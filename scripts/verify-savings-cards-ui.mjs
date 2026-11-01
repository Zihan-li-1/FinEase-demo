// Optional browser QA against the running site. Uses a fresh, isolated browser
// context and a read-only saved plan from the real seeded Core plus model fixture.
// PLAYWRIGHT_MODULE may point to an external Playwright installation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { handleBankingAgent } from '../server/banking-agent.mjs';
import { createBankingCore } from '../src/banking-core/core.mjs';
import { savingsAdviceFixture } from '../tests/fixtures/savings-runtime.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.FINEASE_VERIFY_URL || 'http://127.0.0.1:4300';
const output = 'docs/verification/savings-cards-ui';
const env = { FINEASE_ACCESS_CODE: 'ui-fixture-access-code', CONTINUATION_TOKEN_SECRET: 'ui-fixture-secret-for-test-only' };
const core = createBankingCore();
const forbidden = async () => { throw new Error('UI verification must not perform financial writes'); };
const options = { env, now: () => Date.parse('2026-10-22T12:00:00+08:00'),
  core: { ...core, prepare: forbidden, decide: forbidden, execute: forbidden },
  parseIntent: async () => ({ schemaVersion: '1.0.0', action: 'orchestrator.goal',
    slots: { goal_text: '年底存够一万元', amount: { amount_minor: 1000000, currency: 'CNY' }, deadline: '2026-12-31' }, missingSlots: [], status: 'ready_for_resolution' }),
  savingsAdvisor: async facts => savingsAdviceFixture(facts),
};
let serial = 0;
async function call(body) {
  const response = await handleBankingAgent(new Request(`${base}/api/banking-agent`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-FinEase-Access': env.FINEASE_ACCESS_CODE, 'X-Forwarded-For': `ui-fixture-${++serial}` },
    body: JSON.stringify({ history: [], consent: true, ...body }),
  }), options);
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.data;
}
const initial = await call({ message: '年底存够一万元' });
const plan = await call({ continuationToken: initial.continuationToken, planInputs: { saved_amount_minor: 0 } });
assert.equal(plan.status, 'goal_plan');
assert.ok(plan.data.advice.comparisons.length);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { fixture: 'real seeded amounts; offline model fixture; no financial writes', base, cases: [], pageErrors: [] };
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 1024, 768, 430, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      await context.addInitScript(({ plan }) => {
        const now = Date.now();
        sessionStorage.setItem('finease.banking-chat.v1', JSON.stringify({ version: 2, savedAt: now, continuationExpiresAt: now,
          continuation: null, flows: {}, focusedFlowId: null, messages: [{ id: 1, role: 'agent', text: '储蓄计划已核算', kind: 'banking_savings_plan', banking: plan }] }));
      }, { plan });
      const page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push({ width, message: error.message }));
      await page.goto(base, { waitUntil: 'networkidle' });
      const card = page.locator('.savings-plan-card');
      await card.waitFor();
      const sections = card.locator('.savings-insights-section');
      assert.equal(await sections.count(), 2);
      assert.equal(await card.locator('.savings-calculation-details[open]').count(), 0);
      assert.equal(await sections.nth(1).getByText('基于历史数据预测 · 待用户确认', { exact: true }).count(), 1);
      assert.equal(await sections.locator('button').count(), 0);
      const changes = await sections.first().locator('.savings-change').evaluateAll(elements => elements.map(item => ({
        state: item.className.split('savings-change--')[1], color: getComputedStyle(item).color, text: item.textContent,
      })));
      for (const change of changes) {
        if (change.state === 'up') { assert.equal(change.color, 'rgb(184, 58, 58)'); assert.match(change.text, /\+.*↑ 增长/); }
        if (change.state === 'down') { assert.equal(change.color, 'rgb(25, 115, 77)'); assert.match(change.text, /−.*↓ 下降/); }
        if (change.state === 'flat') { assert.equal(change.color, 'rgb(69, 94, 118)'); assert.match(change.text, /— ¥0.00.*持平/); }
      }
      const measurements = await sections.evaluateAll(elements => elements.map(section => {
        const grid = section.querySelector('.savings-compact-grid');
        const cards = [...grid.children];
        const boxes = cards.map(item => item.getBoundingClientRect());
        return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, availableWidth: grid.clientWidth, count: cards.length,
          widths: boxes.map(box => Math.round(box.width)), heights: boxes.map(box => Math.round(box.height)),
          firstRowAligned: boxes.length < 2 || Math.abs(boxes[0].y - boxes[1].y) < 1,
          overflow: [grid, ...grid.querySelectorAll('*')].some(item => item.scrollWidth > item.clientWidth + 1),
          inViewport: boxes.every(box => box.left >= 0 && box.right <= innerWidth + 1),
          valueSize: parseFloat(getComputedStyle(section.querySelector('.savings-compact-value')).fontSize),
          labelSize: parseFloat(getComputedStyle(section.querySelector('.savings-compact-label')).fontSize),
        };
      }));
      if (width === 1440 || width === 390) {
        await sections.first().evaluate(element => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
        await sections.nth(1).evaluate(element => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: `${output}/${width}-budgets.png`, fullPage: true });
      }
      for (const measurement of measurements) {
        assert.equal(measurement.overflow, false, `overflow at ${width}`);
        assert.equal(measurement.inViewport, true, `outside viewport at ${width}`);
        assert.ok(measurement.valueSize > measurement.labelSize * 1.8);
        if (width >= 1024) { assert.equal(measurement.columns, 2, JSON.stringify({ width, measurement })); assert.equal(measurement.firstRowAligned, true); }
        if (width <= 430) assert.equal(measurement.columns, 1);
        assert.ok(Math.max(...measurement.heights) - Math.min(...measurement.heights) <= 1);
      }
      for (let index = 0; index < 2; index++) {
        const details = sections.nth(index).locator('details');
        await details.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await details.getAttribute('open'), '');
        assert.match(await details.innerText(), /有效月份/);
        await page.keyboard.press('Enter');
        assert.equal(await details.getAttribute('open'), null);
      }
      report.cases.push({ width, sections: measurements, changes, keyboardDisclosure: 'passed' });
    } finally { await context.close(); }
  }
  assert.deepEqual(report.pageErrors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
