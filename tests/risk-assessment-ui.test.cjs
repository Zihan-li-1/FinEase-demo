/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...rest); };
const React = require('react');
const { create, act } = require('react-test-renderer');
const { BankingWealthResult } = require('../src/app/BankingWealthCards.tsx');

test('real chat card: start, radio answers, navigation, cancellation, trusted result, matching and retest', async t => {
  const { createRiskAssessmentStore } = await import('../server/risk-assessment-store.mjs');
  const { createBankingCore } = await import('../src/banking-core/core.mjs');
  const { handleBankingAgent } = await import('../server/banking-agent.mjs');
  const directory = await mkdtemp(path.join(tmpdir(), 'finease-risk-ui-'));
  const env = { FINEASE_ACCESS_CODE: 'risk-ui-access-123456', CONTINUATION_TOKEN_SECRET: 'risk-ui-secret-123456' };
  const store = createRiskAssessmentStore({ scope: 'ui-test', env: { ...env, FINEASE_DEMO_DATA_DIR: directory } });
  const core = createBankingCore({ riskStore: store });
  const oldFetch = global.fetch;
  let sequence = 0, submits = 0;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.riskQuestionnaire?.operation === 'submit') submits++;
    return handleBankingAgent(new Request(`http://localhost${url}`, { ...init, headers: { ...init.headers, 'x-forwarded-for': `risk-ui-${++sequence}` } }), { env, core });
  };
  let renderer;
  t.after(async () => { if (renderer) await act(async () => renderer.unmount()); global.fetch = oldFetch; global.IS_REACT_ACT_ENVIRONMENT = false; });
  await act(async () => { renderer = create(React.createElement(BankingWealthResult, { accessCode: env.FINEASE_ACCESS_CODE, data: { status: 'wealth_result', data: { kind: 'questionnaire_required' } } })); });
  const button = text => renderer.root.findAllByType('button').find(b => b.children.includes(text));
  const click = async text => { const b = button(text); assert.ok(b, text); assert.equal(!!b.props.disabled, false, text); await act(async () => b.props.onClick()); };
  await click('开始模拟测评');
  assert.equal(renderer.root.findAllByType('input').length, 4);
  assert.equal(button('下一步').props.disabled, true);
  assert.equal(button('提交测评'), undefined);
  await act(async () => renderer.root.findAllByType('input')[2].props.onChange());
  await click('下一步');
  await click('上一步');
  assert.equal(renderer.root.findAllByType('input')[2].props.checked, true);
  await click('取消');
  assert.equal(submits, 0);
  assert.equal(await store.getRiskAssessment(), undefined);
  await click('开始模拟测评');
  for (let index = 0; index < 7; index++) {
    if (index === 6) assert.equal(button('提交测评').props.disabled, true);
    await act(async () => renderer.root.findAllByType('input')[3].props.onChange());
    if (index < 6) await click('下一步');
  }
  await click('提交测评');
  assert.ok(JSON.stringify(renderer.toJSON()).includes('R3'));
  assert.ok(JSON.stringify(renderer.toJSON()).includes('21/21'));
  const firstId = (await store.getRiskAssessment()).assessment_id;
  await click('查看匹配产品');
  assert.ok(JSON.stringify(renderer.toJSON()).includes('模拟产品筛选'));
  await click('重新测评');
  for (let index = 0; index < 7; index++) {
    await act(async () => renderer.root.findAllByType('input')[0].props.onChange());
    if (index < 6) await click('下一步');
  }
  await click('提交测评');
  assert.equal((await store.getRiskAssessment()).risk_level, 'R1');
  assert.notEqual((await store.getRiskAssessment()).assessment_id, firstId);
  assert.equal(submits, 2);
});
