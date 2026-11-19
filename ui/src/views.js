import { icon } from './icons.js';
import { domains, retrievers, splitDocument, strategies } from './pipeline.js';

export const navigation = {
  'hoi-dap': ['Hỏi đáp', 'chat'], 'thu-vien': ['Thư viện', 'book'],
  'so-sanh': ['So sánh', 'compare'], 'thi-nghiem': ['Thí nghiệm', 'lab'],
};

export const experiments = {
  e1: 'Chia đoạn', e2: 'Truy xuất', e3: 'Chuẩn hóa', e4: 'Trích dẫn', e5: 'Miền tài liệu',
};

export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function select(name, label, choices, value) {
  return `<label class="field"><span>${label}</span><select name="${name}">
    ${Object.entries(choices).map(([key, text]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`).join('')}
  </select></label>`;
}

export function sidebar(config) {
  return `<a class="brand" href="#hoi-dap">
    <span class="brand-mark">${icon('book', 22)}</span>
    <span><strong>CiteDoc-VN</strong><small>Hỏi đáp có trích dẫn</small></span>
  </a>
  <nav aria-label="Điều hướng chính">
    ${Object.entries(navigation).map(([id, [label, glyph]]) => `
      <a href="#${id}" data-route="${id}">${icon(glyph)}<span>${label}</span></a>`).join('')}
  </nav>
  <section class="pipeline" aria-labelledby="pipeline-title">
    <div class="pipeline-title"><h2 id="pipeline-title">Cấu hình pipeline</h2><span class="applied">Đang áp dụng</span></div>
    <div class="pipeline-fields">
      ${select('domain', 'Miền tài liệu', domains, config.domain)}
      ${select('strategy', 'Chia đoạn', strategies, config.strategy)}
      ${select('retrieval', 'Truy xuất', retrievers, config.retrieval)}
      <div class="field">
        <span id="top-k-label">Top-k</span>
        <div class="stepper" role="group" aria-labelledby="top-k-label">
          <button type="button" data-action="step" data-delta="-1" aria-label="Giảm Top-k">−</button>
          <output id="top-k">${config.topK}</output>
          <button type="button" data-action="step" data-delta="1" aria-label="Tăng Top-k">+</button>
        </div>
      </div>
    </div>
    <div class="switches">
      <label class="switch">Chuẩn hóa câu hỏi<input name="normalize" type="checkbox" role="switch" ${config.normalize ? 'checked' : ''}></label>
      <label class="switch">Kiểm tra trích dẫn<input name="verify" type="checkbox" role="switch" ${config.verify ? 'checked' : ''}></label>
    </div>
  </section>
  <div class="demo-label">Bản demo · ${icon('file', 14)} Dữ liệu cục bộ</div>`;
}

function pageTitle(category, title, description) {
  return `<header class="page-heading"><p class="kicker">${category}</p>
    <h1>${title}</h1><p class="page-description">${description}</p></header>`;
}

function queryForm(id, question, actionText) {
  return `<form class="query" id="${id}">
    ${icon('search', 21)}<input type="search" name="question" value="${escape(question)}" maxlength="500"
      aria-label="Câu hỏi" placeholder="Nhập câu hỏi về tài liệu…" autocomplete="off" required>
    <button class="button primary" type="submit">${actionText}</button>
  </form>`;
}

function location(hit) {
  return [hit.page ? `Trang ${hit.page}` : 'Văn bản', hit.heading].filter(Boolean).map(escape).join(' · ');
}

function citedQuote(quote, evidence) {
  if (evidence) {
    const start = quote.indexOf(evidence);
    if (start >= 0) {
      const end = start + evidence.length;
      return `${escape(quote.slice(0, start))}<mark>${escape(evidence)}</mark>${escape(quote.slice(end))}`;
    }
  }
  return `<mark>${escape(quote)}</mark>`;
}

function citeButton(index, prefix) {
  return `<button class="citation" type="button" data-action="citation" data-target="${prefix}-${index}"
    aria-label="Xem nguồn ${index + 1}">[${index + 1}]</button>`;
}

function sourceList(result, prefix, title = 'Nguồn trích dẫn') {
  const { hits, source, example } = result;
  return `<aside class="sources" aria-label="${title}">
    <div class="sources-heading"><div><h2 class="eyebrow">${title}</h2><p>Đối chiếu với tài liệu gốc</p></div>
      <span class="pill neutral">${hits.length} đoạn</span></div>
    ${hits.map((hit, index) => `<article class="source panel" id="${prefix}-${index}" tabindex="-1">
      <div class="source-header"><span class="source-icon">${icon('file', 17)}</span>
        <div><div class="source-title">${escape(hit.doc.name)}</div><div class="small">${location(hit)}</div></div>
        <span class="citation label">[${index + 1}]</span>
      </div>
      <blockquote>${source === hit ? citedQuote(hit.quote, example?.evidence) : escape(hit.quote)}</blockquote>
    </article>`).join('') || '<p class="empty panel">Không tìm thấy đoạn phù hợp trong miền này.</p>'}
  </aside>`;
}

export function qaView({ question, result, example, algorithm }) {
  const citation = result.hits.indexOf(result.source);
  const answer = result.example?.answer ?? result.source?.quote;
  return `${pageTitle('Tra cứu tài liệu', 'Hỏi đáp có kiểm chứng', 'Đặt câu hỏi và đối chiếu câu trả lời với đoạn văn trong tài liệu gốc.')}
    ${queryForm('ask', question, 'Hỏi')}
    <div class="suggestions"><span>Câu hỏi mẫu</span>
      ${example ? `<button type="button" data-action="example" data-question="${escape(example.question)}">${escape(example.question)}</button>` : ''}
      <button type="button" data-action="example" data-question="Học phí mỗi học kỳ là bao nhiêu?">Học phí chưa có dữ liệu</button>
    </div>
    <div class="results-grid" aria-live="polite">
      ${result.source ? `<article class="answer panel">
        <header class="answer-heading"><h2 class="eyebrow">${result.example ? 'Câu trả lời' : 'Trích đoạn liên quan'}</h2>
          <span class="pill ${result.verified ? 'success' : 'neutral'}">${icon(result.verified ? 'shield' : 'file', 14)}
            ${result.verified ? 'Đã đối chiếu nguồn' : 'Chưa đối chiếu nguồn'}</span></header>
        <p class="serif answer-text">${escape(answer)} ${citeButton(citation, 'source')}</p>
        ${result.example ? `<details><summary>Xem đoạn thuật toán truy xuất</summary>
          <p class="serif">${escape(algorithm?.quote ?? result.source.quote)}</p></details>` : ''}
        <footer class="answer-footer">${icon('file', 15)} 1 đoạn hỗ trợ <span aria-hidden="true">·</span> ${result.example ? 'Bộ câu hỏi mẫu' : 'Trích dẫn nguyên văn'}</footer>
      </article>` : `<article class="answer warning panel">
        <span class="warning-icon">${icon('warning', 22)}</span><h2>Không đủ bằng chứng để trả lời</h2>
        <p>Tài liệu trong miền ${escape(domains[result.config.domain])} chưa có đoạn đủ sát với câu hỏi này.</p>
        <div class="actions"><a class="button primary" href="#thu-vien">Thêm tài liệu</a>
          <button class="button secondary" type="button" data-action="rephrase">Diễn đạt lại</button></div>
      </article>`}
      ${sourceList(result, 'source', result.source ? 'Nguồn trích dẫn' : 'Đoạn đã truy xuất')}
    </div>`;
}

export function libraryView({ documents, selectedDocument, upload }) {
  const doc = documents.find(({ id }) => id === selectedDocument);
  const chunks = doc ? splitDocument(doc, doc.strategy) : [];
  return `${pageTitle('Kho tài liệu', 'Thư viện tài liệu', 'Thêm tài liệu và xem văn bản theo trang, điều hoặc mục.')}
    <form id="upload" class="panel upload" aria-busy="${upload.busy}">
      <div class="section-title"><h2>Thêm tài liệu</h2><p class="small">Tệp được xử lý trong trình duyệt và lưu trong phiên hiện tại.</p></div>
      <label class="file-field">${icon('upload', 22)}<span><strong>Chọn tệp tài liệu</strong><small>PDF, DOCX, TXT UTF-8 · tối đa 10 MB mỗi tệp</small></span>
        <input type="file" name="files" accept=".pdf,.docx,.txt" multiple required ${upload.busy ? 'disabled' : ''}></label>
      <div class="form-row">
        ${select('uploadDomain', 'Miền tài liệu', domains, upload.domain)}
        ${select('uploadStrategy', 'Chia đoạn', strategies, upload.strategy)}
        <button type="submit" class="button primary" ${upload.busy ? 'disabled' : ''}>${upload.busy ? 'Đang xử lý…' : 'Xử lý'}</button>
      </div>
      ${upload.message ? `<p class="notice ${upload.error ? 'notice-error' : ''}" role="status">${escape(upload.message)}</p>` : ''}
    </form>
    <section class="panel table-card">
      <div class="section-title"><h2>Danh sách tài liệu</h2><span class="pill neutral">${documents.length} tài liệu</span></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Danh sách tài liệu"><table>
        <thead><tr><th scope="col">Tài liệu</th><th scope="col">Miền</th><th scope="col">Chia đoạn</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
        <tbody>${documents.map((item) => `<tr>
          <td><strong>${escape(item.title)}</strong><small>${escape(item.sample ? item.name : 'Tệp đã thêm trong phiên')}</small></td>
          <td>${domains[item.domain]}</td><td>${strategies[item.strategy]}</td>
          <td><span class="pill ${item.needsOcr ? 'caution' : 'success'}">${icon(item.needsOcr ? 'warning' : 'check', 13)}
            ${item.needsOcr ? 'Cần OCR' : 'Đã xử lý'}</span></td>
          <td><button type="button" class="text-button" data-action="document" data-id="${escape(item.id)}"
            aria-controls="document-preview" aria-expanded="${doc === item}">${doc === item ? 'Đang xem' : 'Xem đoạn'}</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section class="panel document-preview" id="document-preview" tabindex="-1" ${doc ? '' : 'hidden'}>
      ${doc ? `<div class="section-title"><h2>${escape(doc.title)}</h2><span class="pill neutral">${chunks.length} đoạn</span></div>
        ${chunks.length ? `<ol class="passages">${chunks.map((chunk) => `<li><strong>${location(chunk)}</strong>
          <p class="serif">${escape(chunk.quote)}</p></li>`).join('')}</ol>` : '<p>Hãy chạy OCR để tạo lớp văn bản trước khi tra cứu tài liệu này.</p>'}` : ''}
    </section>`;
}

export function compareView({ compareQuestion, comparison }) {
  if (!comparison) return `${pageTitle('Đối chiếu', 'So sánh câu trả lời', 'Xem đoạn truy xuất và câu trả lời từ bộ mẫu cho cùng một câu hỏi.')}
    ${queryForm('compare', compareQuestion, 'So sánh')}<p class="empty panel">Nhập câu hỏi để bắt đầu so sánh.</p>`;
  const baseline = comparison.hits[0];
  const index = comparison.hits.indexOf(comparison.source);
  return `${pageTitle('Đối chiếu', 'So sánh câu trả lời', 'Xem đoạn truy xuất và câu trả lời từ bộ mẫu cho cùng một câu hỏi.')}
    ${queryForm('compare', compareQuestion, 'So sánh')}
    <div class="compare-grid">
      <article class="panel comparison"><h2>Chỉ thuật toán</h2><p class="small">Đoạn có điểm truy xuất cao nhất</p>
        <p class="serif">${baseline ? `${escape(baseline.quote)} ${citeButton(0, 'rank')}` : 'Không có kết quả truy xuất.'}</p></article>
      <article class="panel comparison"><h2>Trả lời từ bộ mẫu</h2><p class="small">Hiển thị khi tìm thấy đúng bằng chứng</p>
        <p class="serif">${comparison.example ? `${escape(comparison.example.answer)} ${citeButton(index, 'rank')}` : 'Chưa có đáp án mẫu được nguồn hỗ trợ cho câu hỏi này.'}</p>
        ${comparison.example ? `<span class="pill ${comparison.verified ? 'success' : 'neutral'}">${comparison.verified ? 'Đã đối chiếu nguồn' : 'Chưa đối chiếu nguồn'}</span>` : ''}
      </article>
    </div>
    <section class="panel table-card"><div class="section-title"><h2>Đoạn truy xuất</h2><span class="pill neutral">${retrievers[comparison.config.retrieval]}</span></div>
      ${comparison.hits.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Đoạn truy xuất"><table>
        <thead><tr><th scope="col">Hạng</th><th scope="col">Nguồn và trích đoạn</th><th scope="col">Điểm tương đối</th></tr></thead><tbody>
        ${comparison.hits.map((hit, rank) => {
          const percent = Math.round(hit.score / baseline.score * 100);
          return `<tr id="rank-${rank}" tabindex="-1"><td>[${rank + 1}]</td><td><strong>${escape(hit.doc.name)}</strong>
            <small>${location(hit)}</small><p>${escape(hit.quote)}</p></td>
            <td><meter aria-label="Điểm tương đối" min="0" max="100" value="${percent}">${percent}%</meter> ${percent}%</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">Chưa có đoạn phù hợp.</p>'}
    </section>`;
}

function metric(value) {
  return value == null ? '—' : value.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function experimentView({ experiment, experimentDomain, labRows, labTopK, yamlFile, yamlError }) {
  return `${pageTitle('Đánh giá pipeline', 'Thí nghiệm', 'Đo khả năng tìm lại đoạn bằng chứng trên bộ câu hỏi mẫu của dự án.')}
    <div class="experiment-nav" role="group" aria-label="Chọn thí nghiệm">
      ${Object.entries(experiments).map(([id, label]) => `<button type="button" class="button secondary"
        data-action="experiment" data-id="${id}" aria-pressed="${id === experiment}">${id.toUpperCase()} ${label}</button>`).join('')}
    </div>
    <form id="experiment" class="panel lab-config">
      ${select('experimentDomain', 'Miền đánh giá', domains, experimentDomain)}
      <label class="field yaml-field"><span>Cấu hình YAML (tùy chọn)</span><input type="file" accept=".yaml,.yml" name="yaml">
        ${yamlFile ? `<small>${escape(yamlFile)}</small>` : ''}</label>
      <button class="button primary" type="submit">Chạy thí nghiệm</button>
      ${yamlError ? `<p class="notice notice-error" role="status">${escape(yamlError)}</p>` : ''}
    </form>
    <section class="panel table-card" aria-live="polite">
      <div class="section-title"><h2>Kết quả đánh giá</h2><button class="button secondary" type="button" data-action="export" ${labRows ? '' : 'disabled'}>
        ${icon('download', 16)} Xuất CSV</button></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Kết quả đánh giá"><table>
        <thead><tr><th scope="col">Cấu hình</th><th scope="col">Recall@${labTopK}</th><th scope="col">MRR</th><th scope="col">nDCG@${labTopK}</th><th scope="col">Đã đối chiếu</th></tr></thead>
        <tbody>${(labRows ?? []).map(({ label, stats }) => `<tr><td><strong>${label}</strong></td>
          <td>${metric(stats?.recall)}</td><td>${metric(stats?.mrr)}</td><td>${metric(stats?.ndcg)}</td>
          <td>${stats ? `${stats.verified}/${stats.total}` : '—'}</td></tr>`).join('') || '<tr><td>Chưa chạy thí nghiệm</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>'}</tbody>
      </table></div>
    </section>`;
}
