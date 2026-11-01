/* Interaction test: calendar dispatch → order detail → assign / cycle / skip */
const path = require('path');
const { chromium } = require('playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = 'file://' + path.join(__dirname, 'elevator-mp-prototype.html');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 460, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('play()')) errs.push('console: ' + m.text()); });

  await page.goto(FILE);
  await page.waitForTimeout(900);
  await page.click('#role-pill'); await page.waitForTimeout(250);
  await page.click('#sheet-list .sheet-row:has-text("管理员")'); await page.waitForTimeout(250);
  await page.click('.tab:has-text("我的")'); await page.waitForTimeout(400);
  await page.click('.fn-item:has-text("安排维保工单")'); await page.waitForTimeout(700);

  const log = [];
  // 1. calendar rendered
  const cells = await page.$$eval('.cal-cell[data-day]', els => els.length);
  const dots = await page.$$eval('.cal-cell .cal-dots i', els => els.length);
  log.push(`日历天数 ${cells} · 状态点 ${dots}`);

  // 2. default day list = day 3 (2 orders)
  const dayList0 = await page.$$eval('#day-list .list-row', els => els.map(e => e.querySelector('.lr-t').textContent.trim()));
  log.push('默认 3 日工单：' + dayList0.join(' / '));

  // 3. click day 6 → completed order appears
  await page.click('.cal-cell[data-day="6"]'); await page.waitForTimeout(200);
  const dayList6 = await page.$$eval('#day-list .list-row', els => els.map(e => e.querySelector('.lr-t').textContent.trim()));
  log.push('点击 6 日 → ' + dayList6.join(' / '));

  // 4. filter 已跳过 → only skipped order on day 12
  await page.click('[data-filter="已跳过"]'); await page.waitForTimeout(200);
  const dotsFiltered = await page.$$eval('.cal-cell .cal-dots i', els => els.length);
  await page.click('.cal-cell[data-day="12"]'); await page.waitForTimeout(200);
  const skipList = await page.$$eval('#day-list .lr-t', els => els.map(e => e.textContent.trim()));
  log.push(`筛选「已跳过」→ 状态点 ${dotsFiltered} · 12 日 ${skipList.join(' / ')}`);

  // 5. back to 全部, day 3, open pending order → assign tech
  await page.click('[data-filter="全部"]'); await page.waitForTimeout(150);
  await page.click('.cal-cell[data-day="3"]'); await page.waitForTimeout(150);
  await page.click('#day-list .list-row:has-text("王珮")'); await page.waitForTimeout(600);
  const t1 = await page.$eval('.dp-title', e => e.textContent.trim());
  const hasPicker = await page.$$eval('.pick-row[data-tech]', els => els.length);
  await page.click('.pick-row[data-tech="沈志强"]'); await page.waitForTimeout(600);
  const t2 = await page.$eval('.dp-title', e => e.textContent.trim());
  const status = await page.$eval('.status-pill', e => e.textContent.trim());
  const toastTxt = await page.$eval('.toast', e => e.textContent.trim()).catch(() => 'NO TOAST');
  log.push(`详情「${t1}」·技师候选 ${hasPicker} →派单后状态「${status}」·toast「${toastTxt}」·仍在「${t2}」`);

  // 6. completed order → 定时维保 → d-cycle
  await page.click('[data-back]'); await page.waitForTimeout(300);
  await page.click('.cal-cell[data-day="6"]'); await page.waitForTimeout(150);
  await page.click('#day-list .list-row'); await page.waitForTimeout(600);
  const cycBtn = await page.$('[data-page="d-cycle"]');
  log.push('已完成工单有「定时维保」入口：' + !!cycBtn);
  await cycBtn.click(); await page.waitForTimeout(600);
  const ct = await page.$eval('.dp-title', e => e.textContent.trim());
  const cycBody = await page.$eval('#content', e => e.textContent.replace(/\s+/g, ' '));
  log.push(`「${ct}」含自动建单提示：` + /自动创建「.+?」工单/.test(cycBody));

  // 7. back to order → 跳过维保 → d-skip
  await page.click('[data-back]'); await page.waitForTimeout(300);
  await page.click('[data-back]'); await page.waitForTimeout(300);
  await page.click('.cal-cell[data-day="15"]'); await page.waitForTimeout(150);
  await page.click('#day-list .list-row'); await page.waitForTimeout(600);
  await page.click('[data-page="d-skip"]'); await page.waitForTimeout(600);
  const st = await page.$eval('.dp-title', e => e.textContent.trim());
  const hasUp = await page.$$eval('[data-upload]', els => els.length);
  log.push(`「${st}」含图文上传：${hasUp > 0}`);
  await page.click('[data-upload]'); await page.waitForTimeout(250);
  const upTxt = await page.$eval('.up-files', e => e.textContent.trim());
  log.push('上传反馈：' + upTxt);

  // 8. orders list → detail jump
  await page.click('[data-back]'); await page.waitForTimeout(250);
  await page.click('[data-back]'); await page.waitForTimeout(250);
  await page.click('[data-back]'); await page.waitForTimeout(250);
  await page.click('.fn-item:has-text("工单记录")'); await page.waitForTimeout(600);
  const rowsN = await page.$$eval('[data-page="d-order"]', els => els.length);
  await page.click('[data-page="d-order"]'); await page.waitForTimeout(600);
  const ot = await page.$eval('.dp-title', e => e.textContent.trim());
  log.push(`工单记录 ${rowsN} 行可跳转 → 打开「${ot}」`);

  // screenshots
  await page.click('[data-back]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots-debug2/orders.png' });
  await page.click('[data-back]'); await page.waitForTimeout(300);
  await page.click('.fn-item:has-text("安排维保工单")'); await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots-debug2/calendar.png' });
  await page.click('.cal-cell[data-day="3"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots-debug2/calendar-day.png' });
  await page.click('#day-list .list-row:has-text("王珮")'); await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots-debug2/order-pending.png' });
  await page.click('[data-back]'); await page.waitForTimeout(250);
  await page.click('.cal-cell[data-day="6"]'); await page.waitForTimeout(150);
  await page.click('#day-list .list-row'); await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots-debug2/order-done.png', fullPage: false });
  await page.click('[data-page="d-cycle"]'); await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots-debug2/cycle.png' });
  await page.click('[data-back]'); await page.waitForTimeout(250);
  await page.click('[data-back]'); await page.waitForTimeout(250);

  // overflow probe on the new pages
  const probe = await page.evaluate(() => {
    const c = document.getElementById('content');
    return { ox: c.scrollWidth - c.clientWidth };
  });

  console.log(log.join('\n'));
  console.log('\n横向溢出: ' + probe.ox + 'px');
  console.log('运行期错误: ' + (errs.length ? '\n' + errs.join('\n') : '无'));
  await browser.close();
})();
