import { runSync } from './run.js';
import { D1Store } from './store.js';
import { toRelayCatalog } from './catalog.js';
import { dashboardHtml, loginHtml } from './dashboard.js';
import { toRssXml } from './rss.js';
import type { SyncOptions } from './run.js';

export interface Env {
  DB: D1Database;
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
      const models = await new D1Store(env.DB).getExisting();
      const self = `https://${url.host}/`;
      return new Response(toRssXml(models, self), {
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
      return json(await new D1Store(env.DB).getExisting());
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
      return json(summary);
    }

    return new Response(
      'ModelRadar: free model auto-discovery & relay sync.\nEndpoints: POST /run, GET /models, GET /catalog, GET /rss.xml.',
      { headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runSync(syncOptions(env));
  },
};