import hashlib
import json
import sqlite3
from contextlib import closing
from dataclasses import asdict
from pathlib import Path
from typing import Literal

from citedoc.chunking import FixedWordChunker, compact, section_pages, sentences
from citedoc.ingest import read_document
from citedoc.prepare import DOMAINS
from citedoc.schemas import Chunk, Document, Domain, Page

Strategy = Literal["section", "sentence", "fixed"]
STRATEGIES: tuple[Strategy, ...] = ("section", "sentence", "fixed")
SAMPLE_TITLES = {
    "quy_che/thu_vien.txt": "Quy chế thư viện",
    "giao_trinh/hoc_may.txt": "Giáo trình học máy",
    "bai_bao/truy_xuat.txt": "Bài báo về truy xuất",
}
METADATA = "id, domain, name, strategy, sample, needs_ocr AS needsOcr"


def split_for_index(document: Document, strategy: Strategy) -> list[Chunk]:
    if strategy == "fixed":
        return FixedWordChunker(30, 6).split(document)
    if strategy == "section":
        return FixedWordChunker().split(document)

    chunks = []
    for page, heading, text in section_pages(document):
        for sentence in sentences(text, heading):
            chunks.append(Chunk(f"{document.id}#{len(chunks) + 1}", document.id, sentence, page, heading, document.domain))
    return chunks


def metadata(row: sqlite3.Row) -> dict:
    values = dict(row)
    return {
        **values, "title": SAMPLE_TITLES.get(values["id"], values["name"]),
        "sample": bool(values["sample"]), "needsOcr": bool(values["needsOcr"]),
    }


def index_rows(document: Document) -> list[tuple]:
    return [
        (document.id, kind, position, chunk.id, chunk.page, chunk.section, chunk.text)
        for kind in STRATEGIES for position, chunk in enumerate(split_for_index(document, kind))
    ]


class Catalog:
    def __init__(self, path: Path):
        self.path = path

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY, domain TEXT NOT NULL, name TEXT NOT NULL,
                    strategy TEXT NOT NULL, sample INTEGER NOT NULL, needs_ocr INTEGER NOT NULL,
                    digest TEXT NOT NULL, original BLOB NOT NULL, pages TEXT NOT NULL,
                    UNIQUE(domain, digest)
                );
                CREATE TABLE IF NOT EXISTS chunks (
                    doc_id TEXT NOT NULL REFERENCES documents(id), strategy TEXT NOT NULL,
                    position INTEGER NOT NULL, id TEXT NOT NULL, page INTEGER, section TEXT, text TEXT NOT NULL,
                    PRIMARY KEY (doc_id, strategy, position)
                );
            """)

    def add(self, document: Document, content: bytes, strategy: Strategy, *, sample: bool = False) -> tuple[dict, bool]:
        digest = hashlib.sha256(content).hexdigest()
        needs_ocr = any(not page.text.strip() for page in document.pages)
        pages = json.dumps([asdict(page) for page in document.pages], ensure_ascii=False)
        indexed = index_rows(document)
        with closing(self.connect()) as db, db:
            inserted = db.execute("""
                INSERT INTO documents (id, domain, name, strategy, sample, needs_ocr, digest, original, pages)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
                """, (document.id, document.domain, document.path.name, strategy, sample, needs_ocr, digest, content, pages))
            if inserted.rowcount:
                db.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?)", indexed)
            row = db.execute(
                f"SELECT {METADATA} FROM documents WHERE id = ? OR (domain = ? AND digest = ?)",
                (document.id, document.domain, digest),
            ).fetchone()
            return metadata(row), bool(inserted.rowcount)

    def documents(self) -> list[dict]:
        with closing(self.connect()) as db:
            return [metadata(row) for row in db.execute(f"SELECT {METADATA} FROM documents ORDER BY sample DESC, domain, name, id")]

    def document(self, doc_id: str) -> dict | None:
        with closing(self.connect()) as db:
            row = db.execute(f"SELECT {METADATA} FROM documents WHERE id = ?", (doc_id,)).fetchone()
        return metadata(row) if row else None

    def original(self, doc_id: str) -> sqlite3.Row | None:
        with closing(self.connect()) as db:
            return db.execute("SELECT name, original FROM documents WHERE id = ?", (doc_id,)).fetchone()

    def pages(self, doc_id: str) -> list[Page]:
        with closing(self.connect()) as db:
            row = db.execute("SELECT pages FROM documents WHERE id = ?", (doc_id,)).fetchone()
        return [Page(**page) for page in json.loads(row["pages"])] if row else []

    def update_pages(self, document: Document) -> dict:
        pages = json.dumps([asdict(page) for page in document.pages], ensure_ascii=False)
        missing = any(not page.text.strip() for page in document.pages)
        indexed = index_rows(document)
        with closing(self.connect()) as db, db:
            db.execute("UPDATE documents SET pages = ?, needs_ocr = ? WHERE id = ?", (pages, missing, document.id))
            db.execute("DELETE FROM chunks WHERE doc_id = ?", (document.id,))
            db.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?)", indexed)
            row = db.execute(f"SELECT {METADATA} FROM documents WHERE id = ?", (document.id,)).fetchone()
            return metadata(row)

    def chunks(self, strategy: Strategy, *, domain: Domain | None = None, doc_id: str | None = None) -> list[Chunk]:
        sql = """
            SELECT c.id, c.doc_id, c.text, c.page, c.section, d.domain
            FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.strategy = ?
        """
        params = [strategy]
        if domain is not None:
            sql += " AND d.domain = ?"
            params.append(domain)
        if doc_id is not None:
            sql += " AND c.doc_id = ?"
            params.append(doc_id)
        with closing(self.connect()) as db:
            return [Chunk(**dict(row)) for row in db.execute(sql + " ORDER BY c.doc_id, c.position", params)]

    def verify(self, doc_id: str, number: int | None, quote: str) -> bool:
        normalized = compact(quote)
        return bool(normalized and any(
            page.number == number and normalized in compact(page.text) for page in self.pages(doc_id)
        ))


def seed_catalog(catalog: Catalog, sample_dir: Path) -> None:
    catalog.initialize()
    existing = {doc["id"] for doc in catalog.documents()}
    for domain in DOMAINS:
        for path in sorted((sample_dir / domain).glob("*.txt")):
            doc_id = path.relative_to(sample_dir).as_posix()
            if doc_id not in existing:
                catalog.add(read_document(path, doc_id, domain), path.read_bytes(), "section", sample=True)
