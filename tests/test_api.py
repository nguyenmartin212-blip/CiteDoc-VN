import tempfile
import unittest
from contextlib import ExitStack
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pymupdf
from fastapi.testclient import TestClient

from citedoc.api import create_app


def pdf_with_pages(*texts: str) -> bytes:
    with pymupdf.open() as pdf:
        for text in texts:
            page = pdf.new_page()
            if text:
                page.insert_text((72, 72), text)
        return pdf.tobytes()


class TestCiteDocAPI(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.database = Path(workspace.name) / "test.sqlite3"
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.client = stack.enter_context(TestClient(create_app(self.database)))

    def upload(self, name, data, domain="quy_che", strategy="section"):
        response = self.client.post("/api/documents", files={"file": (name, data)}, data={
            "domain": domain, "strategy": strategy,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def ask(self, question, **config):
        response = self.client.post("/api/ask", json={"question": question, "config": config})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_new_pdf_answer_has_working_source_on_page_two(self):
        data = pdf_with_pages("Huong dan khu nghien cuu.", "Phong luu tru mo cua vao thu tu.")
        item = self.upload("phong-luu-tru.pdf", data)["document"]
        for retrieval in ("bm25", "tfidf", "hybrid"):
            with self.subTest(retrieval=retrieval):
                result = self.ask("Phòng lưu trữ mở cửa vào ngày nào?", retrieval=retrieval)
                self.assertFalse(result["answer"]["abstained"])
                citation, = result["answer"]["citations"]
                self.assertEqual((citation["doc_id"], citation["page"]), (item["id"], 2))
                self.assertEqual(citation["quote"], "Phong luu tru mo cua vao thu tu.")
                self.assertEqual(result["hits"][result["citationIndex"]]["id"], citation["chunk_id"])
                self.assertTrue(result["verified"])
        source = self.client.get("/api/documents/file", params={"id": item["id"]})
        self.assertEqual(source.headers["content-type"], "application/pdf")
        self.assertEqual(source.content, data)
        with TestClient(create_app(self.database)) as restarted:
            self.assertTrue(any(doc["id"] == item["id"] for doc in restarted.get("/api/documents").json()))
            response = restarted.post("/api/ask", json={"question": "Phòng lưu trữ mở cửa vào ngày nào?"})
            self.assertEqual(response.json()["answer"]["citations"][0]["page"], 2)

    def test_related_duration_does_not_answer_quantity_question(self):
        result = self.ask("Sinh viên được mượn tối đa bao nhiêu tài liệu trong 14 ngày kể từ ngày nhận sách?")
        self.assertTrue(any("14 ngày" in hit["quote"] for hit in result["hits"]))
        self.assertTrue(result["answer"]["abstained"])
        self.assertFalse(result["verified"])
        self.assertEqual(result["answer"]["citations"], [])

    def test_duplicate_upload_and_domain_filter(self):
        content = "Xe buýt thực tập khởi hành vào thứ bảy.".encode()
        original = self.upload("xe-buyt.txt", content, "giao_trinh", "sentence")
        duplicate = self.upload("xe-buyt-sao.txt", content, "giao_trinh")
        self.assertTrue(original["created"])
        self.assertFalse(duplicate["created"])
        self.assertEqual(original["document"], duplicate["document"])
        question = "Xe buýt thực tập khởi hành vào ngày nào?"
        self.assertTrue(self.ask(question)["answer"]["abstained"])
        result = self.ask(question, domain="giao_trinh", strategy="sentence", verify=False)
        self.assertFalse(result["answer"]["abstained"])
        self.assertFalse(result["verified"])

    def test_scan_and_word_import(self):
        scan = self.upload("scan.pdf", pdf_with_pages(""))["document"]
        self.assertTrue(scan["needsOcr"])
        self.assertEqual(self.client.get("/api/documents/chunks", params={"id": scan["id"]}).json(), [])
        word = BytesIO()
        with ZipFile(word, "w") as archive:
            archive.writestr("word/document.xml", '''
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                  <w:body><w:p><w:r><w:t>Trạm thực hành đặt tại phòng B12.</w:t></w:r></w:p></w:body>
                </w:document>'''.strip())
        item = self.upload("tram.docx", word.getvalue())["document"]
        response = self.client.get("/api/documents/chunks", params={"id": item["id"]})
        self.assertEqual(response.json()[0]["quote"], "Trạm thực hành đặt tại phòng B12.")

    def test_benchmark_reports_positive_and_negative_examples(self):
        for domain, counts in {"quy_che": (5, 2), "giao_trinh": (5, 2), "bai_bao": (4, 2)}.items():
            with self.subTest(domain=domain):
                response = self.client.post("/api/evaluate", json={"domain": domain})
                self.assertEqual(response.status_code, 200, response.text)
                stats = response.json()
                self.assertEqual((stats["positives"], stats["negatives"]), counts)
                self.assertGreater(stats["correct"], 0)
                self.assertEqual(stats["abstentions"], 2)
