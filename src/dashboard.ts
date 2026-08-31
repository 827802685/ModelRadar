import { CATEGORY_LABELS } from './classify.js';

export function dashboardHtml(): string {  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ModelRadar · 免费模型控制面板</title>
<style>
:root{--bg:#0f1115;--panel:#171a21;--panel2:#1e222b;--line:#2a2f3a;--txt:#e6e8ee;--mut:#8b93a1;--acc:#4f8cff;--ok:#37d67a;--bad:#ff5964;--warn:#ffb454;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font:14px/1.5 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;padding:24px;max-width:1200px;margin:0 auto}
header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px}
h1{font-size:22px;font-weight:700;letter-spacing:.3px}
h1 span{color:var(--acc)}
.tag{font-size:12px;color:var(--mut);border:1px solid var(--line);padding:2px 10px;border-radius:20px}
.actions{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button{cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--txt);padding:8px 14px;border-radius:8px;font-size:13px}
button:hover{border-color:var(--acc)}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff}
button.primary:disabled{opacity:.5;cursor:wait}
input,select{background:var(--panel);border:1px solid var(--line);color:var(--txt);padding:8px 10px;border-radius:8px;font-size:13px}
#key{width:220px;font-family:ui-monospace,Consolas,monospace}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.statrow{display:flex;gap:12px;flex-wrap:wrap}
.stat{flex:1;min-width:120px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:24px;font-weight:700}
.stat span{font-size:12px;color:var(--mut)}
.g{color:var(--ok)}.r{color:var(--bad)}.y{color:var(--warn)}
#runmsg{font-size:13px;color:var(--mut);min-height:18px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;white-space:nowrap;position:sticky;top:0;background:var(--panel)}
td.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}
.badge{display:inline-block;padding:1px 8px;border-radius:20px;font-size:12px;border:1px solid var(--line)}
.badge.unlimited{color:var(--ok);border-color:var(--ok)}
.badge.monthly,.badge.daily{color:var(--warn);border-color:var(--warn)}
.badge.trial{color:var(--bad);border-color:var(--bad)}
.res{display:inline-block;padding:1px 8px;border-radius:20px;font-size:12px;border:1px solid var(--line)}
.res-ok{color:var(--ok);border-color:var(--ok)}
.res-auth,.res-unsupported{color:var(--bad);border-color:var(--bad)}
.res-rate{color:var(--warn);border-color:var(--warn)}
.res-error{color:#c792ea;border-color:#c792ea}
.res-skip{color:var(--mut);border-color:var(--line)}
.testing{color:var(--warn)}
footer{color:var(--mut);font-size:12px;margin-top:16px;text-align:center}
#wrap{overflow:auto;max-height:70vh}
</style>
</head>
<body>
<header>
  <h1>Model<span>Radar</span></h1>
  <span class="tag">免费模型自动发现 · 中转同步</span>
  <div class="actions">
    <input id="key" type="password" placeholder="Sync Key(可选,触发同步用)" />
    <button id="btn-sync" class="primary">立即同步</button>
    <button id="btn-refresh">刷新</button>
  </div>
</header>

<div class="card" id="runmsg">加载中…</div>

<div class="card">
  <div class="filters">
    <b>供应商密钥</b>
    <span style="color:var(--mut);font-size:12px">填写并保存各供应商的 API Key——抓取与可用性验证会自动使用（存入服务器，不回显）</span>
  </div>
  <div class="filters">
    <select id="key-provider"><option value="">加载供应商…</option></select>
    <input id="key-input" type="password" placeholder="粘贴要保存的供应商 Key" style="flex:1;max-width:340px;font-family:ui-monospace,monospace" />
    <button id="btn-save-key" class="primary">保存密钥</button>
    <button id="btn-del-key" style="display:none">删除选中</button>
  </div>
  <div id="key-msg" style="color:var(--mut);font-size:13px"></div>
  <div id="key-list" style="margin-top:8px;font-size:12px;line-height:2"></div>
</div>

<div class="card" id="testcard">
  <div class="filters">
    <b>模型测试台</b>
    <span style="color:var(--mut);font-size:12px">用已保存的 Key 对拉取到的模型做批量 chat 探测，实时流式返回结果</span>
  </div>
  <div class="filters">
    <select id="tb-prov"><option value="">全部厂商</option></select>
    <select id="tb-scope">
      <option value="active">范围: 可用模型</option>
      <option value="chat">范围: 仅聊天模型</option>
      <option value="all">范围: 全部(含下线)</option>
    </select>
    <button id="btn-test-all" class="primary">测试全部</button>
    <button id="btn-test-sel">测试选中</button>
    <button id="tb-check-all">全选</button>
    <button id="tb-uncheck">清空</button>
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--mut)">
      <input type="checkbox" id="tb-fail" />仅显示不可用
    </label>
  </div>
  <div id="tb-summary" style="color:var(--mut);font-size:13px;margin-bottom:8px">加载中…</div>
  <div id="tb-wrap" style="overflow:auto;max-height:52vh">
    <table>
      <thead><tr>
        <th><input type="checkbox" id="tb-ck-all" title="全选当前筛选" /></th>
        <th>厂商</th><th>模型名称</th><th>能力</th><th>结果</th><th>延迟</th><th>详情</th><th>操作</th>
      </tr></thead>
      <tbody id="tb-rows"></tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="statrow" id="stats"></div>
</div>

<div class="card">
  <div class="filters">
    <input id="q" type="search" placeholder="搜索模型名 / base_url…" style="flex:1;max-width:320px" />
    <select id="pf"></select>
    <select id="cat"></select>
    <select id="st">
      <option value="">全部状态</option>
      <option value="active">可用</option>
      <option value="inactive">已下线</option>
    </select>
    <select id="ft">
      <option value="">实测:全部</option>
      <option value="ok">实测可用</option>
      <option value="unproven">未实测 / 不可用</option>
    </select>
    <span id="count" style="color:var(--mut)"></span>
    <span id="batch-count" style="color:var(--mut)"></span>
    <button id="btn-batch-off" disabled>批量下线</button>
    <button id="btn-batch-on" disabled>批量恢复</button>
    <button id="btn-logs">日志</button>
  </div>
  <div id="wrap"><table>
    <thead><tr>
      <th><input type="checkbox" id="ck-all" title="全选当前筛选结果" /></th>
      <th>厂商</th><th>模型名称</th><th>免费类型</th><th>额度</th><th>限速</th><th>上下文</th><th>能力</th><th>分类</th><th>状态</th><th>实测</th><th>检测时间</th><th>操作</th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table></div>
</div>

<div class="card" id="logcard" style="display:none">
  <div class="filters">
    <b>操作日志</b>
    <span id="logcount" style="color:var(--mut)"></span>
    <button id="btn-log-refresh" style="margin-left:auto">刷新日志</button>
  </div>
  <div id="logwrap">
    <table>
      <thead><tr><th>时间</th><th>动作</th><th>模型</th><th>详情</th></tr></thead>
      <tbody id="logbody"></tbody>
    </table>
  </div>
</div>

<footer>ModelRadar · 数据仅供中转站参考，请以各厂商官方页面为准</footer>

<script>
const KEY = 'mr_sync_key';
const $ = (id) => document.getElementById(id);
let MODELS = [];
let PROV = [];
const LABELS = ${JSON.stringify(CATEGORY_LABELS)};
// Fallback suppliers used when /providers is unreachable, so the dropdown is
// never empty (an empty <select> collapses to a thin bar in some browsers).
const DEFAULT_PROVIDERS = ['nvidia', 'openrouter', 'google', 'modelscope', 'zhipu', 'siliconflow', 'agnes', 'opencodezen'];

function fmtTime(iso){ if(!iso) return '-'; const d=new Date(iso); return d.toLocaleString('zh-CN',{hour12:false}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function api(path, opts){
  const r = await fetch(path, opts);
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  if(!r.ok) throw new Error(typeof d==='object' ? (d.error||r.status) : t);
  return d;
}

function renderStats(){
  const models = MODELS;
  const total = models.length;
  const active = models.filter(m=>m.status==='active').length;            // 拉取可用 = 抓取池留下的
  const okSet = new Set(Object.keys(TB_RESULTS).filter(k=>TB_RESULTS[k].result==='ok'));
  const activeOk = models.filter(m=>m.status==='active' && okSet.has(selKey(m))).length; // 实测可用 = 池内且被测试台证明 ok
  const byP = {};
  models.forEach(m=>{ byP[m.provider]=(byP[m.provider]||0)+1; });
  let html = '<div class="stat"><b>' + total + '</b><span>模型总数</span></div>'
    + '<div class="stat"><b class="acc">' + active + '</b><span>拉取可用 · 抓取池</span></div>'
    + '<div class="stat"><b class="g">' + activeOk + '</b><span>实测可用 · 测试台 ok</span></div>'
    + '<div class="stat"><b class="y">' + (active - activeOk) + '</b><span>拉取但未实测</span></div>';
  Object.entries(byP).forEach(function(entry){ html += '<div class="stat"><b>' + entry[1] + '</b><span>' + esc(entry[0]) + '</span></div>'; });
  $('stats').innerHTML = html;
}

function renderRun(run){
  if(!run){
    $('runmsg').innerHTML = '尚未执行过同步。点击「立即同步」或等待每日 Cron(UTC 00:00)。';
    return;
  }
  const errs = Object.entries(run.provider_errors||{}).map(function(e){ return esc(e[0]) + ': ' + esc(e[1]); }).join('；');
  $('runmsg').innerHTML =
    '最近同步: <b>' + fmtTime(run.ran_at) + '</b> · 共抓取 ' + run.total_scraped
    + ' · <span class="g">+' + run.added + ' 新增</span>'
    + ' · <span class="r">-' + run.removed + ' 下线</span>'
    + ' · <span class="y">~' + run.changed + ' 变更</span>'
    + (errs ? ' · <span class="r">失败: ' + errs + '</span>' : '');
}

function selKey(m){ return m.provider + ':' + m.model_name; }
let SELECTED = new Map();

function updateBatchBtns(){
  const sel = [...SELECTED.values()];
  $('btn-batch-off').disabled = !sel.some(s=>s.status==='active');
  $('btn-batch-on').disabled = !sel.some(s=>s.admin_offline);
  $('batch-count').textContent = sel.length ? (sel.length + ' 已选') : '';
}

function renderRows(){
  const q = $('q').value.trim().toLowerCase();
  const pf = $('pf').value;
  const st = $('st').value;
  const cat = $('cat').value;
  const rows = MODELS
    .filter(m=>!pf || m.provider===pf)
    .filter(m=>!st || m.status===st)
    .filter(m=>!cat || (m.categories||[]).includes(cat))
    .filter(m=>{ const f=$('ft').value; if(!f) return true; const r=TB_RESULTS[selKey(m)]; return f==='ok' ? !!(r&&r.result==='ok') : !(r&&r.result==='ok'); })
    .filter(m=>!q || m.model_name.toLowerCase().includes(q) || (m.base_url||'').toLowerCase().includes(q));
  $('count').textContent = '共 ' + rows.length + ' 条';
  $('rows').innerHTML = rows.map(m => {
    const key = selKey(m);
    return '<tr>'
    + '<td><input type="checkbox" class="ck" data-prov="' + esc(m.provider) + '" data-name="' + esc(m.model_name) + '" data-st="' + m.status + '" data-admin="' + (m.admin_offline ? 1 : 0) + '" ' + (SELECTED.has(key) ? 'checked' : '') + '></td>'
    + '<td>' + esc(m.provider) + '</td>'
    + '<td class="mono">' + esc(m.model_name) + '</td>'
    + '<td><span class="badge ' + esc(m.free_type) + '">' + esc(m.free_type) + '</span></td>'
    + '<td class="mono">' + esc(m.free_quota) + '</td>'
    + '<td class="mono">' + esc(m.rate_limit) + '</td>'
    + '<td>' + (m.context_length ? m.context_length.toLocaleString() : '-') + '</td>'
    + '<td>' + (Array.isArray(m.capabilities) ? m.capabilities.map(c => '<span class="badge">' + esc(c) + '</span>').join(' ') : '-') + '</td>'
    + '<td>' + (Array.isArray(m.categories) ? m.categories.map(c => '<span class="badge">' + esc(LABELS[c] || c) + '</span>').join(' ') : '-') + '</td>'
    + '<td>' + (m.status==='active' ? '<span class="g">可用</span>' : '<span class="r">已下线</span>') + '</td>'
    + '<td id="mres-' + key + '">' + tbResultMark(TB_RESULTS[key]) + '</td>'
    + '<td>' + fmtTime(m.detected_at) + '</td>'
    + '<td>' + (m.status==='active'
        ? '<button data-off="' + esc(m.provider) + '" data-name="' + esc(m.model_name) + '">下线</button>'
        : (m.admin_offline
            ? '<button data-on="' + esc(m.provider) + '" data-name="' + esc(m.model_name) + '">恢复</button>'
            : ''))
      + '</td>'
    + '</tr>';
  }).join('') || '<tr><td colspan="13" style="color:var(--mut)">无匹配模型</td></tr>';
  updateBatchBtns();
}

async function load(){
  const models = await api('/models');
  const run = await api('/status').then(function(d){ return d.last_run; }).catch(function(){ return null; });
  MODELS = models; PROV = [...new Set(models.map(m=>m.provider))].sort();
  $('pf').innerHTML = '<option value="">全部厂商</option>' + PROV.map(p => '<option>' + esc(p) + '</option>').join('');
  const cats = [...new Set(models.flatMap(m=>m.categories||[]))].sort();
  $('cat').innerHTML = '<option value="">全部分类</option>' + cats.map(c => '<option value="' + esc(c) + '">' + esc(LABELS[c] || c) + '</option>').join('');
  renderStats(); renderRun(run); renderRows();
  tbInitModels(models); tbLoadResults();
}

async function loadKeyStatus(){
  let list = [];
  try{ list = await api('/config/keys'); }catch(e){ list = []; }
  const sel = $('key-provider');
  const data = (Array.isArray(list) && list.length) ? list : DEFAULT_PROVIDERS.map(function(n){ return { name:n }; });
  if(sel.options.length <= 1){
    sel.innerHTML = '<option value="">选择供应商…</option>' + data.map(function(p){
      return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>';
    }).join('');
  }
  const rows = (Array.isArray(list) && list.length) ? list : [];
  const hasDb = rows.filter(function(p){ return p.has_key && p.source==='db'; }).map(function(p){ return p.name; });
  $('btn-del-key').style.display = hasDb.length ? '' : 'none';
  $('key-list').innerHTML = rows.map(function(p){
    const dot = p.has_key ? '<b class="g">●</b>' : '<b style="color:var(--line)">○</b>';
    const src = p.has_key ? ' <span style="color:var(--mut)">[' + (p.source==='db' ? '已保存' : '环境变量') + ']</span>' : ' <span style="color:var(--mut)">[未配置]</span>';
    const del = (p.has_key && p.source==='db')
      ? ' <a href="#" data-del="' + esc(p.name) + '" style="color:var(--bad)" onclick="return false">删除</a>'
      : '';
    return '<span>' + dot + ' <span class="mono">' + esc(p.name) + '</span>' + src + del + '</span><br/>';
  }).join('') || '<span>暂无数据</span>';
  document.querySelectorAll('[data-del]').forEach(function(a){
    a.addEventListener('click', function(ev){ ev.preventDefault(); delKey(a.getAttribute('data-del')); });
  });
}

async function saveKey(){
  const provider = $('key-provider').value;
  const key = $('key-input').value.trim();
  if(!provider){ $('key-msg').innerHTML = '<span class="r">请先选择供应商</span>'; return; }
  if(!key){ $('key-msg').innerHTML = '<span class="r">请粘贴要保存的 Key</span>'; return; }
  const btn = $('btn-save-key'); btn.disabled = true;
  try{
    await api('/config/keys', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ provider: provider, api_key: key })
    });
    $('key-input').value = '';
    $('key-msg').innerHTML = '<span class="g">已保存 ' + esc(provider) + ' 的密钥</span>';
    await loadKeyStatus();
  }catch(e){
    $('key-msg').innerHTML = '<span class="r">保存失败: ' + esc(e.message) + '</span>';
  }finally{ btn.disabled = false; }
}

async function delKey(provider){
  try{
    await api('/config/keys?provider=' + encodeURIComponent(provider), { method:'DELETE' });
    $('key-msg').innerHTML = '<span class="g">已删除 ' + esc(provider) + ' 的密钥</span>';
    await loadKeyStatus();
  }catch(e){
    $('key-msg').innerHTML = '<span class="r">删除失败: ' + esc(e.message) + '</span>';
  }
}

async function sync(){
  const btn = $('btn-sync'); btn.disabled = true;
  const mk = $('key').value.trim();
  try{
    const headers = {};
    if(mk){ headers['X-Sync-Key'] = mk; localStorage.setItem(KEY, mk); }
    $('runmsg').innerHTML = '同步中…(抓取各厂商, 约需 5~20 秒)';
    const run = await api('/run', { method:'POST', headers:headers });
    renderRun(run); await load(); loadKeyStatus();
    $('runmsg').innerHTML += (mk
      ? ' · 已使用 Sync Key 鉴权'
      : ' · 未填 Sync Key（通过登录会话鉴权, 或服务端未配置 SYNC_SECRET）');
  }catch(e){
    $('runmsg').innerHTML = '<span class="r">同步失败: ' + esc(e.message) + '</span>';
  }finally{ btn.disabled = false; }
}

async function batchAction(offline){
  const items = [...SELECTED.values()]
    .filter(s => offline ? s.status==='active' : s.admin_offline)
    .map(s => ({ provider: s.provider, model_name: s.model_name }));
  if(!items.length) return;
  const btn = offline ? $('btn-batch-off') : $('btn-batch-on');
  btn.disabled = true;
  try{
    const r = await api('/models/batch', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ offline: offline, items: items })
    });
    SELECTED.clear(); $('ck-all').checked = false;
    await load();
    $('runmsg').innerHTML = '<span class="g">已' + (offline ? '下线' : '恢复') + ' ' + r.count + ' 个模型</span>';
    if($('logcard').style.display !== 'none') loadLogs().catch(function(){});
  }catch(e){
    $('runmsg').innerHTML = '<span class="r">批量操作失败: ' + esc(e.message) + '</span>';
  }finally{ btn.disabled = false; updateBatchBtns(); }
}

async function loadLogs(){
  const logs = await api('/logs').catch(function(){ return []; });
  $('logbody').innerHTML = logs.map(l => '<tr>'
    + '<td>' + fmtTime(l.ts) + '</td>'
    + '<td class="mono">' + esc(l.action) + '</td>'
    + '<td class="mono">' + esc(l.provider ? l.provider + '/' + l.model_name : '-') + '</td>'
    + '<td>' + esc(l.detail) + '</td>'
    + '</tr>').join('') || '<tr><td colspan="4" style="color:var(--mut)">暂无日志</td></tr>';
  $('logcount').textContent = '共 ' + logs.length + ' 条';
}

$('btn-sync').onclick = sync;
$('btn-save-key').onclick = saveKey;
$('btn-del-key').onclick = function(){
  const p = $('key-provider').value;
  if(p) delKey(p);
};
$('btn-refresh').onclick = ()=>{
  loadKeyStatus();
  load().catch(e=>$('runmsg').innerHTML='<span class="r">加载失败: '+esc(e.message)+'</span>');
};
$('q').oninput = renderRows;
$('pf').onchange = renderRows;
$('cat').onchange = renderRows;
$('st').onchange = renderRows;
$('ft').onchange = renderRows;
$('key').value = localStorage.getItem(KEY) || '';
$('rows').addEventListener('click', async function(ev){
  const btn = ev.target.closest('button');
  if(!btn || !(btn.dataset.off || btn.dataset.on)) return;
  const isOff = 'off' in btn.dataset;
  const payload = { provider: btn.dataset.off || btn.dataset.on, model_name: btn.dataset.name };
  try{
    await api('/models/' + (isOff ? 'offline' : 'online'), {
      method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(payload)
    });
    await load();
    if($('logcard').style.display !== 'none') loadLogs().catch(function(){});
  }catch(e){
    $('runmsg').innerHTML = '<span class="r">' + (isOff ? '下线' : '恢复') + '失败: ' + esc(e.message) + '</span>';
  }
});

$('rows').addEventListener('change', function(ev){
  const cb = ev.target;
  if(!cb || !cb.classList || !cb.classList.contains('ck')) return;
  const key = cb.dataset.prov + ':' + cb.dataset.name;
  if(cb.checked){
    SELECTED.set(key, { provider: cb.dataset.prov, model_name: cb.dataset.name, status: cb.dataset.st, admin_offline: cb.dataset.admin === '1' });
  }else{
    SELECTED.delete(key);
  }
  updateBatchBtns();
});

$('ck-all').onchange = function(){
  const all = $('ck-all').checked;
  document.querySelectorAll('#rows .ck').forEach(function(cb){
    cb.checked = all;
    const key = cb.dataset.prov + ':' + cb.dataset.name;
    if(all) SELECTED.set(key, { provider: cb.dataset.prov, model_name: cb.dataset.name, status: cb.dataset.st, admin_offline: cb.dataset.admin === '1' });
    else SELECTED.delete(key);
  });
  updateBatchBtns();
};

$('btn-batch-off').onclick = function(){ batchAction(true); };
$('btn-batch-on').onclick = function(){ batchAction(false); };

// ---------- test bench ----------
const RES = { ok:'可用', auth:'鉴权失败', unsupported:'模型不可用', rate_limit:'限流', error:'服务异常', skip:'跳过' };
const RES_CLS = { ok:'res-ok', auth:'res-auth', unsupported:'res-unsupported', rate_limit:'res-rate', error:'res-error', skip:'res-skip' };
let TB_MODELS = [];
let TB_RESULTS = {};   // key(p:name) -> last stored result
let TB_SEL = new Set();
let TB_RUNNING = false;

function tbKey(p, n){ return p + ':' + n; }

async function tbLoadResults(){
  try{ const d = await api('/test/results'); TB_RESULTS = d.tests || {}; }
  catch(e){ TB_RESULTS = {}; }
  tbRender();
  renderStats(); renderRows(); // refresh split-availability stats + main table now that results are loaded
}

function tbVisible(){
  const prov = $('tb-prov').value;
  const scope = $('tb-scope').value;
  const onlyFail = $('tb-fail').checked;
  const out = [];
  for(const m of TB_MODELS){
    if(prov && m.provider!==prov) continue;
    if(scope==='active' && m.status!=='active') continue;
    if(scope==='chat'){
      const caps=(m.capabilities||[]).map(c=>c.toLowerCase());
      if(m.status!=='active' || !caps.includes('chat') || caps.includes('embedding')) continue;
    }
    if(onlyFail){
      const r = TB_RESULTS[tbKey(m.provider,m.model_name)];
      if(!r || r.result==='ok' || r.result==='skip') continue;
    }
    out.push(m);
  }
  return out;
}

function tbResultMark(r){
  const kind = r ? r.result : null;
  if(!kind) return '<span class="badge">未测试</span>';
  const n = RES[kind] || kind;
  return '<span class="res ' + (RES_CLS[kind]||'res-skip') + '">' + n + '</span>';
}

function tbRow(m){
  const key = tbKey(m.provider,m.model_name);
  const r = TB_RESULTS[key];
  const caps = (m.capabilities||[]).map(function(c){ return '<span class="badge">'+esc(c)+'</span>'; }).join(' ');
  const testing = TB_SEL.has(key);
  return '<tr data-key="'+esc(key)+'">'
    + '<td><input type="checkbox" class="tb-ck" data-key="'+esc(key)+'" ' + (TB_SEL.has(key)?'checked':'') + '/></td>'
    + '<td>'+esc(m.provider)+'</td>'
    + '<td class="mono">'+esc(m.model_name)+'</td>'
    + '<td>'+caps+'</td>'
    + '<td id="res-'+esc(key)+'">'+tbResultMark(r)+'</td>'
    + '<td>'+(r ? r.latency_ms+'ms' : '-')+'</td>'
    + '<td style="max-width:260px;word-break:break-all">'+(r ? esc(r.detail) : '-')+'</td>'
    + '<td><button data-test="'+esc(m.provider)+'" data-name="'+esc(m.model_name)+'">测这个</button></td>'
    + '</tr>';
}

function tbRender(){
  const rows = tbVisible();
  $('tb-rows').innerHTML = rows.map(tbRow).join('') || '<tr><td colspan="8" style="color:var(--mut)">无匹配模型</td></tr>';
  const tested = TB_MODELS.length;
  const ok = Object.values(TB_RESULTS).filter(function(r){ return r.result==='ok'; }).length;
  const bad = Object.values(TB_RESULTS).filter(function(r){ return ['auth','unsupported','rate_limit','error'].includes(r.result); }).length;
  $('tb-summary').innerHTML = '可视 '+rows.length+' 个 · 共 '+tested+' 个模型 · <span class="g">可用 '+ok+'</span> · <span class="r">不可用/异常 '+bad+'</span>'
    + (TB_RUNNING ? ' · <span class="testing">测试中…</span>' : '');
  $('tb-ck-all').checked = rows.length>0 && rows.every(function(m){ return TB_SEL.has(tbKey(m.provider,m.model_name)); });
}

async function tbRun(items){
  if(TB_RUNNING) return;
  if(!items.length){ $('tb-summary').innerHTML = '<span class="r">没有可测试的模型</span>'; return; }
  TB_RUNNING = true;
  $('btn-test-all').disabled = true; $('btn-test-sel').disabled = true;
  tbRender();
  const selKeys = new Set(items.map(function(i){ return tbKey(i.provider,i.model_name); }));
  items.forEach(function(i){ TB_SEL.add(tbKey(i.provider,i.model_name)); });
  tbRender();
  try{
    const resp = await fetch('/test/run', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ items: items, concurrency: 6 })
    });
    if(!resp.ok || !resp.body){
      const err = await resp.text().catch(function(){ return ''+resp.status; });
      throw new Error(err || ('HTTP '+resp.status));
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buf += dec.decode(value, { stream:true });
      let idx;
      while((idx = buf.indexOf('\\n\\n')) >= 0){
        const raw = buf.slice(0, idx); buf = buf.slice(idx+2);
        if(raw.indexOf('data: ') !== 0) continue;
        try{
          const ev = JSON.parse(raw.slice(6));
          if(ev.type==='result') tbApplyResult(ev);
          else if(ev.type==='done'){ $('tb-summary').innerHTML += ' · 完成(可用 '+ev.passed+(ev.offline ? ' · 已即时下线 '+ev.offline : '')+')'; }
          else if(ev.type==='error') throw new Error(ev.message||'测试出错');
        }catch(pe){ /* skip malformed */ }
      }
    }
  }catch(e){
    $('tb-summary').innerHTML = '<span class="r">测试失败: '+esc(e.message)+'</span>';
  }finally{
    TB_RUNNING = false;
    // remove selection markers after run
    selKeys.forEach(function(k){ TB_SEL.delete(k); });
    $('btn-test-all').disabled = false; $('btn-test-sel').disabled = false;
    tbRender();
  }
}

function tbApplyResult(ev){
  TB_RESULTS[tbKey(ev.provider, ev.model_name)] = {
    provider: ev.provider, model_name: ev.model_name,
    result: ev.kind, latency_ms: ev.latency_ms, detail: ev.detail,
    tested_at: ''
  };
  const el = $('res-'+tbKey(ev.provider, ev.model_name));
  if(el){ el.innerHTML = tbResultMark(TB_RESULTS[tbKey(ev.provider,ev.model_name)]); }
  const me = $('mres-'+tbKey(ev.provider, ev.model_name));
  if(me){ me.innerHTML = tbResultMark(TB_RESULTS[tbKey(ev.provider,ev.model_name)]); }
  renderStats();
  tbRenderSummaryOnly();
}

function tbRenderSummaryOnly(){
  const ok = Object.values(TB_RESULTS).filter(function(r){ return r.result==='ok'; }).length;
  const bad = Object.values(TB_RESULTS).filter(function(r){ return ['auth','unsupported','rate_limit','error'].includes(r.result); }).length;
  $('tb-summary').innerHTML = '可视 '+tbVisible().length+' 个 · 共 '+TB_MODELS.length+' 个模型 · <span class="g">可用 '+ok+'</span> · <span class="r">不可用/异常 '+bad+'</span>'
    + (TB_RUNNING ? ' · <span class="testing">测试中…</span>' : '');
}

function tbSelectedModels(){
  const items = [];
  for(const m of TB_MODELS){
    if(TB_SEL.has(tbKey(m.provider,m.model_name))) items.push({ provider:m.provider, model_name:m.model_name });
  }
  return items;
}

$('btn-test-all').onclick = function(){
  const items = tbVisible().map(function(m){ return { provider:m.provider, model_name:m.model_name }; });
  tbRun(items);
};
$('btn-test-sel').onclick = function(){ tbRun(tbSelectedModels()); };
$('tb-check-all').onclick = function(){
  tbVisible().forEach(function(m){ TB_SEL.add(tbKey(m.provider,m.model_name)); });
  tbRender();
};
$('tb-uncheck').onclick = function(){ TB_SEL.clear(); tbRender(); };
$('tb-fail').onchange = function(){ tbRender(); };
$('tb-prov').onchange = function(){ tbRender(); };
$('tb-scope').onchange = function(){ tbRender(); };
$('tb-ck-all').onchange = function(){
  const all = $('tb-ck-all').checked;
  tbVisible().forEach(function(m){
    const k = tbKey(m.provider,m.model_name);
    if(all) TB_SEL.add(k); else TB_SEL.delete(k);
  });
  tbRender();
};
$('tb-rows').addEventListener('click', function(ev){
  const btn = ev.target.closest('button');
  if(!btn || !btn.dataset.test) return;
  tbRun([{ provider: btn.dataset.test, model_name: btn.dataset.name }]);
});
$('tb-rows').addEventListener('change', function(ev){
  const cb = ev.target;
  if(!cb.classList || !cb.classList.contains('tb-ck')) return;
  const k = cb.dataset.key;
  if(cb.checked) TB_SEL.add(k); else TB_SEL.delete(k);
  const row = cb.closest('tr');
  if(row) row.style.outline = cb.checked ? '1px solid var(--acc)' : '';
});

function tbInitModels(models){
  TB_MODELS = models.filter(m=>m.status==='active');
  const provs = [...new Set(TB_MODELS.map(m=>m.provider))].sort();
  $('tb-prov').innerHTML = '<option value="">全部厂商</option>' + provs.map(p => '<option>'+esc(p)+'</option>').join('');
}

$('btn-logs').onclick = function(){
  const card = $('logcard');
  const show = card.style.display === 'none';
  card.style.display = show ? '' : 'none';
  if(show) loadLogs().catch(function(e){ $('logcount').textContent = '加载失败: ' + e.message; });
};
$('btn-log-refresh').onclick = function(){ loadLogs().catch(function(e){ $('logcount').textContent = '加载失败: ' + e.message; }); };
load().catch(e=>$('runmsg').innerHTML='<span class="r">加载失败: '+esc(e.message)+'</span>');
loadKeyStatus();
</script>
</body>
</html>`;
}

export function loginHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ModelRadar · 登录</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1115;color:#e6e8ee;font:14px/1.5 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#171a21;border:1px solid #2a2f3a;border-radius:12px;padding:32px;width:100%;max-width:360px}
h1{font-size:20px;margin-bottom:6px}
h1 span{color:#4f8cff}
p{color:#8b93a1;margin-bottom:20px;font-size:13px}
input{width:100%;background:#0f1115;border:1px solid #2a2f3a;color:#e6e8ee;padding:10px 12px;border-radius:8px;margin-bottom:12px}
button{width:100%;cursor:pointer;background:#4f8cff;border:none;color:#fff;padding:10px;border-radius:8px;font-size:14px}
button:hover{filter:brightness(1.1)}
.err{color:#ff5964;font-size:13px;min-height:18px;margin-bottom:8px}
</style>
</head>
<body>
<div class="card">
  <h1>Model<span>Radar</span></h1>
  <p>请输入管理密码以访问控制面板</p>
  <form method="post" action="/login">
    <input type="password" name="password" placeholder="管理密码" autofocus autocomplete="current-password" />
    <div class="err"></div>
    <button type="submit">登 录</button>
  </form>
</div>
</body>
</html>`;
}