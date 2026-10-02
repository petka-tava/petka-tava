import { getFlag, setFlag } from '../../services/admin/flags.js';
import { recordingLimits, purgeExpired } from '../../services/recording/recording.js';

const ORIGIN = 'https://petka-tava.github.io';
const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'content-type,authorization,x-audio-seconds', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors } });
const isAdmin = (req, env) => env.ADMIN_TOKEN && req.headers.get('authorization') === 'Bearer ' + env.ADMIN_TOKEN;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      if (url.pathname === '/api/health') return json({ ok: true });
      if (url.pathname === '/api/recording/limits') { const r = await recordingLimits(env.DB); return new Response(r.body, { headers: { 'content-type': 'application/json', ...cors } }); }
      if (url.pathname === '/api/admin/flags') {
        if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401);
        if (req.method === 'GET') { const { results } = await env.DB.prepare('SELECT key,enabled,config_json FROM feature_flags ORDER BY key').all(); return json(results); }
        if (req.method === 'POST') { const b = await req.json(); await setFlag(env.DB, 'admin', b.key, !!b.enabled, b.config); return json({ ok: true }); }
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof Response) return new Response(e.body, { status: e.status, headers: { 'content-type': 'application/json', ...cors } });
      return json({ error: 'server_error' }, 500);
    }
  },
  async scheduled(_evt, env) { await purgeExpired(env.DB); },
};
