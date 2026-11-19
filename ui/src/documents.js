import exampleText from '../../data/eval/questions.jsonl?raw';

const files = import.meta.glob('../../data/raw/*/*.txt', { query: '?raw', import: 'default', eager: true });
const titles = {
  'quy_che/thu_vien.txt': 'Quy chế thư viện',
  'giao_trinh/hoc_may.txt': 'Giáo trình học máy',
  'bai_bao/truy_xuat.txt': 'Bài báo về truy xuất',
};

export const examples = exampleText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
export const sampleDocuments = Object.entries(files).map(([path, text]) => {
  const id = path.split('/data/raw/')[1];
  const [domain, name] = id.split('/');
  return {
    id, domain, name, title: titles[id] ?? name, sample: true, strategy: 'section',
    pages: [{ page: null, text }],
  };
});

export async function readFile(file, domain, strategy) {
  const extension = file.name.toLowerCase().split('.').pop();
  let pages;
  switch (extension) {
    case 'txt':
      pages = [{ page: null, text: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }];
      break;
    case 'docx': {
      const { default: mammoth } = await import('mammoth/mammoth.browser.js');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      pages = [{ page: null, text: result.value }];
      break;
    }
    case 'pdf': {
      const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
        import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      GlobalWorkerOptions.workerSrc = workerUrl;
      const task = getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 100) throw new Error('Bản demo hỗ trợ tối đa 100 trang cho mỗi PDF.');
        pages = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          const { items } = await page.getTextContent();
          const text = items.map((item) => item.str === undefined ? '' : item.str + (item.hasEOL ? '\n' : ' ')).join('');
          pages.push({ page: number, text });
        }
      } finally {
        await task.destroy();
      }
      break;
    }
    default:
      throw new Error('Hãy chọn tệp PDF, DOCX hoặc TXT.');
  }

  const empty = !pages.some(({ text }) => text.trim());
  if (empty && extension !== 'pdf') throw new Error('Tệp không có văn bản để lập chỉ mục.');
  return {
    id: crypto.randomUUID(), domain, name: file.name, title: file.name, strategy, pages, needsOcr: empty,
  };
}
