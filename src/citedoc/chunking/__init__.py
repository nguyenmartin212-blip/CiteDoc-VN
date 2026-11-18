import re

from citedoc.schemas import Chunk, Document

SECTION = re.compile(
    r"^(?:#{1,6}[ \t]+)?(?:Điều|Mục|Chương|Phần)[ \t]+"
    r"(?:\d+[a-z]?|[IVXLCDM]+)(?=\W|$)",
    re.IGNORECASE,
)


class FixedWordChunker:
    def __init__(self, size: int = 120, overlap: int = 20):
        if size < 1 or not 0 <= overlap < size:
            raise ValueError("Cần 0 <= overlap < size.")
        self.size = size
        self.overlap = overlap

    def split(self, doc: Document) -> list[Chunk]:
        chunks = []
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
                words = list(re.finditer(r"\S+", text[start:end]))
                for offset in range(0, len(words), self.size - self.overlap):
                    stop = min(offset + self.size, len(words))
                    excerpt = text[start + words[offset].start():start + words[stop - 1].end()]
                    chunks.append(Chunk(
                        id=f"{doc.id}#{len(chunks) + 1}",
                        doc_id=doc.id,
                        text=excerpt,
                        page=page.number,
                        section=section,
                        domain=doc.domain,
                    ))
                    if stop == len(words):
                        break
        return chunks
