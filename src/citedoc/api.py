import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path, PurePosixPath
from threading import Lock
from typing import Annotated
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints

from citedoc.answering import ABSTENTION, answer_question
from citedoc.catalog import Catalog, Strategy, seed_catalog
from citedoc.evaluation import Split, evaluate, in_domain, load_dataset
from citedoc.ingest import ocr_pdf, read_upload
from citedoc.local_ai import LocalReader, ReaderUnavailable
from citedoc.retrieval import Retrieval, rank
from citedoc.schemas import Answer, Chunk, Document, Domain

ROOT = Path(__file__).resolve().parents[2]
MAX_UPLOAD = 10 * 1024 * 1024
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class Settings(BaseModel):
    domain: Domain = "quy_che"
    strategy: Strategy = "section"
    retrieval: Retrieval = "hybrid"
    topK: int = Field(default=5, ge=1, le=10)
    normalize: bool = True
    verify: bool = True


class Question(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    config: Settings = Field(default_factory=Settings)


class EvaluationSettings(Settings):
    split: Split = "dev"


def excerpt(chunk: Chunk) -> dict:
    return {"id": chunk.id, "page": chunk.page, "heading": chunk.section, "quote": chunk.text}


def create_app(
    database: Path, *, sample_dir: Path = ROOT / "data/raw", ui_dir: Path = ROOT / "ui/dist",
    tessdata: Path | None = None, reader: LocalReader | None = None,
) -> FastAPI:
    catalog = Catalog(database)
    ocr_lock = Lock()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        seed_catalog(catalog, sample_dir)
        yield

    app = FastAPI(title="CiteDoc-VN", lifespan=lifespan)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "ocr": bool(tessdata and all(
            (tessdata / f"{language}.traineddata").is_file() for language in ("vie", "eng")
        )), "aiModel": reader.model if reader else None}

    @app.get("/api/documents")
    def documents():
        return catalog.documents()

    @app.post("/api/documents")
    def upload(file: Annotated[UploadFile, File()], domain: Annotated[Domain, Form()], strategy: Annotated[Strategy, Form()]):
        name = PurePosixPath((file.filename or "").replace("\\", "/")).name
        content = file.file.read(MAX_UPLOAD + 1)
        if len(content) > MAX_UPLOAD:
            raise HTTPException(413, "Tệp vượt quá 10 MB.")
        if not content or not name or len(name) > 240:
            raise HTTPException(422, "Tệp trống hoặc tên tệp không hợp lệ.")
        try:
            pages = read_upload(name, content)
            if sum(len(page.text) for page in pages) > 2_000_000:
                raise ValueError("Văn bản trích xuất vượt quá 2 triệu ký tự.")
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        document = Document(uuid4().hex, Path(name), domain, pages)
        saved, created = catalog.add(document, content, strategy)
        return {"document": saved, "created": created}

    @app.post("/api/documents/ocr")
    def recognize(id: str):
        document = catalog.document(id)
        if document is None:
            raise HTTPException(404, "Không tìm thấy tài liệu.")
        if Path(document["name"]).suffix.lower() != ".pdf":
            raise HTTPException(422, "OCR chỉ áp dụng cho PDF.")
        if not health()["ocr"]:
            raise HTTPException(503, "Chưa cài dữ liệu OCR tiếng Việt và tiếng Anh.")
        with ocr_lock:
            pages = catalog.pages(id)
            pending = sum(not page.text.strip() for page in pages)
            if not pending:
                return {"document": catalog.document(id), "recognized": 0}
            source = catalog.original(id)
            try:
                result = ocr_pdf(source["original"], pages, tessdata)
                if sum(len(page.text) for page in result) > 2_000_000:
                    raise ValueError("Văn bản trích xuất vượt quá 2 triệu ký tự.")
            except (RuntimeError, ValueError) as exc:
                raise HTTPException(422, f"Không thể OCR PDF: {exc}") from exc
            updated = catalog.update_pages(Document(id, Path(document["name"]), document["domain"], result))
            return {"document": updated, "recognized": pending - sum(not page.text.strip() for page in result)}

    @app.get("/api/documents/chunks")
    def chunks(id: str):
        document = catalog.document(id)
        if not document:
            raise HTTPException(404, "Không tìm thấy tài liệu.")
        return [excerpt(chunk) for chunk in catalog.chunks(document["strategy"], doc_id=id)]

    @app.get("/api/documents/file")
    def source_file(id: str):
        source = catalog.original(id)
        if source is None:
            raise HTTPException(404, "Không tìm thấy tài liệu.")
        extension = Path(source["name"]).suffix.lower()
        disposition = "attachment" if extension == ".docx" else "inline"
        return Response(source["original"], media_type=MEDIA_TYPES[extension], headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(source['name'], safe='')}",
            "X-Content-Type-Options": "nosniff",
        })

    def answer_payload(request: Question, compare_ai: bool):
        config = request.config
        chunks = catalog.chunks(config.strategy, domain=config.domain)
        hits = rank(chunks, request.question, config.retrieval, config.topK, config.normalize)
        def checked(answer: Answer) -> tuple[Answer, list[int]]:
            indices = {hit.chunk.id: index for index, hit in enumerate(hits)}
            if any(citation.chunk_id not in indices or not catalog.verify(
                citation.doc_id, citation.page, citation.quote,
            ) for citation in answer.citations):
                return Answer(ABSTENTION, [], True), []
            return answer, [indices[citation.chunk_id] for citation in answer.citations]

        answer, citation_indices = checked(answer_question(request.question, hits))
        ai = None
        if compare_ai and reader:
            try:
                selected, indices = checked(reader.answer(request.question, hits))
                ai = {"model": reader.model, "answer": asdict(selected), "citationIndices": indices}
            except ReaderUnavailable as exc:
                ai = {"model": reader.model, "error": str(exc)}
        doc_metadata = {doc["id"]: doc for doc in catalog.documents()}
        return {
            "question": request.question, "config": config.model_dump(), "answer": asdict(answer),
            "citationIndex": citation_indices[0] if citation_indices else None,
            "verified": config.verify and bool(citation_indices), "ai": ai,
            "hits": [{**excerpt(hit.chunk), "score": hit.score, "doc": doc_metadata[hit.chunk.doc_id]} for hit in hits],
        }

    @app.post("/api/ask")
    def ask(request: Question):
        return answer_payload(request, False)

    @app.post("/api/compare")
    def compare(request: Question):
        return answer_payload(request, True)

    @app.post("/api/evaluate")
    def run_evaluation(config: EvaluationSettings):
        examples = in_domain(load_dataset(ROOT / "data/eval", config.split), config.domain)
        corpus = [chunk for chunk in catalog.chunks(config.strategy, domain=config.domain) if chunk.doc_id.startswith(f"{config.domain}/")]
        return evaluate(catalog, corpus, examples, config.retrieval, config.topK, config.normalize, config.verify)

    if ui_dir.is_dir():
        app.mount("/", StaticFiles(directory=ui_dir, html=True), name="ui")
    return app


runtime = ROOT / "data/processed/runtime"
ai_model = os.environ.get("CITEDOC_AI_MODEL")
app = create_app(
    Path(os.environ.get("CITEDOC_DB", ROOT / "data/processed/catalog.sqlite3")),
    tessdata=Path(os.environ.get("CITEDOC_TESSDATA", runtime / "tessdata")),
    reader=LocalReader(int(os.environ.get("CITEDOC_AI_PORT", "8081")), ai_model) if ai_model else None,
)
