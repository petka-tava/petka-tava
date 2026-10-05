import { requireFlag } from '../admin/flags.js';
// Sends through the Gmail API as the product mailbox. Secrets (env.GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN) are Worker secrets.
async function accessToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  return (await r.json()).access_token;
}
const b64u = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = s => '=?UTF-8?B?' + btoa(String.fromCharCode(...new TextEncoder().encode(s))) + '?=';
export async function sendMail(env, { to, subject, html }) {
  const cfg = await requireFlag(env.DB, 'email_notifications'); // admin on/off + daily_cap (default 450)
  const day = Date.now() - 86400000;
  const n = await env.DB.prepare("SELECT count(*) c FROM notifications WHERE kind='email' AND sent_at>?").bind(day).first();
  if (n.c >= (cfg.daily_cap ?? 450)) return { error: 'daily_cap' };
  const raw = [`From: ${enc('פתקא טבא')} <petkatava@gmail.com>`, `To: ${to}`, `Subject: ${enc(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { authorization: 'Bearer ' + await accessToken(env), 'content-type': 'application/json' }, body: JSON.stringify({ raw: b64u(raw) }) });
  if (!r.ok) return { error: 'send_failed', status: r.status };
  await env.DB.prepare("INSERT INTO notifications(id,user_id,kind,payload_json,sent_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), null, 'email', JSON.stringify({ to }), Date.now()).run();
  return { ok: true };
}
