import { icon } from './icons.js';
import { sourceUrl } from './api.js';
import { domains, retrievers, strategies } from './settings.js';

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
  quote = quote.replace(/\s+/g, ' ').trim();
  if (evidence) {
    const start = quote.indexOf(evidence);
    if (start >= 0) {
      const end = start + evidence.length;
      return `${escape(quote.slice(0, start))}<mark>${escape(evidence)}</mark>${escape(quote.slice(end))}`;
    }
  }
  return escape(quote);
}

function sourceLink(id, page) {
  return `<a class="text-button" href="${escape(sourceUrl(id, page))}" target="_blank" rel="noopener">Mở tài liệu gốc</a>`;
}

function lookupStatus(controller, error) {
  if (controller) return '<p class="empty panel lookup-status" role="status">Đang tra cứu tài liệu…</p>';
  if (error) return `<p class="empty panel lookup-status notice-error" role="alert">${escape(error)}</p>`;
  return '';
}

function citeButton(index, prefix) {
  return `<button class="citation" type="button" data-action="citation" data-target="${prefix}-${index}"
    aria-label="Xem nguồn ${index + 1}">[${index + 1}]</button>`;
}

function sourceList(result, prefix, title = 'Nguồn trích dẫn') {
  const { hits, answer, citationIndex } = result;
  return `<aside class="sources" aria-label="${title}">
    <div class="sources-heading"><div><h2 class="eyebrow">${title}</h2><p>Đối chiếu với tài liệu gốc</p></div>
      <span class="pill neutral">${hits.length} đoạn</span></div>
    ${hits.map((hit, index) => `<article class="source panel" id="${prefix}-${index}" tabindex="-1">
      <div class="source-header"><span class="source-icon">${icon('file', 17)}</span>
        <div><div class="source-title">${escape(hit.doc.name)}</div><div class="small">${location(hit)}</div></div>
        <span class="citation label">[${index + 1}]</span>
      </div>
      <blockquote>${citedQuote(hit.quote, index === citationIndex ? answer.citations[0].quote : null)}</blockquote>
      <p class="source-link">${sourceLink(hit.doc.id, hit.page)}</p>
    </article>`).join('') || '<p class="empty panel">Không tìm thấy đoạn phù hợp trong miền này.</p>'}
  </aside>`;
}

export function qaView({ draft, result, example, controller, error }) {
  return `${pageTitle('Tra cứu tài liệu', 'Hỏi đáp có kiểm chứng', 'Đặt câu hỏi và đối chiếu câu trả lời với đoạn văn trong tài liệu gốc.')}
    ${queryForm('ask', draft, 'Hỏi')}
    <div class="suggestions"><span>Câu hỏi mẫu</span>
      ${example ? `<button type="button" data-action="example" data-question="${escape(example)}">${escape(example)}</button>` : ''}
      <button type="button" data-action="example" data-question="Học phí mỗi học kỳ là bao nhiêu?">Học phí chưa có dữ liệu</button>
    </div>
    ${lookupStatus(controller, error)}
    ${result ? `<div class="results-grid" aria-live="polite">
      ${!result.answer.abstained ? `<article class="answer panel">
        <header class="answer-heading"><h2 class="eyebrow">Câu trả lời trích xuất</h2>
          <span class="pill ${result.verified ? 'success' : 'neutral'}">${icon(result.verified ? 'shield' : 'file', 14)}
            ${result.verified ? 'Đã đối chiếu trích đoạn' : 'Trích dẫn nguyên văn'}</span></header>
        <p class="serif answer-text">${escape(result.answer.text)} ${citeButton(result.citationIndex, 'source')}</p>
      </article>` : `<article class="answer warning panel">
        <span class="warning-icon">${icon('warning', 22)}</span><h2>Không đủ bằng chứng để trả lời</h2>
        <p>Chưa tìm thấy câu trả lời trực tiếp trong các đoạn truy xuất ở miền ${escape(domains[result.config.domain])}.</p>
        <div class="actions"><a class="button primary" href="#thu-vien">Thêm tài liệu</a>
          <button class="button secondary" type="button" data-action="rephrase">Diễn đạt lại</button></div>
      </article>`}
      ${sourceList(result, 'source', result.answer.abstained ? 'Đoạn đã truy xuất' : 'Nguồn trích dẫn')}
    </div>` : ''}`;
}

export function libraryView({ documents, selectedDocument, upload, libraryLoading, libraryError, ocr }) {
  const doc = documents.find(({ id }) => id === selectedDocument?.id);
  const chunks = selectedDocument?.chunks;
  return `${pageTitle('Kho tài liệu', 'Thư viện tài liệu', 'Thêm tài liệu và xem văn bản theo trang, điều hoặc mục.')}
    <form id="upload" class="panel upload" aria-busy="${upload.busy}">
      <div class="section-title"><h2>Thêm tài liệu</h2><p class="small">Tài liệu được lưu trong thư viện và có thể tra cứu sau khi tải lại trang.</p></div>
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
      ${ocr.id ? '<p class="empty" role="status">Đang nhận dạng văn bản và cập nhật chỉ mục…</p>' : ''}
      ${ocr.message ? `<p class="empty ${ocr.error ? 'notice-error' : ''}" role="status">${escape(ocr.message)}</p>` : ''}
      ${libraryLoading ? '<p class="empty" role="status">Đang tải thư viện…</p>' : ''}
      ${libraryError ? `<p class="empty notice-error" role="alert">${escape(libraryError)}
        <button type="button" class="text-button" data-action="reload-library">Thử lại</button></p>` : ''}
      <div class="table-scroll" tabindex="0" role="region" aria-label="Danh sách tài liệu"><table>
        <thead><tr><th scope="col">Tài liệu</th><th scope="col">Miền</th><th scope="col">Chia đoạn</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
        <tbody>${documents.map((item) => `<tr>
          <td><strong>${escape(item.title)}</strong><small>${escape(item.sample ? item.name : 'Tệp đã nhập')}</small></td>
          <td>${domains[item.domain]}</td><td>${strategies[item.strategy]}</td>
          <td><span class="pill ${item.needsOcr ? 'caution' : 'success'}">${icon(item.needsOcr ? 'warning' : 'check', 13)}
            ${item.needsOcr ? 'Cần OCR' : 'Đã xử lý'}</span></td>
          <td><button type="button" class="text-button" data-action="document" data-id="${escape(item.id)}"
            aria-controls="document-preview" aria-expanded="${doc === item}">${doc === item ? 'Đang xem' : 'Xem đoạn'}</button>
          ${item.needsOcr ? `<button type="button" class="text-button ocr-button" data-action="ocr" data-id="${escape(item.id)}" ${ocr.id ? 'disabled' : ''}>Chạy OCR</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section class="panel document-preview" id="document-preview" tabindex="-1" ${doc ? '' : 'hidden'}>
      ${doc ? `<div class="section-title"><h2>${escape(doc.title)}</h2>${sourceLink(doc.id)}
        ${chunks ? `<span class="pill neutral">${chunks.length} đoạn</span>` : ''}</div>
        ${selectedDocument.error ? `<p class="notice notice-error" role="alert">${escape(selectedDocument.error)}</p>` : ''}
        ${!chunks && !selectedDocument.error ? '<p class="small" role="status">Đang tải trích đoạn…</p>' : ''}
        ${chunks?.length ? `<ol class="passages">${chunks.map((chunk) => `<li><strong>${location(chunk)}</strong>
          <p class="serif">${escape(chunk.quote)}</p></li>`).join('')}</ol>` : ''}
        ${chunks?.length === 0 ? '<p>Hãy chạy OCR để tạo lớp văn bản trước khi tra cứu tài liệu này.</p>' : ''}` : ''}
    </section>`;
}

export function compareView({ draft, result, controller, error }) {
  const intro = `${pageTitle('Đối chiếu', 'So sánh câu trả lời', 'Đối chiếu quy tắc trích xuất với AI cục bộ trên cùng các đoạn truy xuất.')}
    ${queryForm('compare', draft, 'So sánh')}${lookupStatus(controller, error)}`;
  if (!result) return intro;
  const baseline = result.hits[0];
  const ai = result.ai;
  return `${intro}
    <div class="compare-grid">
      <article class="panel comparison"><h2>Thuật toán thuần</h2><p class="small">Chọn câu theo quy tắc trích xuất</p>
        <p class="serif">${escape(result.answer.text)} ${result.answer.abstained ? '' : citeButton(result.citationIndex, 'rank')}</p>
        ${result.verified ? '<span class="pill success">Đã đối chiếu trích đoạn</span>' : ''}
      </article>
      <article class="panel comparison"><h2>Thuật toán + AI</h2><p class="small">${ai ? escape(ai.model) : 'Mô hình cục bộ'}</p>
        ${ai?.answer ? `<p class="serif">${escape(ai.answer.text)} ${[...new Set(ai.citationIndices)].map((index) => citeButton(index, 'rank')).join(' ')}</p>`
          : `<p class="small">${escape(ai?.error ?? 'Khởi động mô hình theo hướng dẫn trong README để dùng phần so sánh.')}</p>`}
      </article>
    </div>
    <section class="panel table-card"><div class="section-title"><h2>Đoạn truy xuất</h2><span class="pill neutral">${retrievers[result.config.retrieval]}</span></div>
      ${result.hits.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Đoạn truy xuất"><table>
        <thead><tr><th scope="col">Hạng</th><th scope="col">Nguồn và trích đoạn</th><th scope="col">Điểm tương đối</th></tr></thead><tbody>
        ${result.hits.map((hit, rank) => {
          const percent = Math.round(hit.score / baseline.score * 100);
          return `<tr id="rank-${rank}" tabindex="-1"><td>[${rank + 1}]</td><td><strong>${escape(hit.doc.name)}</strong>
            <small>${location(hit)}</small><p>${escape(hit.quote)}</p>${sourceLink(hit.doc.id, hit.page)}</td>
            <td><meter aria-label="Điểm tương đối" min="0" max="100" value="${percent}">${percent}%</meter> ${percent}%</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">Chưa có đoạn phù hợp.</p>'}
    </section>`;
}

function metric(value) {
  return value == null ? '—' : value.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function experimentView({ experiment, experimentDomain, experimentSplit, labRows, labTopK, labSplit, yamlFile, yamlError }) {
  return `${pageTitle('Đánh giá pipeline', 'Thí nghiệm', 'Đo khả năng truy xuất, trích dẫn và từ chối trên tập câu hỏi có gán nhãn.')}
    <div class="experiment-nav" role="group" aria-label="Chọn thí nghiệm">
      ${Object.entries(experiments).map(([id, label]) => `<button type="button" class="button secondary"
        data-action="experiment" data-id="${id}" aria-pressed="${id === experiment}">${id.toUpperCase()} ${label}</button>`).join('')}
    </div>
    <form id="experiment" class="panel lab-config">
      ${select('experimentDomain', 'Miền đánh giá', domains, experimentDomain)}
      ${select('experimentSplit', 'Tập đánh giá', { test: 'Kiểm tra · 24 câu', dev: 'Phát triển · 20 câu' }, experimentSplit)}
      <label class="field yaml-field"><span>Cấu hình YAML (tùy chọn)</span><input type="file" accept=".yaml,.yml" name="yaml">
        ${yamlFile ? `<small>${escape(yamlFile)}</small>` : ''}</label>
      <button class="button primary" type="submit">Chạy thí nghiệm</button>
      ${yamlError ? `<p class="notice notice-error" role="status">${escape(yamlError)}</p>` : ''}
    </form>
    <section class="panel table-card" aria-live="polite">
      <div class="section-title"><div><h2>Kết quả đánh giá</h2>${labRows ? `<p class="small">${labSplit === 'test' ? 'Tập kiểm tra' : 'Tập phát triển'}</p>` : ''}</div><button class="button secondary" type="button" data-action="export" ${labRows ? '' : 'disabled'}>
        ${icon('download', 16)} Xuất CSV</button></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Kết quả đánh giá"><table>
        <thead><tr><th scope="col">Cấu hình</th><th scope="col">Recall@${labTopK}</th><th scope="col">MRR</th><th scope="col">nDCG@${labTopK}</th><th scope="col">Trích dẫn đúng</th><th scope="col">Đã đối chiếu</th><th scope="col">Từ chối đúng</th></tr></thead>
        <tbody>${(labRows ?? []).map(({ label, stats }) => `<tr><td><strong>${label}</strong></td>
          <td>${metric(stats?.recall)}</td><td>${metric(stats?.mrr)}</td><td>${metric(stats?.ndcg)}</td>
          <td>${stats.positives ? `${stats.correct}/${stats.positives}` : '—'}</td>
          <td>${stats.correct ? `${stats.verified}/${stats.correct}` : '—'}</td>
          <td>${stats.negatives ? `${stats.abstentions}/${stats.negatives}` : '—'}</td></tr>`).join('') || '<tr><td colspan="7">Chưa chạy thí nghiệm</td></tr>'}</tbody>
      </table></div>
    </section>`;
}
