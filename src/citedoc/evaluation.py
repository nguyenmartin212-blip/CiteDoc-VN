import json
import math
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from citedoc.answering import answer_question
from citedoc.catalog import Catalog
from citedoc.chunking import compact
from citedoc.retrieval import Retrieval, rank
from citedoc.schemas import Answer, Chunk, Hit

Split = Literal["dev", "test"]
DATASETS = {"dev": "questions.jsonl", "test": "test.jsonl"}


def load_dataset(folder: Path, split: Split) -> list[dict]:
    with (folder / DATASETS[split]).open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def in_domain(rows: list[dict], domain: str) -> list[dict]:
    return [row for row in rows if (row.get("domain") or row["doc_id"].split("/")[0]) == domain]


def annotations(item: dict) -> list[dict]:
    if "evidences" in item:
        return item["evidences"]
    return [item] if item.get("evidence") else []


def matched(doc_id: str, page: int | None, text: str, gold: list[dict]) -> set[int]:
    passage = compact(text)
    return {index for index, evidence in enumerate(gold) if (
        doc_id == evidence["doc_id"] and page == evidence["page"] and compact(evidence["evidence"]) in passage
    )}


def evaluate(
    catalog: Catalog, chunks: list[Chunk], examples: list[dict], method: Retrieval,
    k: int, normalize: bool, verify: bool, *, reader: Callable[[str, list[Hit]], Answer] = answer_question,
    cases: list[dict] | None = None,
) -> dict:
    positives = negatives = correct = abstentions = verified = answered = 0
    recalled = reciprocal = discounted = 0.0
    for item in examples:
        question = item["question"]
        hits = rank(chunks, question, method, k, normalize)
        answer = reader(question, hits)
        gold = annotations(item)
        exact = bool(answer.citations) and all(catalog.verify(c.doc_id, c.page, c.quote) for c in answer.citations)
        answered += not answer.abstained
        if not gold:
            negatives += 1
            abstentions += answer.abstained
            if cases is not None:
                cases.append({"id": item["id"], "question": question, "result": "từ chối đúng" if answer.abstained else "trả lời sai khi thiếu nguồn", "answer": answer.text})
            continue
        positives += 1
        found = set()
        dcg = 0.0
        for position, hit in enumerate(hits, 1):
            chunk = hit.chunk
            new = matched(chunk.doc_id, chunk.page, chunk.text, gold) - found
            if new:
                if not found:
                    reciprocal += 1 / position
                found.update(new)
                dcg += 1 / math.log2(position + 1)
        recalled += len(found) / len(gold)
        discounted += dcg / sum(1 / math.log2(position + 1) for position in range(1, min(k, len(gold)) + 1))
        cited = [matched(c.doc_id, c.page, c.quote, gold) for c in answer.citations]
        covered = set().union(*cited)
        supported = exact and all(cited) and len(covered) == len(gold)
        correct += supported
        verified += supported and verify
        if cases is not None:
            outcome = "đúng bằng chứng" if supported else "thiếu bằng chứng khi truy xuất" if len(found) < len(gold) else "chọn thiếu hoặc sai bằng chứng"
            cases.append({"id": item["id"], "question": question, "result": outcome, "answer": answer.text})
    return {
        "recall": recalled / positives if positives else None,
        "mrr": reciprocal / positives if positives else None,
        "ndcg": discounted / positives if positives else None,
        "verified": verified, "correct": correct, "positives": positives,
        "abstentions": abstentions, "negatives": negatives, "total": positives + negatives, "answered": answered,
    }
