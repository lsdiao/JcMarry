/* Chrome headless: render every mine-tab entry page, probe overflow + console errors */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const ROLES = ['业主', '业务员', '安装维保', '管理员'];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 460, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 160)); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message.slice(0, 160)));

  await page.goto('file://' + path.join(__dirname, 'elevator-mp-prototype.html'));
  await page.waitForTimeout(900);

  for (const role of ROLES) {
    await page.click('#role-pill');
    await page.waitForTimeout(260);
    await page.click(`#sheet-list .sheet-row:has-text("${role}")`);
    await page.waitForTimeout(260);
    await page.click('.tab:has-text("我的")');
    await page.waitForTimeout(420);

    const n = await page.$$eval('.fn-item[data-page]', els => els.length);
    const labels = await page.$$eval('.fn-item[data-page] .fn-t', els => els.map(e => e.textContent.trim()));

    for (let i = 0; i < n; i++) {
      await page.$$eval('.fn-item[data-page]', (els, i) => els[i].click(), i);
      await page.waitForTimeout(520);
      const info = await page.evaluate(() => {
        const c = document.getElementById('content');
        const t = document.querySelector('.dp-title');
        return {
          title: t ? t.textContent.trim() : 'NONE',
          overflowX: c.scrollWidth - c.clientWidth,
          /* ignore intentional single-line ellipsis (e.g. the store address) */
          overflowing: [...c.querySelectorAll('*')]
            .filter(el => {
              if (el.scrollWidth - el.clientWidth <= 2) return false;
              const cs = getComputedStyle(el);
              return !(cs.textOverflow === 'ellipsis' || cs.overflowX === 'auto');
            })
            .map(el => el.className + '(' + (el.scrollWidth - el.clientWidth) + 'px)').slice(0, 3),
          len: c.textContent.replace(/\s+/g, ' ').trim().length
        };
      });
      if (info.title === 'NONE') problems.push(`${role}/${labels[i]}: 未进入详情页`);
      if (info.overflowX > 2) problems.push(`${role}/${labels[i]}: 横向溢出 ${info.overflowX}px`);
      if (info.overflowing.length) problems.push(`${role}/${labels[i]}: 子元素溢出 ${info.overflowing.join(',')}`);
      const slug = role + '-' + i;
      await page.screenshot({ path: path.join(SHOTS, slug + '.png') });
      await page.click('[data-back]');
      await page.waitForTimeout(300);
    }
    console.log(`${role}: 渲染 ${n} 页 -> ${labels.join(' / ')}`);
  }

  await browser.close();
  console.log('\n问题: ' + (problems.length ? '\n' + [...new Set(problems)].join('\n') : '无'));
  console.log('SHOT CHECK: ' + (problems.length ? 'FAIL' : 'PASS'));
})();
