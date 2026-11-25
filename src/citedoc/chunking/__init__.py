import re
from collections.abc import Iterator

from citedoc.schemas import Chunk, Document

SECTION = re.compile(
    r"^(?:#{1,6}[ \t]+)?(?:Điều|Mục|Chương|Phần)[ \t]+"
    r"(?:\d+[a-z]?|[IVXLCDM]+)(?=\W|$)",
    re.IGNORECASE,
)


def section_pages(doc: Document) -> Iterator[tuple[int | None, str | None, str]]:
    section = None
    for page in doc.pages:
        text = page.text
        boundaries = [
            (line.start(), line.group().strip())
            for line in re.finditer(r"[^\r\n]+", text)
            if SECTION.match(line.group().lstrip())
        ]
        starts = [(0, section)] if not boundaries or boundaries[0][0] else []
        starts.extend(boundaries)
        for index, (start, section) in enumerate(starts):
            end = starts[index + 1][0] if index + 1 < len(starts) else len(text)
            yield page.number, section, text[start:end]


def compact(text: str) -> str:
    return " ".join(text.split())


def sentences(text: str, heading: str | None = None) -> list[str]:
    lines = text.strip().splitlines()
    if heading and len(lines) > 1 and lines[0].strip() == heading:
        lines = lines[1:]
    return [
        sentence for sentence in re.split(r"(?<=[!?。])\s+|(?<=\.)\s+(?=[A-ZÀ-ỸĐ])", compact(" ".join(lines)))
        if sentence
    ]


class FixedWordChunker:
    def __init__(self, size: int = 120, overlap: int = 20):
        if size < 1 or not 0 <= overlap < size:
            raise ValueError("Cần 0 <= overlap < size.")
        self.size = size
        self.overlap = overlap

    def split(self, doc: Document) -> list[Chunk]:
        chunks = []
        for page, section, text in section_pages(doc):
            words = list(re.finditer(r"\S+", text))
            for offset in range(0, len(words), self.size - self.overlap):
                stop = min(offset + self.size, len(words))
                excerpt = text[words[offset].start():words[stop - 1].end()]
                chunks.append(Chunk(
                    id=f"{doc.id}#{len(chunks) + 1}", doc_id=doc.id, text=excerpt,
                    page=page, section=section, domain=doc.domain,
                ))
                if stop == len(words):
                    break
        return chunks
