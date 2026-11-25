import re
from unicodedata import normalize

from citedoc.chunking import compact, sentences
from citedoc.retrieval import STOP_WORDS, fold, words
from citedoc.schemas import Answer, Citation, Hit

ABSTENTION = "Không đủ bằng chứng để trả lời câu hỏi này."
NUMBER = r"(?:\d+(?:[.,]\d+)?|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)"
DURATION = r"(?:giay|phut|gio|ngay|tuan|thang|nam|hoc ky)"
ITEM = r"(?:tai lieu|sach|cuon|ban|tin chi|lan|mau|nguoi|nhom|lop|mon|tep)"
COUNTER = r"(?:(?:cuon|quyen|ban)\s+)?"

# A lexical match only nominates a candidate. Each supported question form
# also requires the corresponding kind of value or relation in the sentence.
RULES = (
    (r"(?:bao nhieu|may) (?:cuon |quyen |ban )?(?P<unit>" + ITEM + r")\b",
     r"\b" + NUMBER + r"\s+" + COUNTER + r"{unit}\b"),
    (r"bao lau|trong (?:bao nhieu|may) " + DURATION + r"\b|(?:bao nhieu|may) " + DURATION + r"\b",
     r"\b" + NUMBER + r"\s+" + DURATION + r"\b"),
    (r"(?:bao nhieu|may) (?:tien|dong)|muc phi|muc phat", r"\b\d[\d.,]*\s*(?:dong|vnd|nghin|trieu)\b"),
    (r"dieu kien|truong hop nao", r"\b(?:neu|voi dieu kien|trong truong hop|chi khi)\b"),
    (r"ngay nao|thu may|khi nao|luc nao|may gio", r"\b(?:thu (?:hai|ba|tu|nam|sau|bay|[2-7])|chu nhat|\d{1,2}[:h]\d{0,2}|\d{1,2} gio|ngay \d{1,2}|cuoi ky|dau ky|vao buoi)\b"),
    (r"chi so nao|do bang gi|thuoc do nao", r"\b(?:recall|precision|mrr|ndcg|accuracy|f1|map)\b"),
    (r"dung de lam gi|muc dich(?: cua)?|co tac dung gi", r"\b(?:dung de|su dung de|nham|de danh gia|de do)\b"),
    (r"o dau|dia diem nao|tai dau", r"\b(?:tai|o) (?:phong|toa|thu vien|tang|khu|quay|co so)\b"),
    (r"la gi|duoc dinh nghia the nao", r"\b(?:la|duoc dinh nghia)\b"),
    (r"the nao|nhu the nao|quy trinh", r"\b(?:buoc|truoc tien|sau do|phai|can nop)\b"),
)

TOPIC_STOP = STOP_WORDS + " mấy tối đa nhất theo hãy xin biết vui lòng giúp cần thể"
OCR_JOINED = re.compile(r"\b(mở|đóng)(cửa)\b|\b(thứ)(hai|ba|tư|năm|sáu|bảy)\b", re.IGNORECASE)


def lexical_sentence(text: str) -> str:
    # Vietnamese OCR may merge common schedule words. Keep the original in citations.
    return OCR_JOINED.sub(lambda match: " ".join(value for value in match.groups() if value), text)


def answer_question(question: str, hits: list[Hit]) -> Answer:
    original = compact(normalize("NFC", question.casefold()))
    normalized = fold(original)
    unaccented = len(original) != len(normalized) or original == normalized
    if unaccented:
        original = normalized
    prefix = re.match(r"^(?:trong|theo) (?:giao trinh|tai lieu|quy che|bai bao)[,:]?\s+", normalized)
    if prefix:
        original = original[prefix.end():]
        normalized = normalized[prefix.end():]
    rule = next((
        (match, cue) for pattern, cue in RULES
        if (match := re.search(r"\b(?:" + pattern + r")", normalized))
    ), None)
    if rule is None:
        return Answer(ABSTENTION, [], True)

    match, cue = rule
    topic_text = original[:match.start()] + " " + original[match.end():]
    topic = set(words(topic_text, unaccented)) - set(words(TOPIC_STOP, unaccented))
    if not topic:
        return Answer(ABSTENTION, [], True)
    folded_topic = {fold(term) for term in topic}
    answer_cue = re.compile(cue.format(**match.groupdict()) if "{unit}" in cue else cue)

    for hit in hits:
        chunk = hit.chunk
        for sentence in sentences(chunk.text, chunk.section):
            searchable = lexical_sentence(sentence)
            source = searchable + " " + (chunk.section or "")
            use_fold = unaccented or source.casefold() == fold(source)
            required = folded_topic if use_fold else topic
            if (required & set(words(searchable, use_fold)) and required <= set(words(source, use_fold))
                    and answer_cue.search(fold(searchable))):
                citation = Citation(chunk.id, chunk.doc_id, chunk.page, sentence)
                return Answer(sentence, [citation], False)
    return Answer(ABSTENTION, [], True)
