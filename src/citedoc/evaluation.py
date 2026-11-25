import math

from citedoc.answering import answer_question
from citedoc.catalog import Catalog
from citedoc.chunking import compact
from citedoc.retrieval import Retrieval, rank
from citedoc.schemas import Chunk


def evaluate(
    catalog: Catalog, chunks: list[Chunk], examples: list[dict], method: Retrieval,
    k: int, normalize: bool, verify: bool,
) -> dict:
    positives = negatives = recalled = correct = abstentions = verified = 0
    reciprocal = discounted = 0.0
    for item in examples:
        question = item["question"]
        hits = rank(chunks, question, method, k, normalize)
        answer = answer_question(question, hits)
        gold = compact(item.get("evidence") or "")
        if not gold:
            negatives += 1
            abstentions += answer.abstained
            continue
        positives += 1
        for position, hit in enumerate(hits, 1):
            chunk = hit.chunk
            if chunk.doc_id == item["doc_id"] and chunk.page == item["page"] and gold in compact(chunk.text):
                recalled += 1
                reciprocal += 1 / position
                discounted += 1 / math.log2(position + 1)
                break
        if answer.citations:
            citation = answer.citations[0]
            if citation.doc_id == item["doc_id"] and citation.page == item["page"] and gold in compact(citation.quote):
                correct += 1
                verified += verify and catalog.verify(citation.doc_id, citation.page, citation.quote)
    return {
        "recall": recalled / positives if positives else None,
        "mrr": reciprocal / positives if positives else None,
        "ndcg": discounted / positives if positives else None,
        "verified": verified, "correct": correct, "positives": positives,
        "abstentions": abstentions, "negatives": negatives, "total": positives + negatives,
    }
