import subprocess
import sys
import unittest


class DemoTest(unittest.TestCase):
    def test_sample_pdf_answers_with_source_and_abstains(self):
        result = subprocess.run(
            [sys.executable, "-m", "citedoc.demo"],
            input=(
                "Sinh viên được mượn tài liệu trong bao lâu?\n"
                "Học phí học kỳ này là bao nhiêu?\n\n"
            ),
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("Sinh viên được mượn tài liệu trong 14 ngày", result.stdout)
        self.assertIn("Nguồn: quy_che_thu_vien.pdf, trang 1", result.stdout)
        self.assertIn("Không tìm thấy đoạn trích đủ rõ trong tài liệu.", result.stdout)
