import { getFlag, setFlag } from '../../services/admin/flags.js';
import { recordingLimits, purgeExpired } from '../../services/recording/recording.js';
import { emailStart, emailVerify, googleLogin, currentUser } from '../../services/users/auth.js';
import { sections, books } from '../../services/catalog/catalog.js';
import { register, contact, adminListUsers, adminDeleteUser } from '../../services/users/extra.js';
import { stats as pStats, listContacts as pContacts, replyContact as pReply, setSetting as pSet } from '../../services/admin/panel.js';
import { handle as consoleHandle, isAdmin as isAdminAsync, notifyPending, ADMIN_MAIL, consolePath, mintSession } from '../../services/admin/console.js';
import * as C from '../../services/content/content.js';
import { shabbatStatus } from '../../services/shabbat/shabbat.js';
import * as Lib from '../../services/library/library.js';
import { feed } from '../../services/feed/feed.js';
const wrap = r => new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', ...cors } });

const ORIGIN = 'https://petka-tava.github.io';
const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'content-type,authorization,x-audio-seconds', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors } });


const isProductAccount = async (env, req) => {
  const u = await currentUser(env, req); if (!u) return false;
  const row = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(u.id).first();
  return !!row && String(row.email || '').toLowerCase() === ADMIN_MAIL;
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const isAdmin = async (rq, e) => isAdminAsync(rq, e);
    { const ch = await consoleHandle(req, env, url); if (ch) return ch; }
    // Shabbat / yom tov lock: everything except health, the status check and the product account's own session is closed.
    try {
      const P0 = url.pathname;
      if (P0.startsWith('/api/') && P0 !== '/api/health' && P0 !== '/api/shabbat/status' && P0 !== '/api/auth/logout') {
        const st = await shabbatStatus(env.DB);
        if (st.locked && !(await isAdmin(req, env)) && !(await isProductAccount(env, req))) {
          let ok = false;
          if ((P0 === '/api/auth/email/start' || P0 === '/api/auth/email/verify') && req.method === 'POST') { const b = await req.clone().json().catch(() => ({})); ok = String(b.email || '').trim().toLowerCase() === ADMIN_MAIL; }
          else if (P0 === '/api/auth/google' && req.method === 'POST') { const b = await req.clone().json().catch(() => ({})); const t = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(b.id_token || '')).then(r => r.json()).catch(() => ({})); ok = String(t.email || '').toLowerCase() === ADMIN_MAIL; }
          if (!ok) return json({ error: 'shabbat', until: st.until || null }, 503);
        }
      }
    } catch {}
    try {
      if (url.pathname === '/api/health') return json({ ok: true });
      if (url.pathname === '/api/shabbat/status') {
        const at = url.searchParams.get('at'); const ms = at && await isAdmin(req, env) ? Date.parse(at) : Date.now();
        const st = await shabbatStatus(env.DB, ms);
        if (!(at && await isAdmin(req, env)) && st.locked && (await isAdmin(req, env) || await isProductAccount(env, req))) return json({ locked: false });
        return json({ locked: !!st.locked, until: st.until || null });
      }
      if (url.pathname === '/api/recording/limits') { const r = await recordingLimits(env.DB); return new Response(r.body, { headers: { 'content-type': 'application/json', ...cors } }); }
      if (url.pathname === '/api/auth/email/start' && req.method === 'POST') return wrap(await emailStart(env, await req.json()));
      if (url.pathname === '/api/auth/email/verify' && req.method === 'POST') return wrap(await emailVerify(env, await req.json()));
      if (url.pathname === '/api/auth/google' && req.method === 'POST') return wrap(await googleLogin(env, await req.json()));
      const P = url.pathname, M = req.method;
      if (P === '/api/admin/queue' && M === 'GET') { if (!(await isAdmin(req, env))) return json({ error: 'not_found' }, 404); return wrap(await C.adminQueue(env)); }
      if (P === '/api/admin/moderate' && M === 'POST') { if (!(await isAdmin(req, env))) return json({ error: 'not_found' }, 404); return wrap(await C.adminModerate(env, await req.json())); }
      if (P.startsWith('/api/admin/') && ['/api/admin/stats', '/api/admin/contacts', '/api/admin/contacts/reply', '/api/admin/setting'].includes(P)) {
        if (!(await isAdmin(req, env))) return json({ error: 'not_found' }, 404);
        if (P === '/api/admin/stats' && M === 'GET') return wrap(await pStats(env));
        if (P === '/api/admin/contacts' && M === 'GET') return wrap(await pContacts(env));
        if (P === '/api/admin/contacts/reply' && M === 'POST') return wrap(await pReply(env, await req.json()));
        if (P === '/api/admin/setting' && M === 'POST') return wrap(await pSet(env, await req.json()));
      }
      if (P === '/api/auth/logout' && M === 'POST') return wrap(await C.logout(env, req));
      const cm = P.match(/^\/api\/chiddushim\/([\w-]+)\/(audio|transcript|submit|comments|reaction)$/);
      const cid = P.match(/^\/api\/chiddushim\/([\w-]+)$/);
      if (P === '/api/chiddushim' || P === '/api/my/chiddushim' || (P === '/api/me' && M === 'DELETE') || (cm && !(cm[2] === 'comments' && M === 'GET')) || (cid && M !== 'OPTIONS')) {
        const u = await currentUser(env, req);
        if (!u) return json({ error: 'unauthorized' }, 401);
        if (P === '/api/chiddushim' && M === 'POST') return wrap(await C.create(env, u, await req.json()));
        if (P === '/api/my/chiddushim') return wrap(await C.mine(env, u));
        if (P === '/api/me' && M === 'DELETE') { const r = await adminDeleteUser(env, u.id); return wrap(r); }
        if (cid && M === 'GET') return wrap(await C.get(env, u, cid[1]));
        if (cid && M === 'DELETE') return wrap(await C.remove(env, u, cid[1]));
        if (cm && cm[2] === 'audio' && M === 'PUT') return wrap(await C.upload(env, ctx, u, cm[1], req));
        if (cm && cm[2] === 'transcript' && M === 'PUT') return wrap(await C.setTranscript(env, u, cm[1], await req.json()));
        if (cm && cm[2] === 'submit' && M === 'POST') return wrap(await C.submit(env, u, cm[1], ctx, url.origin, notifyPending));
        if (cm && cm[2] === 'comments' && M === 'POST') return wrap(await C.addComment(env, u, cm[1], await req.json(), ctx, url.origin, notifyPending));
        if (cm && cm[2] === 'reaction' && M === 'POST') return wrap(await C.react(env, u, cm[1]));
      }
      if (cm && cm[2] === 'comments' && M === 'GET') return wrap(await C.listComments(env, cm[1]));
      if (url.pathname === '/api/me/extras' && req.method === 'GET') {
        const u = await currentUser(env, req); const row = u && await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(u.id).first();
        if (!row || String(row.email || '').toLowerCase() !== ADMIN_MAIL || !env.ADMIN_TOKEN) return json({ error: 'not_found' }, 404);
        return json({ links: [{ label: 'ניהול', href: url.origin + '/a/' + (await consolePath(env)) + '#' + (await mintSession(env)) }] });
      }
      if (url.pathname === '/api/me') { const u = await currentUser(env, req); return json(u ? { id: u.id, nickname: u.nickname, role: u.role } : { error: 'unauthorized' }, u ? 200 : 401); }
      if (url.pathname === '/api/location/parse' && req.method === 'GET') return wrap(await Lib.parse(url));
      if (url.pathname.startsWith('/api/library/') && req.method === 'GET') {
        const lp = url.pathname.slice(13), q = url.searchParams;
        if (lp === 'search') return wrap(await Lib.search(env.DB, q.get('q')));
        if (lp === 'sections') return wrap(await Lib.sections(env.DB));
        if (lp === 'books') return wrap(await Lib.books(env.DB, q.get('section') || ''));
        if (lp === 'book') return wrap(await Lib.book(env.DB, await currentUser(env, req), q.get('id') || ''));
        if (lp === 'daf') return wrap(await Lib.daf(env.DB, await currentUser(env, req), q.get('book') || '', q.get('daf'), q.get('amud') || ''));
      }
      if (url.pathname === '/api/catalog/sections') return wrap(await sections(env.DB));
      if (url.pathname === '/api/catalog/books') return wrap(await books(env.DB, url.searchParams.get('section'), url.searchParams.get('q')));
      if (url.pathname === '/api/feed') return wrap(await feed(env.DB, await currentUser(env, req), url.searchParams.get('limit')));
      if (url.pathname === '/api/admin/flags') {
        if (!(await isAdmin(req, env))) return json({ error: 'not_found' }, 404);
        if (req.method === 'GET') { const { results } = await env.DB.prepare('SELECT key,enabled,config_json FROM feature_flags ORDER BY key').all(); return json(results); }
        if (req.method === 'POST') { const b = await req.json(); await setFlag(env.DB, 'admin', b.key, !!b.enabled, b.config); return json({ ok: true }); }
      }
      if (url.pathname === '/api/auth/register' && req.method === 'POST') return wrap(await register(env, await req.json()));
      if (url.pathname === '/api/contact' && req.method === 'POST') return wrap(await contact(env, req, await req.json()));
      if (url.pathname === '/api/admin/users' && req.method === 'GET') { if (!(await isAdmin(req, env))) return json({ error: 'not_found' }, 404); return wrap(await adminListUsers(env, url)); }
      const dm = url.pathname.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (dm && req.method === 'DELETE') { if (!(await isAdmin(req, env))) return json({ error: 'not_found' }, 404); return wrap(await adminDeleteUser(env, dm[1])); }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof Response) return new Response(e.body, { status: e.status, headers: { 'content-type': 'application/json', ...cors } });
      return json({ error: 'server_error' }, 500);
    }
  },
  async scheduled(_evt, env) { await purgeExpired(env.DB); },
};
