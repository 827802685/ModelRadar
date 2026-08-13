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
  <div class="statrow" id="stats"></div>
</div>

<div class="card">
  <div class="filters">
    <input id="q" type="search" placeholder="搜索模型名 / base_url…" style="flex:1;max-width:320px" />
    <select id="pf"></select>
    <select id="st">
      <option value="">全部状态</option>
      <option value="active">可用</option>
      <option value="inactive">已下线</option>
    </select>
    <span id="count" style="color:var(--mut)"></span>
  </div>
  <div id="wrap"><table>
    <thead><tr>
      <th>厂商</th><th>模型名称</th><th>免费类型</th><th>额度</th><th>限速</th><th>上下文</th><th>能力</th><th>状态</th><th>检测时间</th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table></div>
</div>

<footer>ModelRadar · 数据仅供中转站参考，请以各厂商官方页面为准</footer>

<script>
const KEY = 'mr_sync_key';
const $ = (id) => document.getElementById(id);
let MODELS = [];
let PROV = [];

function fmtTime(iso){ if(!iso) return '-'; const d=new Date(iso); return d.toLocaleString('zh-CN',{hour12:false}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function api(path, opts){
  const r = await fetch(path, opts);
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  if(!r.ok) throw new Error(typeof d==='object' ? (d.error||r.status) : t);
  return d;
}

function renderStats(models){
  const total = models.length;
  const active = models.filter(m=>m.status==='active').length;
  const byP = {};
  models.forEach(m=>{ byP[m.provider]=(byP[m.provider]||0)+1; });
  let html = '<div class="stat"><b>' + total + '</b><span>模型总数</span></div>'
    + '<div class="stat"><b class="g">' + active + '</b><span>可用中</span></div>'
    + '<div class="stat"><b>' + Math.round(active/total*100) + '%</b><span>可用率</span></div>';
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

function renderRows(){
  const q = $('q').value.trim().toLowerCase();
  const pf = $('pf').value;
  const st = $('st').value;
  const rows = MODELS
    .filter(m=>!pf || m.provider===pf)
    .filter(m=>!st || m.status===st)
    .filter(m=>!q || m.model_name.toLowerCase().includes(q) || (m.base_url||'').toLowerCase().includes(q));
  $('count').textContent = '共 ' + rows.length + ' 条';
  $('rows').innerHTML = rows.map(m => '<tr>'
    + '<td>' + esc(m.provider) + '</td>'
    + '<td class="mono">' + esc(m.model_name) + '</td>'
    + '<td><span class="badge ' + esc(m.free_type) + '">' + esc(m.free_type) + '</span></td>'
    + '<td class="mono">' + esc(m.free_quota) + '</td>'
    + '<td class="mono">' + esc(m.rate_limit) + '</td>'
    + '<td>' + (m.context_length ? m.context_length.toLocaleString() : '-') + '</td>'
    + '<td>' + (Array.isArray(m.capabilities) ? m.capabilities.map(c => '<span class="badge">' + esc(c) + '</span>').join(' ') : '-') + '</td>'
    + '<td>' + (m.status==='active' ? '<span class="g">可用</span>' : '<span class="r">已下线</span>') + '</td>'
    + '<td>' + fmtTime(m.detected_at) + '</td>'
    + '</tr>').join('') || '<tr><td colspan="9" style="color:var(--mut)">无匹配模型</td></tr>';
}

async function load(){
  const models = await api('/models');
  const run = await api('/status').then(function(d){ return d.last_run; }).catch(function(){ return null; });
  MODELS = models; PROV = [...new Set(models.map(m=>m.provider))].sort();
  $('pf').innerHTML = '<option value="">全部厂商</option>' + PROV.map(p => '<option>' + esc(p) + '</option>').join('');
  renderStats(models); renderRun(run); renderRows();
}

async function sync(){
  const btn = $('btn-sync'); btn.disabled = true;
  const mk = $('key').value.trim();
  try{
    const headers = {};
    if(mk){ headers['X-Sync-Key'] = mk; localStorage.setItem(KEY, mk); }
    $('runmsg').innerHTML = '同步中…(抓取 6 个厂商, 约需 5~20 秒)';
    const run = await api('/run', { method:'POST', headers:headers });
    renderRun(run); await load();
    $('runmsg').innerHTML += (mk ? ' · 请求需鉴权' : ' · 未配置 Key, 若服务端已设置 Sync Key 请填写后重试');
  }catch(e){
    $('runmsg').innerHTML = '<span class="r">同步失败: ' + esc(e.message) + '</span>';
  }finally{ btn.disabled = false; }
}

$('btn-sync').onclick = sync;
$('btn-refresh').onclick = ()=>{ load().catch(e=>$('runmsg').innerHTML='<span class="r">加载失败: '+esc(e.message)+'</span>'); };
$('q').oninput = renderRows;
$('pf').onchange = renderRows;
$('st').onchange = renderRows;
$('key').value = localStorage.getItem(KEY) || '';
load().catch(e=>$('runmsg').innerHTML='<span class="r">加载失败: '+esc(e.message)+'</span>');
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