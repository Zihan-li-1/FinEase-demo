import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankingCore } from '../src/banking-core/core.mjs';
import { collectSavingsData } from '../server/savings-data.mjs';
import { summarizeBills } from '../src/skills/bill/bill-summary.mjs';
import seed from '../src/data/saveflow_mock_data.json' with { type: 'json' };

test('seeded last complete month drives savings from the same transactions as bill analysis', async () => {
  const repository = createBankingCore().repository;
  const result = await collectSavingsData(repository, '2026-10-28');
  const bill = summarizeBills(await repository.getTransactions({ month: '2026-09' }));
  assert.equal(result.recentSource, 'repository');
  assert.equal(result.recent.month, '2026-09');
  assert.equal(result.recent.income_minor, bill.totalIncomeFen);
  assert.deepEqual(result.recent.category_expenses_minor, bill.categoryTotals);
  assert.ok(result.recent.income_minor > 0);
  assert.ok(bill.totalExpenseFen > 0);
  const septemberSummary = seed.monthlySummaries.find(item => item.month === '2026-09');
  assert.equal(septemberSummary.income * 100, bill.totalIncomeFen);
  assert.equal(septemberSummary.expense * 100, bill.totalExpenseFen);
  assert.deepEqual(Object.fromEntries(Object.entries(septemberSummary.byCategory).map(([category, yuan]) => [category, yuan * 100])), bill.categoryTotals);
});

test('a complete repository month is the only recent source; future months never enter history', async () => {
  const base = createBankingCore().repository;
  const original = await base.getContextInfo();
  const september = (await base.getTransactions({ month: '2026-08' })).map(item => ({ ...item, id: `${item.id}-recent`, occurredAt: item.occurredAt.replace('2026-08', '2026-09') }));
  const queried = [];
  const repository = { ...base,
    getContextInfo: async () => ({ ...original, asOf: '2026-10-01T00:00:00+08:00', snapshotId: 'updated-snapshot', availableMonths: [...original.availableMonths, '2026-09', '2026-11'], completeMonths: ['2026-09'] }),
    getTransactions: async filter => { queried.push(filter.month); return filter.month === '2026-09' ? september : filter.month === '2026-11' ? [] : base.getTransactions(filter); },
  };
  const result = await collectSavingsData(repository, '2026-10-22');
  assert.equal(result.recentSource, 'repository');
  assert.equal(result.recent.month, '2026-09');
  assert.equal(result.recent.income_minor, 1200000);
  assert.ok(result.history.every(item => item.month < '2026-09'));
  assert.equal(queried.includes('2026-11'), false);
  assert.equal(result.sources.recent_as_of, '2026-10-01T00:00:00+08:00');
});

test('stale repository data selects its latest certified complete month', async () => {
  const base = createBankingCore().repository;
  const context = await base.getContextInfo();
  const repository = { ...base, getContextInfo: async () => ({ ...context, asOf: '2026-09-01T00:00:00+08:00', availableMonths: ['2026-06', '2026-07', '2026-08'], completeMonths: ['2026-06', '2026-07', '2026-08'] }) };
  const result = await collectSavingsData(repository, '2026-10-22');
  assert.equal(result.recentSource, 'repository');
  assert.equal(result.recent.month, '2026-08');
  assert.deepEqual(result.history.map(item => item.month), ['2026-06', '2026-07']);
});

test('available recent records without complete coverage still require user input', async () => {
  const base = createBankingCore().repository;
  const context = await base.getContextInfo();
  const repository = { ...base, getContextInfo: async () => ({ ...context, asOf: '2026-10-01T00:00:00+08:00', availableMonths: [...context.availableMonths, '2026-09'], completeMonths: [] }) };
  const result = await collectSavingsData(repository, '2026-10-22');
  assert.equal(result.recent, null);
  assert.equal(result.recentSource, 'user_provided');
});

test('November uses September while October remains an incomplete snapshot month', async () => {
  const repository = createBankingCore().repository;
  const result = await collectSavingsData(repository, '2026-11-01');
  assert.equal(result.requiredMonth, '2026-10');
  assert.equal(result.recent.month, '2026-09');
  assert.ok(!result.context.completeMonths.includes('2026-10'));
  assert.ok(result.history.every(item => item.month < '2026-09'));
});

test('month selection requires both markers and rejects current and snapshot months', async () => {
  const base = createBankingCore().repository;
  const context = await base.getContextInfo();
  const queried = [];
  const repository = { ...base,
    getContextInfo: async () => ({ ...context, asOf: '2026-11-15', availableMonths: ['bad', '2026-13', '2026-12', '2026-11', '2026-09', '2026-08', '2026-09'], completeMonths: ['2026-12', '2026-11', '2026-10', '2026-09', '2026-08'] }),
    getTransactions: async filter => { queried.push(filter.month); return base.getTransactions(filter); },
  };
  const result = await collectSavingsData(repository, '2026-10-01');
  assert.equal(result.recent.month, '2026-09');
  assert.deepEqual(queried, ['2026-09', '2026-08']);
});

test('missing records never become zero amounts and absent categories are not invented', async () => {
  const base = createBankingCore().repository;
  const context = await base.getContextInfo();
  const repository = { ...base,
    getContextInfo: async () => ({ ...context, availableMonths: ['2026-07', '2026-08', '2026-09'], completeMonths: ['2026-07', '2026-08', '2026-09'] }),
    getTransactions: async ({ month }) => month === '2026-09' ? [] : (await base.getTransactions({ month })).filter(item => month !== '2026-08' || item.category !== '购物'),
  };
  const result = await collectSavingsData(repository, '2026-11-01');
  assert.equal(result.recent.month, '2026-08');
  assert.equal(Object.hasOwn(result.recent.category_expenses_minor, '购物'), false);
});

