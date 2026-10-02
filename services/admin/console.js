// Hidden moderation console + signed one-click approval links. Nothing here is linked from the public site;
// every route answers with the same 404 as an unknown path unless the caller proves knowledge of the secret.
import { sendMail } from '../notifications/gmail.js';
import { adminModerate } from '../content/content.js';
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const enc = s => new TextEncoder().encode(s);
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc(s)));
const hmac = async (key, msg) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc(msg)));
const NF = () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
const html = (b, s = 200) => new Response(b, { status: s, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const ADMIN_MAIL = 'petkatava@gmail.com';
export const consolePath = async env => (await sha('adminpath:' + env.ADMIN_TOKEN)).slice(0, 20);
export async function mintSession(env) { const exp = Date.now() + 12 * 3600000; return 'adm.' + exp + '.' + (await hmac(env.ADMIN_TOKEN, 'sess:' + exp)).slice(0, 40); }
export async function isAdmin(req, env) {
  if (!env.ADMIN_TOKEN) return false;
  const a = req.headers.get('authorization') || '';
  if (a === 'Bearer ' + env.ADMIN_TOKEN) return true;
  const m = a.match(/^Bearer adm\.(\d+)\.([0-9a-f]{40})$/);
  return !!m && Number(m[1]) > Date.now() && m[2] === (await hmac(env.ADMIN_TOKEN, 'sess:' + m[1])).slice(0, 40);
}
const linkSig = (env, kind, id, action) => hmac(env.ADMIN_TOKEN, `link:${kind}:${id}:${action}`).then(s => s.slice(0, 32));
export async function notifyPending(env, origin, kind, id, who, text) {
  try {
    const mk = async a => `${origin}/m/${kind}/${id}/${a}/${await linkSig(env, kind, id, a)}`;
    const safe = String(text).slice(0, 600).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    await sendMail(env, { to: ADMIN_MAIL, subject: kind === 'chidush' ? 'חידוש ממתין לאישור' : 'תגובה ממתינה לאישור', html: `<div dir="rtl">בס״ד<br><b>${who.replace(/[<>&]/g, '')}</b>:<br>${safe}<br><br><a href="${await mk('approve')}">לאישור</a> | <a href="${await mk('reject')}">לדחייה</a></div>` });
  } catch {}
}
export async function handle(req, env, url) {
  const P = url.pathname;
  const lm = P.match(/^\/m\/(chidush|comment)\/([\w-]+)\/(approve|reject)\/([0-9a-f]{32})$/);
  if (lm) {
    if (!env.ADMIN_TOKEN || lm[4] !== await linkSig(env, lm[1], lm[2], lm[3])) return NF();
    if (req.method === 'POST') { await adminModerate(env, { kind: lm[1], id: lm[2], action: lm[3] }); return html('<meta charset="utf-8"><p dir="rtl">בוצע.</p>'); }
    if (req.method === 'GET') return html(`<meta charset="utf-8"><meta name="viewport" content="width=device-width"><form method="post" dir="rtl" style="font:20px serif;margin:2em"><p>${lm[3] === 'approve' ? 'לאשר' : 'לדחות'}?</p><button style="font:20px serif;padding:.5em 1.5em">אישור פעולה</button></form>`);
    return NF();
  }
  const cm = P.match(/^\/a\/([0-9a-f]{20})(\/code|\/login)?$/);
  if (!cm || !env.ADMIN_TOKEN || cm[1] !== await consolePath(env)) return null;
  if (!cm[2] && req.method === 'GET') return html(PAGE);
  if (cm[2] === '/code' && req.method === 'POST') {
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    await env.DB.prepare("DELETE FROM auth_codes WHERE email='admin:console'").run();
    await env.DB.prepare("INSERT INTO auth_codes(email,code_hash,expires_at,created_at) VALUES('admin:console',?,?,?)").bind(await sha('admin:' + code), Date.now() + 600000, Date.now()).run();
    const r = await sendMail(env, { to: ADMIN_MAIL, subject: 'קוד כניסה לניהול', html: `<div dir="rtl">הקוד: <b>${code}</b></div>` });
    return json(r.error ? { error: 'mail_unavailable' } : { ok: true }, r.error ? 503 : 200);
  }
  if (cm[2] === '/login' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const row = await env.DB.prepare("SELECT rowid,code_hash,expires_at,tries FROM auth_codes WHERE email='admin:console'").first();
    if (!row || row.expires_at < Date.now() || row.tries >= 5) return json({ error: 'invalid_code' }, 400);
    await env.DB.prepare('UPDATE auth_codes SET tries=tries+1 WHERE rowid=?').bind(row.rowid).run();
    if (row.code_hash !== await sha('admin:' + String(b.code || '').trim())) return json({ error: 'invalid_code' }, 400);
    await env.DB.prepare("DELETE FROM auth_codes WHERE email='admin:console'").run();
    return json({ ok: true, session: await mintSession(env) });
  }
  return null;
}
const PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ניהול</title>
<style>body{font:18px/1.5 Georgia,serif;background:#f6efe0;color:#2b2118;max-width:760px;margin:0 auto;padding:1em}button{font:inherit;padding:.3em 1em;margin:.2em}.c{background:#fffaf0;border:1px solid #cdbb94;border-radius:8px;padding:.8em;margin:.8em 0}input{font:inherit;padding:.3em}</style></head><body>
<h2>ניהול</h2><div id="login"><button id="send">שליחת קוד לתיבת האתר</button> <input id="code" inputmode="numeric" placeholder="קוד"> <button id="go">כניסה</button></div><div id="msg"></div><div id="q"></div>
<script>
const base=location.pathname.replace(/\\/$/,'');let S=sessionStorage.getItem('s');const api='/api/admin/';
const msg=t=>document.getElementById('msg').textContent=t;
async function call(p,o={}){const r=await fetch(p,{...o,headers:{authorization:'Bearer '+S,'content-type':'application/json'}});return r}
async function load(){const r=await call(api+'queue');if(!r.ok){S=null;sessionStorage.removeItem('s');document.getElementById('login').hidden=false;return}document.getElementById('login').hidden=true;const d=await r.json();const q=document.getElementById('q');q.textContent='';
const row=(k,x,t)=>{const e=document.createElement('div');e.className='c';const p=document.createElement('div');p.textContent=x.nickname+(x.location?' ('+x.location+')':'')+': '+t;e.append(p);for(const a of['approve','reject']){const b=document.createElement('button');b.textContent=a==='approve'?'אישור':'דחייה';b.onclick=async()=>{await call(api+'moderate',{method:'POST',body:JSON.stringify({kind:k,id:x.id,action:a})});load()};e.append(b)}q.append(e)};
d.chiddushim.forEach(x=>row('chidush',x,x.transcript));d.comments.forEach(x=>row('comment',x,x.body));if(!q.children.length)q.textContent='אין פריטים ממתינים.'}
document.getElementById('send').onclick=async()=>{const r=await fetch(base+'/code',{method:'POST'});msg(r.ok?'הקוד נשלח.':'שליחה נכשלה.')};
document.getElementById('go').onclick=async()=>{const r=await fetch(base+'/login',{method:'POST',body:JSON.stringify({code:document.getElementById('code').value})});const d=await r.json();if(d.session){S=d.session;sessionStorage.setItem('s',S);msg('');load()}else msg('קוד שגוי.')};
if(S)load();
</script></body></html>`;
