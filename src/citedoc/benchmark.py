import argparse
import csv
import os
import tempfile
import time
from pathlib import Path

from citedoc.answering import answer_question
from citedoc.catalog import Catalog, seed_catalog
from citedoc.evaluation import DATASETS, evaluate, in_domain, load_dataset
from citedoc.local_ai import LocalReader
from citedoc.prepare import DOMAINS


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Chạy đánh giá CiteDoc-VN trên corpus đi kèm repo.")
    parser.add_argument("--split", choices=tuple(DATASETS), default="test")
    parser.add_argument("--output", type=Path, default=Path("data/processed/benchmark"))
    parser.add_argument("--ai-model", help="Tên model trên llama-server cục bộ để đối chiếu với Hybrid.")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    rows = load_dataset(root / "data/eval", args.split)
    ai = LocalReader(int(os.environ.get("CITEDOC_AI_PORT", "8081")), args.ai_model) if args.ai_model else None
    summary, details = [], []
    with tempfile.TemporaryDirectory() as directory:
        store = Catalog(Path(directory) / "benchmark.sqlite3")
        seed_catalog(store, root / "data/raw")
        for domain in DOMAINS:
            corpus = store.chunks("section", domain=domain)
            examples = in_domain(rows, domain)
            configs = [(name, "quy-tac", answer_question) for name in ("bm25", "tfidf", "hybrid")]
            if ai:
                configs.append(("hybrid", args.ai_model, ai.answer))
            for method, label, reader in configs:
                run = {"split": args.split, "domain": domain, "retrieval": method, "reader": label, "k": 5}
                cases = []
                start = time.perf_counter()
                stats = evaluate(store, corpus, examples, method, 5, True, True, reader=reader, cases=cases)
                elapsed = time.perf_counter() - start
                summary.append({**run, **stats, "mean_ms": round(1000 * elapsed / len(examples), 1)})
                details.extend({**run, **case} for case in cases)
    args.output.mkdir(parents=True, exist_ok=True)
    write_csv(args.output / "summary.csv", summary)
    write_csv(args.output / "cases.csv", details)
    print(f"{len(summary)} configurations, {len(details)} evaluated results: {args.output}")


if __name__ == "__main__":
    main()
