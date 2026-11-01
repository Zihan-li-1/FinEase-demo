// Read-only smoke test against the production container, including dynamic routes.
// node --env-file=.env.local scripts/verify-container.mjs
import assert from 'node:assert/strict';

const base = process.env.SAVEFLOW_VERIFY_URL || 'http://127.0.0.1:4300';
assert.ok(process.env.SAVEFLOW_ACCESS_CODE, 'SAVEFLOW_ACCESS_CODE is required');
const headers = { 'X-Saveflow-Access': process.env.SAVEFLOW_ACCESS_CODE };
const checks = [];
async function request(path, options = {}, expected = 200) {
  const response = await fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, expected, `${options.method || 'GET'} ${path}`);
  checks.push(`${options.method || 'GET'} ${path}: ${expected}`);
  return response;
}
const html = await (await request('/')).text();
const asset = html.match(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+\.(?:js|css))"/);
assert.ok(asset, 'home page must contain a built Next.js asset');
await request(asset[1]);
for (const path of ['/shopping', '/shopping/product', '/api/saveflow', '/healthz', '/version', '/health']) await request(path);
const version = await (await request('/version')).json();
assert.notEqual(version.gitSha, 'unknown');
if (process.env.SAVEFLOW_GIT_SHA) assert.equal(version.gitSha, process.env.SAVEFLOW_GIT_SHA);
await request('/ready', {}, 401);
await request('/api/v1/skills', {}, 401);
const ready = await (await request('/ready', { headers })).json();
assert.equal(ready.error, null);
assert.ok(ready.data.skills.length > 0);
const skills = await (await request('/api/v1/skills', { headers })).json();
assert.equal(skills.error, null);
assert.ok(skills.data.length > 0);
await request('/api/banking', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ schema_version: '1.1.0', action: 'account.list', input: {} }) });
await request('/api/banking-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 401);
console.log(JSON.stringify({ base, version, checks, passed: checks.length }, null, 2));
