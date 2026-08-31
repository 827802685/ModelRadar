import { runSync } from './run.js';
import { D1Store, type Store } from './store.js';
import { toRelayCatalog } from './catalog.js';
import { dashboardHtml, loginHtml } from './dashboard.js';
import { toRssXml } from './rss.js';
import { providerInfos, testProvider } from './provider-test.js';
import { runBatchProbe, toRow, type BatchTestItem } from './batch-test.js';
import type { WorkersAiLike } from './classify.js';
import type { SyncOptions } from './run.js';
import type { RunSummary } from './types.js';

export interface Env {
  DB: D1Database;
  AI?: WorkersAiLike;
  NOTIFY_WEBHOOK?: string;
  SYNC_SECRET?: string;
  ADMIN_PASSWORD?: string;
  RETENTION_DAYS?: string;
  OPENROUTER_API_KEY?: string;
  ZHIPU_API_KEY?: string;
  MODELSCOPE_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  SILICONFLOW_API_KEY?: string;
  AGNES_API_KEY?: string;
}

const AUTH_COOKIE = 'mr_auth';
const SESSION_DAYS = 7;
const AUTH_ROUTES = new Set(['/', '/status']);

// Provider name -> environment variable holding its API key.
const ENV_KEY: Record<string, keyof Env> = {
  openrouter: 'OPENROUTER_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY',
  google: 'GOOGLE_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  siliconflow: 'SILICONFLOW_API_KEY',
  agnes: 'AGNES_API_KEY',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location },
  });
}

function syncOptions(env: Env): SyncOptions {
  return {
    store: new D1Store(env.DB),
    webhookUrl: env.NOTIFY_WEBHOOK,
    retentionDays: Number(env.RETENTION_DAYS || '60') || 60,
    ai: env.AI,
    apiKeys: {
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
      ZHIPU_API_KEY: env.ZHIPU_API_KEY,
      MODELSCOPE_API_KEY: env.MODELSCOPE_API_KEY,
      GOOGLE_API_KEY: env.GOOGLE_API_KEY,
      NVIDIA_API_KEY: env.NVIDIA_API_KEY,
      SILICONFLOW_API_KEY: env.SILICONFLOW_API_KEY,
      AGNES_API_KEY: env.AGNES_API_KEY,
    },
  };
}

function authSecret(env: Env): string {
  return env.ADMIN_PASSWORD || env.SYNC_SECRET || '';
}

async function hmacSign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function issueSession(secret: string): Promise<string> {
  const payload = b64url(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86400000 }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function sessionValid(token: string | null, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSign(payload, secret);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp: number };
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const secret = authSecret(env);
  if (!secret) return true; // no password configured -> open
  return sessionValid(cookieValue(request, AUTH_COOKIE), secret);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const secret = authSecret(env);
  if (!secret) return redirect('/');

  if (request.method === 'POST') {
    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    if (password === secret) {
      const token = await issueSession(secret);
      return new Response(null, {
        status: 302,
        headers: {
          location: '/',
          'set-cookie': `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
        },
      });
    }
    return html(loginHtml().replace('<div class="err"></div>', '<div class="err">密码错误，请重试</div>'), 401);
  }
  return html(loginHtml());
}

const MODEL_CAP = 30;

function fmtModels(names: string[]): string {
  if (names.length === 0) return '无';
  const shown = names.slice(0, MODEL_CAP).join(', ');
  return names.length > MODEL_CAP ? `${shown} … 等 ${names.length} 个` : shown;
}

async function setModelsOffline(
  store: Store,
  items: { provider: string; model_name: string }[],
  offline: boolean
): Promise<number> {
  await store.setAdminOfflineMany(items, offline);
  const now = new Date().toISOString();
  const names = items.map((it) => `${it.provider}:${it.model_name}`);
  if (items.length === 1 && items[0]) {
    await store.addLog({
      ts: now,
      action: offline ? 'offline' : 'online',
      provider: items[0].provider,
      model_name: items[0].model_name,
      detail: offline ? '手动下线' : '手动恢复',
    });
  } else if (items.length > 1) {
    await store.addLog({
      ts: now,
      action: offline ? 'batch_offline' : 'batch_online',
      detail: `${offline ? '批量下线' : '批量恢复'} ${items.length} 个模型: ${fmtModels(names)}`,
    });
  }
  return items.length;
}

async function logSyncRun(store: Store, action: string, summary: RunSummary): Promise<void> {
  const parts: string[] = [];
  if ((summary.added_models ?? []).length > 0) {
    parts.push(`新增(${summary.added}): ${fmtModels(summary.added_models!)}`);
  }
  if ((summary.removed_models ?? []).length > 0) {
    parts.push(`下线(${summary.removed}): ${fmtModels(summary.removed_models!)}`);
  }
  if ((summary.changed_models ?? []).length > 0) {
    parts.push(`变更(${summary.changed}): ${fmtModels(summary.changed_models!)}`);
  }
  await store.addLog({
    ts: new Date().toISOString(),
    action,
    detail:
      parts.length > 0
        ? `抓取 ${summary.total_scraped} 个模型; ${parts.join('; ')}`
        : `抓取 ${summary.total_scraped} 个模型, 无变化`,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/login') return handleLogin(request, env);

    if (url.pathname === '/logout') {
      return new Response(null, {
        status: 302,
        headers: {
          location: '/login',
          'set-cookie': `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    if (url.pathname === '/rss.xml' && request.method === 'GET') {
      const store = new D1Store(env.DB);
      const models = await store.getExisting();
      // Only models proven usable by a key-probe meet the "free usable" bar.
      const tests = await store.getModelTests();
      const okKeys = new Set<string>();
      for (const t of tests) {
        if (t.result === 'ok') okKeys.add(`${t.provider}:${t.model_name}`);
      }
      const usable = models.filter((m) => okKeys.has(`${m.provider}:${m.model_name}`));
      const self = `https://${url.host}/`;
      return new Response(toRssXml(usable, self), {
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      });
    }

    // Panel / status require login
    if (AUTH_ROUTES.has(url.pathname)) {
      if (request.method === 'GET' && !(await isAuthed(request, env))) {
        return redirect('/login');
      }
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return html(dashboardHtml());
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      const store = new D1Store(env.DB);
      return json({
        last_run: await store.getLastRun(),
        updated_at: new Date().toISOString(),
      });
    }

    if (url.pathname === '/models' && request.method === 'GET') {
      return json(await new D1Store(env.DB).getAll());
    }

    if (url.pathname === '/providers' && request.method === 'GET') {
      return json(providerInfos());
    }

    if (url.pathname === '/config/keys') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const store = new D1Store(env.DB);

      if (request.method === 'GET') {
        const stored = await store.getApiKeys();
        const list = providerInfos().map((p) => {
          const envKey = ENV_KEY[p.name];
          const envVal = envKey ? env[envKey] : undefined;
          const dbVal = stored[p.name];
          const hasKey = Boolean(dbVal || envVal);
          return {
            name: p.name,
            needsKey: p.needsKey,
            has_key: hasKey,
            source: dbVal ? 'db' : envVal ? 'env' : 'none',
          };
        });
        return json(list);
      }

      if (request.method === 'POST') {
        const body = (await request.json()) as { provider?: string; api_key?: string };
        const name = (body.provider ?? '').trim().toLowerCase();
        const key = (body.api_key ?? '').trim();
        const known = providerInfos().some((p) => p.name === name);
        if (!name || !known) return json({ error: 'invalid provider' }, 400);
        if (!key) return json({ error: 'api_key required' }, 400);
        await store.setApiKey(name, key);
        await store.addLog({
          ts: new Date().toISOString(),
          action: 'set_key',
          provider: name,
          detail: `保存 ${name} 密钥`,
        });
        return json({ ok: true });
      }

      if (request.method === 'DELETE') {
        const name = (url.searchParams.get('provider') ?? '').trim().toLowerCase();
        if (!name) return json({ error: 'provider required' }, 400);
        await store.deleteApiKey(name);
        await store.addLog({
          ts: new Date().toISOString(),
          action: 'delete_key',
          provider: name,
          detail: `删除 ${name} 密钥`,
        });
        return json({ ok: true });
      }

      return json({ error: 'method not allowed' }, 405);
    }

    if (url.pathname === '/providers/test' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const body = (await request.json()) as { provider?: string; api_key?: string };
      if (!body.provider || !body.api_key) {
        return json({ error: 'provider and api_key required' }, 400);
      }
      const result = await testProvider(body.provider, body.api_key);
      try {
        await new D1Store(env.DB).addLog({
          ts: new Date().toISOString(),
          action: 'provider_test',
          provider: body.provider,
          detail: `${result.ok ? '通过' : '失败'} - ${result.message}`,
        });
      } catch (err) {
        console.error('[log] provider_test failed:', err);
      }
      return json(result);
    }

    if (url.pathname === '/models/offline' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const body = (await request.json()) as { provider?: string; model_name?: string };
      if (!body.provider || !body.model_name) {
        return json({ error: 'provider and model_name required' }, 400);
      }
      await setModelsOffline(
        new D1Store(env.DB),
        [{ provider: body.provider, model_name: body.model_name }],
        true
      );
      return json({ ok: true });
    }

    if (url.pathname === '/models/online' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const body = (await request.json()) as { provider?: string; model_name?: string };
      if (!body.provider || !body.model_name) {
        return json({ error: 'provider and model_name required' }, 400);
      }
      await setModelsOffline(
        new D1Store(env.DB),
        [{ provider: body.provider, model_name: body.model_name }],
        false
      );
      return json({ ok: true });
    }

    if (url.pathname === '/models/batch' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const body = (await request.json()) as {
        offline?: boolean;
        items?: { provider?: string; model_name?: string }[];
      };
      const items = (body.items ?? []).filter(
        (it) => it.provider && it.model_name
      ) as { provider: string; model_name: string }[];
      if (items.length === 0) {
        return json({ error: 'items required' }, 400);
      }
      const count = await setModelsOffline(new D1Store(env.DB), items, body.offline === true);
      return json({ ok: true, count });
    }

    if (url.pathname === '/logs' && request.method === 'GET') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      return json(await new D1Store(env.DB).getLogs(200));
    }

    if (url.pathname === '/catalog' && request.method === 'GET') {
      return json(toRelayCatalog(await new D1Store(env.DB).getExisting()));
    }

    if (url.pathname === '/run' && (request.method === 'POST' || request.method === 'GET')) {
      const keyOk = env.SYNC_SECRET
        ? request.headers.get('X-Sync-Key') === env.SYNC_SECRET ||
          new URL(request.url).searchParams.get('key') === env.SYNC_SECRET
        : true;
      const sessionOk = await isAuthed(request, env);
      if (!keyOk && !sessionOk) return json({ error: 'unauthorized' }, 401);
      const summary = await runSync(syncOptions(env));
      await logSyncRun(new D1Store(env.DB), 'sync', summary);
      return json(summary);
    }

    if (url.pathname === '/test/results' && request.method === 'GET') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const rows = await new D1Store(env.DB).getModelTests();
      const byKey: Record<string, unknown> = {};
      for (const r of rows) byKey[`${r.provider}:${r.model_name}`] = r;
      return json({ tests: byKey, updated_at: new Date().toISOString() });
    }

    if (url.pathname === '/test/run' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401);
      const body = (await request.json()) as {
        providers?: string[];
        scope?: string;
        concurrency?: number;
        items?: { provider?: string; model_name?: string }[];
      };
      const store = new D1Store(env.DB);
      const models = await store.getAll();

      const openaiCompat = new Set(
        providerInfos().filter((p) => p.openaiCompatible).map((p) => p.name)
      );

      // Keys: environment vars (low priority) then saved DB keys (high priority).
      const keys: Record<string, string> = {};
      for (const p of providerInfos()) {
        const envKey = ENV_KEY[p.name];
        if (envKey && env[envKey]) keys[p.name] = env[envKey] as string;
      }
      for (const [k, v] of Object.entries(await store.getApiKeys())) {
        if (v) keys[k] = v;
      }

      const byKey = new Map(models.map((m) => [`${m.provider}:${m.model_name}`, m]));

      const items: BatchTestItem[] = [];
      const extraItems = body.items ?? [];
      const explicit = Array.isArray(extraItems) && extraItems.length > 0;
      if (explicit) {
        for (const it of extraItems) {
          if (!it.provider || !it.model_name) continue;
          const m = byKey.get(`${it.provider}:${it.model_name}`);
          const compatible = openaiCompat.has(it.provider);
          items.push({
            provider: it.provider,
            model_name: it.model_name,
            base_url: compatible ? (m?.base_url || '') : '',
          });
        }
      } else {
        const provs =
          Array.isArray(body.providers) && body.providers.length
            ? new Set(body.providers.map((s) => String(s)))
            : null;
        const scope =
          body.scope === 'chat' ? 'chat' : body.scope === 'all' ? 'all' : 'active';
        for (const m of models) {
          if (provs && !provs.has(m.provider)) continue;
          if (scope === 'active' && m.status !== 'active') continue;
          if (scope === 'chat') {
            const caps = (m.capabilities ?? []).map((c) => c.toLowerCase());
            if (m.status !== 'active' || !caps.includes('chat') || caps.includes('embedding')) {
              continue;
            }
          }
          const compatible = openaiCompat.has(m.provider);
          items.push({
            provider: m.provider,
            model_name: m.model_name,
            base_url: compatible ? m.base_url || '' : '',
          });
        }
      }

      const encoder = new TextEncoder();
      const stream = new TransformStream<Uint8Array>();
      const writer = stream.writable.getWriter();
      const send = (obj: unknown) =>
        writer.write(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n'));

      let offlineCount = 0;
      runBatchProbe(items, keys, (o) => {
        const row = toRow(o);
        try {
          store.saveModelTest(row).catch((e) => console.error('[test] save:', e));
        } catch (e) {
          console.error('[test] result:', e);
        }
        // Immediate closed-loop: a chat probe proving "unsupported" takes the
        // model out of the active pool right away (pure-embedding models spared).
        if (o.kind === 'unsupported') {
          const m = byKey.get(`${o.provider}:${o.model_name}`);
          const caps = (m?.capabilities ?? []).map((c) => c.toLowerCase());
          const pureEmbed = caps.includes('embedding') && !caps.includes('chat');
          if (!pureEmbed && m) {
            offlineCount++;
            store.markRemoved([m]).catch((e) => console.error('[test] offline:', e));
          }
        }
        send({
          type: 'result',
          provider: o.provider,
          model_name: o.model_name,
          kind: o.kind,
          ok: o.ok,
          latency_ms: o.latency_ms,
          detail: o.detail,
        });
      }, body.concurrency ?? 6)
        .then((sum) => {
          send({
            type: 'done',
            ...sum,
            offline: offlineCount > 0 ? offlineCount : undefined,
          });
          return writer.close();
        })
        .catch((err) => {
          send({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
          return writer.close();
        });

      return new Response(stream.readable, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
      });
    }

    return new Response(
      'ModelRadar: free model auto-discovery & relay sync.\nEndpoints: POST /run, GET /models, GET /catalog, GET /rss.xml.',
      { headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const summary = await runSync(syncOptions(env));
    try {
      await logSyncRun(new D1Store(env.DB), 'sync_cron', summary);
    } catch (err) {
      console.error('[log] failed:', err);
    }
  },
};