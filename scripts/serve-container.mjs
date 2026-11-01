import { handlePurchaseRequest } from '../server/purchase-api.mjs';
// Keep legacy API handlers and delegate pages and App Router APIs to Next.js.
import http from 'node:http';
import { Readable } from 'node:stream';
import next from 'next';
import { handleAgent } from '../server/qwen.mjs';
import { handleBanking } from '../server/banking.mjs';
import { handleBankingAgent, bankingAuthConfigStatus } from '../server/banking-agent.mjs';
import { handleExecuteTrial } from '../server/transfer-execute-bridge.mjs';

const port = Number(process.env.PORT || 3000);
const app = next({ dev: false, hostname: '0.0.0.0', port });
await app.prepare();
const handleNext = app.getRequestHandler();
const visits = [];
const server = http.createServer(async (req, res) => {
  const pathname = req.url?.split('?')[0];
  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ok: true, service: 'saveflow', gitSha: process.env.SAVEFLOW_GIT_SHA || 'unknown', gitDirty: process.env.SAVEFLOW_GIT_DIRTY || 'unknown' })); return; }
  if (pathname === '/version') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ service: 'saveflow', gitSha: process.env.SAVEFLOW_GIT_SHA || 'unknown', gitDirty: process.env.SAVEFLOW_GIT_DIRTY || 'unknown', nodeEnv: process.env.NODE_ENV || 'unknown' })); return; }
  const banking = pathname === '/api/banking' || (pathname === '/api/saveflow' && req.method === 'POST');
  const agent = pathname === '/api/banking-agent';
  const executeTrial = pathname === '/api/execute-trial';
  const purchase = pathname === '/api/purchase';
  try {
    if (banking || agent || executeTrial || purchase || pathname === '/api/agent') {
      const now = Date.now();
      while (visits.length && visits[0] < now - 60000) visits.shift();
      if (!banking && !executeTrial && !purchase && visits.length >= 10) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'RATE_LIMIT', message: '每分钟最多10次请求，请稍后再试。' })); return; }
      if (!banking && !executeTrial && !purchase) visits.push(now);
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: new Headers(Object.entries(req.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]])), signal: controller.signal,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) });
      const response = await (purchase ? handlePurchaseRequest(request) : banking ? handleBanking(request) : agent ? handleBankingAgent(request) : executeTrial ? handleExecuteTrial(request) : handleAgent(request));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    await handleNext(req, res);
  } catch { if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"code":"INTERNAL_ERROR","message":"Service unavailable"}'); }
});
console.info(JSON.stringify({ event: 'banking_auth_config', ...bankingAuthConfigStatus() }));
server.listen(port, '0.0.0.0', () => console.log('SaveFlow container HTTP ready'));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(async () => { await app.close(); process.exit(0); }); setTimeout(() => server.closeAllConnections(), 5000).unref(); });
