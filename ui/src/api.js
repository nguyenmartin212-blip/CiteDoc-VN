async function request(path, options) {
  let response;
  try {
    response = await fetch(`/api/${path}`, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Không kết nối được API CiteDoc-VN. Hãy kiểm tra máy chủ và thử lại.');
  }
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  if (!response.ok || data === null) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Máy chủ chưa xử lý được yêu cầu. Hãy kiểm tra API rồi thử lại.');
  }
  return data;
}

function post(path, payload, signal) {
  return request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  });
}

export const askQuestion = (question, config, signal) => post('ask', { question, config }, signal);
export const runEvaluation = (config) => post('evaluate', config);
export const listDocuments = () => request('documents');
export const listChunks = (id) => request(`documents/chunks?${new URLSearchParams({ id })}`);
export const sourceUrl = (id, page) => `/api/documents/file?${new URLSearchParams({ id })}${page ? `#page=${page}` : ''}`;

export function uploadDocument(file, domain, strategy) {
  const body = new FormData();
  body.set('file', file);
  body.set('domain', domain);
  body.set('strategy', strategy);
  return request('documents', { method: 'POST', body });
}
