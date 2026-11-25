import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './style.css';
import { askQuestion, listChunks, listDocuments, recognizeDocument, runEvaluation, uploadDocument } from './api.js';
import { defaults, domains, examples, retrievers, strategies } from './settings.js';
import { compareView, experimentView, libraryView, navigation, qaView, sidebar } from './views.js';

const settings = { ...defaults };
const sidebarElement = document.querySelector('#sidebar');
const main = document.querySelector('#main');
const upload = { domain: settings.domain, strategy: settings.strategy, busy: false, message: '', error: false };
const lookupRoutes = { 'hoi-dap': 'ask', 'so-sanh': 'compare' };
const lookups = Object.fromEntries(Object.values(lookupRoutes).map((id) => [id, {
  draft: examples[settings.domain], submitted: examples[settings.domain], result: null, error: '', controller: null,
}]));

let route;
let documents = [];
let libraryLoading = false;
let libraryError = '';
let selectedDocument = null;
const ocr = { id: null, message: '', error: false };
let experiment = 'e2';
let experimentDomain = settings.domain;
let experimentSplit = 'test';
let labRows = null;
let labTopK = settings.topK;
let labSplit = experimentSplit;
let yamlFile = '';
let yamlError = '';

function render() {
  const field = document.activeElement;
  const editing = field?.name === 'question' && main.contains(field);
  const selection = editing ? [field.selectionStart, field.selectionEnd] : null;
  switch (route) {
    case 'thu-vien':
      main.innerHTML = libraryView({ documents, selectedDocument, upload, libraryLoading, libraryError, ocr });
      break;
    case 'so-sanh':
      main.innerHTML = compareView(lookups.compare);
      break;
    case 'thi-nghiem':
      main.innerHTML = experimentView({ experiment, experimentDomain, experimentSplit, labRows, labTopK, labSplit, yamlFile, yamlError });
      break;
    default:
      main.innerHTML = qaView({ ...lookups.ask, example: examples[settings.domain] });
  }
  if (selection) {
    const replacement = main.querySelector('[name="question"]');
    replacement?.focus({ preventScroll: true });
    replacement?.setSelectionRange(...selection);
  }
}

async function query(id, question) {
  const lookup = lookups[id];
  lookup.controller?.abort();
  const controller = new AbortController();
  Object.assign(lookup, { submitted: question, result: null, error: '', controller });
  if (lookupRoutes[route] === id) render();

  try {
    const result = await askQuestion(question, settings, controller.signal, id === 'compare');
    if (lookup.controller === controller) lookup.result = result;
  } catch (error) {
    if (error.name !== 'AbortError' && lookup.controller === controller) lookup.error = error.message;
  } finally {
    if (lookup.controller === controller) {
      lookup.controller = null;
      if (lookupRoutes[route] === id) render();
    }
  }
}

async function loadLibrary() {
  if (libraryLoading) return;
  libraryLoading = true;
  libraryError = '';
  if (route === 'thu-vien') render();
  try {
    documents = await listDocuments();
  } catch (error) {
    libraryError = error.message;
  } finally {
    libraryLoading = false;
    if (route === 'thu-vien') render();
  }
}

function goToRoute(moveFocus = false) {
  const requested = location.hash.slice(1);
  if (requested === 'main' && route) return;
  route = Object.hasOwn(navigation, requested) ? requested : 'hoi-dap';
  for (const link of sidebarElement.querySelectorAll('[data-route]')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${navigation[route][0]} | CiteDoc-VN`;
  render();
  const id = lookupRoutes[route];
  if (id && !lookups[id].result && !lookups[id].controller) void query(id, lookups[id].submitted);
  if (route === 'thu-vien' && !upload.busy) void loadLibrary();
  if (moveFocus) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function refreshResults(previousDomain) {
  const previousExample = examples[previousDomain];
  for (const [id, lookup] of Object.entries(lookups)) {
    lookup.controller?.abort();
    lookup.controller = null;
    lookup.result = null;
    if (previousExample && lookup.draft === previousExample) lookup.draft = examples[settings.domain];
    if (previousExample && lookup.submitted === previousExample) lookup.submitted = examples[settings.domain];
    if (lookupRoutes[route] === id) void query(id, lookup.submitted);
  }
}

function updateStepper() {
  sidebarElement.querySelector('#top-k').value = settings.topK;
  sidebarElement.querySelector('[data-delta="-1"]').disabled = settings.topK === 1;
  sidebarElement.querySelector('[data-delta="1"]').disabled = settings.topK === 10;
}

async function importFiles(files) {
  if (upload.busy || !files.length) return;
  const { domain, strategy } = upload;
  upload.busy = true;
  upload.message = '';
  render();
  const added = [];
  const errors = [];
  let duplicates = 0;
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      errors.push(`${file.name} vượt quá 10 MB.`);
      continue;
    }
    try {
      const { document: item, created } = await uploadDocument(file, domain, strategy);
      if (created) added.push(item);
      else duplicates += 1;
    } catch (error) {
      errors.push(`${file.name}: ${error.message || 'Không đọc được tệp.'}`);
    }
  }
  upload.busy = false;
  upload.error = errors.length > 0;
  upload.message = [
    added.length ? `Đã thêm ${added.length} tài liệu.` : '',
    duplicates ? `${duplicates} tài liệu đã có trong thư viện.` : '',
    ...errors,
  ].filter(Boolean).join(' ');
  refreshResults();
  if (route === 'thu-vien') {
    await loadLibrary();
    if (added.length && route === 'thu-vien') void showDocument(added.at(-1).id, false);
  }
}

async function showDocument(id, focus) {
  if (selectedDocument?.id === id) {
    selectedDocument = null;
    render();
    if (focus) main.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus();
    return;
  }
  const preview = { id, chunks: null, error: '' };
  selectedDocument = preview;
  render();
  if (focus) main.querySelector('#document-preview')?.focus();
  try {
    preview.chunks = await listChunks(id);
  } catch (error) {
    preview.error = error.message;
  }
  if (selectedDocument === preview && route === 'thu-vien') {
    const restoreFocus = document.activeElement?.id === 'document-preview';
    render();
    if (restoreFocus) main.querySelector('#document-preview')?.focus({ preventScroll: true });
  }
}

async function recognize(id) {
  if (ocr.id) return;
  Object.assign(ocr, { id, message: '', error: false });
  render();
  try {
    const { document, recognized } = await recognizeDocument(id);
    documents = documents.map((item) => item.id === id ? document : item);
    ocr.message = recognized ? `Đã đọc và lập chỉ mục ${recognized} trang. ${document.needsOcr ? 'Một số trang vẫn chưa nhận dạng được.' : ''}`
      : 'Không nhận dạng được thêm văn bản từ các trang còn lại.';
    if (selectedDocument?.id === id) {
      const preview = selectedDocument;
      preview.chunks = await listChunks(id);
    }
    refreshResults();
  } catch (error) {
    Object.assign(ocr, { message: error.message, error: true });
  } finally {
    ocr.id = null;
    if (route === 'thu-vien') render();
  }
}

function labVariants(config, id) {
  switch (id) {
    case 'e1':
      return Object.entries(strategies).map(([strategy, label]) => ({ label, config: { ...config, strategy } }));
    case 'e3':
      return [true, false].map((normalize) => ({ label: normalize ? 'Bật chuẩn hóa' : 'Tắt chuẩn hóa', config: { ...config, normalize } }));
    case 'e4':
      return [true, false].map((verify) => ({ label: verify ? 'Bật đối chiếu nguồn' : 'Tắt đối chiếu nguồn', config: { ...config, verify } }));
    case 'e5':
      return Object.entries(domains).map(([domain, label]) => ({ label, config: { ...config, domain } }));
    default:
      return Object.entries(retrievers).map(([retrieval, label]) => ({ label, config: { ...config, retrieval } }));
  }
}

async function readYaml(file) {
  if (file.size > 16384) throw new Error('Tệp YAML phải nhỏ hơn hoặc bằng 16 KB.');
  const { parse } = await import('yaml');
  const config = parse(await file.text(), { maxAliasCount: 0 });
  const allowed = {
    domain: (value) => typeof value === 'string' && Object.hasOwn(domains, value),
    strategy: (value) => typeof value === 'string' && Object.hasOwn(strategies, value),
    retrieval: (value) => typeof value === 'string' && Object.hasOwn(retrievers, value),
    topK: (value) => Number.isInteger(value) && value >= 1 && value <= 10,
    normalize: (value) => typeof value === 'boolean',
    verify: (value) => typeof value === 'boolean',
  };
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Tệp YAML phải chứa các cặp tên cấu hình và giá trị.');
  }
  for (const [key, value] of Object.entries(config)) {
    if (!Object.hasOwn(allowed, key) || !allowed[key](value)) throw new Error(`Cấu hình YAML không hợp lệ ở mục ${key}.`);
  }
  return config;
}

async function runLab(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  const file = form.elements.yaml.files[0];
  const id = experiment;
  const split = experimentSplit;
  const base = { ...settings, domain: experimentDomain };
  try {
    const overrides = file ? await readYaml(file) : {};
    if (!form.isConnected) return;
    const config = { ...base, ...overrides };
    const rows = await Promise.all(labVariants(config, id).map(async ({ label, config: variant }) => ({
      label, stats: await runEvaluation({ ...variant, split }),
    })));
    if (!form.isConnected) return;
    labRows = rows;
    labTopK = config.topK;
    labSplit = split;
    yamlFile = file ? `Đã dùng ${file.name}` : '';
    yamlError = '';
    experimentDomain = config.domain;
  } catch (error) {
    if (!form.isConnected) return;
    labRows = null;
    yamlFile = '';
    yamlError = error.message || 'Không đọc được cấu hình YAML.';
  }
  render();
  main.querySelector('#experiment button[type="submit"]').focus({ preventScroll: true });
}

function exportResults() {
  if (!labRows) return;
  const rows = [`Tập đánh giá,Cấu hình,Recall@${labTopK},MRR,nDCG@${labTopK},Trích dẫn đúng,Đã đối chiếu,Câu có đáp án,Từ chối đúng,Câu thiếu bằng chứng`];
  for (const { label, stats } of labRows) {
    rows.push([labSplit, label, stats.recall, stats.mrr, stats.ndcg, stats.correct, stats.verified,
      stats.positives, stats.abstentions, stats.negatives].join(','));
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `citedoc-${experiment}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

sidebarElement.innerHTML = sidebar(settings);
updateStepper();
goToRoute();
window.addEventListener('hashchange', () => goToRoute(true));

sidebarElement.addEventListener('change', ({ target }) => {
  const previousDomain = target.name === 'domain' ? settings.domain : undefined;
  settings[target.name] = target.type === 'checkbox' ? target.checked : target.value;
  if (previousDomain) {
    upload.domain = settings.domain;
    experimentDomain = settings.domain;
    if (route === 'thu-vien') main.querySelector('[name="uploadDomain"]').value = settings.domain;
    if (route === 'thi-nghiem') main.querySelector('[name="experimentDomain"]').value = settings.domain;
  }
  refreshResults(previousDomain);
});

sidebarElement.addEventListener('click', (event) => {
  const step = event.target.closest('[data-action="step"]');
  if (!step) return;
  settings.topK += Number(step.dataset.delta);
  updateStepper();
  refreshResults();
});

main.addEventListener('input', ({ target }) => {
  const lookup = lookups[target.form?.id];
  if (lookup) lookup.draft = target.value;
});

main.addEventListener('change', ({ target }) => {
  if (target.name === 'uploadDomain') upload.domain = target.value;
  if (target.name === 'uploadStrategy') upload.strategy = target.value;
  if (target.name === 'experimentDomain') experimentDomain = target.value;
  if (target.name === 'experimentSplit') experimentSplit = target.value;
});

main.addEventListener('submit', (event) => {
  const form = event.target;
  event.preventDefault();
  if (form.id === 'upload') return void importFiles([...form.elements.files.files]);
  if (form.id === 'experiment') return void runLab(form);
  const field = form.elements.question;
  const input = field.value.trim();
  if (!input) return field.focus();
  lookups[form.id].draft = input;
  void query(form.id, input);
  main.querySelector(`#${form.id} input`).focus({ preventScroll: true });
});

main.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id, target } = button.dataset;
  switch (action) {
    case 'example':
      lookups.ask.draft = button.dataset.question;
      void query('ask', button.dataset.question);
      main.querySelector('#ask input').focus({ preventScroll: true });
      break;
    case 'citation':
      document.getElementById(target)?.focus();
      break;
    case 'rephrase': {
      const field = main.querySelector('#ask input');
      field.focus();
      field.select();
      break;
    }
    case 'document':
      void showDocument(id, true);
      break;
    case 'ocr':
      void recognize(id);
      break;
    case 'reload-library':
      void loadLibrary();
      break;
    case 'experiment':
      if (experiment === id) break;
      experiment = id;
      labRows = null;
      labTopK = settings.topK;
      yamlFile = '';
      yamlError = '';
      render();
      main.querySelector(`[data-id="${id}"]`).focus({ preventScroll: true });
      break;
    case 'export':
      exportResults();
      break;
  }
});
