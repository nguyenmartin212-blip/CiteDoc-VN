import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './style.css';
import { examples, readFile, sampleDocuments } from './documents.js';
import { defaults, domains, evaluate, retrievers, runQuestion, strategies } from './pipeline.js';
import { compareView, experimentView, libraryView, navigation, qaView, sidebar } from './views.js';

const settings = { ...defaults };
const sidebarElement = document.querySelector('#sidebar');
const main = document.querySelector('#main');
const documents = [...sampleDocuments];
const upload = { domain: settings.domain, strategy: settings.strategy, busy: false, message: '', error: false };
const exampleFor = (domain) => examples.find(({ doc_id }) => doc_id.startsWith(`${domain}/`));
const ask = (question) => runQuestion(documents, examples, question, { ...settings });

let route;
let question = exampleFor(settings.domain)?.question ?? '';
let result = ask(question);
let compareQuestion = question;
let comparison = result;
let selectedDocument = null;
let experiment = 'e2';
let experimentDomain = settings.domain;
let labRows = null;
let labTopK = settings.topK;
let yamlFile = '';
let yamlError = '';

function render() {
  switch (route) {
    case 'thu-vien':
      main.innerHTML = libraryView({ documents, selectedDocument, upload });
      break;
    case 'so-sanh':
      main.innerHTML = compareView({ compareQuestion, comparison });
      break;
    case 'thi-nghiem':
      main.innerHTML = experimentView({ experiment, experimentDomain, labRows, labTopK, yamlFile, yamlError });
      break;
    default:
      main.innerHTML = qaView({ question, result, example: exampleFor(settings.domain), algorithm: result.hits[0] });
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
  if (moveFocus) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function refreshResults(previousDomain) {
  const previousExample = exampleFor(previousDomain)?.question;
  const nextExample = exampleFor(settings.domain)?.question ?? '';
  if (previousDomain && previousExample) {
    if (question === previousExample) question = nextExample;
    if (compareQuestion === previousExample) compareQuestion = nextExample;
  }
  result = ask(previousDomain && result.question === previousExample ? nextExample : result.question);
  comparison = ask(previousDomain && comparison.question === previousExample ? nextExample : comparison.question);
  if (route === 'hoi-dap' || route === 'so-sanh') render();
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
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      errors.push(`${file.name} vượt quá 10 MB.`);
      continue;
    }
    try {
      added.push(await readFile(file, domain, strategy));
    } catch (error) {
      errors.push(`${file.name}: ${error.message || 'Không đọc được tệp.'}`);
    }
  }
  documents.push(...added);
  if (added.length) selectedDocument = added.at(-1).id;
  upload.busy = false;
  upload.error = errors.length > 0;
  upload.message = [added.length ? `Đã thêm ${added.length} tài liệu.` : '', ...errors].filter(Boolean).join(' ');
  refreshResults();
  if (route === 'thu-vien') render();
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
  const base = { ...settings, domain: experimentDomain };
  try {
    const overrides = file ? await readYaml(file) : {};
    if (!form.isConnected) return;
    const config = { ...base, ...overrides };
    labRows = labVariants(config, id).map(({ label, config: variant }) => ({
      label, stats: evaluate(documents, examples, variant),
    }));
    labTopK = config.topK;
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
  const rows = [`Cấu hình,Recall@${labTopK},MRR,nDCG@${labTopK},Số trích dẫn đã đối chiếu,Số câu hỏi`];
  for (const { label, stats } of labRows) {
    rows.push([label, stats?.recall, stats?.mrr, stats?.ndcg, stats?.verified, stats?.total].join(','));
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
  if (target.form?.id === 'ask') question = target.value;
  if (target.form?.id === 'compare') compareQuestion = target.value;
});

main.addEventListener('change', ({ target }) => {
  if (target.name === 'uploadDomain') upload.domain = target.value;
  if (target.name === 'uploadStrategy') upload.strategy = target.value;
  if (target.name === 'experimentDomain') experimentDomain = target.value;
});

main.addEventListener('submit', (event) => {
  const form = event.target;
  event.preventDefault();
  if (form.id === 'upload') return void importFiles([...form.elements.files.files]);
  if (form.id === 'experiment') return void runLab(form);
  const field = form.elements.question;
  const input = field.value.trim();
  if (!input) return field.focus();
  if (form.id === 'ask') {
    question = input;
    result = ask(question);
  } else {
    compareQuestion = input;
    comparison = ask(compareQuestion);
  }
  render();
  main.querySelector(`#${form.id} button`).focus({ preventScroll: true });
});

main.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id, target } = button.dataset;
  switch (action) {
    case 'example':
      question = button.dataset.question;
      result = ask(question);
      render();
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
    case 'document': {
      selectedDocument = selectedDocument === id ? null : id;
      render();
      if (selectedDocument) main.querySelector('#document-preview').focus();
      else main.querySelector(`[data-id="${CSS.escape(id)}"]`).focus();
      break;
    }
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
