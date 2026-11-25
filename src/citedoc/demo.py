import argparse
import re
from pathlib import Path

from citedoc.chunking import FixedWordChunker
from citedoc.ingest import read_document
from citedoc.schemas import Chunk

SAMPLE = Path(__file__).resolve().parents[2] / "data/demo/quy_che_thu_vien.pdf"
STOP_WORDS = set("ai bao cái có được gì khi là nào nhiêu lâu sao thế thì trong ở".split())


def words(text: str) -> list[str]:
    return re.findall(r"[^\W_]+", text.casefold())


def find_excerpt(question: str, chunks: list[Chunk]) -> Chunk | None:
    # shortcut: lexical matching misses paraphrases, replace when adding the project retriever.
    tokens = words(question)
    keywords = set(tokens) - STOP_WORDS
    if not keywords:
        return None

    phrases = set(zip(tokens, tokens[1:]))
    scored = []
    for chunk in chunks:
        source = words(chunk.text)
        if keywords <= set(source):
            score = len(phrases & set(zip(source, source[1:])))
            scored.append((score, chunk))

    scored.sort(key=lambda match: match[0], reverse=True)
    if not scored or (len(scored) > 1 and scored[0][0] == scored[1][0]):
        return None
    return scored[0][1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Hỏi đáp trích đoạn từ một PDF.")
    parser.add_argument("pdf", nargs="?", type=Path, default=SAMPLE, help="Đường dẫn PDF.")
    path = parser.parse_args().pdf
    if path.suffix.lower() != ".pdf":
        parser.error("Hãy chọn một tệp PDF.")

    try:
        document = read_document(path, path.name, "quy_che")
        chunks = FixedWordChunker().split(document)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Lỗi: {exc}\n")

    print(f"Đã đọc {path.name} • {len(document.pages)} trang • {len(chunks)} đoạn")
    while True:
        try:
            question = input("\nCâu hỏi (Enter để thoát): ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not question:
            return

        excerpt = find_excerpt(question, chunks)
        if excerpt is None:
            print("Không tìm thấy đoạn trích đủ rõ trong tài liệu.")
        else:
            print(excerpt.text)
            print(f"Nguồn: {excerpt.doc_id}, trang {excerpt.page}")


if __name__ == "__main__":
    main()
