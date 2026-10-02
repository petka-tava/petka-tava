(() => {
  const $=id=>document.getElementById(id);
  let max=0,recorder,stream,timer,start,chunks=[],url='',timeout;
  const params=new URLSearchParams(location.search);
  $('record-book').textContent=params.get('title')?'ספר שנבחר: '+params.get('title'):'';
  const clock=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  const status=(text,error=false)=>{$('record-status').textContent=text;$('record-status').className=error?'notice error':'muted small';};
  const clearResult=()=>{if(url)URL.revokeObjectURL(url);url='';$('record-result').hidden=true;$('record-audio').removeAttribute('src');$('record-audio').load();};
  function stop(){if(recorder?.state==='recording')recorder.stop();clearTimeout(timeout);clearInterval(timer);}
  async function limits(){
    try{const l=await window.Petka.api('/api/recording/limits');max=Number(l.max_seconds);if(!Number.isFinite(max)||max<=0)throw new Error('לא ניתן לאמת את מגבלת ההקלטה.');$('limit').textContent=l.enabled?'הקלטה עד '+window.Petka.formatSeconds(max):'ההקלטה מושבתת כרגע.';$('rec').disabled=!l.enabled;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('rec').disabled=true;status('הדפדפן הזה אינו תומך בהקלטה. נסו דפדפן עדכני.',true);}}
    catch(e){$('limit').textContent='מגבלת ההקלטה אינה זמינה. אין אפשרות להקליט עד לבדיקה מחדש.';status(e.message,true);const b=document.createElement('button');b.textContent='בדיקה מחדש';b.className='secondary';b.onclick=()=>{b.remove();limits();};$('record-status').append(' ',b);}
  }
  $('rec').onclick=async()=>{
    if(recorder?.state==='recording'){stop();return;}
    $('rec').disabled=true;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      recorder=new MediaRecorder(stream);chunks=[];clearResult();
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{clearInterval(timer);clearTimeout(timeout);stream.getTracks().forEach(t=>t.stop());$('rec').textContent='הקלטה חדשה';$('rec').disabled=false;const blob=new Blob(chunks,{type:recorder.mimeType});if(!blob.size){status('לא התקבל אודיו. נסו שוב.',true);return;}url=URL.createObjectURL(blob);$('record-audio').src=url;$('record-download').href=url;$('record-download').download='petka-tava-recording.'+(recorder.mimeType.includes('mp4')?'m4a':recorder.mimeType.includes('ogg')?'ogg':'webm');$('record-result').hidden=false;status('ההקלטה מוכנה להאזנה. היא נשארת כאן בלבד.');};
      recorder.onerror=()=>{stop();status('אירעה תקלה בהקלטה. נסו שוב.',true);};
      recorder.start();start=Date.now();$('rec').textContent='עצירת הקלטה';$('rec').disabled=false;status('מקליטים. ההקלטה תיעצר אוטומטית במגבלה.');
      timer=setInterval(()=>{$('t').textContent=clock(Math.min(max,Math.floor((Date.now()-start)/1000)))+' / '+clock(max);},250);
      timeout=setTimeout(stop,max*1000);
    }catch(e){stream?.getTracks().forEach(t=>t.stop());$('rec').disabled=false;status(e.name==='NotAllowedError'?'הרשאת המיקרופון לא ניתנה. אפשרו גישה בהגדרות הדפדפן ונסו שוב.':'לא ניתן להפעיל את המיקרופון. בדקו שהוא מחובר ונסו שוב.',true);}
  };
  $('record-delete').onclick=()=>{clearResult();status('ההקלטה נמחקה מהדף. קובץ שכבר הורד למכשיר אינו נמחק.');};
  window.addEventListener('pagehide',()=>{stop();stream?.getTracks().forEach(t=>t.stop());if(url)URL.revokeObjectURL(url);});
  limits();
})();
