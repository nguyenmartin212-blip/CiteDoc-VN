import math
import re
import unicodedata
from collections import Counter
from typing import Literal

from citedoc.schemas import Chunk, Hit

Retrieval = Literal["bm25", "tfidf", "hybrid"]
STOP_WORDS = "cho của có dùng được để là khi làm nào gì bao lâu nhiêu như thế trong một các và với từ về ra ở trên"


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.casefold()).replace("đ", "d")
    return "".join(character for character in decomposed if not unicodedata.combining(character))


def words(text: str, normalize: bool) -> list[str]:
    text = fold(text) if normalize else unicodedata.normalize("NFC", text.casefold())
    return re.findall(r"[^\W_]+", text)


def rank(chunks: list[Chunk], question: str, method: Retrieval, k: int, normalize: bool) -> list[Hit]:
    stops = set(words(STOP_WORDS, normalize))
    terms = set(words(question, normalize)) - stops
    if not terms or not chunks:
        return []

    frequencies = [Counter(words(chunk.text, normalize)) for chunk in chunks]
    document_frequency = Counter(term for counts in frequencies for term in counts)
    lengths = [counts.total() for counts in frequencies]
    size = len(chunks)
    average_length = sum(lengths) / size or 1
    vocabulary = document_frequency.keys() | terms
    idf = {term: math.log((size + 1) / (document_frequency[term] + 1)) + 1 for term in vocabulary}
    bm25_idf = {
        term: math.log1p((size - document_frequency[term] + 0.5) / (document_frequency[term] + 0.5))
        for term in terms
    }
    query_norm = math.sqrt(sum(idf[term] ** 2 for term in terms))

    scores = []
    for chunk, counts, length in zip(chunks, frequencies, lengths):
        shared = terms & counts.keys()
        if not shared:
            continue
        saturation = 1.2 * (0.25 + 0.75 * length / average_length)
        bm25 = sum(bm25_idf[t] * 2.2 * counts[t] / (counts[t] + saturation) for t in shared)
        weights = {term: (1 + math.log(count)) * idf[term] for term, count in counts.items()}
        doc_norm = math.sqrt(sum(weight ** 2 for weight in weights.values()))
        tfidf = sum(weights[term] * idf[term] for term in shared) / (query_norm * doc_norm)
        scores.append((chunk, bm25, tfidf))

    max_bm25 = max((bm25 for _, bm25, _ in scores), default=1)
    max_tfidf = max((tfidf for _, _, tfidf in scores), default=1)
    hits = []
    for chunk, bm25, tfidf in scores:
        if method == "hybrid":
            score = (bm25 / max_bm25 + tfidf / max_tfidf) / 2
        else:
            score = bm25 if method == "bm25" else tfidf
        hits.append(Hit(chunk, score))
    return sorted(hits, key=lambda hit: (-hit.score, hit.chunk.id))[:k]
