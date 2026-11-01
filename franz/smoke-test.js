/* Smoke test: 「我的」→ 业务模块面板 / 常用功能网格 → 详情页 → 返回，覆盖四个角色全部入口 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'elevator-mp-prototype.html'), 'utf8');
const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  /* jsdom 无 matchMedia —— 注入桩，避免误报为原型缺陷 */
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  }
});
const { window } = dom;
const consoleError = console.error;
console.error = (...a) => errors.push('console.error: ' + a.join(' '));
window.addEventListener('error', e => errors.push('window error: ' + e.message));

/* jsdom 未实现媒体播放 */
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.load = () => {};

const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => [...doc.querySelectorAll(s)];
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const text = () => $('#content').textContent.replace(/\s+/g, ' ').trim();

function goTab(label) {
  const tab = $$('.tab').find(t => t.textContent.includes(label));
  if (!tab) throw new Error('找不到 tab: ' + label);
  click(tab);
}
function switchRole(name) {
  click($('#role-pill'));
  const row = $$('#sheet-list .sheet-row').find(r => r.textContent.includes(name));
  if (!row) throw new Error('找不到角色: ' + name);
  click(row);
}
/* descriptors only — the DOM is rebuilt on every paint(), so never hold element refs */
function mineEntries() {
  const out = [];
  const panel = $('[data-page]');
  if (panel) out.push({ kind: '业务模块面板', label: (panel.querySelector('.rp-more') || panel).textContent.trim(), idx: -1 });
  $$('.invite-card[data-page]').forEach(el => {
    out.push({ kind: '邀请会员', label: el.querySelector('.invite-t').textContent.trim(), idx: -2 });
  });
  $$('.fn-item[data-page]').forEach((el, i) => {
    out.push({ kind: '常用功能', label: el.querySelector('.fn-t').textContent.trim(), idx: i });
  });
  return out;
}
function entryEl(d) {
  if (d.idx === -1) return $('[data-page]');
  if (d.idx === -2) return $('.invite-card[data-page]');
  return $$('.fn-item[data-page]')[d.idx];
}

const ROLES = ['业主', '业务员', '安装维保', '管理员'];
const rows = [];
let checked = 0;

try {
  rows.push(['初始 tab 数', $$('.tab').length]);
  rows.push(['TabBar 文案', $$('.tab').map(t => t.textContent.trim()).join(' / ')]);
  rows.push(['切换身份 选项', $$('#sheet-list .sr-name').map(n => n.textContent).join(' / ')]);

  for (const role of ROLES) {
    switchRole(role);
    goTab('我的');

    const entries = mineEntries();
    if (entries.length < 5) throw new Error(role + '：入口数量异常，仅 ' + entries.length + ' 个');
    /* 网格项必须全部可点 */
    const grids = $$('.fn-item');
    const deadGrids = grids.filter(g => !g.dataset.page);
    if (deadGrids.length) throw new Error(role + '：存在不可点击的网格项 ' + deadGrids.map(d => d.querySelector('.fn-t').textContent).join('/'));

    const visited = [];
    for (const d of entries) {
      const el = entryEl(d);
      if (!el) throw new Error(role + ' / ' + d.label + '：DOM 重建后找不到入口');
      click(el);
      if (!$('.dp-title')) throw new Error(role + ' / ' + d.label + '：点击后未进入详情页');
      const title = $('.dp-title').textContent.trim();
      const len = text().length;
      if (len < 120) throw new Error(role + ' / ' + d.label + '：详情页内容过少（' + len + ' 字符）');
      visited.push(d.label + '→' + title);
      click($('[data-back]'));
      if ($('.dp-title')) throw new Error(role + ' / ' + d.label + '：返回后仍停留在详情页');
      if (!$('[data-page]')) throw new Error(role + ' / ' + d.label + '：返回后未回到「我的」');
      checked++;
    }
    rows.push([role + ' 可点击入口', entries.length + ' 个全部通过：' + visited.join('，')]);
  }

  ['首页', '产品', '维保'].forEach(t => {
    goTab(t);
    if (text().length < 20) throw new Error('页面为空: ' + t);
  });
  rows.push(['Tab 切换', '首页 / 产品 / 维保 均正常渲染']);

  /* ---- 会员归属链路：邀请 → 会员详情可见归属 → 管理员改派 ---- */
  switchRole('业务员');
  goTab('我的');
  click($('.invite-card[data-page]'));
  if ($('.dp-title').textContent.trim() !== '邀请成为会员') throw new Error('业务员邀请页标题不正确');
  let inv = text();
  ['扫码邀请', '王珮', '何婧'].forEach(p => { if (!inv.includes(p)) throw new Error('业务员邀请明细缺少：' + p); });
  if (inv.includes('顾承')) throw new Error('未分配会员不应出现在业务员的邀请明细中');
  click($('[data-back]'));

  goTab('我的');
  const grids = $$('.fn-item[data-page]');
  click(grids[0]);                                   /* 我的客户 */
  if ($('.dp-title').textContent.trim() !== '我的客户') throw new Error('未进入「我的客户」');
  /* open the first owned member */
  click($$('.list-row[data-page="d-client"]')[0]);
  const det = text();
  ['专属业务员', '李航', '维保记录', '设备与合同'].forEach(p => {
    if (!det.includes(p)) throw new Error('会员详情缺少：' + p);
  });
  rows.push(['会员详情归属', '显示专属业务员 李航 · 含维保记录区块']);
  click($('[data-back]'));

  switchRole('管理员');
  goTab('我的');
  const staffItem = $$('.fn-item[data-page]').find(g => g.textContent.includes('人员权限'));
  click(staffItem);                                   /* 人员权限 */
  if ($('.dp-title').textContent.trim() !== '人员与权限') throw new Error('未进入「人员与权限」');
  click($('[data-page="d-assign"]'));
  if ($('.dp-title').textContent.trim() !== '会员分配') throw new Error('未进入「会员分配」');
  if (!text().includes('顾承')) throw new Error('待分配会员缺失');
  const pick = doc.querySelector('[data-assign][data-sales="周涛"]');
  if (!pick) throw new Error('找不到业务员选择器');
  const targetName = pick.closest('.task-col').querySelector('.tk-t').textContent.trim().split(' · ')[0];
  click(pick);
  const tst = $('.toast');
  if (!tst || !tst.textContent.includes('周涛')) throw new Error('分配后未给出归属变更提示');
  if (!text().includes('归属 周涛')) throw new Error('分配后列表未显示新归属人');
  rows.push(['管理员分配会员', targetName + ' → 周涛 · toast 提示 · 列表同步新归属']);

  /* 分配后该会员应出现在业务员列表中 */
  switchRole('业务员');
  goTab('我的');
  click($$('.fn-item[data-page]')[0]);
  const after = text();
  if (after.includes(targetName)) throw new Error('分配给周涛后仍出现在李航的客户列表');
  rows.push(['归属生效校验', '指派给周涛后已移出李航的客户列表']);

  console.error = consoleError;
  rows.forEach(([k, v]) => console.log(String(k).padEnd(16) + ' | ' + v));
  console.log('\n累计校验详情页：' + checked + ' 个');
  console.log('运行期错误: ' + (errors.length ? '\n' + errors.join('\n') : '无'));
  console.log('SMOKE TEST: ' + (errors.length ? 'FAIL' : 'PASS'));
} catch (e) {
  console.error = consoleError;
  rows.forEach(([k, v]) => console.log(String(k).padEnd(16) + ' | ' + v));
  console.log('\nSMOKE TEST FAILED: ' + e.message);
  if (errors.length) console.log('运行期错误:\n' + errors.join('\n'));
  process.exit(1);
}
