// app.js - LinguaQuest (email-only Firebase auth optional)
// Loads data/lessons.json and provides UI, games, XP, pronunciation.
// If firebase-config.js is configured with your keys, Firestore sync will be used.
// Otherwise the app uses localStorage only.

const STATE = {
  user: null,
  xp: 0,
  streak: 0,
  lessons: [],
  currentLevel: null,
  currentLesson: null,
  theme: localStorage.getItem('lingua_theme') || 'light'
};

const KEYS = { USERS:'lingua_users_v1', PROGRESS:'lingua_progress_v1' };

const $ = s => document.querySelector(s);
const $all = s => Array.from(document.querySelectorAll(s));
const uid = (p='u')=> p + Date.now().toString(36).slice(4) + Math.random().toString(36).slice(2,8);

async function loadLessons(){
  try{
    const r = await fetch('./data/lessons.json', {cache:'no-store'});
    if(!r.ok) throw new Error('file');
    STATE.lessons = await r.json();
  }catch(e){ console.warn('lessons load fail', e); STATE.lessons = []; }
}

function loadProgress(){ try{ return JSON.parse(localStorage.getItem(KEYS.PROGRESS)||'{}'); }catch{return {};}}
function saveProgress(p){ localStorage.setItem(KEYS.PROGRESS, JSON.stringify(p)); }

function initUI(){
  setTheme(STATE.theme);
  $('#btn-theme').addEventListener('click', ()=> { STATE.theme = STATE.theme==='light'?'dark':'light'; setTheme(STATE.theme);});
  $('#btn-random').addEventListener('click', ()=> playRandom());
  $('#btn-export').addEventListener('click', ()=> exportProgress());
  $('#btn-back').addEventListener('click', ()=> showView('home'));
  $('#btn-back2').addEventListener('click', ()=> showView('lesson'));
  renderAuthBox();
}

function setTheme(t){ STATE.theme=t; if(t==='dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); localStorage.setItem('lingua_theme', t); }

function renderAuthBox(){
  const box = $('#auth-box'); box.innerHTML='';
  if(STATE.user){
    const html = `<div><strong>${STATE.user.name}</strong><div class="muted">ID: ${STATE.user.id}</div>
      <div style="margin-top:8px"><button id="btn-logout" class="btn-ghost">Salir</button></div></div>`;
    box.innerHTML = html;
    $('#btn-logout').addEventListener('click', ()=> { STATE.user=null; renderAuthBox(); renderStats(); });
    return;
  }
  const form = document.createElement('div');
  form.innerHTML = `<input id="inp-email" placeholder="Correo (email)"/><input id="inp-pass" placeholder="Contraseña" type="password"/>
    <div style="display:flex;gap:6px;margin-top:6px">
      <button id="btn-login" class="btn-ghost">Entrar</button>
      <button id="btn-create" class="btn-primary">Crear cuenta</button>
    </div>`;
  box.appendChild(form);
  $('#btn-login').addEventListener('click', ()=> emailLogin());
  $('#btn-create').addEventListener('click', ()=> emailRegister());
}

// Firebase integration (optional) - email/password only
let firebaseApp=null, firebaseAuth=null, firebaseDB=null;
async function initFirebaseIfConfigured(){
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey!=='REPLACE_ME'){
    // load firebase libs
    const mod = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');
    firebaseApp = mod.initializeApp(window.FIREBASE_CONFIG);
    firebaseAuth = authMod.firebase.auth();
    firebaseDB = dbMod.firebase.firestore();
    console.log('Firebase initialized (compat)');
    // listen auth
    firebaseAuth.onAuthStateChanged(user=>{
      if(user) {
        STATE.user = { id:user.uid, name: user.email };
        // load user meta
        loadUserMetaFromFirestore(user.uid);
      } else {
        // no-op
      }
      renderAuthBox(); renderStats();
    });
  }
}

async function emailRegister(){
  const email = $('#inp-email').value.trim(); const pass = $('#inp-pass').value;
  if(!email || !pass) return alert('Rellena correo y contraseña');
  if(firebaseAuth){
    try{
      const cred = await firebaseAuth.createUserWithEmailAndPassword(email, pass);
      STATE.user = { id: cred.user.uid, name: email };
      await saveUserMetaFirestore(cred.user.uid);
      renderAuthBox(); renderStats();
    }catch(e){ alert('Firebase register error: '+e.message); }
  } else {
    // local register
    const id = uid('p'); STATE.user = { id, name: email };
    const users = JSON.parse(localStorage.getItem(KEYS.USERS)||'[]'); users.push(STATE.user); localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    saveUserMetaLocal();
    renderAuthBox(); renderStats();
  }
}

async function emailLogin(){
  const email = $('#inp-email').value.trim(); const pass = $('#inp-pass').value;
  if(!email || !pass) return alert('Rellena correo y contraseña');
  if(firebaseAuth){
    try{
      const cred = await firebaseAuth.signInWithEmailAndPassword(email, pass);
      STATE.user = { id: cred.user.uid, name: email };
      await loadUserMetaFromFirestore(cred.user.uid);
      renderAuthBox(); renderStats();
    }catch(e){ alert('Firebase login error: '+e.message); }
  } else {
    // local login - accept any created user by email
    const users = JSON.parse(localStorage.getItem(KEYS.USERS)||'[]');
    const u = users.find(x=>x.name===email);
    if(u){ STATE.user=u; renderAuthBox(); renderStats(); } else alert('Usuario no encontrado. Crea cuenta primero.');
  }
}

function saveUserMetaLocal(){
  const p = loadProgress(); p['__meta'] = p['__meta']||{}; p['__meta'][STATE.user.id] = { xp: STATE.xp, streak: STATE.streak, updatedAt: Date.now() }; saveProgress(p);
}

async function saveUserMetaFirestore(uid){
  if(!firebaseDB) return;
  try{
    await firebaseDB.collection('users').doc(uid).set({ xp: STATE.xp, streak: STATE.streak, updatedAt: Date.now() }, { merge:true });
  }catch(e){ console.warn('firestore save fail', e); }
}

async function loadUserMetaFromFirestore(uid){
  if(!firebaseDB) return;
  try{
    const doc = await firebaseDB.collection('users').doc(uid).get();
    if(doc.exists){
      const data = doc.data();
      STATE.xp = data.xp || 0; STATE.streak = data.streak || 0;
    }
  }catch(e){ console.warn('firestore load fail', e); }
}

// rest of functionality (levels, games, XP) - simplified version
function renderLevels(){
  const list = $('#levels-list'); const cards = $('#levels-cards');
  list.innerHTML=''; cards.innerHTML='';
  STATE.lessons.forEach(level=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${level.title}</span><small class="muted">${level.lessons.length} lecciones</small>
      <button class="btn-ghost small" data-level="${level.id}">Entrar</button>`;
    list.appendChild(li);
    const card = document.createElement('div'); card.className='level-card';
    card.innerHTML = `<h4>${level.title}</h4><p class="muted">${level.description||''}</p>
      <div style="margin-top:10px"><button class="btn-primary" data-level="${level.id}">Comenzar</button></div>`;
    cards.appendChild(card);
  });
  $all('[data-level]').forEach(btn=>btn.addEventListener('click', e=> openLevel(e.currentTarget.dataset.level)));
}

function openLevel(levelId){
  const level = STATE.lessons.find(l=>l.id===levelId); if(!level) return alert('Nivel no encontrado');
  STATE.currentLevel = level; $('#lesson-title').textContent = level.title; $('#lesson-level').textContent = level.description||'';
  const body = $('#lesson-body'); body.innerHTML='';
  level.lessons.forEach(les=>{
    const row = document.createElement('div'); row.className='card'; row.style.margin='8px 0';
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${les.title}</strong><div class="muted">${truncate(les.text,80)}</div></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn-primary" data-lesson="${les.id}">Ver</button>
        <button class="btn-ghost" data-play="${les.id}">Jugar</button>
      </div>
    </div>`;
    body.appendChild(row);
  });
  body.querySelectorAll('[data-lesson]').forEach(b=>b.addEventListener('click', e=> openLesson(levelId, e.currentTarget.dataset.lesson)));
  body.querySelectorAll('[data-play]').forEach(b=>b.addEventListener('click', e=> startMatchGame(levelId, e.currentTarget.dataset.play)));
  showView('lesson');
}

function openLesson(levelId, lessonId){
  const level = STATE.lessons.find(l=>l.id===levelId);
  const lesson = level && level.lessons.find(x=>x.id===lessonId);
  if(!lesson) return alert('Lección no encontrada');
  STATE.currentLesson={levelId, lesson};
  $('#lesson-title').textContent = lesson.title; $('#lesson-level').textContent = level.title;
  const body = $('#lesson-body');
  body.innerHTML = `
    <div>
      <div class="lesson-phrase">${lesson.text}</div>
      <div class="lesson-actions">
        <button id="btn-listen-tts" class="btn-ghost">🔊 Escuchar</button>
        <button id="btn-speak" class="btn-primary">🎤 Practicar pronunciación</button>
      </div>
      <div id="pronounce-result" style="margin-top:8px"></div>
      <hr style="margin:12px 0" />
      <h4>Mini-juegos</h4>
      <div style="display:flex;gap:8px">
        <button id="btn-game-1" class="btn-primary">Emparejar</button>
        <button id="btn-game-2" class="btn-ghost">multiple choice</button>
      </div>
      <div style="margin-top:12px">
        <h4>Notas</h4>
        <textarea id="lesson-notes" style="width:100%;height:90px;border-radius:8px;padding:8px;border:1px solid #e6eef6"></textarea>
        <div style="margin-top:8px"><button id="btn-save-notes" class="btn-primary">Guardar notas</button></div>
      </div>
    </div>`;
  $('#btn-listen-tts').onclick = ()=> speak(lesson.text);
  $('#btn-speak').onclick = ()=> startRecognitionForPhrase(lesson.text);
  $('#btn-game-1').onclick = ()=> startMatchGame(levelId, lessonId);
  $('#btn-game-2').onclick = ()=> startMultipleChoice(levelId, lessonId);
  $('#btn-save-notes').onclick = ()=> { persistProgress(lesson.id, { notes: $('#lesson-notes').value }); alert('Notas guardadas'); };
  const p = loadProgress(); $('#lesson-notes').value = (p[lesson.id] && p[lesson.id].notes) || '';
  showView('lesson');
}

function playRandom(){
  const levels = STATE.lessons; if(!levels.length) return alert('No lessons');
  const L = levels[Math.floor(Math.random()*levels.length)]; const lesson = L.lessons[Math.floor(Math.random()*L.lessons.length)];
  startMatchGame(L.id, lesson.id);
}

function speak(text){ if(!window.speechSynthesis) return alert('TTS no disponible'); const u = new SpeechSynthesisUtterance(text); u.lang='en-US'; window.speechSynthesis.speak(u); }

function startRecognitionForPhrase(target){
  if(!(window.SpeechRecognition || window.webkitSpeechRecognition)) return alert('Reconocimiento de voz no soportado');
  const R = new (window.SpeechRecognition || window.webkitSpeechRecognition)(); R.lang='en-US'; R.interimResults=false; R.maxAlternatives=1;
  $('#pronounce-result').textContent = 'Escuchando...';
  R.onresult = e=>{ const t = e.results[0][0].transcript || ''; const score = scoreSimilarity(target, t); $('#pronounce-result').innerHTML = `Dijiste: <strong>${escapeHtml(t)}</strong> — puntuación: <strong>${score}%</strong>`; awardXP(Math.round(score/10)); persistProgress(STATE.currentLesson.lesson.id, { lastScore: score, practicedAt: Date.now() }); };
  R.onend = ()=> $('#pronounce-result').textContent = 'Proceso terminado.'; R.start();
}

function scoreSimilarity(a,b){ a=a.toLowerCase().replace(/[^\w\s]/g,'').trim(); b=b.toLowerCase().replace(/[^\w\s]/g,'').trim(); if(!a && !b) return 100; const d=levenshtein(a,b); const max=Math.max(a.length,b.length)||1; return Math.max(0, Math.round((1 - d/max)*100)); }
function levenshtein(a,b){ const m=a.length,n=b.length; if(m===0) return n; if(n===0) return m; const dp=Array.from({length:m+1}, ()=> new Array(n+1).fill(0)); for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j; for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ const cost=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost); } } return dp[m][n]; }

function startMatchGame(levelId, lessonId){
  const level = STATE.lessons.find(l=>l.id===levelId); const lesson = level.lessons.find(x=>x.id===lessonId); const phrase = lesson.text;
  const words = phrase.split(/\s+/).filter(w=>w.length>2).slice(0,6);
  if(words.length<2) return alert('No hay suficientes palabras para emparejar');
  const pairs = words.slice(0,4).map((w,i)=>({a:w,b:w.split('').reverse().join('')})); const tiles=[]; pairs.forEach((p,i)=>{ tiles.push({id:'a'+i,text:p.a,pair:i}); tiles.push({id:'b'+i,text:p.b,pair:i}); });
  shuffleArray(tiles);
  $('#game-title').textContent = `Emparejar — ${lesson.title}`; const area = $('#game-area'); area.innerHTML=''; const grid=document.createElement('div'); grid.className='match-grid';
  tiles.forEach(t=>{ const el=document.createElement('div'); el.className='match-tile'; el.dataset.pair=t.pair; el.dataset.id=t.id; el.textContent='🔒'; el.onclick=()=> revealTile(el,t.text); grid.appendChild(el); });
  area.appendChild(grid); showView('game');
  let first=null,matches=0;
  function revealTile(el,text){
    if(el.classList.contains('revealed')) return; el.classList.add('revealed'); el.textContent=text;
    if(!first){ first={el,pair:el.dataset.pair}; } else {
      if(first.pair===el.dataset.pair){ matches++; awardXP(5); if(matches===pairs.length){ area.innerHTML=`<div class="card">¡Completado! Ganaste XP. <button id="btn-return" class="btn-primary">Volver</button></div>`; $('#btn-return').onclick=()=> showView('lesson'); } }
      else { setTimeout(()=>{ first.el.classList.remove('revealed'); first.el.textContent='🔒'; el.classList.remove('revealed'); el.textContent='🔒'; first=null; },700); }
      first=null;
    }
  }
}

function startMultipleChoice(levelId, lessonId){
  const level=STATE.lessons.find(l=>l.id===levelId); const lesson=level.lessons.find(x=>x.id===lessonId); const phrase=lesson.text;
  const words = phrase.split(/\s+/).filter(w=>w.length>3); const target = words[Math.floor(Math.random()*words.length)]||words[0];
  const choices=[target]; while(choices.length<4){ const r=(words[Math.floor(Math.random()*words.length)]||uid()).slice(0,6); if(!choices.includes(r)) choices.push(r); }
  shuffleArray(choices);
  $('#game-title').textContent = `Multiple choice — ${lesson.title}`; const area=$('#game-area'); area.innerHTML=`<div><p>Encuentra la palabra que aparece en la frase:</p><blockquote class="muted">${escapeHtml(phrase)}</blockquote></div>`;
  const list=document.createElement('div'); list.style.display='grid'; list.style.gridTemplateColumns='1fr 1fr'; list.style.gap='8px';
  choices.forEach(c=>{ const b=document.createElement('button'); b.className='btn-ghost'; b.textContent=c; b.onclick=()=>{ if(c===target){ awardXP(10); alert('Correcto!'); showView('lesson'); } else alert('Inténtalo de nuevo'); }; list.appendChild(b); });
  area.appendChild(list); showView('game');
}

function awardXP(n){ STATE.xp=(STATE.xp||0)+n; STATE.streak=(STATE.streak||0)+1; renderStats(); if(STATE.user){ const p=loadProgress(); p['__meta']=p['__meta']||{}; p['__meta'][STATE.user.id]={ xp:STATE.xp, streak:STATE.streak, updatedAt:Date.now() }; saveProgress(p); if(firebaseDB) saveUserMetaFirestore(STATE.user.id); } }

function persistProgress(lessonId,obj){ const p=loadProgress(); p[lessonId]={ ...(p[lessonId]||{}), ...obj }; if(STATE.user) p['__owner']=STATE.user.id; saveProgress(p); }

function renderStats(){ $('#xp-count').textContent=STATE.xp||0; $('#streak-count').textContent=STATE.streak||0; }

function showView(name){ $all('.view').forEach(v=>v.classList.add('hidden')); if(name==='home') $('#home-view').classList.remove('hidden'); if(name==='lesson') $('#lesson-view').classList.remove('hidden'); if(name==='game') $('#game-view').classList.remove('hidden'); }

function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function truncate(s,l=80){ return s.length>l? s.slice(0,l)+'…': s; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function exportProgress(){ const p = localStorage.getItem(KEYS.PROGRESS)||'{}'; const blob = new Blob([p], {type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='linguaquest-progress.json'; a.click(); URL.revokeObjectURL(url); }

async function startup(){ await loadLessons(); await initFirebaseIfConfigured(); initUI(); renderLevels(); const p=loadProgress(); STATE.xp=(p['__meta'] && Object.values(p['__meta']).reduce((s,m)=>s+(m.xp||0),0))||0; renderStats(); showView('home'); }
startup(); window.LinguaQuest={STATE,persistProgress,loadProgress,exportProgress};
