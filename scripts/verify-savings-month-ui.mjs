// Read-only browser acceptance against the deployed site and its real model runtime.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
try { process.loadEnvFile('.env.local'); } catch { /* caller may supply credentials */ }
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SAVEFLOW_VERIFY_URL || 'http://127.0.0.1:4300';
const output = process.env.SAVINGS_QA_OUTPUT || 'docs/verification/savings-month-choice';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, cases: [], pageErrors: [], financialWrites: 0 };
await mkdir(output, { recursive: true });
try {
  for (const manual of [false, true]) {
    const context = await browser.newContext({ viewport: { width: manual ? 390 : 1440, height: 1000 } });
    try {
      const page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(error.message));
      page.on('request', request => {
        if (request.url().endsWith('/api/banking') && ['action.prepare', 'action.decide', 'action.execute'].includes(request.postDataJSON()?.action)) report.financialWrites++;
      });
      async function call(action) {
        const pending = page.waitForResponse(response => response.url().endsWith('/api/banking-agent') && response.request().method() === 'POST', { timeout: 120000 });
        await action();
        const response = await pending;
        const payload = await response.json();
        assert.equal(response.status(), 200, `${payload.code}: ${payload.message}`);
        await page.locator('.typing').waitFor({ state: 'detached' });
        return { data: payload.data, posted: response.request().postDataJSON() };
      }
      await page.goto(base);
      await page.getByLabel('演示访问码', { exact: true }).fill(process.env.SAVEFLOW_ACCESS_CODE);
      await page.locator('.consent-control input').check();
      const initial = await call(async () => {
        await page.locator('.composer input').fill('我要在2026年12月31日前存够一万元');
        await page.locator('.composer input').press('Enter');
      });
      assert.equal(initial.data.status, 'needs_plan_inputs');
      assert.equal(initial.data.requiredMonth, '2026-10');
      assert.equal(initial.data.recent.month, '2026-09');
      const form = page.getByRole('form', { name: '补充储蓄计划数据' });
      assert.equal(await form.locator('input').count(), 0);
      if (!manual) await form.screenshot({ path: `${output}/source-choice.png` });
      await form.getByRole('button', { name: manual ? '手填表单' : /使用上一次有效数据/ }).click();
      assert.equal(await form.locator('input').count(), manual ? initial.data.categories.length + 2 : 1);
      await form.getByLabel('为这个目标，你目前已经存了多少钱？（元）', { exact: true }).fill('2000');
      if (manual) {
        await form.getByLabel('月收入（元）', { exact: true }).fill('12000');
        for (const category of initial.data.categories) {
          await form.getByLabel(category, { exact: true }).fill(String(initial.data.recent.category_expenses_minor[category] / 100));
        }
      }
      await form.screenshot({ path: `${output}/${manual ? 'manual' : 'repository'}-inputs.png` });
      const plan = await call(() => form.getByRole('button', { name: '生成储蓄计划', exact: true }).click());
      assert.deepEqual(Object.keys(plan.posted.planInputs).sort(), manual ? ['category_expenses_minor', 'income_minor', 'month', 'saved_amount_minor'] : ['saved_amount_minor']);
      assert.equal(plan.data.status, 'goal_plan');
      assert.equal(plan.data.data.verification_status, 'verified');
      assert.equal(plan.data.data.recent.month, manual ? '2026-10' : '2026-09');
      assert.equal(plan.data.data.recent_source, manual ? 'user_provided' : 'repository');
      assert.equal(plan.data.data.calculation.saved_amount_minor, 200000);
      assert.equal(plan.data.data.calculation.required_monthly_minor, 800000);
      const card = page.getByRole('region', { name: '储蓄计划卡片' });
      await card.waitFor();
      await card.screenshot({ path: `${output}/${manual ? 'manual' : 'repository'}-plan.png` });
      report.cases.push({ source: manual ? 'user_provided' : 'repository', month: plan.data.data.recent.month, passed: true });
    } finally { await context.close(); }
  }
  assert.deepEqual(report.pageErrors, []);
  assert.equal(report.financialWrites, 0);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
  await browser.close();
}
