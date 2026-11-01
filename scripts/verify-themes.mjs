// Real Chrome rendering; no external services or financial writes are permitted.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { fork } from 'node:child_process';
import { once } from 'node:events';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.THEME_TEST_URL || 'http://127.0.0.1:3187';
const directory = 'docs/verification/themes';
const baseline = process.argv.includes('--baseline');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const fixture = baseline ? null : fork('tests/fixtures/conversation-ui-server.mjs', [], {stdio:['ignore','ignore','inherit','ipc']});
const fixtureOrigin = fixture ? `http://127.0.0.1:${(await once(fixture,'message'))[0].port}` : null;
const report = { mode: baseline ? 'baseline' : 'final', origin, success:false, errors: [], failedRequests: [], expectedMockErrors:[], cases: [] };
const selectors = ['.app-shell', '.sidebar', '.chat-area', '.chat-header', '.header-actions', '.stage-pill', '.messages', '.composer', '.composer input', '.insights', '.nav-item', '.bubble p'];
async function choose(page, theme) {
  await page.locator('.theme-trigger').click();
  await page.getByRole('menuitemradio',{name:`主题：${theme==='dark'?'深色':'浅色'}`}).click();
}
async function inspect(page, label) {
  const audit = await page.evaluate(() => {
    const luminance = rgb => rgb.map(v => { v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; }).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
    const parse = value => (value.match(/[\d.]+/g)||[]).map(Number);
    const lowContrast=[];
    for(const el of document.querySelectorAll('body *')) {
      if(!el.checkVisibility() || ![...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()) || el.closest('button:disabled, [inert], nextjs-portal, script, style'))continue;
      const s=getComputedStyle(el);let bg, node=el;
      while(node){const st=getComputedStyle(node),rgb=parse(st.backgroundColor); if(st.backgroundImage!=='none'){bg=null;break;} if(rgb.length===3 || rgb[3]===1){bg=rgb;break;}node=node.parentElement;}
      if(!bg)continue; const fg=parse(s.color); const a=luminance(fg.slice(0,3)),b=luminance(bg.slice(0,3)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      if(ratio<4.5)lowContrast.push({tag:el.tagName, class:el.className, color:s.color,background:bg,ratio:+ratio.toFixed(2)});
    }
    return {overflow:document.documentElement.scrollWidth>innerWidth, lowContrast};
  });
  report.cases.push({label,...audit});
}
async function geometry(page) {
  return page.evaluate(selectors => Object.fromEntries(selectors.map(selector => {
    const node = document.querySelector(selector); if (!node) return [selector, null];
    const s = getComputedStyle(node), r = node.getBoundingClientRect();
    return [selector, { x:r.x, y:r.y, width:r.width, height:r.height, fontSize:s.fontSize, fontFamily:s.fontFamily, fontWeight:s.fontWeight, lineHeight:s.lineHeight, padding:s.padding, margin:s.margin, gap:s.gap }];
  })), selectors);
}
try {
  for (const [device, viewport] of Object.entries({ desktop: { width:1440,height:900 }, mobile:{ width:390,height:844 } })) {
    const context = await browser.newContext({ viewport, colorScheme:'light' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    let expectedMockFailure=false;
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {if(message.type()==='error' && !(expectedMockFailure && message.text().includes('503')))report.errors.push(message.text());});
    page.on('response', response => { if (response.status() >= 400) (expectedMockFailure && response.status()===503 ? report.expectedMockErrors : report.failedRequests).push({ url:new URL(response.url()).pathname, status:response.status() }); });
    await page.goto(origin); await page.locator('.composer input').waitFor(); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path:`${directory}/${baseline ? 'baseline' : 'dark'}-${device}.png`, fullPage:true });
    const layout = await geometry(page);
    if (baseline) await writeFile(`${directory}/baseline-${device}.json`, JSON.stringify(layout,null,2));
    else {
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await page.evaluate(()=>localStorage.getItem('finease.theme')),null);
      assert.deepEqual(layout, JSON.parse(await readFile(`${directory}/baseline-${device}.json`, 'utf8')));
      await page.locator('.theme-trigger').focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
      await page.keyboard.press('End');
      assert.equal(await page.getByRole('menuitemradio',{name:'主题：浅色'}).evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Home');await page.keyboard.press('Escape');
      assert.equal(await page.locator('.theme-trigger').evaluate(el=>el===document.activeElement),true);
      await page.locator('.composer input').fill('未提交的主题切换检查');
      await page.getByRole('button', {name:'主题：深色',exact:true}).click();
      await page.screenshot({ path:`${directory}/dark-menu-${device}.png`, fullPage:true });
      await page.getByRole('menuitemradio',{name:'主题：浅色'}).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.locator('.composer input').inputValue(),'未提交的主题切换检查');
      assert.deepEqual(await geometry(page), layout);
      await page.screenshot({ path:`${directory}/light-${device}.png`, fullPage:true });
      await inspect(page, `light assistant ${device}`);
      if(device==='desktop') {
        for(const theme of ['light','dark']) {
          await choose(page,theme);
          for(const [name,selector] of [['账户概览','.account-overview'],['卡片管理','.card-management']]) {
            await page.getByRole('button',{name,exact:true}).click();
            await page.locator(selector).waitFor();
            await page.screenshot({path:`${directory}/${theme}-${name}.png`,fullPage:true});
            await inspect(page,`${theme} ${name}`);
            await page.getByRole('button',{name:'智能助理',exact:true}).click();
          }
        }
        await choose(page,'light');
      }
      let requests=0, release, hold=true;
      await page.route('**/api/banking-agent',async route => {
        requests++;
        const response=await route.fetch({url:fixtureOrigin+'/api/banking-agent',headers:{...route.request().headers(),origin:fixtureOrigin,referer:fixtureOrigin+'/',host:new URL(fixtureOrigin).host}});
        assert.equal(response.status(),200,await response.text());
        if(hold) await new Promise(resolve => {release=resolve;});
        await route.fulfill({response});
      });
      await page.getByLabel('演示访问码',{exact:true}).fill('conversation-ui-access-1234');
      await page.locator('.consent-control input').check();
      await page.locator('.composer input').fill('查看娱乐虚拟卡');
      await page.locator('.composer input').press('Enter');
      await page.locator('.typing').waitFor();
      while(!release)await new Promise(resolve=>setTimeout(resolve,50));
      const existing=await page.locator('.messages').innerText();
      const scroll=await page.locator('.messages').evaluate(el=>el.scrollTop);
      await choose(page,'dark');
      assert.equal(await page.locator('.messages').innerText(),existing);
      assert.equal(await page.locator('.messages').evaluate(el=>el.scrollTop),scroll);
      assert.equal(await page.locator('.typing').count(),1);
      assert.equal(requests,1);
      await page.screenshot({path:`${directory}/dark-loading-${device}.png`,fullPage:true});
      hold=false; release(); await page.locator('.typing').waitFor({state:'detached'});
      await page.locator('.banking-result-card').last().waitFor();
      assert.equal(requests,1);
      for(const theme of ['dark','light']) {
        await choose(page,theme);
        await page.screenshot({path:`${directory}/${theme}-card-result-${device}.png`,fullPage:true});
        await inspect(page,`${theme} card result ${device}`);
      }
      assert.equal(requests,1);
      report.cases.push(`${device}: in-flight read-only Mock card query keeps history, scroll and task; exactly one request`);
      await page.locator('.composer input').fill('查看2026年8月账单');
      await page.locator('.composer input').press('Enter');
      await page.locator('.bill-report').waitFor();
      await page.waitForTimeout(700); // Existing chat smooth-scroll must finish before comparing theme-only effects.
      await page.locator('.messages').evaluate(el=>{
        const report=el.querySelector('.bill-report');
        el.scrollTo({top:el.scrollTop+report.getBoundingClientRect().top-el.getBoundingClientRect().top,behavior:'instant'});
      });
      await page.waitForTimeout(700);
      const populatedScroll=await page.locator('.messages').evaluate(el=>el.scrollTop);
      for(const theme of ['dark','light']) {
        await choose(page,theme);
        assert.equal(await page.locator('.messages').evaluate(el=>el.scrollTop),populatedScroll);
        await page.screenshot({path:`${directory}/${theme}-bill-${device}.png`,fullPage:true});
        await inspect(page,`${theme} bill ${device}`);
      }
      expectedMockFailure=true;
      await page.unroute('**/api/banking-agent');
      await page.route('**/api/banking-agent',route=>route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',message:'Mock theme error-state check',requestId:'theme-error'}}));
      await page.locator('.composer input').fill('查看娱乐虚拟卡');await page.locator('.composer input').press('Enter');
      await page.locator('.error-banner').last().waitFor();
      await page.waitForTimeout(700);
      await page.locator('.error-banner').last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      for(const theme of ['dark','light']) {
        await choose(page,theme);
        await page.screenshot({path:`${directory}/${theme}-error-${device}.png`,fullPage:true});
        await inspect(page,`${theme} error ${device}`);
      }
      await page.reload(); await page.locator('.composer input').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.getByRole('button',{name:'主题：浅色',exact:true}).click();
      await page.screenshot({ path:`${directory}/light-menu-${device}.png`, fullPage:true });
      await page.keyboard.press('Escape');
      for(const route of ['/shopping','/shopping/product']) {
        await page.goto(origin+route); await page.locator('h1').waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
        await page.screenshot({path:`${directory}/light-${route.split('/').at(-1)}-${device}.png`,fullPage:true});
        await inspect(page,`light ${route} ${device}`);
      }
      const reopened = await context.newPage(); await reopened.goto(origin);
      await reopened.getByRole('button',{name:'主题：浅色',exact:true}).click();
      await reopened.getByRole('menuitemradio',{name:'主题：深色'}).click();
      await reopened.reload(); await reopened.locator('.composer input').waitFor();
      assert.equal(await reopened.locator('html').getAttribute('data-theme'),'dark');
      for(const route of ['/shopping','/shopping/product']) {
        await reopened.goto(origin+route); await reopened.locator('h1').waitFor();
        await reopened.screenshot({path:`${directory}/dark-${route.split('/').at(-1)}-${device}.png`,fullPage:true});
        await inspect(reopened,`dark ${route} ${device}`);
      }
      const restored = await browser.newContext({storageState:await context.storageState(),viewport});
      const restoredPage=await restored.newPage();await restoredPage.goto(origin);
      await restoredPage.locator('.theme-trigger').waitFor();
      assert.equal(await restoredPage.locator('html').getAttribute('data-theme'),'dark');
      await restored.close();
      report.cases.push(`${device}: default ignores light OS; draft and geometry stable; both preferences survive reload, navigation and new page`);
    }
    report.cases.push(`${device}: rendered`);
    await context.close();
  }
  if(!baseline) {
    for(const scenario of ['invalid','unreadable','saved-light']) {
      const context=await browser.newContext({colorScheme:'light'});
      await context.addInitScript(scenario=>{
        if(scenario==='unreadable')Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked storage');}});
        else localStorage.setItem('finease.theme',scenario==='saved-light'?'light':'invalid');
        requestAnimationFrame(()=>{window.__firstThemeFrame=document.documentElement.dataset.theme;});
      },scenario);
      const page=await context.newPage();await page.goto(origin);await page.locator('.theme-trigger').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'),scenario==='saved-light'?'light':'dark');
      assert.equal(await page.evaluate(()=>window.__firstThemeFrame),scenario==='saved-light'?'light':'dark');
      if(scenario==='unreadable') {await choose(page,'light');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');}
      report.cases.push(`${scenario}: safe first-paint preference`); await context.close();
    }
    const state=await (await fetch(fixtureOrigin+'/test-state')).json();
    assert.equal(state.counts.execute,0);assert.equal(state.counts.prepare,0);
    assert.equal(report.errors.length,0);assert.equal(report.failedRequests.length,0);
    for(const c of report.cases.filter(c=>c.label)) {assert.equal(c.overflow,false,c.label);assert.equal(c.lowContrast.length,0,c.label);}
  }
  report.success=true;
} finally {
  await writeFile(`${directory}/${baseline ? 'baseline' : 'final'}-report.json`, JSON.stringify(report,null,2));
  await browser.close();
  fixture?.kill();
}
console.log(JSON.stringify(report));
