from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

Domain = Literal["giao_trinh", "quy_che", "bai_bao"]


@dataclass
class Page:
    number: int | None
    text: str


@dataclass
class Document:
    id: str
    path: Path
    domain: Domain
    pages: list[Page]


@dataclass
class Chunk:
    id: str
    doc_id: str
    text: str
    page: int | None
    section: str | None
    domain: Domain


@dataclass
class Hit:
    chunk: Chunk
    score: float


@dataclass
class Citation:
    chunk_id: str
    doc_id: str
    page: int | None
    quote: str


@dataclass
class Answer:
    text: str
    citations: list[Citation]
    abstained: bool


class Chunker(Protocol):
    def split(self, doc: Document) -> list[Chunk]: ...


class Retriever(Protocol):
    def search(self, query: str, k: int) -> list[Hit]: ...


class Answerer(Protocol):
    def answer(self, query: str, hits: list[Hit]) -> Answer: ...
