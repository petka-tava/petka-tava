(() => {
  'use strict';
  const config = window.PETKA_CONFIG || {};
  const API = config.apiBase || 'https://petka-tava-api.petka-tava.workers.dev';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const page = document.body.dataset.page || 'home';
  let token = '';
  try { token = sessionStorage.getItem('petka-session') || ''; } catch {}
  let user = null;
  const errors = { location_required:'יש לציין מיקום או מראה מקום.', bad_ref:'הספר שנבחר אינו זמין. בחרו ספר מחדש.', too_long:'ההקלטה ארוכה מהמגבלה.', too_large:'קובץ האודיו גדול מהמגבלה. הקליטו שוב הקלטה קצרה יותר.', daily_cap:'הגעתם למכסת ההקלטות היומית. נסו שוב מחר.', bad_type:'פורמט האודיו אינו נתמך.', not_draft:'החידוש כבר נשלח ואינו טיוטה.', transcript_required:'יש לשמור תמלול לפני שליחה.', feature_disabled:'האפשרות מושבתת כרגע. נסו שוב מאוחר יותר.', invalid:'יש לבדוק את הפרטים בטופס ולנסות שוב.', exists:'כתובת הדוא״ל כבר רשומה. היכנסו לחשבון הקיים.', bad_email:'כתובת הדוא"ל אינה תקינה.', rate_limited:'נשלחו יותר מדי בקשות. נסו שוב מאוחר יותר.', mail_unavailable:'שליחת הקוד אינה זמינה כרגע. נסו שוב מאוחר יותר.', invalid_code:'הקוד שגוי או שפג תוקפו. בקשו קוד חדש ונסו שוב.', nickname_required:'נדרש כינוי באורך 2 עד 24 תווים.', nickname_taken:'הכינוי כבר תפוס. בחרו כינוי אחר ובקשו קוד חדש.', banned:'הכניסה לחשבון זה אינה זמינה.', invalid_token:'לא ניתן לאמת את הכניסה עם Google. נסו שוב.', unauthorized:'יש להיכנס לחשבון כדי להמשיך.', not_found:'האפשרות אינה זמינה כרגע.', server_error:'אירעה תקלה בשרת. נסו שוב בעוד רגע.' };
  async function api(path, { method = 'GET', body, auth = false, signal, raw, headers:extraHeaders = {} } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = {...extraHeaders}; if (body) headers['Content-Type'] = 'application/json'; if (auth && token) headers.Authorization = 'Bearer ' + token;
    try {
      const response = await fetch(API + path, { method, headers, body:raw || (body ? JSON.stringify(body) : undefined), signal:signal || controller.signal });
      const data = await response.json();
      if (!response.ok) { const error = new Error(errors[data.error] || 'הפעולה אינה זמינה כרגע. נסו שוב מאוחר יותר.'); error.code = data.error; error.status = response.status; throw error; }
      return data;
    } catch (error) { if (error.name === 'AbortError') throw new Error('הבקשה ארכה זמן רב. נסו שוב.'); if (error instanceof TypeError) throw new Error('לא ניתן להתחבר לשרת. בדקו את החיבור ונסו שוב.'); throw error; }
    finally { clearTimeout(timeout); }
  }
  function failure(target, error, retry) {
    target.innerHTML = `<div class="notice error" role="alert">${esc(error.message)}</div>`;
    if (retry) { const button = document.createElement('button'); button.className = 'secondary'; button.textContent = 'נסו שוב'; button.onclick = retry; target.append(button); }
  }
  function shell() {
    const links = [['home','index.html','בית'],['catalog','catalog.html','ספרייה'],['feed','feed.html','חידושים'],['my-feed','my-feed.html','הפיד שלי']];
    $('site-header').innerHTML = `<div class="header-inner"><a class="brand" href="index.html"><img src="logo.svg" alt="" width="52" height="52"><span class="brand-name">פתקא טבא<small>מקום לחידושי תורה</small></span></a><nav class="site-nav" aria-label="ניווט ראשי">${links.map(([key,url,label]) => `<a href="${url}" ${page === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}<a id="account-link" href="login.html">כניסה</a></nav></div>`;
    $('site-footer').innerHTML = '<div class="footer-inner"><span>פתקא טבא · by OrelAI</span><div class="footer-links"><button type="button" class="text-button" id="contact-open">יצירת קשר</button><a href="credits.html">קרדיטים</a><a href="privacy.html">פרטיות</a><a href="index.html">חזרה לבית</a></div></div>';
    try { $('hdate').textContent = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jerusalem'}).format(new Date()); } catch {}
  }
  async function loadUser() {
    if (!token) return null;
    try { user = await api('/api/me', {auth:true}); $('account-link').textContent = 'יציאה'; $('account-link').href = '#logout'; $('account-link').onclick = async event => { event.preventDefault();const link=$('account-link');link.textContent='יוצאים…';try{await api('/api/auth/logout',{method:'POST',auth:true});try{sessionStorage.removeItem('petka-session');}catch{}token='';user=null;location.assign('index.html');}catch(e){failure($('page-status'),e);link.textContent='יציאה';} }; return user; }
    catch (error) { if (error.status === 401) { token=''; try { sessionStorage.removeItem('petka-session'); } catch {} return null; } throw error; }
  }
  function sectionURL(id) { return 'catalog.html?' + new URLSearchParams({section:id}); }
  function bookURL(book, section) { return 'book.html?' + new URLSearchParams({section, id:book.id, title:book.title_he || book.title_en}); }
  async function home() {
    const target = $('sections');
    const load = async () => { target.innerHTML='<p class="loading" role="status">טוענים את הספרייה…</p>'; try { const sections = await api('/api/catalog/sections'); target.innerHTML = '<div class="section-grid">' + sections.map((s,i) => `<a class="section-card" href="${esc(sectionURL(s.id))}"><span class="number">${String(i+1).padStart(2,'0')}</span><h3>${esc(s.title_he || s.title_en)}</h3><span>לעיון בספרים ←</span></a>`).join('') + '</div>'; } catch (e) {failure(target,e,load);} }; await load();
  }
  async function catalog() {
    const target=$('books'), menu=$('categories');
    let sections;
    try { sections=await api('/api/catalog/sections'); } catch(e) { failure(target,e,()=>location.reload()); return; }
    if (!sections.length) { target.innerHTML='<div class="empty">הספרייה עדיין ריקה.</div>'; return; }
    const section=params.get('section') || sections[0].id;
    const selected=sections.find(s=>s.id===section);
    menu.innerHTML=sections.map(s=>`<a href="${esc(sectionURL(s.id))}" ${s.id===section?'aria-current="true"':''}>${esc(s.title_he||s.title_en)}</a>`).join('');
    if (!selected) { target.innerHTML='<div class="empty"><h2>המדור לא נמצא</h2><a href="catalog.html">חזרה לספרייה</a></div>'; return; }
    $('section-title').textContent=selected.title_he || selected.title_en;
    $('book-search').value=params.get('q') || '';
    $('search-form').onsubmit=e=>{e.preventDefault();location.assign('catalog.html?'+new URLSearchParams({section,q:$('book-search').value.trim()}));};
    async function load() {
      target.innerHTML='<p class="loading" role="status">טוענים ספרים…</p>';
      try {
        const books=await api('/api/catalog/books?'+new URLSearchParams({section,q:params.get('q')||''}));
        $('result-count').textContent=books.length===200?'מוצגים עד 200 ספרים. חפשו לפי שם כדי לצמצם.':`${books.length} ספרים בתוצאות`;
        target.innerHTML=books.length?'<div class="book-list">'+books.map(b=>`<a class="book-link" href="${esc(bookURL(b,section))}"><h3>${esc(b.title_he||b.title_en)}</h3><small dir="auto">${esc(b.title_en)}</small></a>`).join('')+'</div>':'<div class="empty"><h2>לא נמצאו ספרים</h2><p>נסו שם קצר יותר או חפשו במדור אחר.</p></div>';
      }catch(e){failure(target,e,load);}
    } await load();
  }
  function date(value) { if (!value) return ''; const parsed=new Date(value); return Number.isNaN(parsed.getTime())?'':parsed.toLocaleDateString('he-IL'); }
  function renderFeed(items) {
    return '<div class="feed-list">'+items.map(item=>`<article class="feed-card" data-chiddush-id="${esc(item.id)}"><div class="feed-meta"><span>${esc(item.nickname||'')}</span><span>${esc(date(item.published_at))}</span></div><h3>${esc(item.title_he||item.title_en||'חידוש תורה')}</h3>${item.location?`<p class="muted small">${esc(item.location)}</p>`:''}<div class="transcript" dir="auto">${esc(item.transcript||'התמלול אינו זמין.')}</div><div class="actions"><button class="secondary reaction-button" type="button">שכוייח! <span>${Number(item.shkoyach)||0}</span></button><button class="secondary comments-button" type="button">תגובות</button></div><div class="item-status" role="status"></div><section class="comments-area" hidden></section></article>`).join('')+'</div>';
  }
  function wireFeed(target) {
    for(const card of target.querySelectorAll('[data-chiddush-id]')) {
      const path='/api/chiddushim/'+encodeURIComponent(card.dataset.chiddushId), status=card.querySelector('.item-status');
      card.querySelector('.reaction-button').onclick=async event=>{if(!user){status.innerHTML='כדי להגיב, <a href="login.html">היכנסו לחשבון</a>.';return;}const button=event.currentTarget;button.disabled=true;try{const result=await api(path+'/reaction',{method:'POST',auth:true});button.querySelector('span').textContent=result.count;button.setAttribute('aria-pressed',String(result.mine));status.textContent=result.mine?'השכוייח שלכם נוסף.':'השכוייח שלכם הוסר.';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
      const area=card.querySelector('.comments-area');
      card.querySelector('.comments-button').onclick=async()=>{if(!area.hidden){area.hidden=true;return;}area.hidden=false;area.innerHTML='<p role="status">טוענים תגובות…</p>';try{const result=await api(path+'/comments');area.innerHTML='<h3>תגובות</h3>'+result.items.map(c=>`<div class="comment"><p class="small muted">${esc(c.nickname)} · ${esc(date(c.created_at))}</p><p class="transcript">${esc(c.body)}</p></div>`).join('')+(!result.items.length?'<p class="small muted">אין עדיין תגובות שפורסמו.</p>':'')+(user?'<form class="comment-form"><label>תגובה חדשה<textarea required maxlength="1000" rows="3"></textarea></label><p class="small muted">עד 1,000 תווים. התגובה עשויה להמתין לאישור לפני שתוצג.</p><button type="submit">שליחת תגובה</button></form>':'<p><a href="login.html">כניסה לחשבון כדי לכתוב תגובה</a></p>');const form=area.querySelector('form');if(form)form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const result=await api(path+'/comments',{method:'POST',auth:true,body:{body:form.querySelector('textarea').value.trim()}});status.textContent=result.status==='published'?'התגובה פורסמה.':'התגובה נשלחה וממתינה לאישור.';form.reset();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};}catch(e){area.textContent=e.message;}};
    }
  }
  async function feed(my=false) {
    const target=$('feed-content');
    if (my&&!user) { target.innerHTML='<div class="empty"><h2>הפיד שלכם מתחיל כאן</h2><p>היכנסו לחשבון כדי לראות את החידושים המפורסמים, מעבר לטעימה לאורחים.</p><a class="button" href="login.html?next=my-feed.html">כניסה לחשבון</a> <a class="button secondary" href="signup.html">הרשמה</a></div>'; return; }
    if (my) { $('feed-title').textContent='שלום, '+user.nickname; $('feed-description').textContent='חידושים שפורסמו בקהילה. התאמה אישית של הפיד עדיין אינה זמינה.'; }
    const load=async()=>{target.innerHTML='<p class="loading" role="status">טוענים חידושים…</p>';try{const result=await api('/api/feed',{auth:my});target.innerHTML=result.items.length?renderFeed(result.items):'<div class="empty"><h2>עוד אין כאן חידושים שפורסמו</h2><p>כשיהיו חידושים מאושרים בקהילה, הם יופיעו כאן.</p><a class="button secondary" href="catalog.html">בינתיים, לספרייה</a></div>';wireFeed(target);}catch(e){failure(target,e,load);}};await load();
  }
  async function myContent() {
    const target=$('my-content');
    async function load(){target.innerHTML='<p class="loading">טוענים את החידושים שלכם…</p>';try{const result=await api('/api/my/chiddushim',{auth:true});const labels={draft:'טיוטה',pending:'ממתין לאישור',published:'פורסם',rejected:'לא אושר'};target.innerHTML='<h2>החידושים שלי</h2><p class="small muted">מוצגים עד 100 חידושים אחרונים.</p>'+(result.items.length?'<div class="feed-list">'+result.items.map(c=>`<article class="feed-card"><div class="feed-meta"><span class="status-badge">${esc(labels[c.status]||c.status)}</span><span>${esc(date(c.created_at))}</span></div><h3>${esc(c.ref_id||'חידוש תורה')}</h3><p class="small muted">${esc(c.location)}</p><p class="transcript">${esc(c.preview||'התמלול עדיין אינו מוכן.')}</p><div class="actions"><a class="button secondary" href="record.html?draft=${encodeURIComponent(c.id)}">${c.status==='draft'?'עריכת טיוטה':'צפייה ועריכה'}</a><button class="secondary delete-chiddush" data-id="${esc(c.id)}">מחיקת חידוש</button></div></article>`).join('')+'</div>':'<div class="empty"><p>עדיין לא שמרתם חידושים.</p><a class="button" href="record.html">הקלטת חידוש ראשון</a></div>');for(const button of target.querySelectorAll('.delete-chiddush'))button.onclick=async()=>{if(!confirm('למחוק את החידוש, התמלול והאודיו שלו? לא ניתן לבטל.'))return;button.disabled=true;try{await api('/api/chiddushim/'+encodeURIComponent(button.dataset.id),{method:'DELETE',auth:true});await load();}catch(e){failure($('page-status'),e);button.disabled=false;}};}catch(e){failure(target,e,load);}}
    await load();$('account-tools').hidden=false;$('delete-account').onclick=async()=>{if(!confirm('מחיקת החשבון תמחק לצמיתות את כל החידושים, ההקלטות, התגובות והשכוייח שלכם. להמשיך?'))return;if(prompt('לאישור סופי, הקלידו: מחיקת החשבון')!=='מחיקת החשבון')return;const button=$('delete-account');button.disabled=true;try{await api('/api/me',{method:'DELETE',auth:true});window.Petka.clearSession();location.assign('index.html');}catch(e){failure($('page-status'),e);button.disabled=false;}};
  }
  async function book() {
    const target=$('book-content'),section=params.get('section'),id=params.get('id');
    if (!section||!id) {target.innerHTML='<div class="empty"><h2>הספר לא נמצא</h2><a href="catalog.html">חזרה לספרייה</a></div>';return;}
    try {
      // Resolve through the catalog, never treat the URL title as verified content.
      const query=params.get('title')||'';
      const books=await api('/api/catalog/books?'+new URLSearchParams({section,q:query}));
      const selected=books.find(b=>String(b.id)===id);
      if(!selected){target.innerHTML='<div class="empty"><h2>לא ניתן למצוא את הספר</h2><p>ייתכן שהקישור השתנה. בחרו את הספר מחדש מתוך הספרייה.</p><a href="catalog.html">חזרה לספרייה</a></div>';return;}
      document.title=(selected.title_he||selected.title_en)+' - פתקא טבא';
      target.innerHTML=`<div class="crumbs"><a href="catalog.html">ספרייה</a> / <a href="${esc(sectionURL(section))}">חזרה למדור</a></div><div class="book-header"><p class="eyebrow">מתוך קטלוג ספריא</p><h1>${esc(selected.title_he||selected.title_en)}</h1><p class="muted" dir="auto">${esc(selected.title_en)}</p><div class="actions"><a class="button" href="record.html?${esc(new URLSearchParams({section,id,title:selected.title_he||selected.title_en}).toString())}">הקלטת חידוש</a><a class="button secondary" href="feed.html">לחידושים בקהילה</a></div></div><div class="notice">זהו דף ספר בקטלוג, ולא נוסח הספר עצמו. לקריאת חידושים שפורסמו, עברו לפיד הקהילה.</div><div id="book-limit" class="muted small" role="status">בודקים את מגבלת ההקלטה…</div>`;
      try {const l=await api('/api/recording/limits');$('book-limit').textContent=l.enabled?`מגבלת הקלטה נוכחית: ${formatSeconds(l.max_seconds)}.`:'אפשרות ההקלטה מושבתת כרגע.';}catch{$('book-limit').textContent='מגבלת ההקלטה אינה זמינה כרגע. ההקלטה תיפתח רק לאחר בדיקה.';}
    }catch(e){failure(target,e,()=>location.reload());}
  }
  function formatSeconds(seconds) {const n=Number(seconds);return n%60===0?`${n/60} דקות`:`${Math.floor(n/60)} דקות ו-${n%60} שניות`;}
  function authStatus(message, error=false) { const target=$('auth-status');target.textContent=message;target.className='auth-status notice'+(error?' error':'');target.hidden=false; }
  function nickname() {return $('nickname').value.trim();}
  function validNick(){const n=nickname();if(n.length<2||n.length>24||/[<>@\/\\]/.test(n)){authStatus(errors.nickname_required,true);$('nickname').focus();return false;}return true;}
  function signedIn(data) {if(!data.token)throw new Error('לא התקבל אישור כניסה. נסו שוב.');try{sessionStorage.setItem('petka-session',data.token);}catch{throw new Error('יש לאפשר אחסון בדפדפן כדי להיכנס.');} const next=params.get('next');location.assign(['my-feed.html','record.html','catalog.html','feed.html'].includes(next)?next:'my-feed.html');}
  async function auth() {
    if(user){$('auth-form-area').innerHTML=`<div class="notice">כבר נכנסתם בתור ${esc(user.nickname)}.</div><a class="button" href="my-feed.html">לפיד שלי</a>`;return;}
    let email='';
    $('email-form').onsubmit=async event=>{event.preventDefault();if(page==='signup'&&!validNick())return;const button=$('send-code');button.disabled=true;button.textContent='שולחים…';try{email=$('email').value.trim();await api('/api/auth/email/start',{method:'POST',body:{email}});$('email-form').hidden=true;$('code-form').hidden=false;$('code-email').textContent=email;authStatus('הקוד נשלח. הוא תקף ל-10 דקות. בדקו גם בתיקיית הספאם.');$('code').focus();}catch(e){authStatus(e.message,true);}finally{button.disabled=false;button.textContent='שליחת קוד כניסה';}};
    $('code-form').onsubmit=async event=>{event.preventDefault();if(nickname()&&!validNick())return;const button=$('verify-code');button.disabled=true;try{const data=await api('/api/auth/email/verify',{method:'POST',body:{email,code:$('code').value.trim(),nickname:nickname()}});signedIn(data);}catch(e){authStatus(e.message,true);if(['nickname_required','nickname_taken'].includes(e.code)){$('nickname').focus();authStatus(e.message+' לאחר בחירת כינוי יש לבקש קוד חדש.',true);}}finally{button.disabled=false;}};
    $('change-email').onclick=()=>{$('code-form').hidden=true;$('email-form').hidden=false;$('code').value='';$('auth-status').hidden=true;$('email').focus();};
    if(!config.googleClientId){$('google-unavailable').hidden=false;return;}
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
    script.onload=()=>{try{google.accounts.id.initialize({client_id:config.googleClientId,auto_select:false,callback:async result=>{const nick=nickname();if(nick&&!validNick())return;authStatus(nick?'מאמתים את הכניסה…':'מאמתים את הכניסה. לחשבון חדש ללא כינוי יוצג השם מחשבון Google.');try{const body={id_token:result.credential};if(nick)body.nickname=nick;signedIn(await api('/api/auth/google',{method:'POST',body}));}catch(e){authStatus(e.message,true);if(e.code==='nickname_required')$('nickname').focus();}}});google.accounts.id.renderButton($('google-button'),{type:'standard',theme:'outline',size:'large',text:'continue_with',locale:'he',width:320});}catch{$('google-unavailable').hidden=false;}};
    script.onerror=()=>{$('google-unavailable').hidden=false;};document.head.append(script);
  }
  function manualRegistration() {
    let email='';
    const report=(text,error=false)=>{const status=$('manual-status');status.hidden=false;status.textContent=text;status.className='notice'+(error?' error':'');};
    $('manual-form').onsubmit=async event=>{
      event.preventDefault();const button=$('manual-submit');button.disabled=true;button.textContent='שולחים קוד…';
      try{email=$('manual-email').value.trim();const body={email,display_name:$('manual-nickname').value.trim(),consent:$('manual-consent').checked};const phone=$('manual-phone').value.trim();if(phone)body.phone=phone;const result=await api('/api/auth/register',{method:'POST',body});if(!result.ok||!result.pending)throw new Error('לא התקבל אישור הרשמה. נסו שוב.');$('manual-form').hidden=true;$('manual-code-form').hidden=false;$('manual-code-email').textContent=email;report('קוד אימות נשלח לדוא"ל. החשבון ייווצר רק לאחר אימות הקוד. הקוד תקף ל-10 דקות.');$('manual-code').focus();}
      catch(e){report(e.message,true);$('manual-login-hint').hidden=e.code!=='exists';}finally{button.disabled=false;button.textContent='המשך הרשמה';}
    };
    $('manual-code-form').onsubmit=async event=>{event.preventDefault();const button=$('manual-verify');button.disabled=true;try{const result=await api('/api/auth/email/verify',{method:'POST',body:{email,code:$('manual-code').value.trim()}});signedIn(result);}catch(e){report(e.message,true);}finally{button.disabled=false;}};
    $('manual-back').onclick=()=>{$('manual-code-form').hidden=true;$('manual-form').hidden=false;$('manual-code').value='';report('אפשר לעדכן פרטים ולבקש קוד חדש.');$('manual-email').focus();};
  }
  function contactModal() {
    const dialog=document.createElement('dialog');dialog.id='contact-dialog';dialog.className='contact-dialog';dialog.setAttribute('aria-labelledby','contact-title');
    dialog.innerHTML='<div class="modal-heading"><h2 id="contact-title">יצירת קשר</h2><button id="contact-close" class="text-button" type="button" aria-label="סגירת החלון">סגירה ×</button></div><p class="muted small">שאלה, הצעה או תקלה? כתבו לנו כאן, בלי לעזוב את הדף.</p><form id="contact-form"><div class="field"><label for="contact-name">שם (לא חובה)</label><input id="contact-name" name="name" autocomplete="name" maxlength="80"></div><div class="field"><label for="contact-email">כתובת דוא"ל לחזרה</label><input id="contact-email" name="email" type="email" dir="ltr" autocomplete="email" maxlength="120" required></div><div class="field"><label for="contact-message">הודעה</label><textarea id="contact-message" name="message" rows="5" minlength="5" maxlength="2000" required aria-describedby="contact-help"></textarea><p id="contact-help" class="muted small">עד 2,000 תווים. אין לשלוח סיסמאות, פרטי תשלום או מידע רגיש.</p></div><div class="honeypot" aria-hidden="true"><label for="contact-website">Website</label><input id="contact-website" name="website" tabindex="-1" autocomplete="off"></div><p class="small muted">השם, כתובת הדוא"ל וההודעה יישלחו לצוות פתקא טבא וישמשו רק כדי להשיב לפנייה.</p><button id="contact-send" type="submit">שליחת הודעה</button></form><div id="contact-status" role="status" aria-live="polite" hidden></div>';
    document.body.append(dialog);const open=$('contact-open');open.onclick=()=>dialog.showModal();$('contact-close').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    $('contact-form').onsubmit=async event=>{event.preventDefault();const status=$('contact-status'),button=$('contact-send');status.hidden=false;status.className='notice';button.disabled=true;button.textContent='שולחים…';try{const result=await api('/api/contact',{method:'POST',body:{name:$('contact-name').value.trim(),email:$('contact-email').value.trim(),message:$('contact-message').value.trim(),website:$('contact-website').value}});if(!result.ok)throw new Error('לא התקבל אישור שליחה. נסו שוב.');status.textContent='ההודעה נשלחה לצוות פתקא טבא. תודה!';$('contact-form').reset();}catch(e){status.className='notice error';status.textContent=e.code==='mail_unavailable'?'שליחת ההודעה אינה זמינה כרגע. נסו שוב מאוחר יותר.':e.message;}finally{button.disabled=false;button.textContent='שליחת הודעה';}};
  }
  shell();
  if($('contact-open'))contactModal();
  window.Petka={api,formatSeconds,esc,getUser:()=>user,clearSession:()=>{try{sessionStorage.removeItem('petka-session');}catch{}token='';user=null;}};
  (async()=>{try{await loadUser();}catch(e){if(['my-feed','login','signup','register','record'].includes(page)){failure($('page-status'),e,()=>location.reload());return;}}window.Petka.readyUser=true;if(page==='record')window.dispatchEvent(new CustomEvent('petka-ready'));if(page==='my-feed'&&user)await myContent();if(page==='register')manualRegistration();if(page==='home')await home();if(page==='catalog')await catalog();if(page==='book')await book();if(page==='feed'||page==='my-feed')await feed(page==='my-feed');if(page==='login'||page==='signup')await auth();})().catch(e=>failure($('page-status'),e));
})();
