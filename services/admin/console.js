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
<style>body{font:17px/1.5 Georgia,serif;background:#f6efe0;color:#2b2118;max-width:860px;margin:0 auto;padding:1em}button,input,select,textarea{font:inherit}button{padding:.3em 1em;margin:.2em;cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:.3em;align-items:center;border-bottom:1px solid #cdbb94;padding-bottom:.5em;margin-bottom:.5em}nav a{padding:.3em .8em;border-radius:6px;text-decoration:none;color:#2b2118;border:1px solid #cdbb94;cursor:pointer}nav a.on{background:#7a4f28;color:#fff}.c{background:#fffaf0;border:1px solid #cdbb94;border-radius:8px;padding:.8em;margin:.8em 0}.s{font-size:.85em;opacity:.75}textarea{width:100%;box-sizing:border-box;min-height:5em}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #cdbb94;padding:.3em;text-align:right}input[type=number]{width:6em}.ok{color:#2e7d32;font-weight:bold;margin-inline-start:.6em}.bad{color:#b3261e;font-weight:bold;margin-inline-start:.6em}</style></head><body>
<nav id="nav" hidden></nav><div id="login"><h2>ניהול</h2><button id="send">שליחת קוד לתיבת האתר</button> <input id="code" inputmode="numeric" placeholder="קוד"> <button id="go">כניסה</button></div><div id="msg" role="status"></div><div id="v"></div>
<script>
const base=location.pathname.replace(/\\/$/,'');let S=sessionStorage.getItem('s');if(/^#adm\\.\\d+\\.[0-9a-f]{40}$/.test(location.hash)){S=location.hash.slice(1);sessionStorage.setItem('s',S);history.replaceState(null,'',location.pathname)}const api='/api/admin/';
const $=id=>document.getElementById(id);const msg=t=>$('msg').textContent=t;
const h=(t,a,...k)=>{const e=document.createElement(t);for(const[x,y]of Object.entries(a||{}))x==='on'?Object.assign(e,y):e.setAttribute(x,y);e.append(...k.filter(z=>z!=null));return e};
async function call(p,o={}){try{return await fetch(p,{...o,headers:{authorization:'Bearer '+S,'content-type':'application/json'}})}catch{return{ok:false,status:0,json:async()=>({})}}}
const post=(p,b)=>call(api+p,{method:'POST',body:JSON.stringify(b)});
const busy=async(btn,f)=>{if(btn.disabled)return;btn.disabled=true;try{return await f()}finally{btn.disabled=false}};
const dt=t=>t?new Date(t).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'';
const tabs=[['queue','ממתינים לאישור'],['contacts','פניות'],['users','משתמשים'],['settings','הגדרות'],['stats','סטטיסטיקה']];
let cur='queue';function toast(t,ok){const old=$('toast');if(old)old.remove();const e=h('div',{id:'toast',role:'status'},t);e.style.cssText='position:fixed;bottom:1.2em;left:50%;transform:translateX(-50%);padding:.7em 1.4em;border-radius:8px;color:#fff;font-weight:bold;z-index:9;background:'+(ok?'#2e7d32':'#b3261e');document.body.append(e);setTimeout(()=>e.remove(),3500)}
function nav(){const n=$('nav');n.hidden=false;n.textContent='';n.append(h('a',{href:'https://petka-tava.github.io/petka-tava/index.html'},'← חזרה לאתר'));for(const[k,l]of tabs)n.append(h('a',{class:k===cur?'on':'',on:{onclick:()=>show(k)}},l));n.append(h('a',{on:{onclick:()=>{S=null;sessionStorage.removeItem('s');location.replace('https://petka-tava.github.io/petka-tava/login.html')}}},'יציאה'))}
async function show(k){cur=k;nav();msg('');const v=$('v');v.textContent='';const r=await call(api+(k==='queue'?'queue':k==='contacts'?'contacts':k==='users'?'users?limit=100':k==='settings'?'flags':'stats'));if(r.status===404){S=null;sessionStorage.removeItem('s');v.textContent='';$('login').hidden=false;$('nav').hidden=true;msg('נדרשת כניסה.');return}if(!r.ok){v.textContent='';msg('הטעינה נכשלה.');v.append(h('button',{on:{onclick:()=>show(k)}},'ניסיון חוזר'));return}const d=await r.json().catch(()=>null);if(!d){msg('תגובה לא תקינה.');v.append(h('button',{on:{onclick:()=>show(k)}},'ניסיון חוזר'));return}$('login').hidden=true;({queue:vQueue,contacts:vContacts,users:vUsers,settings:vSettings,stats:vStats})[k](v,d)}
function vQueue(v,d){const row=(k,x,t)=>{const e=h('div',{class:'c'},h('div',{},x.nickname+(x.location?' ('+x.location+')':'')+': '+t));for(const a of['approve','reject']){const b=h('button',{},a==='approve'?'אישור':'דחייה');b.onclick=()=>busy(b,async()=>{const r=await post('moderate',{kind:k,id:x.id,action:a});if(!r.ok){msg('הפעולה נכשלה, נסו שוב.');return}show('queue')});e.append(b)}v.append(e)};d.chiddushim.forEach(x=>row('chidush',x,x.transcript));d.comments.forEach(x=>row('comment',x,x.body));if(!v.children.length)v.append('אין פריטים ממתינים.')}
function vContacts(v,d){if(!d.length)v.append('אין פניות.');for(const x of d){const ta=h('textarea',{placeholder:'תשובה'});const e=h('div',{class:'c'},h('div',{class:'s'},dt(x.created_at)+' · '+(x.name||'')+' · '+x.email),h('p',{},x.message));if(x.replied_at)e.append(h('div',{class:'s'},'נענתה '+dt(x.replied_at)),h('p',{},x.reply));else {const b=h('button',{},'שליחת תשובה');b.onclick=()=>busy(b,async()=>{const r=await post('contacts/reply',{id:x.id,body:ta.value});msg(r.ok?'נשלח.':'השליחה נכשלה.');if(r.ok)show('contacts')});e.append(ta,b)};v.append(e)}}
function vUsers(v,d){const q=h('input',{placeholder:'חיפוש'});q.oninput=async()=>{const r=await call(api+'users?limit=100&q='+encodeURIComponent(q.value));if(r.ok)draw(await r.json());else msg('החיפוש נכשל.')};const t=h('div');v.append(q,t);const draw=l=>{t.textContent='';const tb=h('table',{},h('tr',{},h('th',{},'שם'),h('th',{},'דוא״ל'),h('th',{},'כניסה'),h('th',{},'נוצר'),h('th')));for(const u of l)tb.append(h('tr',{},h('td',{},u.display_name||''),h('td',{},u.email||''),h('td',{},u.auth_kind),h('td',{},dt(u.created_at)),h('td',{},u.role==='admin'?'':(()=>{const b=h('button',{},'מחיקה');b.onclick=()=>busy(b,async()=>{if(!confirm('למחוק את '+(u.display_name||u.email)+' וכל התוכן שלו?'))return;const r=await call(api+'users/'+u.id,{method:'DELETE'});if(!r.ok){msg('המחיקה נכשלה.');return}show('users')});return b})())));t.append(tb)};draw(d)}
const FN={max_items:'מספר פריטים',daily_cap_global:'מכסה יומית לכל האתר',max_seconds:'אורך הקלטה מרבי (שניות)',max_bytes:'גודל מרבי (בייטים)',daily_cap_per_user:'מכסה יומית למשתמש',days:'ימים',moderated:'תגובות דורשות אישור',per_hour:'לשעה',mode:'סוג',manual_override:'עקיפה ידנית',codes_per_hour:'קודים לשעה',daily_cap:'מכסה יומית'};
const SET=[['recording','הקלטה','כבוי = אף אחד לא יכול להקליט או להעלות. הגבולות חלים מיד.',['max_seconds','max_bytes','daily_cap_per_user']],['transcription','תמלול אוטומטי','כבוי = הקלטות לא מתומללות. המכסה היא סך כל התמלולים ביום לכל האתר.',['daily_cap_global']],['audio_retention','מחיקת אודיו (ימים)','כבוי = האודיו נשמר ללא מחיקה אוטומטית. פעיל = האודיו נמחק אחרי מספר הימים (התמלול נשאר).',['days']],['comments','תגובות','כבוי = אי אפשר להגיב. הסימון "תגובות דורשות אישור": כשמסומן כל תגובה ממתינה לאישורכם לפני פרסום.',['moderated']],['signups','הרשמה','כבוי = לא ניתן להירשם בשום דרך (גם Google ודוא״ל למשתמש חדש).',[]],['signup_manual','הרשמה ידנית','כבוי = טופס ההרשמה הידני לא זמין. כניסה עם Google ובדוא״ל לא מושפעות.',[]],['contact_form','יצירת קשר','כבוי = טופס צור קשר נסגר. המספר הוא מגבלת פניות לשעה.',['per_hour']],['guest_taste','טעימה לאורחים','פעיל = אורחים רואים כמה חידושים מפורסמים בלי להירשם. כבוי = אורחים לא רואים תוכן. המספר הוא כמה פריטים.',['max_items']],['shabbat_mode','מצב שבת','פעיל = בשבת ובחגים (מכניסת השבת/החג ועד צאת הכוכבים, לפי תל אביב) כל האתר מציג עמוד "סגור" לכולם חוץ מכם. כבוי = האתר פתוח תמיד. עקיפה ידנית: "נעול עכשיו" סוגר מיד, "פתוח עכשיו" פותח למרות השבת, "אוטומטי" לפי הלוח.',['manual_override']],['auto_approve','פרסום אוטומטי ללא אישור','כבוי (מומלץ) = כל חידוש ממתין לאישורכם. פעיל = חידושים מתפרסמים מיד בלי בדיקה.',[]],['login_google','כניסה עם Google','כבוי = כפתור Google לא עובד. המשתמשים נכנסים בדוא״ל.',[]],['login_email','כניסה בדוא״ל','כבוי = קוד כניסה בדוא״ל לא נשלח. המספר הוא מגבלת קודים לשעה.',['codes_per_hour']],['email_notifications','שליחת דוא״ל','כבוי = האתר לא שולח שום דוא״ל (גם קודי כניסה והתראות). המספר הוא מכסה יומית.',['daily_cap']],['reactions','שכוייח','כבוי = אי אפשר לסמן שכוייח.',[]]];
const HOW='כל הגדרה: סמנו או בטלו את הריבוע "פעיל" ואז לחצו "שמירה" ליד אותה הגדרה. השינוי חל מיד על האתר כולו. הגדרה בלי שמירה לא נשמרת.';
function vSettings(v,d){const m=Object.fromEntries(d.map(f=>[f.key,f]));v.append(h('p',{class:'s'},HOW));for(const[key,label,desc,fields]of SET){const f=m[key]||{enabled:0,config_json:'{}'};const cfg=JSON.parse(f.config_json||'{}');const cb=h('input',{type:'checkbox'});cb.checked=!!f.enabled;const ins={};const e=h('div',{class:'c'},h('label',{},cb,' פעיל: ',h('b',{},label)),h('div',{class:'s'},desc));for(const k of fields){let i;if(k==='moderated'){i=h('input',{type:'checkbox'});i.checked=cfg[k]!==false}else if(k==='mode'){i=h('select',{},h('option',{value:'banner'},'באנר'),h('option',{value:'lock'},'נעילה'));i.value=cfg[k]||'banner'}else if(k==='manual_override'){i=h('select',{},h('option',{value:'null'},'אוטומטי (לפי הלוח)'),h('option',{value:'true'},'נעול עכשיו'),h('option',{value:'false'},'פתוח עכשיו'));i.value=String(cfg[k]??null)}else{i=h('input',{type:'number',value:cfg[k]??''})}ins[k]=i;e.append(h('div',{},h('label',{},(FN[k]||k)+': ',i)))}{const sb=h('button',{},'שמירה');const st=h('span',{class:'ok',role:'status'});sb.onclick=()=>busy(sb,async()=>{const c={};for(const k in ins){const i=ins[k];c[k]=i.type==='checkbox'?i.checked:k==='manual_override'?JSON.parse(i.value):k==='mode'?i.value:i.value}st.textContent='';const r=await post('setting',{key,enabled:cb.checked,config:c});const t=r.ok?'✓ נשמר: '+label+(cb.checked?' (פעיל)':' (כבוי)'):'✗ לא נשמר: '+((await r.json().catch(()=>({}))).field||'ערך לא תקין');st.className=r.ok?'ok':'bad';st.textContent=t;toast(t,r.ok)});e.append(sb,st)}v.append(e)}}
function vStats(v,d){const row=(a,b)=>h('tr',{},h('td',{},a),h('td',{},String(b)));const t=h('table',{},row('משתמשים',d.users),row('משתמשים חדשים (7 ימים)',d.users_week),row('תגובות ממתינות',d.comments_pending),row('פניות שלא נענו',d.contacts_unanswered));for(const x of d.chiddushim)t.append(row('חידושים: '+x.status,x.c));v.append(t)}
$('send').onclick=()=>busy($('send'),async()=>{try{const r=await fetch(base+'/code',{method:'POST'});msg(r.ok?'הקוד נשלח.':'שליחה נכשלה.')}catch{msg('שגיאת רשת, נסו שוב.')}});
$('go').onclick=()=>busy($('go'),async()=>{try{const r=await fetch(base+'/login',{method:'POST',body:JSON.stringify({code:$('code').value})});const d=await r.json().catch(()=>({}));if(d.session){S=d.session;sessionStorage.setItem('s',S);show('queue')}else msg('קוד שגוי.')}catch{msg('שגיאת רשת, נסו שוב.')}});
if(S)show('queue');
</script></body></html>`;
