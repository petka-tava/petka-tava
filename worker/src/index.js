import { getFlag, setFlag } from '../../services/admin/flags.js';
import { recordingLimits, purgeExpired } from '../../services/recording/recording.js';
import { emailStart, emailVerify, googleLogin, currentUser } from '../../services/users/auth.js';
import { sections, books } from '../../services/catalog/catalog.js';
import { register, contact, adminListUsers, adminDeleteUser } from '../../services/users/extra.js';
import { feed } from '../../services/feed/feed.js';
const wrap = r => new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', ...cors } });

const ORIGIN = 'https://petka-tava.github.io';
const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'content-type,authorization,x-audio-seconds', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors } });
const isAdmin = (req, env) => env.ADMIN_TOKEN && req.headers.get('authorization') === 'Bearer ' + env.ADMIN_TOKEN;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      if (url.pathname === '/api/health') return json({ ok: true });
      if (url.pathname === '/api/recording/limits') { const r = await recordingLimits(env.DB); return new Response(r.body, { headers: { 'content-type': 'application/json', ...cors } }); }
      if (url.pathname === '/api/auth/email/start' && req.method === 'POST') return wrap(await emailStart(env, await req.json()));
      if (url.pathname === '/api/auth/email/verify' && req.method === 'POST') return wrap(await emailVerify(env, await req.json()));
      if (url.pathname === '/api/auth/google' && req.method === 'POST') return wrap(await googleLogin(env, await req.json()));
      if (url.pathname === '/api/me') { const u = await currentUser(env, req); return json(u ? { id: u.id, nickname: u.nickname, role: u.role } : { error: 'unauthorized' }, u ? 200 : 401); }
      if (url.pathname === '/api/catalog/sections') return wrap(await sections(env.DB));
      if (url.pathname === '/api/catalog/books') return wrap(await books(env.DB, url.searchParams.get('section'), url.searchParams.get('q')));
      if (url.pathname === '/api/feed') return wrap(await feed(env.DB, await currentUser(env, req), url.searchParams.get('limit')));
      if (url.pathname === '/api/admin/flags') {
        if (!isAdmin(req, env)) return json({ error: 'not_found' }, 404);
        if (req.method === 'GET') { const { results } = await env.DB.prepare('SELECT key,enabled,config_json FROM feature_flags ORDER BY key').all(); return json(results); }
        if (req.method === 'POST') { const b = await req.json(); await setFlag(env.DB, 'admin', b.key, !!b.enabled, b.config); return json({ ok: true }); }
      }
      if (url.pathname === '/api/auth/register' && req.method === 'POST') return wrap(await register(env, await req.json()));
      if (url.pathname === '/api/contact' && req.method === 'POST') return wrap(await contact(env, req, await req.json()));
      if (url.pathname === '/api/admin/users' && req.method === 'GET') { if (!isAdmin(req, env)) return json({ error: 'not_found' }, 404); return wrap(await adminListUsers(env, url)); }
      const dm = url.pathname.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (dm && req.method === 'DELETE') { if (!isAdmin(req, env)) return json({ error: 'not_found' }, 404); return wrap(await adminDeleteUser(env, dm[1])); }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof Response) return new Response(e.body, { status: e.status, headers: { 'content-type': 'application/json', ...cors } });
      return json({ error: 'server_error' }, 500);
    }
  },
  async scheduled(_evt, env) { await purgeExpired(env.DB); },
};
