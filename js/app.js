// state + ระบบที่ยังไม่ได้แยก
// STATE
const SK = 'wordjar_v4';
let D = {
  words: [], decks: [],
  profile: {
    name: 'User',
    id: 'wj-' + Math.random().toString(36).slice(2,8),
    avatar: 'idle',
    voice: 'en-US',
    voiceSpeed: 0.95,
    autoPlay: true,
    ipaAccent: 'us'
  },  
  todayDone: 0, lastDate: '', studyDays: {}
};
 
let curPage = 'home';
let prevPage = 'words';
let prevDeckCardsPage = 'decks';
const pageIds = ['home','decks','words','account'];
let editDeckId = null, selDCol = '#09090b', activeMenuDeckId = null;
let wordFilters = {
  type: '',
  starred: false,
  lang: 'all'
};

let editWordId = null;          
let detailWordId = null;        
let selectedTypes = new Set();  
let fcQ = [], fcI = 0;
let lList = [], lI = 0;
let currentStudyDeckId = null;
let importTargetDeckId = null; 

// Multi-select State
let isSelectMode = false;
let selectedCards = new Set();

function setWordTypeFilter(type) {
  wordFilters.type = type || '';
  updateWordFilterUI();
  updateWordFilterSummary();
  renderWords();
}

function setWordLangFilter(lang) {
  wordFilters.lang = lang || 'all';
  updateWordFilterUI();
  updateWordFilterSummary();
  renderWords();
}

function toggleWordStarFilter() {
  wordFilters.starred = !wordFilters.starred;
  updateWordFilterUI();
  updateWordFilterSummary();
  renderWords();
}

function resetWordFilters() {
  wordFilters.type = '';
  wordFilters.starred = false;
  wordFilters.lang = 'all';
  updateWordFilterUI();
  updateWordFilterSummary();
  renderWords();
}

function updateWordFilterUI() {
  const type = wordFilters.type || '';

  const typeMap = {
    '': 'filterTypeAllBox',
    N: 'filterTypeNBox',
    V: 'filterTypeVBox',
    ADJ: 'filterTypeADJBox',
    ADV: 'filterTypeADVBox',
    ART: 'filterTypeARTBox',
    PRON: 'filterTypePRONBox',
    PHR: 'filterTypePHRBox',
    IDM: 'filterTypeIDMBox'
  };

  Object.values(typeMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('checked');
  });

  const activeType = document.getElementById(typeMap[type] || typeMap['']);
  if (activeType) activeType.classList.add('checked');

  const starBox = document.getElementById('filterStarBox');
  if (starBox) starBox.classList.toggle('checked', !!wordFilters.starred);

  const lang = wordFilters.lang || 'all';

  const langMap = {
    all: 'filterLangAllBox',
    en: 'filterLangEnBox',
    ja: 'filterLangJaBox'
  };

  Object.values(langMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('checked');
  });

  const activeLang = document.getElementById(langMap[lang] || langMap.all);
  if (activeLang) activeLang.classList.add('checked');
}

function updateWordFilterSummary() {
  const el = document.getElementById('wordFilterSummary');
  if (!el) return;

  const typeLabelMap = {
    '': 'All types',
    N: 'Noun',
    V: 'Verb',
    ADJ: 'Adjective',
    ADV: 'Adverb',
    ART: 'Article',
    PRON: 'Pronoun',
    PHR: 'Phrase',
    IDM: 'Idiom'
  };

  const typeText = typeLabelMap[wordFilters.type || ''] || 'All types';

  const langText =
    wordFilters.lang === 'en' ? 'English' :
    wordFilters.lang === 'ja' ? 'Japanese' :
    'All languages';

  const starText = wordFilters.starred ? ' · Starred' : '';

  el.textContent = `${typeText} · ${langText}${starText}`;
}

function openWordFilterModal() {
  updateWordFilterUI();
  updateWordFilterSummary();
  openO('wordFilterModal');
}

function sm2(w, q) {
  let { interval: iv=1, reps=0, ef=2.5 } = w;
  if (q === 0) { iv = 1; reps = 0; }
  else if (q === 3) { iv = Math.max(1, Math.round(iv * 1.2)); ef = Math.max(1.3, ef - 0.15); }
  else if (q === 4) { iv = reps===0?1:reps===1?6:Math.round(iv*ef); reps++; }
  else if (q === 5) { iv = reps===0?1:reps===1?6:Math.round(iv*ef*1.3); reps++; ef = Math.min(3, ef+0.1); }
  const nx = new Date(); nx.setDate(nx.getDate() + iv);
  w.interval = iv; w.reps = reps; w.ef = parseFloat(ef.toFixed(2));
  w.nextReview = nx.toISOString().split('T')[0];
}
function isDue(w) { return !w.nextReview || w.nextReview <= today(); }
function streak() { let s=0; const td=new Date(); for (let i=0; i<365; i++) { const d=new Date(td); d.setDate(td.getDate()-i); if (D.studyDays[d.toDateString()]) s++; else break; } return s; }

// DECK CARDS & Multi-select
function viewDeckCards() {
  prevDeckCardsPage = curPage;
  const d = D.decks.find(x => x.id === currentStudyDeckId);
  if(!d) return;
  document.getElementById('dcTitle').textContent = `Cards in ${d.name}`;
  document.getElementById('dcTitle').style.color = d.color || 'var(--ink)';
  isSelectMode = false;
  selectedCards.clear();
  document.getElementById('btnSelectCards').textContent = 'Select';
  updateSelectActions();
  renderDeckCards();
  nav('deck-cards');
}

function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  selectedCards.clear();
  document.getElementById('btnSelectCards').textContent = isSelectMode ? 'Cancel' : 'Select';
  updateSelectActions();
  renderDeckCards();
}

function toggleCardSelection(id) {
  if (selectedCards.has(id)) selectedCards.delete(id);
  else selectedCards.add(id);
  updateSelectActions();
  renderDeckCards();
}

function updateSelectActions() {
  const cnt = selectedCards.size;
  const bar = document.getElementById('cardSelectActions');
  const listWrap = document.getElementById('deckCardsList');
  const badge = document.getElementById('selectCountBadge');

  if (badge) {
    badge.textContent = `${cnt} selected`;
  }

  if (!bar || !listWrap) return;

  if (isSelectMode) {
    bar.style.display = 'block';
    listWrap.style.paddingBottom = '150px';
  } else {
    bar.style.display = 'none';
    listWrap.style.paddingBottom = '20px';
  }
}

function renderDeckCards() {
  const list = D.words.filter(w => String(w.deckId) === String(currentStudyDeckId));
  const el = document.getElementById('deckCardsList');

  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="empty-title">No cards found</div></div>`;
    return;
  }

  el.innerHTML = list.slice().reverse().map(w => {
    const id = String(w.id || '');
    const isSel = selectedCards.has(id);

    const safeId = escHTML(id);
    const safeWord = escHTML(w.word);
    const safeMeaning = escHTML(w.meaning);

    const selectCircle = isSelectMode ? `
      <div class="select-circle ${isSel ? 'selected' : ''}">
        ${isSel ? `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ` : ''}
      </div>
    ` : '';

    const shareBtn = !isSelectMode ? `
      <div class="wr-actions">
        <button class="ib" type="button" onclick="event.stopPropagation(); shareWordById('${safeId}')" title="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
      </div>
    ` : '';

    const clickAction = isSelectMode
      ? `toggleCardSelection('${safeId}')`
      : `showDetail('${safeId}')`;

    return `
      <div class="wr deck-card-selectable ${isSel ? 'selected-card' : ''}" data-card-id="${safeId}" onclick="${clickAction}">
        ${selectCircle}
        <div class="wm">
          <div class="wen">${safeWord}</div>
          <div class="wth">${safeMeaning}</div>
        </div>
        <div class="wr-right">${shareBtn}</div>
      </div>
    `;
  }).join('');
}

function toggleCardSelection(id) {
  const sid = String(id);

  if (selectedCards.has(sid)) {
    selectedCards.delete(sid);
  } else {
    selectedCards.add(sid);
  }

  updateSelectActions();
  renderDeckCards();
}

function deleteSelectedCards() {
  if (selectedCards.size === 0) {
    toast('No cards selected');
    return;
  }

  const count = selectedCards.size;

  if (!confirm(`Delete ${count} selected cards?`)) return;

  D.words = D.words.filter(w => !selectedCards.has(String(w.id)));

  selectedCards.clear();
  isSelectMode = false;

  save();

  const btn = document.getElementById('btnSelectCards');
  if (btn) btn.textContent = 'Select';

  updateSelectActions();
  renderDeckCards();
  renderWords();
  renderDecks();
  updateHome();

  toast(`${count} cards deleted`);
}

function openMoveSelectedModal() {
  if (selectedCards.size === 0) {
    toast('No cards selected');
    return;
  }

  const targetDecks = D.decks.filter(d => String(d.id) !== String(currentStudyDeckId));

  if (!targetDecks.length) {
    toast('No other deck available');
    return;
  }

  const sel = document.getElementById('moveDestDeck');
  if (!sel) {
    toast('Move modal not found');
    return;
  }

  sel.innerHTML = targetDecks
    .map(d => `<option value="${escHTML(d.id)}">${escHTML(d.name)}</option>`)
    .join('');

  openO('moveCardsModal');
}

function moveSelectedCards() {
  if (selectedCards.size === 0) {
    toast('No cards selected');
    return;
  }

  const targetId = document.getElementById('moveDestDeck')?.value;
  if (!targetId) {
    toast('No destination deck');
    return;
  }

  let count = 0;

  D.words.forEach(w => {
    if (selectedCards.has(String(w.id))) {
      w.deckId = targetId;
      count++;
    }
  });

  selectedCards.clear();
  isSelectMode = false;

  save();

  closeO('moveCardsModal');

  const btn = document.getElementById('btnSelectCards');
  if (btn) btn.textContent = 'Select';

  updateSelectActions();
  renderDeckCards();
  renderWords();
  renderDecks();
  updateHome();

  toast(`${count} cards moved`);
}
function escHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shareWordById(id) {
  const w = D.words.find(x => x.id === id);
  if (!w) return;
  shareWord(w.word, w.meaning, w.example || '');
}
function shareWord(word, meaning, example) {
  const text = `${word} - ${meaning}${example ? `\nEx: ${example}` : ''}`;
  if (navigator.share) { navigator.share({ title: word, text: text }).catch(()=>{}); }
  else { navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard!")); }
}

// MODALS (WORD & DETAIL)
function populateDecks(sel) { document.getElementById('fDeck').innerHTML = D.decks.map(d => `<option value="${d.id}" ${d.id===sel?'selected':''}>${d.name}</option>`).join(''); }

function openWordModal(id, deckId) {
  prevPage = curPage;
  editWordId = id || null;

  const w = id ? D.words.find(x => x.id === id) : null;

  document.getElementById('wmTitle').textContent = id ? 'Edit Word' : 'Add New Word';
  document.getElementById('wDel').style.display = id ? 'flex' : 'none';

  document.getElementById('fWord').value = w ? w.word : '';
  document.getElementById('fPron').value = w ? (w.pronunciation || '') : '';
  document.getElementById('fMeaning').value = w ? w.meaning : '';
  document.getElementById('fEx').value = w ? (w.example || '') : '';
  document.getElementById('fNotes').value = w ? (w.notes || '') : '';

  selectedTypes.clear();

  if (w && w.type) {
    w.type.split(',').forEach(t => selectedTypes.add(t.trim().toUpperCase()));
  }

  document.querySelectorAll('#typePills .tp').forEach(p => {
    p.classList.toggle('sel', selectedTypes.has(p.dataset.t));
  });

  populateDecks(deckId || (w ? w.deckId : null) || (D.decks[0]?.id || 'd1'));

  setAutoFillStatus('', '');

  openO('wordModal');
}

function selT(el) { const t = el.dataset.t; if (selectedTypes.has(t)) { selectedTypes.delete(t); el.classList.remove('sel'); } else { selectedTypes.add(t); el.classList.add('sel'); } }

function saveWord() {
  const word = document.getElementById('fWord').value.trim(); 
  const meaning = document.getElementById('fMeaning').value.trim();
  const deckId = document.getElementById('fDeck').value;

  if (!word || !meaning) {
    toast('Please fill in required fields');
    return;
  }

  const normalizedWord = word.toLowerCase();

  const duplicateWords = D.words.filter(w =>
    w.id !== editWordId &&
    String(w.word || '').trim().toLowerCase() === normalizedWord
  );

  if (duplicateWords.length > 0) {
    const sameDeck = duplicateWords.some(w => w.deckId === deckId);

    const ok = window.confirm(
      sameDeck
        ? 'This word already exists in this deck. Add it again?'
        : 'This word already exists in another deck. Add it again?'
    );

    if (!ok) {
      toast('Cancelled');
      return;
    }
  }

  const typeStr = [...selectedTypes].join(', ') || 'N';

  const data = { 
    word,
    meaning,
    type: typeStr,
    deckId,
    lang: /[\u3040-\u30ff\u3400-\u9fff]/.test(word) ? 'ja' : 'en',
    pronunciation: document.getElementById('fPron').value.trim(),
    example: document.getElementById('fEx').value.trim(), 
    notes: document.getElementById('fNotes').value.trim() 
  };
  
  if (editWordId) { 
    Object.assign(D.words.find(x => x.id===editWordId), data); 
    toast('Updated'); 
  } else { 
    D.words.push({ id:'w'+Date.now(), ...data, starred:false, addedDate:today(), interval:1, reps:0, ef:2.5, nextReview:null }); 
    toast('Added!'); 
  }
  
  save();
  document.getElementById('wordModal').classList.remove('open');
  document.getElementById('detailModal').classList.remove('open');
  
  setTimeout(() => {
    renderWords();
    updateHome();
    renderDecks();

    if (prevPage === 'deck-cards') {
      renderDeckCards();
      nav('deck-cards');
    } else if (prevPage === 'deck-overview') {
      showDeckOverview(currentStudyDeckId);
    } else if (prevPage === 'words') {
      nav('words');
    } else if (prevPage === 'decks') {
      nav('decks');
    } else if (prevPage === 'home') {
      nav('home');
    }
  }, 50);
}

function deleteWord() {
  if (!confirm('Delete this word?')) return;
  D.words = D.words.filter(x => x.id!==editWordId);
  save();
  closeO('wordModal');
  closeO('detailModal');
  renderWords();
  renderDecks();
  updateHome();
  toast('Deleted');
  setTimeout(() => {
    if (prevPage === 'deck-cards') { renderDeckCards(); nav('deck-cards'); }
    else if (prevPage === 'deck-overview') { showDeckOverview(currentStudyDeckId); }
  }, 50);
}

function editFromDetail() {
  closeO('detailModal');
  setTimeout(() => {
    prevPage = curPage;
    openWordModal(detailWordId);
  }, 150);
}

function showDetail(id) {
  detailWordId = id; const w = D.words.find(x => x.id === id); if (!w) return;
  const typeDisplay = (w.type || 'N').split(',')[0].trim().toUpperCase();
  document.getElementById('dtTypeWrap').innerHTML = `<div class="tag-pill">${typeDisplay}</div>`;
  document.getElementById('dtWord').textContent = w.word; document.getElementById('dtPlayBtn').onclick = () => speak(w.word);
  document.getElementById('dtPron').textContent = w.pronunciation || ''; document.getElementById('dtMeaning').textContent = w.meaning;
  document.getElementById('dtSm2').innerHTML = `<div class="sm2c"><div style="font-weight:700; color:var(--ink);">${w.interval || 1}d</div><div style="font-size:12px; color:var(--ink3);">Interval</div></div><div class="sm2c"><div style="font-weight:700; color:var(--ink);">${w.ef || 2.5}</div><div style="font-size:12px; color:var(--ink3);">Ease</div></div><div class="sm2c"><div style="font-weight:700; color:var(--ink);">${w.reps || 0}</div><div style="font-size:12px; color:var(--ink3);">Reps</div></div>`;
  const exSec = document.getElementById('dtExSec'); if (w.example) { exSec.style.display = 'block'; document.getElementById('dtEx').textContent = `"${w.example}"`; document.getElementById('dtExTts').onclick = () => speak(w.example); } else { exSec.style.display = 'none'; }
  const ntSec = document.getElementById('dtNtSec'); if (w.notes) { ntSec.style.display = 'block'; document.getElementById('dtNotes').textContent = w.notes; } else { ntSec.style.display = 'none'; }
  openO('detailModal');
}

// FLASHCARD (3D FLIP FIXED LAYOUT)
function startFC(deckIdOverride) {
  const dId = deckIdOverride !== undefined ? deckIdOverride : currentStudyDeckId;
  if (dId) {
    fcQ = D.words.filter(w => w.deckId === dId && isDue(w));
    if (!fcQ.length) fcQ = D.words.filter(w=>w.deckId===dId).sort(()=>Math.random()-.5).slice(0,12);
  } else {
    fcQ = D.words.filter(isDue); 
    if (!fcQ.length) fcQ = [...D.words].sort(() => Math.random()-.5).slice(0, 12);
  }
  if (!fcQ.length) { toast('No cards available!'); return; }
  fcI = 0; nav('fc'); renderFC();
}

function startDeckSession() { startFC(currentStudyDeckId); }

function renderFC() {
  const done = document.getElementById('fcDone'), main = document.getElementById('fcMain');
  if (fcI >= fcQ.length) { main.style.display='none'; done.style.display='flex'; return; }
  main.style.display='flex'; done.style.display='none';
  const w = fcQ[fcI];
  const dk = D.decks.find(d => d.id===w.deckId);
  let remN = 0, remL = 0, remR = 0;
  for(let i=fcI; i<fcQ.length; i++){
    let cw = fcQ[i];
    if (cw.reps === 0) remN++;
    else if (cw.interval < 21) remL++;
    else remR++;
  }
  document.getElementById('fcStatsTop').innerHTML = `<span class="fc-s-n">${remN}</span><span class="fc-s-plus">+</span><span class="fc-s-l">${remL}</span><span class="fc-s-plus">+</span><span class="fc-s-r">${remR}</span>`;
  const inner = document.getElementById('fcCardInner');
  inner.classList.remove('flipped');
  const deckTagHtml = dk ? `<div class="tag-pill" style="color:${dk.color||'var(--ink)'}">${dk.name}</div>` : '';
  const typeTagHtml = `<div class="tag-pill">${(w.type || 'N').split(',')[0].toUpperCase()}</div>`;
  document.getElementById('fcTagsF').innerHTML = deckTagHtml + typeTagHtml;
  document.getElementById('fcTagsB').innerHTML = deckTagHtml + typeTagHtml;
  document.getElementById('fcWordF').textContent = w.word;
  document.getElementById('fcPronF').textContent = w.pronunciation || '';
  document.getElementById('fcWordB').textContent = w.word;
  document.getElementById('fcPronB').textContent = w.pronunciation || '';
  document.getElementById('fcMeaning').textContent = w.meaning;
  const ex = document.getElementById('fcEx');
  ex.textContent = w.example ? `"${w.example}"` : '';
  document.getElementById('fcExWrap').style.display = w.example ? 'block' : 'none';
  const nt = document.getElementById('fcNt');
  if (w.notes && w.notes.trim() !== "" && w.notes.trim() !== "-") { nt.textContent = w.notes; document.getElementById('fcNtWrap').style.display = 'block'; } 
  else { document.getElementById('fcNtWrap').style.display = 'none'; }
  const btnEx = document.getElementById('fcPlayEx');
  if(btnEx) btnEx.style.display = w.example ? 'flex' : 'none';
  if(D.profile.autoPlay) setTimeout(() => speak(w.word), 150);
}

function revealFC() {
  const inner = document.getElementById('fcCardInner');
  if (inner.classList.contains('flipped')) return;
  inner.classList.add('flipped');
  const w = fcQ[fcI];
  if (w && D.profile.autoPlay) speakSequence(w.word, w.example || '');
}

function rateFC(q) {
  const w = fcQ[fcI]; sm2(w, q); if (q >= 3) { D.todayDone++; markStudied(); }
  save(); fcI++; renderFC();
}

// LEARN / STUDY MODE (Delegates to WordJar Study UI)
function startLearn(deckId = null) {
  if (typeof window.openStudyDeckPicker === 'function' && !deckId) {
    window.openStudyDeckPicker();
  } else if (typeof window.openStudyWordSelect === 'function' && deckId) {
    window.openStudyWordSelect(deckId);
  } else {
    lList = [...D.words].filter(w => !deckId || String(w.deckId) === String(deckId));
    if (!lList.length) { toast('Add some words first!'); return; }
    lI = 0; nav('learn'); renderLearn();
  }
}
function renderLearn() {
  if (typeof window.renderLearn === 'function' && window.renderLearn !== renderLearn) {
    window.renderLearn();
    return;
  }
  const done = document.getElementById('lDone'), main = document.getElementById('lMain');
  if (!Array.isArray(lList) || !lList.length || lI >= lList.length) {
    if (main) main.style.display='none';
    if (done) done.style.display='flex';
    return;
  }
  if (main) main.style.display='flex';
  if (done) done.style.display='none';
  const w = lList[lI];
  const cntEl = document.getElementById('lCnt');
  if (cntEl) cntEl.textContent = `Word ${lI+1} of ${lList.length}`;
  const s = (w.example||`"${w.word}" is used in context.`).replace(new RegExp('\\b'+(w.word || '').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi'), m => `<span class="hl">${m}</span>`);
  const sentEl = document.getElementById('lSentence');
  if (sentEl) sentEl.innerHTML = `"${s}"`;
  const wordEl = document.getElementById('lWord');
  if (wordEl) wordEl.textContent = w.word;
  const pronEl = document.getElementById('lPron');
  if (pronEl) pronEl.textContent = w.pronunciation ? `/${w.pronunciation}/` : '';
  const meanEl = document.getElementById('lMeaning');
  if (meanEl) meanEl.textContent = w.meaning;
  const typeDisplay = (w.type || 'N').split(',')[0].toUpperCase();
  const tagsEl = document.getElementById('lTags');
  if (tagsEl) tagsEl.innerHTML = `<div class="tag-pill">${typeDisplay}</div>`;
  const btnEx = document.getElementById('lPlayEx');
  if (btnEx) btnEx.style.display = w.example ? 'flex' : 'none';
  if(D.profile.autoPlay && typeof speak === 'function') setTimeout(() => speak(w.word), 150);
}
function nextLearn() {
  if (typeof window.nextLearn === 'function' && window.nextLearn !== nextLearn) {
    window.nextLearn();
    return;
  }
  D.todayDone++;
  markStudied();
  save();
  lI++;
  renderLearn();
  updateHome();
}
const AVATAR_SETS = [
  {
    id: 'rabbit',
    name: 'Rabbit',
    cover: 'assets/avatars/BunnyIdle.gif',
    avatars: [
      { id: 'idle', name: 'Idle', src: 'assets/avatars/BunnyIdle.gif' },
      { id: 'run', name: 'Run', src: 'assets/avatars/BunnyRun.gif' },
      { id: 'jump', name: 'Jump', src: 'assets/avatars/BunnyJump.gif' },
      { id: 'sit', name: 'Sitting', src: 'assets/avatars/BunnySitting.gif' },
      { id: 'sleep', name: 'Sleep', src: 'assets/avatars/BunnySleep.gif' },
      { id: 'carrot', name: 'Carrot Skill', src: 'assets/avatars/BunnyCarrotSkill.gif' },
      { id: 'hurt', name: 'Hurt', src: 'assets/avatars/BunnyHurt.gif' },
      { id: 'attack', name: 'Attack', src: 'assets/avatars/BunnyAttack.gif' },
      { id: 'lie', name: 'Lie Down', src: 'assets/avatars/BunnyLieDown.gif' },
      { id: 'dead', name: 'Dead', src: 'assets/avatars/BunnyDead.gif' }
    ]
  },
  {
    id: 'frog',
    name: 'Frog',
    cover: 'assets/avatars/FrogIdle.gif',
    avatars: [
      { id: 'frog-idle', name: 'Idle', src: 'assets/avatars/FrogIdle.gif' },
      { id: 'frog-jump', name: 'Jump', src: 'assets/avatars/FrogJump.gif' },
      { id: 'frog-land', name: 'Land', src: 'assets/avatars/FrogLand.gif' },
      { id: 'frog-fall', name: 'Fall', src: 'assets/avatars/FrogFall.gif' },
      { id: 'frog-hurt', name: 'Hurt', src: 'assets/avatars/FrogHurt.gif' },
      { id: 'frog-death', name: 'Death', src: 'assets/avatars/FrogDeath.gif' }
    ]
  },
  {
    id: 'ducky',
    name: 'Ducky',
    cover: 'assets/avatars/Duckyidle.gif',
    avatars: [
      { id: 'ducky-idle', name: 'Idle', src: 'assets/avatars/Duckyidle.gif' },
      { id: 'ducky-walk', name: 'Walk', src: 'assets/avatars/Duckywalk.gif' },
      { id: 'ducky-jump', name: 'Jump', src: 'assets/avatars/Duckyjump.gif' },
      { id: 'ducky-land', name: 'Land', src: 'assets/avatars/Duckyland.gif' },
      { id: 'ducky-fall', name: 'Fall', src: 'assets/avatars/Duckyfall.gif' },
      { id: 'ducky-fall-2', name: 'Fall 2', src: 'assets/avatars/Duckyfall_2.gif' },
      { id: 'ducky-death', name: 'Death', src: 'assets/avatars/Duckydeath.gif' },
      { id: 'ducky-hit', name: 'Hit', src: 'assets/avatars/Duckyhit.gif' },
      { id: 'ducky-wall-hit', name: 'Wall Hit', src: 'assets/avatars/Duckywall_hit.gif' },
      { id: 'ducky-wall-slide', name: 'Wall Slide', src: 'assets/avatars/Duckywall_slide.gif' },
      { id: 'ducky-climb-back', name: 'Climb Back', src: 'assets/avatars/DuckyClimbBack.gif' },
      { id: 'ducky-crouch', name: 'Crouch', src: 'assets/avatars/Duckycrouch.gif' },
      { id: 'ducky-crouch-walk', name: 'Crouch Walk', src: 'assets/avatars/Duckycrouch_walk.gif' },
      { id: 'ducky-floating-flap', name: 'Floating Flap', src: 'assets/avatars/Duckyfloating_flap.gif' },
      { id: 'ducky-inhale-start', name: 'Inhale Start', src: 'assets/avatars/Duckyinhale_start.gif' },
      { id: 'ducky-inhale-float', name: 'Inhale Float', src: 'assets/avatars/Duckyinhale_float.gif' },
      { id: 'ducky-inhaling', name: 'Inhaling', src: 'assets/avatars/Duckyinhaling.gif' },
      { id: 'ducky-jump-fall-land', name: 'Jump Fall Land', src: 'assets/avatars/Duckyjump_fall_land.gif' },
      { id: 'ducky-ledge-grab', name: 'Ledge Grab', src: 'assets/avatars/Duckyledge_grab.gif' },
      { id: 'ducky-multi-jump', name: 'Multi Jump', src: 'assets/avatars/Duckymulti_jump.gif' },
      { id: 'ducky-left-jab', name: 'Left Jab', src: 'assets/avatars/Duckyleft_jab.gif' },
      { id: 'ducky-right-hook', name: 'Right Hook', src: 'assets/avatars/Duckyright_hook.gif' },
      { id: 'ducky-right-left-combo', name: 'Right Left Combo', src: 'assets/avatars/Duckyright_left_combo.gif' },
      { id: 'ducky-smash-f', name: 'Forward Smash', src: 'assets/avatars/Duckyf_smash.gif' },
      { id: 'ducky-tilt-f', name: 'Forward Tilt', src: 'assets/avatars/Duckyf_tilt.gif' },
      { id: 'ducky-smash-u', name: 'Up Smash', src: 'assets/avatars/Duckyu_smash.gif' },
      { id: 'ducky-tilt-u', name: 'Up Tilt', src: 'assets/avatars/Duckyu_tilt.gif' },
      { id: 'ducky-roll-1', name: 'Roll 1', src: 'assets/avatars/Duckyroll_1.gif' },
      { id: 'ducky-roll-2', name: 'Roll 2', src: 'assets/avatars/Duckyroll_2.gif' },
      { id: 'ducky-shield', name: 'Shield', src: 'assets/avatars/Duckyshield.gif' }
    ]
  }
];
const AVATAR_SET_PLACEHOLDERS = 5;
let selectedAvatar = 'idle';
let avatarPickerMode = 'sets';
let activeAvatarSetId = null;

function getAllAvatars() {
  return AVATAR_SETS.flatMap(set => set.avatars);
}

function getAvatarSrc(id) {
  return (getAllAvatars().find(a => a.id === id) || AVATAR_SETS[0].avatars[0]).src;
}

function getFreshGifSrc(src) {
  if (!src) return '';
  if (!src.toLowerCase().endsWith('.gif')) return src;

  const joiner = src.includes('?') ? '&' : '?';
  return `${src}${joiner}t=${Date.now()}`;
}
  
function getAvatarSetByAvatarId(id) {
  return AVATAR_SETS.find(set => set.avatars.some(a => a.id === id)) || AVATAR_SETS[0];
}

function renderAvatarSetGrid() {
  const grid = document.getElementById('avatarGrid');
  const head = document.getElementById('avatarPickerHead');
  if (!grid) return;

  if (head) {
    head.innerHTML = `
      <div>
        <div class="avatar-picker-title">Choose a character set</div>
        <div class="avatar-coming-note">More avatar sets are coming in future updates.</div>
      </div>
    `;
  }

  const currentSet = getAvatarSetByAvatarId(selectedAvatar);

  const setCards = AVATAR_SETS.map(set => `
    <button type="button" class="avatar-set-card avatar-set-${set.id} ${set.id === currentSet.id ? 'sel' : ''}" onclick="openAvatarSet('${set.id}')" title="${set.name}">
      <img src="${set.cover}" alt="${set.name}">
    </button>
  `).join('');

  const placeholders = Array.from({ length: AVATAR_SET_PLACEHOLDERS }, () =>
    `<div class="avatar-slot-placeholder" title="More avatar sets are coming in future updates." aria-hidden="true"></div>`
  ).join('');

  grid.innerHTML = setCards + placeholders;
}

function renderAvatarChoiceGrid(setId) {
  const grid = document.getElementById('avatarGrid');
  const head = document.getElementById('avatarPickerHead');
  const set = AVATAR_SETS.find(s => s.id === setId) || AVATAR_SETS[0];
  if (!grid) return;

  if (head) {
    head.innerHTML = `
      <button type="button" class="avatar-back-btn" onclick="backToAvatarSets()">Back</button>
      <div class="avatar-picker-title">${set.name}</div>
    `;
  }

  grid.innerHTML = set.avatars.map(a => `
    <button type="button" class="avatar-choice ${a.id === selectedAvatar ? 'sel' : ''}" onclick="selectAvatar('${a.id}')" title="${a.name}">
      <img src="${a.src}" alt="${a.name}">
    </button>
  `).join('');
}

function renderAvatarGrid() {
  if (avatarPickerMode === 'choices') {
    const fallbackSet = getAvatarSetByAvatarId(selectedAvatar);
    renderAvatarChoiceGrid(activeAvatarSetId || fallbackSet.id);
  } else {
    renderAvatarSetGrid();
  }
}
  
function openAvatarSet(setId) {
  avatarPickerMode = 'choices';
  activeAvatarSetId = setId;
  renderAvatarGrid();
}

function backToAvatarSets() {
  avatarPickerMode = 'sets';
  activeAvatarSetId = null;
  renderAvatarGrid();
}

function selectAvatar(id) {
  selectedAvatar = id;
  renderAvatarGrid();
}

function updateAccount() {
  D.profile = D.profile || {};
  if (!D.profile.name) D.profile.name = 'User';
  if (!D.profile.avatar) D.profile.avatar = 'idle';

  document.getElementById('accName').textContent = D.profile.name;

  const av = document.getElementById('avIcon');
  if (!av) return;

  const src = getFreshGifSrc(getAvatarSrc(D.profile.avatar));

  av.innerHTML = `
    <img
      src="${src}"
      alt=""
      loading="eager"
      decoding="sync"
    >
  `;
}

function openProfileModal() {
  D.profile = D.profile || {};
  selectedAvatar = D.profile.avatar || 'idle';
  avatarPickerMode = 'sets';
  activeAvatarSetId = null;

  const nameInput = document.getElementById('pName');
  if (nameInput) nameInput.value = D.profile.name || 'User';

  openO('profileModal');
  renderAvatarGrid();
}

function saveProfile() {
  const n = document.getElementById('pName').value.trim();
  if (!n) return toast('Name is required');

  D.profile.name = n;
  D.profile.avatar = selectedAvatar || 'idle';

  save();
  updateAccount();
  closeO('profileModal');
  toast('Profile updated');
}

function openVoiceModal() {
  document.getElementById('vAccent').value = D.profile.voice || 'en-US';
  document.getElementById('vSpeed').value = D.profile.voiceSpeed || 0.95;
  document.getElementById('vAutoPlay').checked = D.profile.autoPlay !== false;

  const ipaEl = document.getElementById('vIpaAccent');
  if (ipaEl) ipaEl.value = D.profile.ipaAccent || 'us';

  openO('voiceModal');
}

function saveVoiceSettings() {
  D.profile.voice = document.getElementById('vAccent').value;
  D.profile.voiceSpeed = parseFloat(document.getElementById('vSpeed').value);
  D.profile.autoPlay = document.getElementById('vAutoPlay').checked;

  const ipaEl = document.getElementById('vIpaAccent');
  if (ipaEl) D.profile.ipaAccent = ipaEl.value || 'us';

  save();
  closeO('voiceModal');
  toast('Voice settings saved');
}
function clearAll() { if (!confirm('Are you sure you want to delete ALL data?')) return; D.words=[]; D.decks=[{id:'d1',name:'Default',desc:'',color:'#09090b'}]; D.todayDone=0; D.studyDays={}; save(); updateAccount(); renderDecks(); renderWords(); updateHome(); toast('Data reset'); }

// TEXT TO SPEECH
function getBestVoice(langCode) {
  const voices = window.speechSynthesis.getVoices(); const targetLang = langCode.toLowerCase().replace('_', '-');
  let best = voices.find(v => v.lang.toLowerCase() === targetLang && (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Siri') || v.name.includes('Natural')));
  if (!best) best = voices.find(v => v.lang.toLowerCase() === targetLang);
  if (!best) best = voices.find(v => v.lang.toLowerCase().includes('en'));
  return best;
}
function speak(text) {
  if (!window.speechSynthesis) return; window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); const userAccent = D.profile.voice || 'en-US'; u.lang = userAccent;
  const voice = getBestVoice(userAccent); if (voice) u.voice = voice;
  u.rate = D.profile.voiceSpeed || 0.95; u.pitch = 1; window.speechSynthesis.speak(u);
}
function speakSequence(word, example) {
  if (!window.speechSynthesis) return; window.speechSynthesis.cancel();
  const userAccent = D.profile.voice || 'en-US'; const voice = getBestVoice(userAccent); const speed = D.profile.voiceSpeed || 0.95;
  const u1 = new SpeechSynthesisUtterance(word); u1.lang = userAccent; if (voice) u1.voice = voice; u1.rate = speed; 
  if (example) { u1.onend = () => { setTimeout(() => { const u2 = new SpeechSynthesisUtterance(example); u2.lang = userAccent; if (voice) u2.voice = voice; u2.rate = speed; window.speechSynthesis.speak(u2); }, 500); }; }
  window.speechSynthesis.speak(u1);
}
if (speechSynthesis.onvoiceschanged !== undefined) { speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
function playFCWord(e) { e.stopPropagation(); if (fcQ[fcI]) speak(fcQ[fcI].word); }
function playFCEx(e) { e.stopPropagation(); if (fcQ[fcI] && fcQ[fcI].example) speak(fcQ[fcI].example); }
function playLearnWord(e) { e.stopPropagation(); if (lList[lI]) speak(lList[lI].word); }
function playLearnEx(e) { e.stopPropagation(); if (lList[lI] && lList[lI].example) speak(lList[lI].example); }


// OVERLAY LISTENER
document.querySelectorAll('.overlay').forEach(m => {
  m.addEventListener('mousedown', e => { if(e.target === m) closeO(m.id); }); 
});

// ★ Splash: WordJar หายไปก่อน แล้วค่อยโชว์ Ducky GIF จากนั้นเข้า Home ทันที
window.addEventListener('load', () => {
  const splash = document.getElementById('splashScreen');
  const word = document.getElementById('splashWord');
  const gifStage = document.getElementById('splashGifStage');

  if (!splash || !word || !gifStage) return;

  setTimeout(() => {
    word.classList.remove('active');
  }, 360);

  setTimeout(() => {
    gifStage.classList.add('active');
  }, 520);

  setTimeout(() => {
    splash.classList.add('hidden');
  }, 1500);
});

load();
seedIfEmpty();
updateHome();
updateAccount();
initCloudSync();
