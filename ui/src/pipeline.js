export const domains = { quy_che: 'Quy chế', giao_trinh: 'Giáo trình', bai_bao: 'Bài báo' };
export const strategies = { section: 'Điều – Mục', sentence: 'Câu – đoạn', fixed: 'Cố định từ' };
export const retrievers = { bm25: 'BM25', tfidf: 'TF-IDF', hybrid: 'Hybrid' };
export const defaults = {
  domain: 'quy_che', strategy: 'section', retrieval: 'hybrid', topK: 5, normalize: true, verify: true,
};

const headings = /^(?:(?:Điều|Mục|Chương|Phần|Khoản)\s+[\p{N}IVXLCDM]+(?=[\s.:,)–-]|$)|Tóm tắt$)/iu;
const stopWords = new Set('cho của có dùng được để là khi làm nào gì bao lâu nhiêu như thế trong một các và với từ về ra ở trên'.split(' '));
const segmenter = new Intl.Segmenter('vi', { granularity: 'sentence' });

function words(text, fold) {
  const normalized = text.normalize('NFC').toLocaleLowerCase('vi');
  const searchable = fold
    ? normalized.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd')
    : normalized;
  return searchable.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function splitDocument(doc, strategy) {
  return doc.pages.flatMap(({ page, text }) => {
    const sections = [];
    let section = null;
    for (const line of text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      const isHeading = headings.test(line);
      if (isHeading || !section) {
        section = { heading: isHeading ? line : '', lines: [] };
        sections.push(section);
      }
      if (!isHeading) section.lines.push(line);
    }
    return sections.flatMap(({ heading, lines }) => {
      const body = lines.join(' ') || heading;
      let passages = [body];
      if (strategy === 'sentence') {
        passages = Array.from(segmenter.segment(body), ({ segment }) => segment.trim());
      } else if (strategy === 'fixed') {
        const tokens = body.split(/\s+/);
        passages = [];
        for (let start = 0; start < tokens.length; start += 24) {
          passages.push(tokens.slice(start, start + 30).join(' '));
          if (start + 30 >= tokens.length) break;
        }
      }
      return passages.map((quote) => ({ doc, page, heading, quote }));
    });
  });
}

export function retrieve(documents, question, config) {
  const { domain, strategy, retrieval, topK, normalize } = config;
  const stops = new Set(words([...stopWords].join(' '), normalize));
  const terms = [...new Set(words(question, normalize))].filter((word) => !stops.has(word));
  if (!terms.length) return [];

  const corpus = documents.filter((doc) => doc.domain === domain)
    .flatMap((doc) => splitDocument(doc, strategy))
    .map((chunk) => {
      const quoteTerms = words(chunk.quote, normalize);
      const frequency = new Map();
      for (const term of [...words(chunk.heading, normalize), ...quoteTerms]) {
        frequency.set(term, (frequency.get(term) ?? 0) + 1);
      }
      return { chunk, frequency, length: quoteTerms.length };
    });
  if (!corpus.length) return [];

  const averageLength = corpus.reduce((sum, entry) => sum + entry.length, 0) / corpus.length || 1;
  const counts = new Map();
  for (const { frequency } of corpus) {
    for (const term of frequency.keys()) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const idf = (term) => Math.log((corpus.length + 1) / ((counts.get(term) ?? 0) + 1)) + 1;
  const queryNorm = Math.sqrt(terms.reduce((sum, term) => sum + idf(term) ** 2, 0));
  const scored = corpus.map(({ chunk, frequency, length }) => {
    let bm25 = 0;
    let dot = 0;
    let matched = 0;
    for (const term of terms) {
      const tf = frequency.get(term) ?? 0;
      if (!tf) continue;
      const df = counts.get(term);
      const saturation = 1.2 * (0.25 + 0.75 * length / averageLength);
      bm25 += Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5)) * (2.2 * tf) / (tf + saturation);
      dot += (1 + Math.log(tf)) * idf(term) ** 2;
      matched += 1;
    }
    let squaredWeights = 0;
    for (const [term, tf] of frequency) squaredWeights += ((1 + Math.log(tf)) * idf(term)) ** 2;
    const docNorm = Math.sqrt(squaredWeights);
    return { ...chunk, bm25, tfidf: docNorm ? dot / (queryNorm * docNorm) : 0, matched, coverage: matched / terms.length };
  });
  const maxBm25 = scored.reduce((max, hit) => Math.max(max, hit.bm25), 0) || 1;
  const maxTfidf = scored.reduce((max, hit) => Math.max(max, hit.tfidf), 0) || 1;
  return scored.map((hit) => {
    const hybrid = (hit.bm25 / maxBm25 + hit.tfidf / maxTfidf) / 2;
    return { ...hit, score: retrieval === 'hybrid' ? hybrid : hit[retrieval] };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}

function compact(text) {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function supports(hit, example) {
  return hit.doc.id === example.doc_id && hit.page === example.page
    && compact(hit.quote).includes(compact(example.evidence));
}

export function runQuestion(documents, examples, question, config) {
  const hits = retrieve(documents, question, config);
  const query = words(question, config.normalize).join(' ');
  const example = examples.find((row) => words(row.question, config.normalize).join(' ') === query);
  const evidence = example && hits.find((hit) => supports(hit, example));
  const source = evidence ?? hits.find((hit) => hit.matched >= 2 && hit.coverage >= 0.65);
  const verified = Boolean(config.verify && source && source.doc.pages.some(({ page, text }) => (
    page === source.page && compact(text).includes(compact(source.quote))
  )));
  return { hits, source, verified, example: evidence ? example : null, config, question };
}

export function evaluate(documents, examples, config) {
  const sample = examples.filter(({ doc_id }) => doc_id.startsWith(`${config.domain}/`));
  if (!sample.length) return null;
  const totals = sample.reduce((totals, example) => {
    const result = runQuestion(documents, examples, example.question, config);
    const rank = result.hits.findIndex((hit) => supports(hit, example)) + 1;
    return {
      recall: totals.recall + Number(rank > 0),
      mrr: totals.mrr + (rank ? 1 / rank : 0),
      ndcg: totals.ndcg + (rank ? 1 / Math.log2(rank + 1) : 0),
      verified: totals.verified + Number(Boolean(result.example && result.verified)),
    };
  }, { recall: 0, mrr: 0, ndcg: 0, verified: 0 });
  return {
    recall: totals.recall / sample.length,
    mrr: totals.mrr / sample.length,
    ndcg: totals.ndcg / sample.length,
    verified: totals.verified,
    total: sample.length,
  };
}
