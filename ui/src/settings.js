export const domains = { quy_che: 'Quy chế', giao_trinh: 'Giáo trình', bai_bao: 'Bài báo' };
export const strategies = { section: 'Điều – Mục', sentence: 'Câu – đoạn', fixed: 'Cố định từ' };
export const retrievers = { bm25: 'BM25', tfidf: 'TF-IDF', hybrid: 'Hybrid' };
export const defaults = {
  domain: 'quy_che', strategy: 'section', retrieval: 'hybrid', topK: 5, normalize: true, verify: true,
};
export const examples = {
  quy_che: 'Sinh viên được mượn tài liệu trong bao lâu?',
  giao_trinh: 'Tập kiểm thử được dùng để làm gì?',
  bai_bao: 'Thí nghiệm minh họa dùng chỉ số nào?',
};
