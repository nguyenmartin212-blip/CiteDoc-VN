import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from citedoc.chunking import FixedWordChunker
from citedoc.ingest import read_document
from citedoc.schemas import Domain

DOMAINS: tuple[Domain, ...] = ("giao_trinh", "quy_che", "bai_bao")


def main() -> None:
    parser = argparse.ArgumentParser(description="Đọc tài liệu và xuất các đoạn nguồn JSONL.")
    parser.add_argument("--input", type=Path, default=Path("data/raw"))
    parser.add_argument("--output", type=Path, default=Path("data/processed/chunks.jsonl"))
    parser.add_argument("--size", type=int, default=120)
    parser.add_argument("--overlap", type=int, default=20)
    parser.add_argument(
        "--pdf-native-order", action="append", default=[], metavar="DOC_ID",
        help="Giữ thứ tự văn bản gốc của PDF được chỉ định bằng doc_id. Có thể lặp lại.",
    )
    args = parser.parse_args()
    native_order_ids = set(args.pdf_native_order)

    try:
        chunker = FixedWordChunker(args.size, args.overlap)
        chunks = []
        count = 0
        for domain in DOMAINS:
            for path in sorted((args.input / domain).rglob("*")):
                if not path.is_file() or path.suffix.lower() not in {".pdf", ".txt"}:
                    continue
                doc_id = path.relative_to(args.input).as_posix()
                native_order = path.suffix.lower() == ".pdf" and doc_id in native_order_ids
                document = read_document(path, doc_id, domain, pdf_native_order=native_order)
                chunks.extend(chunker.split(document))
                if native_order:
                    native_order_ids.remove(doc_id)
                count += 1
        if native_order_ids:
            unknown = ", ".join(sorted(native_order_ids))
            raise ValueError(f"Không tìm thấy PDF được chỉ định bởi --pdf-native-order: {unknown}")
        if not count:
            raise ValueError(f"Không tìm thấy PDF hoặc TXT trong các thư mục miền tại {args.input}")
        if args.output.suffix.lower() != ".jsonl":
            raise ValueError("Tệp đầu ra phải có đuôi .jsonl.")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8", newline="\n") as output:
            for chunk in chunks:
                output.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Lỗi: {exc}\n")

    print(f"Đã xuất {len(chunks)} đoạn từ {count} tài liệu vào {args.output}")


if __name__ == "__main__":
    sys.stdout.reconfigure(errors="backslashreplace")
    main()
