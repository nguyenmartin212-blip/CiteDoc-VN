import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modelPath = process.argv[2];
if (!modelPath) throw new Error('Usage: node scripts/local-reader.mjs path/to/model.gguf');
const runtime = resolve('data/processed/runtime/node');
const requireRuntime = createRequire(pathToFileURL(resolve(runtime, 'package.json')));
const binding = requireRuntime.resolve('node-llama-cpp');
const { getLlama, LlamaChatSession } = await import(pathToFileURL(binding).href);
const llama = await getLlama({ gpu: false });
const model = await llama.loadModel({ modelPath: resolve(modelPath) });
const context = await model.createContext({ contextSize: 4096 });
const seq = context.getSequence();
const port = Number(process.env.CITEDOC_AI_PORT ?? 8081);
let busy = false;

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return json(response, 200, { status: 'ok' });
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') return json(response, 404, { error: 'Not found' });
  if (busy) return json(response, 503, { error: 'Model is processing another query' });
  busy = true;
  let session;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65536) return json(response, 413, { error: 'Request too large' });
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const schema = body.response_format?.schema;
    const system = body.messages?.find((message) => message.role === 'system')?.content;
    const user = body.messages?.find((message) => message.role === 'user')?.content;
    if (!schema || typeof system !== 'string' || typeof user !== 'string') {
      return json(response, 400, { error: 'Missing evidence selection request' });
    }
    const grammar = await llama.createGrammarForJsonSchema(schema);
    session = new LlamaChatSession({ contextSequence: seq, systemPrompt: system });
    const content = await session.prompt(user, { grammar, temperature: 0, maxTokens: 90 });
    return json(response, 200, { choices: [{ message: { role: 'assistant', content } }] });
  } catch (error) {
    console.error(error.message);
    return json(response, 500, { error: 'Local inference failed' });
  } finally {
    session?.dispose({ disposeSequence: false });
    busy = false;
  }
}).listen(port, '127.0.0.1', () => console.log(`Local AI reader at http://127.0.0.1:${port}`));
