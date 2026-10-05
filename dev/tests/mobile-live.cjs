const {chromium}=require('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const B='https://petka-tava.github.io/petka-tava/';
for(const member of [false,true]){
const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c.newPage();
if(member){await p.route('**/api/me',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({nickname:'בודק'})}));await p.route('**/api/my/chiddushim*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({items:[]})}));await p.addInitScript(()=>{sessionStorage.setItem('petka_token','x');localStorage.setItem('petka_token','x')});}
for(const f of ['index.html','catalog.html','book.html?section=Talmud&id=Menachot&title='+encodeURIComponent('מנחות'),'daf.html?id=Menachot&daf=2&amud=b','feed.html','login.html','signup.html','help.html','my-feed.html','record.html','account.html']){
try{await p.goto(B+f,{waitUntil:'networkidle'});await p.waitForTimeout(800);
const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,wide:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)}).slice(0,3).map(e=>e.tagName+'.'+e.className+'#'+e.id),small:[...document.querySelectorAll('button,a.button,input,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<36}).length}));
console.log((member?'M ':'G ')+f.slice(0,28),JSON.stringify(r));}catch(e){console.log(f,'ERR',e.message.slice(0,80))}}
await c.close();}
await b.close();})();
