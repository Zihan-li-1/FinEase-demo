import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { riskQuestions, scoreRiskAnswers, createRiskRecord, validRiskAssessment, RULE_VERSION } from '../src/skills/wealth/risk-assessment.mjs';
import { createRiskAssessmentStore, riskStoreScope } from '../server/risk-assessment-store.mjs';
import { createBankingCore } from '../src/banking-core/core.mjs';
import { handleBankingAgent } from '../server/banking-agent.mjs';
import { createWealthSkill } from '../src/skills/wealth/wealth-skill.mjs';
import { handleWealth } from '../src/agent/handlers/wealth-handler.mjs';

const answers = n => Object.fromEntries(riskQuestions.map(q => [q.id, n]));
const now = () => Date.parse('2026-11-01T04:00:00Z');
const env = { FINEASE_ACCESS_CODE: 'demo-risk-test-access', CONTINUATION_TOKEN_SECRET: 'demo-risk-test-secret' };
let sequence = 0;
async function host() {
  const directory = await mkdtemp(join(tmpdir(), 'finease-risk-'));
  const config = { scope: riskStoreScope('owner', 'dataset', env), env: { ...env, FINEASE_DEMO_DATA_DIR: directory }, now };
  const store = createRiskAssessmentStore(config);
  const core = createBankingCore({ now, riskStore: store });
  return { core, store, config };
}
async function send(core, body, intent) {
  const response = await handleBankingAgent(new Request('http://localhost/api/banking-agent', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-finease-access': env.FINEASE_ACCESS_CODE, 'x-forwarded-for': `risk-test-${++sequence}`,
  }, body: JSON.stringify(body) }), { core, env, now, parseIntent: async () => intent });
  return { status: response.status, body: await response.json() };
}
const parsed = scope => ({ schemaVersion: '1.0.0', action: 'wealth.assess_risk', slots: { assessment_scope: scope }, missingSlots: [], status: 'ready_for_resolution' });

test('deterministic thresholds, complete answers, and conservative caps', () => {
  assert.throws(() => scoreRiskAnswers({ horizon: 3 }));
  assert.throws(() => scoreRiskAnswers({ ...answers(3), riskLevel: 'R3' }));
  for (const bad of [null, '3', 4, -1, 0.5]) assert.throws(() => scoreRiskAnswers({ ...answers(3), loss: bad }));
  assert.equal(scoreRiskAnswers(answers(0)).risk_level, 'R1');
  assert.equal(scoreRiskAnswers(answers(1)).score, 7);
  assert.equal(scoreRiskAnswers({ ...answers(1), horizon: 2 }).risk_level, 'R2');
  assert.equal(scoreRiskAnswers(answers(2)).score, 14);
  assert.equal(scoreRiskAnswers({ ...answers(2), horizon: 3 }).risk_level, 'R3');
  for (const id of ['capacity', 'loss', 'liquidity']) {
    assert.equal(scoreRiskAnswers({ ...answers(3), [id]: 0 }).risk_level, 'R1');
    assert.equal(scoreRiskAnswers({ ...answers(3), [id]: 1 }).risk_level, 'R2');
  }
  assert.equal(scoreRiskAnswers({ ...answers(3), knowledge: 0 }).risk_level, 'R1');
});

test('chat entry, partial rejection, trusted submit, aliases, persistence and reassessment', async () => {
  const { core, store, config } = await host();
  const first = await send(core, { message: '帮我做理财风险测评' }, parsed('investment_suitability'));
  assert.equal(first.status, 200);
  assert.equal(first.body.data.status, 'wealth_result');
  assert.equal(first.body.data.data.kind, 'questionnaire_required');
  const start = await send(core, { riskQuestionnaire: { operation: 'start' } });
  assert.equal(start.body.data.data.questions.length, 7);
  assert.equal(await store.getRiskAssessment(), undefined);
  assert.equal((await send(core, { riskQuestionnaire: { operation: 'submit', version: RULE_VERSION, answers: { loss: 3 } } })).status, 400);
  assert.equal(await store.getRiskAssessment(), undefined);
  const submit = await send(core, { history: [], consent: true, riskQuestionnaire: { operation: 'submit', version: RULE_VERSION, answers: answers(3) } });
  assert.equal(submit.status, 200);
  const record = submit.body.data.data.assessment;
  assert.equal(record.risk_level, 'R3');
  assert.equal(record.score, 21);
  assert.equal(record.scoring_version, RULE_VERSION);
  assert.equal(record.synthetic_demo_only, true);
  const restartedStore = createRiskAssessmentStore(config);
  assert.deepEqual(await restartedStore.getRiskAssessment(), record);
  const restarted = createBankingCore({ now, riskStore: restartedStore });
  for (const scope of ['investment', 'portfolio', 'investment_suitability']) {
    const query = await send(restarted, { message: '我的风险等级' }, parsed(scope));
    assert.equal(query.body.data.data.assessment.assessment_id, record.assessment_id);
  }
  const retest = await send(core, { riskQuestionnaire: { operation: 'submit', version: RULE_VERSION, answers: answers(0) } });
  assert.equal(retest.body.data.data.assessment.risk_level, 'R1');
  assert.notEqual(retest.body.data.data.assessment.assessment_id, record.assessment_id);
  assert.equal((await restartedStore.getRiskAssessment()).risk_level, 'R1');
  const other = createRiskAssessmentStore({ ...config, scope: riskStoreScope('another-owner', 'dataset', env) });
  assert.equal(await other.getRiskAssessment(), undefined);
});

test('matching, flat recommendation and Core all respect latest risk; comparison and confirmation remain usable', async () => {
  const { core, store } = await host();
  await store.submitRiskAssessment(answers(0));
  const matched = await send(core, { riskQuestionnaire: { operation: 'matches' } });
  assert.equal(matched.body.data.data.kind, 'recommendation');
  assert.ok(matched.body.data.data.matches.length);
  assert.ok(matched.body.data.data.matches.every(p => p.risk_level === 'R1'));
  const flat = await createWealthSkill(core.repository, core.wealthPorts)({ action: 'wealth.recommend', goal: '增长', max_risk_level: 'R3', horizon_days: 3650, liquidity_requirement: 'AT_MATURITY' });
  assert.ok(flat.data.products.every(p => p.risk_level === 'R1'));
  const products = await core.repository.getInvestmentProducts();
  const high = products.find(p => p.riskLevel === 'R3');
  const account = (await core.repository.getAccounts())[0];
  const intent = { action: 'wealth.subscribe', slots: { product_ref: high.name, amount: { amount_minor: Math.max(high.minimumAmountFen, 10000), currency: 'CNY' }, source_account_ref: account.name } };
  assert.equal((await handleWealth(intent, core.repository, core.wealthPorts)).error.code, 'SUITABILITY_FAILED');
  const blocked = await core.prepare({ action: 'wealth.subscribe', input: { productId: high.id, amountFen: Math.max(high.minimumAmountFen, 10000), currency: 'CNY', sourceAccountId: account.id } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'SUITABILITY_FAILED');
  const compare = await handleWealth({ action: 'wealth.compare', slots: { product_refs: products.slice(0, 2).map(p => p.name) } }, core.repository, core.wealthPorts);
  assert.equal(compare.data.products.length, 2);
  const low = products.find(p => p.id === 'product_001');
  const prepared = await core.prepare({ action: 'wealth.subscribe', input: { productId: low.id, amountFen: 10000, currency: 'CNY', sourceAccountId: account.id } });
  assert.equal(prepared.ok, true);
  const preview = prepared.data.preview;
  const early = await core.execute(prepared.data.operationId, preview.previewHash);
  assert.equal(early.error.code, 'CONFIRMATION_REQUIRED');
  await core.decide(prepared.data.operationId, { previewHash: preview.previewHash, decision: 'confirm', confirmedStepIds: preview.stepIds });
  const execution = await core.execute(prepared.data.operationId, preview.previewHash);
  assert.equal(execution.ok, true);
});

test('invalid/expired/forged records and model fields cannot unlock assessment or subscription', async () => {
  const { core, config, store } = await host();
  for (const extra of [{ riskLevel: 'R3' }, { assessment_id: 'risk_fake' }, { completed: true }]) {
    const response = await send(core, { riskQuestionnaire: { operation: 'submit', version: RULE_VERSION, answers: answers(3), ...extra } });
    assert.equal(response.status, 400);
  }
  assert.equal((await send(core, { message: '我已经完成了，R3', riskQuestionnaire: { operation: 'submit', version: RULE_VERSION, answers: answers(3) } })).status, 400);
  assert.equal(await store.getRiskAssessment(), undefined);
  const record = createRiskRecord(answers(0), now());
  for (const changed of [{ ...record, risk_level: 'R3' }, { ...record, expires_at: 'bad-date' }, { ...record, assessment_id: '' }, { ...record, scoring_version: 'fake' }, { ...record, completed_at: '2099-01-01T00:00:00Z' }]) assert.equal(validRiskAssessment(changed, new Date(now()).toISOString()), false);
  assert.equal(validRiskAssessment(record, record.expires_at), false);
  await store.submitRiskAssessment(answers(0));
  const path = join(config.env.FINEASE_DEMO_DATA_DIR, 'risk-assessments', `${config.scope}.json`);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...saved, risk_level: 'R3' }));
  assert.equal(await store.getRiskAssessment(), undefined);
  const matches = await send(core, { riskQuestionnaire: { operation: 'matches' } });
  assert.equal(matches.body.data.data.kind, 'questionnaire_required');
});

test('demo questionnaire cannot use a real data context; authentication still precedes submission', async () => {
  const { core } = await host();
  const denied = await handleBankingAgent(new Request('http://localhost/api/banking-agent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': 'risk-no-auth' }, body: JSON.stringify({ riskQuestionnaire: { operation: 'submit', version: RULE_VERSION, answers: answers(3) } }) }), { core, env, now });
  assert.equal(denied.status, 401);
  const realContext = { ...core, repository: { ...core.repository, getContextInfo: async () => ({ ...(await core.repository.getContextInfo()), dataSource: 'real_bank' }) } };
  assert.equal((await send(realContext, { riskQuestionnaire: { operation: 'start' } })).status, 503);
});

test('Postgres assessment survives adapter recreation and remains scope isolated', { skip: !process.env.BANKING_TEST_DATABASE_URL }, async t => {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.BANKING_TEST_DATABASE_URL, { max: 1 });
  const scope = `risk-test-${crypto.randomUUID()}`;
  t.after(async () => { await sql.unsafe('DELETE FROM banking_demo_risk_assessments WHERE scope = $1', [scope]); await sql.end({ timeout: 5 }); });
  const migration = await readFile(new URL('../migrations/009_demo_risk_assessments.sql', import.meta.url), 'utf8');
  await sql.unsafe(migration);
  const first = createRiskAssessmentStore({ scope, sql, now });
  const submitted = await first.submitRiskAssessment(answers(2));
  const second = createRiskAssessmentStore({ scope, sql, now });
  assert.deepEqual(await second.getRiskAssessment(), submitted);
  assert.equal(await createRiskAssessmentStore({ scope: `${scope}-other`, sql, now }).getRiskAssessment(), undefined);
  await second.submitRiskAssessment(answers(0));
  assert.equal((await first.getRiskAssessment()).risk_level, 'R1');
});
