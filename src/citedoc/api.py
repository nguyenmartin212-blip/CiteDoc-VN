import json
import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path, PurePosixPath
from typing import Annotated
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints

from citedoc.answering import ABSTENTION, answer_question
from citedoc.catalog import Catalog, Strategy
from citedoc.evaluation import evaluate
from citedoc.ingest import read_document, read_upload
from citedoc.prepare import DOMAINS
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


def excerpt(chunk: Chunk) -> dict:
    return {"id": chunk.id, "page": chunk.page, "heading": chunk.section, "quote": chunk.text}


def create_app(database: Path, *, sample_dir: Path = ROOT / "data/raw", ui_dir: Path = ROOT / "ui/dist") -> FastAPI:
    catalog = Catalog(database)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        catalog.initialize()
        existing = {doc["id"] for doc in catalog.documents()}
        for domain in DOMAINS:
            for path in sorted((sample_dir / domain).glob("*.txt")):
                doc_id = path.relative_to(sample_dir).as_posix()
                if doc_id not in existing:
                    catalog.add(read_document(path, doc_id, domain), path.read_bytes(), "section", sample=True)
        yield

    app = FastAPI(title="CiteDoc-VN", lifespan=lifespan)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

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

    @app.post("/api/ask")
    def ask(request: Question):
        config = request.config
        chunks = catalog.chunks(config.strategy, domain=config.domain)
        hits = rank(chunks, request.question, config.retrieval, config.topK, config.normalize)
        answer = answer_question(request.question, hits)
        citation_index = None
        if answer.citations:
            citation = answer.citations[0]
            if catalog.verify(citation.doc_id, citation.page, citation.quote):
                citation_index = next(i for i, hit in enumerate(hits) if hit.chunk.id == citation.chunk_id)
            else:
                answer = Answer(ABSTENTION, [], True)
        doc_metadata = {doc["id"]: doc for doc in catalog.documents()}
        return {
            "question": request.question, "config": config.model_dump(), "answer": asdict(answer),
            "citationIndex": citation_index, "verified": config.verify and citation_index is not None,
            "hits": [{**excerpt(hit.chunk), "score": hit.score, "doc": doc_metadata[hit.chunk.doc_id]} for hit in hits],
        }

    @app.post("/api/evaluate")
    def run_evaluation(config: Settings):
        with (ROOT / "data/eval/questions.jsonl").open(encoding="utf-8") as dataset:
            rows = [json.loads(line) for line in dataset if line.strip()]
        examples = [row for row in rows if (row.get("domain") or row["doc_id"].split("/")[0]) == config.domain]
        corpus = catalog.chunks(config.strategy, domain=config.domain)
        return evaluate(catalog, corpus, examples, config.retrieval, config.topK, config.normalize, config.verify)

    if ui_dir.is_dir():
        app.mount("/", StaticFiles(directory=ui_dir, html=True), name="ui")
    return app


app = create_app(Path(os.environ.get("CITEDOC_DB", ROOT / "data/processed/catalog.sqlite3")))
