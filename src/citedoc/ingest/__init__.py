from pathlib import Path
from unicodedata import normalize

from citedoc.schemas import Document, Domain, Page


def read_document(path: Path, doc_id: str, domain: Domain) -> Document:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        pages = [Page(None, normalize("NFC", path.read_text(encoding="utf-8-sig")))]
    elif suffix == ".pdf":
        try:
            import pymupdf
        except ModuleNotFoundError as exc:
            if exc.name != "pymupdf":
                raise
            raise ValueError("Cần cài PyMuPDF để đọc PDF.") from exc

        try:
            with pymupdf.open(path) as pdf:
                if pdf.needs_pass:
                    raise ValueError(f"PDF yêu cầu mật khẩu: {path}")
                pages = [
                    Page(number, normalize("NFC", page.get_text(sort=True)))
                    for number, page in enumerate(pdf, start=1)
                ]
        except pymupdf.FileDataError as exc:
            raise ValueError(f"Không đọc được PDF {path}: {exc}") from exc

        if not any(page.text.strip() for page in pages):
            raise ValueError(f"PDF không có văn bản trích xuất được; nếu là bản scan, cần OCR: {path}")
    else:
        raise ValueError(f"Định dạng chưa hỗ trợ: {path}")

    if not any(page.text.strip() for page in pages):
        raise ValueError(f"Không tìm thấy văn bản trong {path}")
    return Document(doc_id, path, domain, pages)
