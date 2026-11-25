import os
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from shutil import copyfile
from tempfile import TemporaryDirectory
from unicodedata import normalize
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from citedoc.schemas import Document, Domain, Page


def read_document(
    path: Path, doc_id: str, domain: Domain, *, pdf_native_order: bool = False
) -> Document:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        pages = [Page(None, normalize("NFC", path.read_text(encoding="utf-8-sig")))]
    elif suffix == ".pdf":
        pages = read_pdf(path, native_order=pdf_native_order)
        if not any(page.text.strip() for page in pages):
            raise ValueError(f"PDF không có văn bản trích xuất được; nếu là bản scan, cần OCR: {path}")
    else:
        raise ValueError(f"Định dạng chưa hỗ trợ: {path}")

    if not any(page.text.strip() for page in pages):
        raise ValueError(f"Không tìm thấy văn bản trong {path}")
    return Document(doc_id, path, domain, pages)


def read_pdf(source: Path | bytes, *, native_order: bool = False, max_pages: int | None = None) -> list[Page]:
    try:
        import pymupdf
    except ModuleNotFoundError as exc:
        if exc.name != "pymupdf":
            raise
        raise ValueError("Cần cài PyMuPDF để đọc PDF.") from exc

    try:
        pdf = pymupdf.open(stream=source, filetype="pdf") if isinstance(source, bytes) else pymupdf.open(source)
        with pdf:
            if not pdf.is_pdf:
                raise ValueError("Tệp không phải PDF.")
            if pdf.needs_pass:
                raise ValueError("PDF yêu cầu mật khẩu.")
            if max_pages is not None and pdf.page_count > max_pages:
                raise ValueError(f"Mỗi PDF được phép có tối đa {max_pages} trang.")
            return [
                Page(number, normalize("NFC", page.get_text(sort=not native_order)))
                for number, page in enumerate(pdf, start=1)
            ]
    except pymupdf.FileDataError as exc:
        raise ValueError("Không đọc được PDF.") from exc


def read_upload(name: str, content: bytes) -> list[Page]:
    suffix = Path(name).suffix.lower()
    if suffix == ".pdf":
        return read_pdf(content, max_pages=100)
    if suffix == ".txt":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Tệp TXT phải dùng mã hóa UTF-8.") from exc
    elif suffix == ".docx":
        text = _word_text(content)
    else:
        raise ValueError("Hãy chọn tệp PDF, DOCX hoặc TXT.")
    if not text.strip():
        raise ValueError("Tệp không có văn bản để lập chỉ mục.")
    return [Page(None, normalize("NFC", text))]


def ocr_pdf(content: bytes, pages: list[Page], tessdata: Path) -> list[Page]:
    import pymupdf

    with _ocr_data_path(tessdata) as data_path, pymupdf.open(stream=content, filetype="pdf") as pdf:
        output = list(pages)
        for index, previous in enumerate(pages):
            if previous.text.strip():
                continue
            page = pdf[index]
            area = max(1, page.rect.width * page.rect.height)
            dpi = min(200, int(72 * (12_000_000 / area) ** 0.5))
            if dpi < 72:
                raise ValueError("Kích thước trang PDF vượt giới hạn OCR bản demo.")
            try:
                layer = page.get_textpage_ocr(language="vie+eng", dpi=dpi, full=True, tessdata=str(data_path))
            except pymupdf.mupdf.FzErrorBase as exc:
                raise ValueError("Tesseract không đọc được trang hoặc dữ liệu ngôn ngữ.") from exc
            output[index] = Page(previous.number, normalize("NFC", page.get_text(textpage=layer, sort=True)))
        return output


@contextmanager
def _ocr_data_path(tessdata: Path):
    # Tesseract uses narrow Windows paths to open language data.
    if os.name != "nt" or str(tessdata.resolve()).isascii():
        yield tessdata
        return
    with TemporaryDirectory(prefix="citedoc-tessdata-") as folder:
        path = Path(folder)
        for name in ("eng.traineddata", "vie.traineddata"):
            copyfile(tessdata / name, path / name)
        yield path


def _word_text(content: bytes) -> str:
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    try:
        with ZipFile(BytesIO(content)) as archive:
            xml = archive.getinfo("word/document.xml")
            if xml.file_size > 8 * 1024 * 1024:
                raise ValueError("Phần văn bản DOCX vượt quá giới hạn xử lý.")
            contents = archive.read(xml)
        if b"\x00" in contents or b"<!DOCTYPE" in contents or b"<!ENTITY" in contents:
            raise ValueError("DOCX chứa XML không được hỗ trợ.")
        root = ElementTree.fromstring(contents)
    except (BadZipFile, KeyError, RuntimeError, ElementTree.ParseError) as exc:
        raise ValueError("Không đọc được DOCX.") from exc
    return "\n".join(
        "".join(node.text or "" for node in paragraph.iter(namespace + "t"))
        for paragraph in root.iter(namespace + "p")
    )
