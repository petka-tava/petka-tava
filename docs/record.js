// Limit text comes from the server (admin-controlled); fallback shown if API is unreachable.
const API = window.API_BASE || '';
let max = 180;
fetch(API + '/api/recording/limits').then(r => r.json()).then(l => {
  max = l.max_seconds; const m = Math.floor(max / 60), s = max % 60;
  document.getElementById('limit').textContent = 'הקלטה עד ' + (s ? m + ':' + String(s).padStart(2, '0') + ' דקות' : m + ' דקות');
  if (!l.enabled) document.getElementById('rec').disabled = true;
}).catch(() => {});
let mr, chunks = [], timer, start;
document.getElementById('rec').onclick = async () => {
  if (mr && mr.state === 'recording') return mr.stop();
  const st = await navigator.mediaDevices.getUserMedia({ audio: true });
  mr = new MediaRecorder(st); chunks = [];
  mr.ondataavailable = e => chunks.push(e.data);
  mr.onstop = () => { clearInterval(timer); st.getTracks().forEach(t => t.stop()); document.getElementById('rec').textContent = 'התחל הקלטה'; window.lastRecording = { blob: new Blob(chunks, { type: mr.mimeType }), seconds: Math.round((Date.now() - start) / 1000) }; };
  mr.start(); start = Date.now(); document.getElementById('rec').textContent = 'עצור';
  timer = setInterval(() => { const s = Math.round((Date.now() - start) / 1000); document.getElementById('t').textContent = s + ' / ' + max; if (s >= max) mr.stop(); }, 500);
};
