// Admin-only API for the hidden console (stats, contact inbox, settings). Callers must pass the isAdmin check first.
import { sendMail } from '../notifications/gmail.js';
import { setFlag } from './flags.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export async function ensurePanelSchema(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS contact_messages(id TEXT PRIMARY KEY, name TEXT, email TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL, replied_at INTEGER, reply TEXT)').run();
}
export async function saveContact(db, name, email, message) {
  await ensurePanelSchema(db);
  await db.prepare('INSERT INTO contact_messages(id,name,email,message,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), name, email, message, Date.now()).run();
}
const one = async (db, sql) => (await db.prepare(sql).first()).c;
export async function stats(env) {
  await ensurePanelSchema(env.DB);
  const db = env.DB;
  const byStatus = (await db.prepare('SELECT status, count(*) c FROM chiddushim GROUP BY status').all()).results;
  return json({
    users: await one(db, 'SELECT count(*) c FROM users'),
    users_week: await one(db, 'SELECT count(*) c FROM users WHERE created_at>' + (Date.now() - 7 * 86400000)),
    chiddushim: byStatus,
    comments_pending: await one(db, "SELECT count(*) c FROM comments WHERE status='pending'").catch(() => 0),
    contacts_unanswered: await one(db, 'SELECT count(*) c FROM contact_messages WHERE replied_at IS NULL'),
  });
}
export async function listContacts(env) {
  await ensurePanelSchema(env.DB);
  return json((await env.DB.prepare('SELECT id,name,email,message,created_at,replied_at,reply FROM contact_messages ORDER BY created_at DESC LIMIT 100').all()).results);
}
export async function replyContact(env, b) {
  await ensurePanelSchema(env.DB);
  const text = String(b.body || '').trim();
  if (text.length < 2 || text.length > 5000) return json({ error: 'invalid' }, 400);
  const row = await env.DB.prepare('SELECT id,email FROM contact_messages WHERE id=?').bind(String(b.id || '')).first();
  if (!row) return json({ error: 'not_found' }, 404);
  const r = await sendMail(env, { to: row.email, subject: 'תשובה לפנייתך אל פתקא טבא', html: `<div dir="rtl">בס״ד<br><br>${esc(text).replace(/\n/g, '<br>')}<br><br>פתקא טבא · by OrelAI</div>` });
  if (r.error) return json({ error: r.error }, 503);
  await env.DB.prepare('UPDATE contact_messages SET replied_at=?, reply=? WHERE id=?').bind(Date.now(), text, row.id).run();
  return json({ ok: true });
}
// Only these keys can be edited from the console; numeric config values are bounded.
const LIMITS = { max_seconds: [10, 600], max_bytes: [100000, 5000000], daily_cap_per_user: [1, 100], days: [1, 365], daily_cap: [1, 450], per_hour: [1, 50], max_items: [1, 50], daily_cap_global: [1, 1000], codes_per_hour: [1, 20] };
const KEYS = ['recording', 'comments', 'signups', 'contact_form', 'shabbat_mode', 'transcription', 'audio_retention', 'auto_approve', 'login_google', 'login_email', 'email_notifications', 'reactions', 'guest_taste', 'daily_page', 'dedications', 'signup_manual', 'ivr', 'mass_email'];
export async function setSetting(env, b) {
  if (!KEYS.includes(b.key)) return json({ error: 'invalid_key' }, 400);
  const cfg = {};
  for (const [k, v] of Object.entries(b.config || {})) {
    if (LIMITS[k]) { const n = Number(v); if (!Number.isFinite(n) || n < LIMITS[k][0] || n > LIMITS[k][1]) return json({ error: 'out_of_range', field: k }, 400); cfg[k] = Math.round(n); }
    else if (k === 'moderated') cfg[k] = !!v;
    else if (k === 'mode' && ['banner', 'lock'].includes(v)) cfg[k] = v;
    else if (k === 'manual_override' && [null, true, false].includes(v)) cfg[k] = v;
    else return json({ error: 'invalid_field', field: k }, 400);
  }
  await setFlag(env.DB, 'console', b.key, !!b.enabled, cfg);
  return json({ ok: true });
}
