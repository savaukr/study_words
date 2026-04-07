// 1000 англійських слів B1–B2
// ["англійське", "частина_мови", "переклад"]

let WORDS = [];


// ═══════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════
const POS_LABELS = {noun:'Іменник',verb:'Дієслово',adj:'Прикметник',adv:'Прислівник',phrase:'Фраза'};
const DAY_UK = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

function getWeekKey(d) {
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const dow = dt.getDay() || 7;
  dt.setDate(dt.getDate() - dow + 1);
  return dt.toISOString().slice(0,10);
}
function getWeekDays(key) {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(key); d.setDate(d.getDate()+i); return d;
  });
}
function fmtD(d) { return d.toLocaleDateString('uk',{day:'numeric',month:'short'}); }
function isToday(d) { return d.toDateString() === new Date().toDateString(); }
function isFuture(d) { const t=new Date(); t.setHours(0,0,0,0); return d>t; }
function findWord(eng) { return WORDS.find(w => w?.[0].toLowerCase()===eng.toLowerCase()); }

// ═══════════════════════════════════════════════════════════════
// INDEXEDDB — архів вивчених слів
// ═══════════════════════════════════════════════════════════════
const DB_NAME    = 'wordwise_db';
const DB_VERSION = 1;
const STORE_WEEKS  = 'weeks';   // архів тижнів
const STORE_BEST   = 'scores';  // рекорди тестів
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      // weeks store: keyPath = weekKey (YYYY-MM-DD)
      if (!d.objectStoreNames.contains(STORE_WEEKS)) {
        const ws = d.createObjectStore(STORE_WEEKS, { keyPath: 'weekKey' });
        ws.createIndex('by_date', 'weekKey');
      }
      // scores store: keyPath = mode_src string
      if (!d.objectStoreNames.contains(STORE_BEST)) {
        d.createObjectStore(STORE_BEST, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(store, record) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}
function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function dbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// Best scores — thin wrappers over IDB (async)
async function loadBest() {
  const all = await dbGetAll(STORE_BEST);
  return Object.fromEntries(all.map(r => [r.id, r.score]));
}
async function saveBestKey(id, score) {
  await dbPut(STORE_BEST, { id, score });
}

// ─── Archive current week into IDB ──────────────────────────────
// Called automatically when week changes or manually via "Mark as learned"
async function archiveWeek(weekKey, wordsList) {
  if (!wordsList || wordsList.length === 0) return;
  const existing = await dbGet(STORE_WEEKS, weekKey);
  const days   = getWeekDays(weekKey);
  const record = {
    weekKey,
    label   : fmtD(days[0]) + ' – ' + fmtD(days[6]),
    words   : wordsList,
    archived: new Date().toISOString(),
    // preserve existing score if re-archiving
    bestScore: existing?.bestScore || null,
  };
  await dbPut(STORE_WEEKS, record);
}

// ─── Auto-archive past weeks from localStorage ───────────────────
async function migrateOldWeeks() {
  const lsData = JSON.parse(localStorage.getItem('ww_week_data') || '{}');
  for (const [wk, val] of Object.entries(lsData)) {
    if (wk < WEEK_KEY && val.words?.length) {
      const existing = await dbGet(STORE_WEEKS, wk);
      if (!existing) await archiveWeek(wk, val.words);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LOCALSTORAGE — current week only (lightweight)
// ═══════════════════════════════════════════════════════════════
function loadWD()   { return JSON.parse(localStorage.getItem('ww_week_data') || '{}'); }
function saveWD(d)  { localStorage.setItem('ww_week_data', JSON.stringify(d)); }

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
const TODAY    = new Date();
const WEEK_KEY = getWeekKey(TODAY);
let selDay       = (TODAY.getDay()+6) % 7;
let expandedSlot = null;
let addQuery     = '';

// ── Settings ──────────────────────────────────────────────────
let WEEK_LIMIT = parseInt(localStorage.getItem('ww_week_limit') || '5');
let WORD_LEVEL = localStorage.getItem('ww_word_level') || 'b1-b2';
let WORD_LANG  = localStorage.getItem('ww_word_lang')  || 'en';

function saveLevel(level) {
  WORD_LEVEL = level;
  localStorage.setItem('ww_word_level', level);
}

function wordsJsonFile() {
  const prefix = WORD_LANG === 'en' ? '' : WORD_LANG + '-';
  return prefix + 'words-' + WORD_LEVEL + '.json';
}

async function changeLang(lang) {
  if (lang === WORD_LANG) return;
  WORD_LANG = lang;
  localStorage.setItem('ww_word_lang', lang);
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === lang));
  try {
    const data = await fetch(wordsJsonFile()).then(r => r.json());
    WORDS = data;
    document.getElementById('totalWordsChip').textContent = WORDS.length + ' слів';
  } catch(e) {
    alert('Файл слів для мови "' + lang + '" не знайдено.');
    return;
  }
  renderWeek();
}
const LIMIT_MIN = 1;
const LIMIT_MAX = 20;

function saveLimit(v) {
  WEEK_LIMIT = v;
  localStorage.setItem('ww_week_limit', v);
  document.getElementById('limitDisplay').textContent = v;
}
function renderWeekLimit() {
  const btn = document.querySelector("#random_btn");
  if (btn) {
    btn.textContent = `Випадкові ${WEEK_LIMIT} слів`;
  }
}

async function changeLevel(level) {
  if (level === WORD_LEVEL) return;
  saveLevel(level);
  WORDS = [];
  document.querySelectorAll('.level-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.level === level));
  try {
    const data = await fetch(wordsJsonFile()).then(r => r.json());
    WORDS = data;
    document.getElementById('totalWordsChip').textContent = WORDS.length + ' слів';
  } catch(e) {
    alert('Файл слів для рівня ' + level + ' не знайдено.');
    return;
  }
  renderWeek();
}

function levelLabel(l) {
  return l === 'a1-a2' ? 'A1–A2' : l === 'b1-b2' ? 'B1–B2' : 'C1–C2';
}

function changeWeekLimit(delta) {
  const n = Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, WEEK_LIMIT + delta));
  if (n === WEEK_LIMIT) return;
  saveLimit(n);
  renderWeekLimit();
  // If current week has fewer words than new limit, pad with random
  const data = loadWD();
  const wk   = data[WEEK_KEY];
  if (wk && wk.words.length < n) {
    const taken = new Set(wk.words.map(w=>w.toLowerCase()));
    const pool  = WORDS.filter(w=>!taken.has(w[0].toLowerCase()));
    const shuffled = pool.sort(()=>Math.random()-.5);
    while (wk.words.length < n && shuffled.length) {
      wk.words.push(shuffled.shift()[0]);
    }
    saveWD(data);
  }
  renderWeek();
}

function toggleSettings() {
  const p = document.getElementById('settingsPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  document.getElementById('totalWordsChip').textContent = WORDS.length + ' слів';
}

document.getElementById('todayLabel').textContent =
  TODAY.toLocaleDateString('uk', { weekday:'short', day:'numeric', month:'long' });

function ensureWeek() {
  const d = loadWD();
  renderWeekLimit();
  if (!d[WEEK_KEY]) {
    const shuffled = [...WORDS].sort(() => Math.random()-.5);
    d[WEEK_KEY] = { words: shuffled.slice(0,WEEK_LIMIT).map(w=>w[0]) };
    saveWD(d);
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchTab(tab) {
  const TABS = ['week','words','archive','quiz','verbs'];
  document.querySelectorAll('.tab').forEach((t,i) =>
    t.classList.toggle('active', TABS[i]===tab));
  TABS.forEach(v =>
    document.getElementById('view-'+v).classList.toggle('active', v===tab));
  if (tab === 'words')   renderWordList();
  if (tab === 'archive') renderArchive();
  if (tab === 'quiz' && !qz.active) showSetup();
  if (tab === 'verbs')   renderIrregVerbs();
}

// ═══════════════════════════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════════════════════════
let curAudio = null;
async function speakWord(word, btn) {
  if(curAudio){ curAudio.pause(); curAudio=null; }
  window.speechSynthesis && window.speechSynthesis.cancel();
  document.querySelectorAll('.icon-btn.playing').forEach(b=>b.classList.remove('playing'));
  if(btn) btn.classList.add('playing');
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if(res.ok) {
      const data = await res.json();
      const url = (data[0]?.phonetics||[]).find(p=>p.audio?.trim())?.audio;
      if(url) {
        const audio = new Audio(url.startsWith('//')?'https:'+url:url);
        curAudio = audio;
        audio.onended = audio.onerror = () => { if(btn)btn.classList.remove('playing'); curAudio=null; };
        await audio.play(); return;
      }
    }
  } catch(e) {}
  if(window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(word); u.lang='en-US'; u.rate=0.85;
    u.onend = u.onerror = () => { if(btn)btn.classList.remove('playing'); };
    const go = () => window.speechSynthesis.speak(u);
    window.speechSynthesis.getVoices().length ? go() : (window.speechSynthesis.onvoiceschanged=go, go());
  } else { if(btn) btn.classList.remove('playing'); }
}

const SPEAK_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

// ═══════════════════════════════════════════════════════════════
// WEEKLY VIEW
// ═══════════════════════════════════════════════════════════════
function renderWeek() {
  const data = ensureWeek();
  const wk   = data[WEEK_KEY];
  const days  = getWeekDays(WEEK_KEY);
  const words = wk.words; // string[]

  // Week range
  document.getElementById('weekRange').textContent = fmtD(days[0]) + ' – ' + fmtD(days[6]);
  document.getElementById('weekCountPill').textContent = words.length + ' / ' + WEEK_LIMIT;

  // Days strip
  document.getElementById('daysStrip').innerHTML = days.map((d,i) => {
    const fut = isFuture(d), tod = isToday(d), sel = i===selDay;
    return `<div class="daydot ${sel?'sel':''} ${tod&&!sel?'today':''} ${fut?'fut':''}" onclick="selDay=${i};expandedSlot=null;renderWeek()">
      <div class="dl">${DAY_UK[i]}</div>
      <div class="dc">${d.getDate()}</div>
    </div>`;
  }).join('');

  // Word slots
  document.getElementById('wSlots').innerHTML = Array.from({length:WEEK_LIMIT},(_,i) => {
    const eng = words[i];
    if(!eng) return `<div class="wslot empty">
      <div class="wslot-num">${i+1}</div>
      <div class="empty-label">Слот вільний — знайдіть слово нижче</div>
    </div>`;
    const w = findWord(eng);
    if(!w) return '';
    const exp = expandedSlot===i;
    return `<div class="wslot">
      <div class="wslot-num">${i+1}</div>
      <div class="wslot-body" onclick="expandedSlot=${exp?'null':i};renderWeek()">
        <div class="wslot-en">${w[0]}</div>
        <div class="wslot-pos">${POS_LABELS[w[1]]||w[1]}</div>
        <div class="wslot-uk">${w[2]}</div>
        ${exp ? `<div class="wslot-detail">
          <p style="font-size:14px;color:var(--muted);font-style:italic;">Натисни 🔊 щоб почути вимову</p>
        </div>` : ''}
      </div>
      <div class="wslot-actions">
        <button class="icon-btn" onclick="speakWord('${esc(w[0])}',this)" title="Вимовити">${SPEAK_SVG}</button>
        <button class="icon-btn danger" onclick="removeWord(${i})" title="Видалити">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  // Add panel
  document.getElementById('addTitle').textContent = `Додати слово (зараз ${words.length} / ${WEEK_LIMIT})`;
  document.getElementById('addInp').disabled = false;
  document.getElementById('addInp').placeholder = 'Пошук серед ' + WORDS.length + ' слів…';
  renderAddResults();
  document.getElementById('addHint').textContent = addQuery ? '' : 'Введіть слово або переклад';
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,"\\'"); }

function renderAddResults() {
  const data  = loadWD();
  const taken = data[WEEK_KEY].words;
  const q     = addQuery.toLowerCase().trim();
  const el    = document.getElementById('addResults');
  if(!q) { el.innerHTML=''; return; }
  const hits = WORDS.filter(w =>
    (w[0].toLowerCase().includes(q) || w[2].toLowerCase().includes(q)) && !taken.includes(w[0])
  ).slice(0,14);
  el.innerHTML = hits.length ? hits.map(w => `
    <div class="add-row">
      <div>
        <div class="add-row-en">${w[0]}</div>
        <div class="add-row-uk">${w[2]}</div>
      </div>
      <button class="btn btn-sm" onclick="addWord('${esc(w[0])}')">+ Додати</button>
    </div>`).join('')
    : `<div class="hint">Нічого не знайдено</div>`;
  document.getElementById('addHint').textContent = '';
}

function onAddSearch(val) {
  addQuery = val;
  renderAddResults();
}

function addWord(eng) {
  const data = loadWD();
  const wk   = data[WEEK_KEY];
  if(wk.words.includes(eng)) return;
  if(wk.words.length >= WEEK_LIMIT) {
    saveLimit(Math.min(LIMIT_MAX, WEEK_LIMIT + 1));
    renderWeekLimit();
  }
  wk.words.push(eng);
  saveWD(data);
  expandedSlot = null;
  renderWeek();
}

function removeWord(idx) {
  const data = loadWD();
  data[WEEK_KEY].words.splice(idx,1);
  expandedSlot = null;
  saveWD(data);
  renderWeek();
}

function randomizeWeek() {
  const data = loadWD();
  const shuffled = [...WORDS].sort(()=>Math.random()-.5);
  data[WEEK_KEY] = { words: shuffled.slice(0,WEEK_LIMIT).map(w=>w[0]) };
  expandedSlot = null; addQuery = '';
  document.getElementById('addInp').value = '';
  saveWD(data);
  renderWeek();
}

// ═══════════════════════════════════════════════════════════════
// QUIZ
// ═══════════════════════════════════════════════════════════════
const qz = { active:false, mode:'en-uk', src:'week', _archiveCache:[] };
let qState  = {};
let recog   = null;
let micOn   = false;

function weekPool() {
  const data = ensureWeek();
  return data[WEEK_KEY].words.map(eng=>findWord(eng)).filter(Boolean);
}
async function archivePool() {
  const all = await dbGetAll(STORE_WEEKS);
  const seen = new Set();
  const result = [];
  for (const rec of all) {
    for (const eng of (rec.words || [])) {
      if (!seen.has(eng)) {
        seen.add(eng);
        const w = findWord(eng);
        if (w) result.push(w);
      }
    }
  }
  return result;
}

function bestKey() { return qz.mode+'_'+qz.src; }

async function showSetup() {
  qz.active = false;
  stopMic();
  const week    = weekPool();
  const archive = await archivePool();
  const bests   = await loadBest();
  const bk      = bestKey();
  const srcCount = qz.src==='week' ? week.length : qz.src==='archive' ? archive.length : WORDS.length;

  document.getElementById('quizWrap').innerHTML = `
    <div class="setup-card fade-up">
      <div class="setup-h">Налаштування тесту</div>

      <div class="slabel">Режим відповіді</div>
      <div class="mode-grid" id="modeGrid">
        ${[
          {id:'en-uk', svg:'<path d="M2 12h20M12 2l10 10-10 10"/>',          lbl:'EN → Укр<br>друк'},
          {id:'uk-en', svg:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', lbl:'Укр → EN<br>друк'},
          {id:'uk-en-voice', svg:'<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>', lbl:'Укр → EN<br>голос'},
        ].map(m=>`<div class="mchip ${qz.mode===m.id?'active':''}" onclick="setMode('${m.id}',this)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${m.svg}</svg>
          <div class="mchip-lbl">${m.lbl}</div>
        </div>`).join('')}
      </div>

      <div class="slabel">Джерело слів</div>
      <div class="src-row">
        <div class="schip ${qz.src==='week'?'active':''}" onclick="setSrc('week',this)">Слова тижня (${week.length})</div>
        <div class="schip ${qz.src==='archive'?'active':''}" onclick="setSrc('archive',this)">Архів (${archive.length})</div>
        <div class="schip ${qz.src==='all'?'active':''}" onclick="setSrc('all',this)">Всі слова (${WORDS.length})</div>
      </div>

      <div class="stats-row">
        <div class="sbox"><div class="n">${srcCount}</div><div class="l">Слів</div></div>
        <div class="sbox"><div class="n">${bests[bk]||0}%</div><div class="l">Рекорд</div></div>
      </div>

      <button class="btn" style="width:100%;justify-content:center;" onclick="startQuiz()">Почати →</button>
    </div>`;
}

function setMode(id, el) {
  qz.mode = id;
  el.closest('.setup-card').querySelectorAll('.mchip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  showSetup();
}
function setSrc(id, el) {
  qz.src = id;
  el.parentElement.querySelectorAll('.schip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  showSetup();
}

async function startQuiz() {
  let pool;
  if (qz.src === 'week') {
    pool = weekPool();
  } else if (qz.src === 'archive') {
    pool = await archivePool();
  } else {
    pool = [...WORDS];
  }
  if (pool.length < 2) { alert('Замало слів для тесту.'); return; }
  const limit = qz.src === 'week' ? pool.length : Math.min(20, pool.length);
  const words = [...pool].sort(()=>Math.random()-.5).slice(0, limit);
  qState = { words, idx:0, correct:0, answered:false };
  qz.active = true;
  renderQCard();
}

function renderQCard() {
  const {words,idx} = qState;
  const w   = words[idx];
  const pct = idx/words.length*100;
  const isEn    = qz.mode==='en-uk';
  const isType  = qz.mode==='uk-en';
  const isVoice = qz.mode==='uk-en-voice';

  let body = '';
  if(isEn) {
    body = `
      <div class="qhint">Перекладіть українською</div>
      <div class="qword-row">
        <div class="qword-en">${w[0]}</div>
        <button class="icon-btn" onclick="speakWord('${esc(w[0])}',this)">${SPEAK_SVG}</button>
      </div>
      <div class="qphon">${POS_LABELS[w[1]]||''}</div>
      <input class="qinput" id="qinp" placeholder="Ваш переклад…" autocomplete="off" onkeydown="if(event.key==='Enter')checkAns()">
      <div id="qfb"></div>
      <div class="qnav"><button class="btn" id="qbtn" onclick="checkAns()">Перевірити</button></div>`;
  } else if(isType) {
    body = `
      <div class="qhint">Напишіть англійською</div>
      <div class="qword-uk" style="margin-bottom:6px;">${w[2]}</div>
      <div class="qphon">${POS_LABELS[w[1]]||''}</div>
      <input class="qinput" id="qinp" placeholder="Type in English…" autocomplete="off" spellcheck="false" onkeydown="if(event.key==='Enter')checkAns()">
      <div id="qfb"></div>
      <div class="qnav"><button class="btn" id="qbtn" onclick="checkAns()">Перевірити</button></div>`;
  } else {
    body = `
      <div class="qhint">Вимовте англійською</div>
      <div class="qword-uk" style="margin-bottom:6px;">${w[2]}</div>
      <div class="qphon">${POS_LABELS[w[1]]||''}</div>
      <div class="mic-area">
        <div class="mic-heard" id="micHeard">—</div>
        <button class="mic-btn" id="micBtn" onclick="toggleMic()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <div class="mic-status" id="micStat">Натисніть мікрофон</div>
      </div>
      <div id="qfb"></div>
      <div class="qnav">
        <button class="btn btn-outline" onclick="skipVoice()">Пропустити</button>
        <button class="btn" id="qbtn" onclick="nextQ()" style="display:none;">Далі →</button>
      </div>`;
  }

  document.getElementById('quizWrap').innerHTML = `
    <div class="qcard fade-up">
      <div class="pbar"><div class="pfill" style="width:${pct}%"></div></div>
      <div class="qnum">${idx+1} / ${words.length}</div>
      ${body}
    </div>`;
  setTimeout(()=>document.getElementById('qinp')?.focus(), 80);
}

function checkAns() {
  if(qState.answered){ nextQ(); return; }
  const ans  = (document.getElementById('qinp')?.value||'').trim().toLowerCase();
  const w    = qState.words[qState.idx];
  const isEn = qz.mode==='en-uk';
  const correctRaw = isEn ? w[2] : w[0];
  const correct    = correctRaw.toLowerCase();
  const aTok = ans.split(/[\s,\/]+/).filter(Boolean);
  const cTok = correct.split(/[,\/]+/).map(s=>s.trim()).filter(Boolean);
  let ok = false;
  if(isEn) ok = ans.length>0 && aTok.some(a=>cTok.some(c=>c.includes(a)||a.includes(c)));
  else     ok = ans.length>0 && aTok.some(a=>a===correct||(a.length>=3&&correct.startsWith(a)));
  qState.answered=true;
  if(ok){ qState.correct++; setTimeout(()=>speakWord(w[0],null),200); }
  const fb  = document.getElementById('qfb');
  const btn = document.getElementById('qbtn');
  fb.innerHTML = ok
    ? `<div class="qfb ok">✓ Правильно! <em>${correctRaw}</em></div>`
    : `<div class="qfb no">✗ Відповідь: <em>${correctRaw}</em></div>`;
  btn.textContent = qState.idx+1<qState.words.length ? 'Далі →' : 'Результат →';
}

// ── Voice ─────────────────────────────────────────────────────
function toggleMic(){ micOn ? stopMic() : startMic(); }

function startMic(){
  const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ alert('Голосовий режим потребує Chrome або Edge.'); return; }
  recog = new SR(); recog.lang='en-US'; recog.interimResults=true; recog.maxAlternatives=3;
  micOn=true;
  const mb=document.getElementById('micBtn'), ms=document.getElementById('micStat');
  if(mb) mb.classList.add('on');
  if(ms) ms.textContent='Слухаю…';
  recog.onresult=(e)=>{
    const finals  = Array.from(e.results).filter(r=>r.isFinal).map(r=>r[0].transcript).join(' ');
    const interim = Array.from(e.results).filter(r=>!r.isFinal).map(r=>r[0].transcript).join(' ');
    const hd=document.getElementById('micHeard'); if(hd) hd.textContent=finals||interim||'…';
    if(finals) checkVoice(finals);
  };
  recog.onerror=(e)=>{ micOn=false; const mb=document.getElementById('micBtn'); if(mb)mb.classList.remove('on'); const ms=document.getElementById('micStat'); if(ms)ms.textContent='Помилка: '+e.error; };
  recog.onend=()=>{ micOn=false; const mb=document.getElementById('micBtn'); if(mb)mb.classList.remove('on'); if(!qState.answered){ const ms=document.getElementById('micStat'); if(ms)ms.textContent='Спробуйте ще раз'; } };
  recog.start();
}

function stopMic(){ if(recog){try{recog.stop();}catch(e){}} micOn=false; const mb=document.getElementById('micBtn'); if(mb)mb.classList.remove('on'); }

function checkVoice(spoken){
  if(qState.answered) return;
  stopMic();
  const w=qState.words[qState.idx];
  const target=w[0].toLowerCase(), said=spoken.trim().toLowerCase();
  const ok=said.includes(target)||(said.split(' ')[0].length>=3&&target.startsWith(said.split(' ')[0]));
  qState.answered=true;
  if(ok){ qState.correct++; speakWord(w[0],null); }
  const ms=document.getElementById('micStat'); if(ms) ms.textContent='Ви сказали: "'+spoken+'"';
  const fb=document.getElementById('qfb');
  fb.innerHTML=ok
    ?`<div class="qfb ok">✓ Правильно! <em>${w[0]}</em></div>`
    :`<div class="qfb no">✗ Відповідь: <em>${w[0]}</em> <button class="icon-btn" style="display:inline-flex;" onclick="speakWord('${esc(w[0])}',this)">${SPEAK_SVG}</button></div>`;
  const skip=document.querySelector('.btn-outline'); if(skip) skip.style.display='none';
  const nb=document.getElementById('qbtn'); if(nb){ nb.style.display='inline-flex'; nb.textContent=qState.idx+1<qState.words.length?'Далі →':'Результат →'; }
}

function skipVoice(){ stopMic(); checkVoice('__skip__'); }

function nextQ(){
  stopMic(); qState.idx++; qState.answered=false;
  qState.idx>=qState.words.length ? finishQuiz() : renderQCard();
}

async function finishQuiz(){
  stopMic(); qz.active=false;
  const pct=Math.round(qState.correct/qState.words.length*100);
  const bk=bestKey();
  const bests=await loadBest();
  if(pct>(bests[bk]||0)){ await saveBestKey(bk,pct); bests[bk]=pct; }
  // If quiz was on week words and score >= 60%, auto-archive
  if(qz.src==='week' && pct>=60){
    const data=loadWD();
    const wk=data[WEEK_KEY];
    if(wk?.words?.length){
      await archiveWeek(WEEK_KEY,wk.words);
      // store best score in archived record too
      const rec=await dbGet(STORE_WEEKS,WEEK_KEY);
      if(rec && (!rec.bestScore || pct>rec.bestScore)){
        rec.bestScore=pct; await dbPut(STORE_WEEKS,rec);
      }
    }
  }
  const emoji=pct>=80?'🌟':pct>=60?'📚':'💪';
  const modeLabel=qz.mode==='en-uk'?'EN → Укр':qz.mode==='uk-en'?'Укр → EN (друк)':'Укр → EN (голос)';
  const srcLabel=qz.src==='week'?'слова тижня':qz.src==='archive'?'архів':'всі слова';
  const archiveNote=qz.src==='week'&&pct>=60?'<div style="font-family:DM Mono,monospace;font-size:10px;color:var(--sage);margin-bottom:12px;">✓ Тиждень збережено в архів</div>':''
  document.getElementById('quizWrap').innerHTML=`
    <div class="result-card fade-up">
      <div class="result-emoji">${emoji}</div>
      <div class="result-pct">${pct}%</div>
      <div class="result-sub">${qState.correct} з ${qState.words.length} правильних · ${modeLabel} · ${srcLabel}</div>
      <div class="result-rec">🏆 Рекорд: ${bests[bk]}%</div>
      ${archiveNote}
      <div class="qnav">
        <button class="btn" onclick="startQuiz()">Ще раз</button>
        <button class="btn btn-outline" onclick="showSetup()">Налаштування</button>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// MARK AS LEARNED (manual archive — daily entry)
// ═══════════════════════════════════════════════════════════════
async function markLearned() {
  const data = loadWD();
  const wk   = data[WEEK_KEY];
  if (!wk?.words?.length) { alert('Немає слів для архівування.'); return; }

  // daily key: d_YYYY-MM-DD (avoids collision with weekly Monday keys)
  const todayKey   = 'd_' + TODAY.toISOString().slice(0, 10);
  const todayLabel = TODAY.toLocaleDateString('uk', { weekday:'short', day:'numeric', month:'long', year:'numeric' });

  const existing = await dbGet(STORE_WEEKS, todayKey);
  await dbPut(STORE_WEEKS, {
    weekKey  : todayKey,
    label    : todayLabel,
    words    : [...wk.words],
    archived : new Date().toISOString(),
    bestScore: existing?.bestScore || null,
  });
  showToast('✓ Слова збережено в архів на сьогодні');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:white;font-family:DM Mono,monospace;font-size:12px;padding:10px 20px;border-radius:4px;z-index:9999;animation:fadeUp .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.2);';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2400);
}

// ═══════════════════════════════════════════════════════════════
// ARCHIVE VIEW
// ═══════════════════════════════════════════════════════════════
let arcFilter = '';
let arcSearch = '';

async function renderArchive() {
  const el = document.getElementById('archiveContent');
  el.innerHTML = '<div class="arc-empty">Завантаження…</div>';

  let all = await dbGetAll(STORE_WEEKS);
  // sort newest first (strip d_ prefix for comparison so daily entries sort correctly)
  const sortKey = k => k.startsWith('d_') ? k.slice(2) : k;
  all.sort((a,b) => sortKey(b.weekKey).localeCompare(sortKey(a.weekKey)));

  // apply search filter
  if (arcSearch) {
    const q = arcSearch.toLowerCase();
    all = all.map(rec => ({
      ...rec,
      words: rec.words.filter(eng => {
        const w = findWord(eng);
        return w && (w[0].toLowerCase().includes(q) || w[2].toLowerCase().includes(q));
      })
    })).filter(r => r.words.length > 0);
  }

  if (!all.length) {
    el.innerHTML = `
      <div class="arc-empty">Архів порожній.<br><small style="font-size:14px;color:var(--muted);">Пройдіть тест або натисніть «Додати до архіву».</small></div>`;
    return;
  }

  const totalWords = await countTotalArchived();
  const totalWeeks = (await dbGetAll(STORE_WEEKS)).length;

  el.innerHTML = `
    <div class="arc-stats">
      <div class="arc-stat"><div class="n">${totalWeeks}</div><div class="l">Записів</div></div>
      <div class="arc-stat"><div class="n">${totalWords}</div><div class="l">Слів вивчено</div></div>
    </div>

    <div class="arc-toolbar">
      <input class="arc-search" placeholder="Пошук у архіві…" value="${arcSearch}" oninput="arcSearch=this.value;renderArchive()">
      <button class="btn btn-ghost btn-sm" onclick="if(confirm('Очистити весь архів?'))clearArchive()">Очистити</button>
    </div>

    ${all.map(rec => {
      const words = rec.words;
      return `
      <div class="arc-week">
        <div class="arc-week-hdr" onclick="this.nextElementSibling.classList.toggle('open')">
          <div>
            <div class="wlabel">${rec.label}</div>
            ${rec.bestScore ? `<div style="font-family:DM Mono,monospace;font-size:10px;color:var(--gold);margin-top:2px;">🏆 ${rec.bestScore}%</div>` : ''}
          </div>
          <div class="wmeta">
            <span class="wcount">${words.length} слів</span>
            <span style="color:var(--muted);">▾</span>
            <button class="del-week-btn" title="Видалити тиждень" onclick="event.stopPropagation();deleteArchiveWeek('${rec.weekKey}')">×</button>
          </div>
        </div>
        <div class="arc-week-body">
          ${words.map(eng => {
            const w = findWord(eng);
            if (!w) return '';
            return `<div class="arc-word-row">
              <div>
                <div class="arc-word-en">
                  ${w[0]}
                  <button class="icon-btn" style="width:22px;height:22px;" onclick="speakWord('${w[0].replace(/'/g,"\'")}',this)">${SPEAK_SVG}</button>
                </div>
                <div class="arc-word-pos">${POS_LABELS[w[1]]||w[1]}</div>
              </div>
              <div class="arc-word-uk">${w[2]}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}`;
}

async function countTotalArchived() {
  const all = await dbGetAll(STORE_WEEKS);
  return all.reduce((sum, r) => sum + (r.words?.length||0), 0);
}

async function deleteArchiveWeek(weekKey) {
  if (!confirm('Видалити цей тиждень з архіву?')) return;
  await dbDelete(STORE_WEEKS, weekKey);
  renderArchive();
}

async function clearArchive() {
  const all = await dbGetAll(STORE_WEEKS);
  for (const r of all) await dbDelete(STORE_WEEKS, r.weekKey);
  renderArchive();
}


// ═══════════════════════════════════════════════════════════════
// ALL WORDS VIEW — paginated list
// ═══════════════════════════════════════════════════════════════
const POS_FULL = {noun:'Іменник',verb:'Дієслово',adj:'Прикметник',adv:'Прислівник',phrase:'Фраза'};
let wlPage    = 1;
let wlPerPage = 50;
let wlSearch  = '';
let wlPos     = '';
let wlWeekSet = new Set();   // English words in current week

function wlOnSearch(v) { wlSearch=v; wlPage=1; renderWordList(); }
function wlOnFilter()  { wlPos=document.getElementById('wlPos').value; wlPage=1; renderWordList(); }
function wlOnPerPage() { wlPerPage=+document.getElementById('wlPerPage').value; wlPage=1; renderWordList(); }

function renderWordList() {
  // update week set
  const wd = loadWD();
  wlWeekSet = new Set((wd[WEEK_KEY]?.words || []).map(s=>s.toLowerCase()));

  // filter
  const q = wlSearch.toLowerCase().trim();
  const filtered = WORDS.filter(w => {
    if (wlPos && w[1] !== wlPos) return false;
    if (q && !w[0].toLowerCase().includes(q) && !w[2].toLowerCase().includes(q)) return false;
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / wlPerPage));
  if (wlPage > totalPages) wlPage = totalPages;

  const start = (wlPage-1) * wlPerPage;
  const slice = filtered.slice(start, start + wlPerPage);

  // count badge
  document.getElementById('wlCount').textContent = total + ' слів';

  // word cards
  document.getElementById('wlList').innerHTML =
    slice.length === 0
      ? '<div style="text-align:center;padding:40px;font-family:Playfair Display,serif;font-style:italic;color:var(--muted);font-size:18px;">Нічого не знайдено</div>'
      : `<div class="wl-grid">${slice.map(w => {
          const inWeek = wlWeekSet.has(w[0].toLowerCase());
          const eWord  = w[0].replace(/'/g,"\'");
          return `<div class="wl-card">
            <div class="wl-en">
              ${w[0]}
              <button class="icon-btn" style="width:22px;height:22px;flex-shrink:0;" onclick="speakWord('${eWord}',this)">${SPEAK_SVG}</button>
            </div>
            <div class="wl-pos">${POS_FULL[w[1]]||w[1]}</div>
            <div class="wl-uk">${w[2]}</div>
            ${inWeek
              ? '<div class="wl-week-badge">✓ Цього тижня</div>'
              : `<button class="btn btn-ghost btn-sm" style="font-size:9px;padding:4px 8px;margin-top:4px;align-self:flex-start;" onclick="wlAddToWeek('${eWord}')">+ До тижня</button>`
            }
          </div>`;
        }).join('')}</div>`;

  // pagination
  renderPager(totalPages, total, start, slice.length);
}

function renderPager(totalPages, total, start, count) {
  const end = start + count;
  if (totalPages <= 1) {
    document.getElementById('wlPager').innerHTML =
      `<div class="pg-info">${total} слів</div>`;
    return;
  }

  // build page numbers: always show first, last, current ±2, ellipsis between
  const pages = new Set([1, totalPages, wlPage]);
  for (let i = Math.max(1, wlPage-2); i <= Math.min(totalPages, wlPage+2); i++) pages.add(i);
  const sorted = [...pages].sort((a,b)=>a-b);

  let btns = '';
  // Prev
  btns += `<button class="pg-btn" ${wlPage===1?'disabled':''} onclick="wlGo(${wlPage-1})">‹</button>`;

  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) btns += `<span class="pg-ellipsis">…</span>`;
    btns += `<button class="pg-btn ${p===wlPage?'active':''}" onclick="wlGo(${p})">${p}</button>`;
    prev = p;
  }

  // Next
  btns += `<button class="pg-btn" ${wlPage===totalPages?'disabled':''} onclick="wlGo(${wlPage+1})">›</button>`;

  document.getElementById('wlPager').innerHTML =
    `<div class="pager">${btns}</div>
     <div class="pg-info" style="margin-top:8px;">${start+1}–${end} з ${total} слів · стор. ${wlPage} / ${totalPages}</div>`;
}

function wlGo(p) {
  wlPage = p;
  renderWordList();
  // scroll to top of list
  document.getElementById('wlList').scrollIntoView({ behavior:'smooth', block:'start' });
}

function wlAddToWeek(eng) {
  const data = loadWD();
  const wk   = data[WEEK_KEY];
  if (!wk.words.includes(eng)) {
    if (wk.words.length >= WEEK_LIMIT) {
      saveLimit(Math.min(LIMIT_MAX, WEEK_LIMIT + 1));
      renderWeekLimit();
    }
    wk.words.push(eng);
    saveWD(data);
    showToast('✓ «' + eng + '» додано до тижня');
    renderWordList(); // refresh badges
  }
}

// ═══════════════════════════════════════════════════════════════
// IRREGULAR VERBS
// ═══════════════════════════════════════════════════════════════

// [base, past simple, past participle, ukrainian]
const IRREG_VERBS = [
  ["arise","arose","arisen","виникати, підніматися"],
  ["awake","awoke","awoken","прокидатися"],
  ["be","was / were","been","бути"],
  ["bear","bore","born / borne","народжувати; нести"],
  ["beat","beat","beaten","бити, перемагати"],
  ["become","became","become","ставати"],
  ["begin","began","begun","починати"],
  ["bend","bent","bent","згинати, нахиляти"],
  ["bet","bet","bet","ставити (на кін)"],
  ["bid","bid","bid","пропонувати ціну"],
  ["bind","bound","bound","зв'язувати"],
  ["bite","bit","bitten","кусати"],
  ["bleed","bled","bled","кровоточити"],
  ["blow","blew","blown","дути"],
  ["break","broke","broken","ламати"],
  ["breed","bred","bred","розводити, вирощувати"],
  ["bring","brought","brought","приносити"],
  ["broadcast","broadcast","broadcast","транслювати"],
  ["build","built","built","будувати"],
  ["burn","burnt / burned","burnt / burned","горіти, палити"],
  ["burst","burst","burst","вибухати, лопатися"],
  ["buy","bought","bought","купувати"],
  ["cast","cast","cast","кидати; грати роль"],
  ["catch","caught","caught","ловити"],
  ["choose","chose","chosen","вибирати"],
  ["cling","clung","clung","чіплятися, прилипати"],
  ["come","came","come","приходити"],
  ["cost","cost","cost","коштувати"],
  ["creep","crept","crept","повзати"],
  ["cut","cut","cut","різати"],
  ["deal","dealt","dealt","мати справу; розподіляти"],
  ["dig","dug","dug","копати"],
  ["do","did","done","робити"],
  ["draw","drew","drawn","малювати; тягнути"],
  ["dream","dreamt / dreamed","dreamt / dreamed","мріяти, снити"],
  ["drink","drank","drunk","пити"],
  ["drive","drove","driven","їхати, керувати"],
  ["dwell","dwelt / dwelled","dwelt / dwelled","мешкати, проживати"],
  ["eat","ate","eaten","їсти"],
  ["fall","fell","fallen","падати"],
  ["feed","fed","fed","годувати"],
  ["feel","felt","felt","відчувати"],
  ["fight","fought","fought","боротися, воювати"],
  ["find","found","found","знаходити"],
  ["flee","fled","fled","тікати"],
  ["fling","flung","flung","жбурляти"],
  ["fly","flew","flown","літати"],
  ["forbid","forbade","forbidden","забороняти"],
  ["forget","forgot","forgotten","забувати"],
  ["forgive","forgave","forgiven","пробачати"],
  ["freeze","froze","frozen","замерзати"],
  ["get","got","got / gotten","отримувати, діставати"],
  ["give","gave","given","давати"],
  ["go","went","gone","іти, їхати"],
  ["grind","ground","ground","молоти, перетирати"],
  ["grow","grew","grown","рости, вирощувати"],
  ["hang","hung","hung","вішати"],
  ["have","had","had","мати"],
  ["hear","heard","heard","чути"],
  ["hide","hid","hidden","ховати"],
  ["hit","hit","hit","вдаряти, влучати"],
  ["hold","held","held","тримати"],
  ["hurt","hurt","hurt","ранити, боліти"],
  ["keep","kept","kept","зберігати, тримати"],
  ["kneel","knelt / kneeled","knelt / kneeled","ставати навколішках"],
  ["knit","knit / knitted","knit / knitted","в'язати"],
  ["know","knew","known","знати"],
  ["lay","laid","laid","класти (горизонтально)"],
  ["lead","led","led","вести, очолювати"],
  ["lean","leant / leaned","leant / leaned","нахилятися"],
  ["leap","leapt / leaped","leapt / leaped","стрибати"],
  ["learn","learnt / learned","learnt / learned","вчитися, дізнатися"],
  ["leave","left","left","залишати, їхати"],
  ["lend","lent","lent","позичати (комусь)"],
  ["let","let","let","дозволяти"],
  ["lie","lay","lain","лежати"],
  ["light","lit / lighted","lit / lighted","запалювати, освітлювати"],
  ["lose","lost","lost","губити, програвати"],
  ["make","made","made","робити, виготовляти"],
  ["mean","meant","meant","означати"],
  ["meet","met","met","зустрічати"],
  ["mistake","mistook","mistaken","помилятися"],
  ["overcome","overcame","overcome","долати, перемагати"],
  ["overtake","overtook","overtaken","обганяти, наздоганяти"],
  ["pay","paid","paid","платити"],
  ["put","put","put","класти, ставити"],
  ["quit","quit","quit","кидати, залишати"],
  ["read","read","read","читати"],
  ["rebuild","rebuilt","rebuilt","відбудовувати"],
  ["redo","redid","redone","переробляти"],
  ["ride","rode","ridden","їхати верхи, їздити"],
  ["ring","rang","rung","дзвонити"],
  ["rise","rose","risen","підніматися, вставати"],
  ["run","ran","run","бігти"],
  ["saw","sawed","sawn / sawed","пиляти"],
  ["say","said","said","говорити, казати"],
  ["see","saw","seen","бачити"],
  ["seek","sought","sought","шукати, прагнути"],
  ["sell","sold","sold","продавати"],
  ["send","sent","sent","надсилати, відправляти"],
  ["set","set","set","встановлювати, класти"],
  ["shake","shook","shaken","трясти, стрясати"],
  ["shed","shed","shed","скидати; проливати (сльози)"],
  ["shine","shone / shined","shone / shined","сяяти, світити"],
  ["shoot","shot","shot","стріляти"],
  ["show","showed","shown / showed","показувати"],
  ["shrink","shrank","shrunk","стискатися, усихати"],
  ["shut","shut","shut","зачиняти"],
  ["sing","sang","sung","співати"],
  ["sink","sank","sunk","тонути, занурюватися"],
  ["sit","sat","sat","сидіти"],
  ["sleep","slept","slept","спати"],
  ["slide","slid","slid","ковзати"],
  ["smell","smelt / smelled","smelt / smelled","нюхати, пахнути"],
  ["sow","sowed","sown / sowed","сіяти"],
  ["speak","spoke","spoken","говорити, розмовляти"],
  ["speed","sped / speeded","sped / speeded","мчати, прискорюватися"],
  ["spell","spelt / spelled","spelt / spelled","вимовляти по буквах"],
  ["spend","spent","spent","витрачати; проводити (час)"],
  ["spill","spilt / spilled","spilt / spilled","проливати"],
  ["spin","spun","spun","крутити, прясти"],
  ["spit","spat / spit","spat / spit","плюватися"],
  ["split","split","split","розщеплювати, ділити"],
  ["spoil","spoilt / spoiled","spoilt / spoiled","псувати, розбещувати"],
  ["spread","spread","spread","поширювати, розстилати"],
  ["spring","sprang","sprung","стрибати"],
  ["stand","stood","stood","стояти"],
  ["steal","stole","stolen","красти"],
  ["stick","stuck","stuck","прилипати; встромляти"],
  ["sting","stung","stung","жалити, пекти"],
  ["stink","stank","stunk","смердіти"],
  ["strike","struck","struck / stricken","вдаряти; страйкувати"],
  ["swear","swore","sworn","клястися; лаятися"],
  ["sweep","swept","swept","підмітати"],
  ["swim","swam","swum","плавати"],
  ["swing","swung","swung","гойдати, розгойдуватися"],
  ["take","took","taken","брати, забирати"],
  ["teach","taught","taught","навчати"],
  ["tear","tore","torn","рвати"],
  ["tell","told","told","розповідати, говорити"],
  ["think","thought","thought","думати, вважати"],
  ["throw","threw","thrown","кидати, жбурляти"],
  ["understand","understood","understood","розуміти"],
  ["undertake","undertook","undertaken","братися за справу"],
  ["undo","undid","undone","скасовувати, розв'язувати"],
  ["upset","upset","upset","засмучувати, перекидати"],
  ["wake","woke","woken","прокидатися; будити"],
  ["wear","wore","worn","носити (одяг)"],
  ["weave","wove","woven","ткати, плести"],
  ["weep","wept","wept","плакати"],
  ["win","won","won","вигравати, перемагати"],
  ["wind","wound","wound","намотувати; повертати"],
  ["withdraw","withdrew","withdrawn","відкликати; знімати (гроші)"],
  ["withstand","withstood","withstood","витримувати, протистояти"],
  ["wring","wrung","wrung","вичавлювати, крутити"],
  ["write","wrote","written","писати"],
];

function ivSpeak(form) {
  return form.split(' / ')[0].trim().replace(/'/g, "\\'");
}

function ivRow(v) {
  const SZ = 'style="width:20px;height:20px;flex-shrink:0;"';
  return `<tr>
    <td><span class="iv-base">${v[0]}</span> <button class="icon-btn" ${SZ} onclick="speakWord('${ivSpeak(v[0])}',this)">${SPEAK_SVG}</button></td>
    <td><span class="iv-form">${v[1]}</span> <button class="icon-btn" ${SZ} onclick="speakWord('${ivSpeak(v[1])}',this)">${SPEAK_SVG}</button></td>
    <td><span class="iv-form">${v[2]}</span> <button class="icon-btn" ${SZ} onclick="speakWord('${ivSpeak(v[2])}',this)">${SPEAK_SVG}</button></td>
    <td><span class="iv-uk">${v[3]}</span></td>
  </tr>`;
}

function renderIrregVerbs() {
  const q = (document.getElementById('ivSearch')?.value || '').toLowerCase().trim();
  const filtered = q
    ? IRREG_VERBS.filter(v =>
        v[0].includes(q) || v[1].includes(q) || v[2].includes(q) || v[3].toLowerCase().includes(q))
    : IRREG_VERBS;

  document.getElementById('ivCount').textContent = filtered.length + ' дієслів';

  if (filtered.length === 0) {
    document.getElementById('ivList').innerHTML =
      '<div style="text-align:center;padding:40px;font-family:Playfair Display,serif;font-style:italic;color:var(--muted);font-size:18px;">Нічого не знайдено</div>';
    return;
  }

  const THEAD = '<table class="iv-table"><thead><tr>'
    + '<th>Base form</th><th>Past Simple</th><th>Past Participle</th><th>Переклад</th>'
    + '</tr></thead><tbody>';

  let html = THEAD;

  if (!q) {
    const groups = {};
    filtered.forEach(v => {
      const letter = v[0][0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(v);
    });
    for (const letter of Object.keys(groups).sort()) {
      html += `<tr class="iv-letter-row"><td colspan="4" class="iv-letter-hdr">${letter}</td></tr>`;
      for (const v of groups[letter]) html += ivRow(v);
    }
  } else {
    for (const v of filtered) html += ivRow(v);
  }

  html += '</tbody></table>';
  document.getElementById('ivList').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
fetch(wordsJsonFile())
  .then(r => r.json())
  .then(data => { WORDS = data; })
  .catch(() => console.error('Не вдалося завантажити words.json'))
  .finally(() => {
    openDB().then(async () => {
      await migrateOldWeeks();
      document.getElementById('limitDisplay').textContent = WEEK_LIMIT;
      document.getElementById('totalWordsChip').textContent = WORDS.length + ' слів';
      document.querySelectorAll('.level-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.level === WORD_LEVEL));
      document.querySelectorAll('.lang-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.lang === WORD_LANG));
      renderWeek();
    }).catch(err => {
      console.error('IndexedDB error:', err);
      renderWeek();
    });
  });