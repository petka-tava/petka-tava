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
<style>body{font:17px/1.5 Georgia,serif;background:#f6efe0;color:#2b2118;max-width:860px;margin:0 auto;padding:1em}button,input,select,textarea{font:inherit}button{padding:.3em 1em;margin:.2em;cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:.3em;align-items:center;border-bottom:1px solid #cdbb94;padding-bottom:.5em;margin-bottom:.5em}nav a{padding:.3em .8em;border-radius:6px;text-decoration:none;color:#2b2118;border:1px solid #cdbb94;cursor:pointer}nav a.on{background:#7a4f28;color:#fff}.c{background:#fffaf0;border:1px solid #cdbb94;border-radius:8px;padding:.8em;margin:.8em 0}.s{font-size:.85em;opacity:.75}textarea{width:100%;box-sizing:border-box;min-height:5em}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #cdbb94;padding:.3em;text-align:right}input[type=number]{width:6em}</style></head><body>
<nav id="nav" hidden></nav><div id="login"><h2>ניהול</h2><button id="send">שליחת קוד לתיבת האתר</button> <input id="code" inputmode="numeric" placeholder="קוד"> <button id="go">כניסה</button></div><div id="msg" role="status"></div><div id="v"></div>
<script>
const base=location.pathname.replace(/\\/$/,'');let S=sessionStorage.getItem('s');if(/^#adm\\.\\d+\\.[0-9a-f]{40}$/.test(location.hash)){S=location.hash.slice(1);sessionStorage.setItem('s',S);history.replaceState(null,'',location.pathname)}const api='/api/admin/';
const $=id=>document.getElementById(id);const msg=t=>$('msg').textContent=t;
const h=(t,a,...k)=>{const e=document.createElement(t);for(const[x,y]of Object.entries(a||{}))x==='on'?Object.assign(e,y):e.setAttribute(x,y);e.append(...k.filter(z=>z!=null));return e};
async function call(p,o={}){return fetch(p,{...o,headers:{authorization:'Bearer '+S,'content-type':'application/json'}})}
const post=(p,b)=>call(api+p,{method:'POST',body:JSON.stringify(b)});
const dt=t=>t?new Date(t).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'';
const tabs=[['queue','ממתינים לאישור'],['contacts','פניות'],['users','משתמשים'],['settings','הגדרות'],['stats','סטטיסטיקה']];
let cur='queue';
function nav(){const n=$('nav');n.hidden=false;n.textContent='';n.append(h('a',{href:'https://petka-tava.github.io/petka-tava/index.html'},'← חזרה לאתר'));for(const[k,l]of tabs)n.append(h('a',{class:k===cur?'on':'',on:{onclick:()=>show(k)}},l));n.append(h('a',{on:{onclick:()=>{S=null;sessionStorage.removeItem('s');location.reload()}}},'יציאה'))}
async function show(k){cur=k;nav();msg('');const v=$('v');v.textContent='';const r=await call(api+(k==='queue'?'queue':k==='contacts'?'contacts':k==='users'?'users?limit=100':k==='settings'?'flags':'stats'));if(r.status===404){S=null;sessionStorage.removeItem('s');$('login').hidden=false;$('nav').hidden=true;return}const d=await r.json();$('login').hidden=true;({queue:vQueue,contacts:vContacts,users:vUsers,settings:vSettings,stats:vStats})[k](v,d)}
function vQueue(v,d){const row=(k,x,t)=>{const e=h('div',{class:'c'},h('div',{},x.nickname+(x.location?' ('+x.location+')':'')+': '+t));for(const a of['approve','reject'])e.append(h('button',{on:{onclick:async()=>{await post('moderate',{kind:k,id:x.id,action:a});show('queue')}}},a==='approve'?'אישור':'דחייה'));v.append(e)};d.chiddushim.forEach(x=>row('chidush',x,x.transcript));d.comments.forEach(x=>row('comment',x,x.body));if(!v.children.length)v.append('אין פריטים ממתינים.')}
function vContacts(v,d){if(!d.length)v.append('אין פניות.');for(const x of d){const ta=h('textarea',{placeholder:'תשובה'});const e=h('div',{class:'c'},h('div',{class:'s'},dt(x.created_at)+' · '+(x.name||'')+' · '+x.email),h('p',{},x.message));if(x.replied_at)e.append(h('div',{class:'s'},'נענתה '+dt(x.replied_at)),h('p',{},x.reply));else e.append(ta,h('button',{on:{onclick:async()=>{const r=await post('contacts/reply',{id:x.id,body:ta.value});msg(r.ok?'נשלח.':'השליחה נכשלה.');if(r.ok)show('contacts')}}},'שליחת תשובה'));v.append(e)}}
function vUsers(v,d){const q=h('input',{placeholder:'חיפוש'});q.oninput=async()=>{const r=await call(api+'users?limit=100&q='+encodeURIComponent(q.value));draw(await r.json())};const t=h('div');v.append(q,t);const draw=l=>{t.textContent='';const tb=h('table',{},h('tr',{},h('th',{},'שם'),h('th',{},'דוא״ל'),h('th',{},'כניסה'),h('th',{},'נוצר'),h('th')));for(const u of l)tb.append(h('tr',{},h('td',{},u.display_name||''),h('td',{},u.email||''),h('td',{},u.auth_kind),h('td',{},dt(u.created_at)),h('td',{},u.role==='admin'?'':h('button',{on:{onclick:async()=>{if(!confirm('למחוק את '+(u.display_name||u.email)+' וכל התוכן שלו?'))return;await call(api+'users/'+u.id,{method:'DELETE'});show('users')}}},'מחיקה'))));t.append(tb)};draw(d)}
const SET=[['recording','הקלטה',['max_seconds','max_bytes','daily_cap_per_user']],['audio_retention','מחיקת אודיו (ימים)',['days']],['comments','תגובות',['moderated']],['signups','הרשמה',[]],['signup_manual','הרשמה ידנית',[]],['contact_form','יצירת קשר',['per_hour']],['shabbat_mode','מצב שבת',['mode','manual_override']],['auto_approve','פרסום אוטומטי ללא אישור',[]],['login_google','כניסה עם Google',[]],['login_email','כניסה בדוא״ל',['codes_per_hour']],['email_notifications','שליחת דוא״ל',['daily_cap']],['reactions','שכוייח',[]]];
function vSettings(v,d){const m=Object.fromEntries(d.map(f=>[f.key,f]));for(const[key,label,fields]of SET){const f=m[key]||{enabled:0,config_json:'{}'};const cfg=JSON.parse(f.config_json||'{}');const cb=h('input',{type:'checkbox'});cb.checked=!!f.enabled;const ins={};const e=h('div',{class:'c'},h('label',{},cb,' '+label));for(const k of fields){let i;if(k==='moderated'){i=h('input',{type:'checkbox'});i.checked=cfg[k]!==false}else if(k==='mode'){i=h('select',{},h('option',{value:'banner'},'באנר'),h('option',{value:'lock'},'נעילה'));i.value=cfg[k]||'banner'}else if(k==='manual_override'){i=h('select',{},h('option',{value:'null'},'אוטומטי'),h('option',{value:'true'},'פעיל'),h('option',{value:'false'},'כבוי'));i.value=String(cfg[k]??null)}else{i=h('input',{type:'number',value:cfg[k]??''})}ins[k]=i;e.append(' ',h('span',{class:'s'},k+': '),i)}e.append(h('button',{on:{onclick:async()=>{const c={};for(const k in ins){const i=ins[k];c[k]=i.type==='checkbox'?i.checked:k==='manual_override'?JSON.parse(i.value):k==='mode'?i.value:i.value}const r=await post('setting',{key,enabled:cb.checked,config:c});msg(r.ok?'נשמר.':'שגיאה: '+((await r.json()).field||'לא תקין'))}}},'שמירה'));v.append(e)}}
function vStats(v,d){const row=(a,b)=>h('tr',{},h('td',{},a),h('td',{},String(b)));const t=h('table',{},row('משתמשים',d.users),row('משתמשים חדשים (7 ימים)',d.users_week),row('תגובות ממתינות',d.comments_pending),row('פניות שלא נענו',d.contacts_unanswered));for(const x of d.chiddushim)t.append(row('חידושים: '+x.status,x.c));v.append(t)}
$('send').onclick=async()=>{const r=await fetch(base+'/code',{method:'POST'});msg(r.ok?'הקוד נשלח.':'שליחה נכשלה.')};
$('go').onclick=async()=>{const r=await fetch(base+'/login',{method:'POST',body:JSON.stringify({code:$('code').value})});const d=await r.json();if(d.session){S=d.session;sessionStorage.setItem('s',S);show('queue')}else msg('קוד שגוי.')};
if(S)show('queue');
</script></body></html>`;
