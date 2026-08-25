// modal / navigation / render หลักบางส่วน
// modal Add Word
function openO(id) { document.getElementById(id).classList.add('open'); }
function closeO(id) { document.getElementById(id).classList.remove('open'); }
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

// navigation
function nav(p) {
  pageIds.forEach(id => { const el=document.getElementById('pg-'+id); if(el) el.classList.remove('active'); });
  ['fc','learn','deck-overview','deck-cards','study-deck-select','study-word-select'].forEach(id => { const el=document.getElementById('pg-'+id); if(el) el.classList.remove('active'); });
  document.querySelectorAll('.top-btn').forEach(n => n.classList.remove('active'));
  
  const el = document.getElementById('pg-'+p);
  if (el) el.classList.add('active');
  const tb = document.getElementById('tb-'+p);
  if (tb) tb.classList.add('active'); else document.getElementById('tb-home').classList.add('active');

  const header = document.getElementById('mainHeader');
  if(p === 'fc' || p === 'learn' || p === 'deck-overview' || p === 'deck-cards' || p === 'study-deck-select' || p === 'study-word-select') { header.style.display = 'none'; } else { header.style.display = 'flex'; }
  
  curPage = p;
  if (p==='home') updateHome();
  if (p==='decks') renderDecks();
  if (p==='words') renderWords();
  if (p==='account') updateAccount();
}

function renderCalendar() {
  const el = document.getElementById('weekCalendar');
  if(!el) return;
  const today = new Date(); const days = [];
  for(let i=6; i>=0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); days.push(d); }
  const dayNames = ['S','M','T','W','T','F','S'];
  el.innerHTML = days.map(d => {
    const isToday = d.toDateString() === today.toDateString();
    const isStudied = (isToday) ? D.todayDone > 0 : !!D.studyDays[d.toDateString()];
    return `<div class="cal-day ${isStudied ? 'active' : ''} ${isToday ? 'today' : ''}"><div class="cal-lbl">${dayNames[d.getDay()]}</div><div class="cal-circle">${d.getDate()}</div></div>`;
  }).join('');
}

// HOME & DECKS
function updateHome() {
  document.getElementById('hDone').textContent = D.todayDone; document.getElementById('hTotal').textContent = D.words.length; document.getElementById('hStreak').textContent = streak();
  const due = D.words.filter(isDue).length; const total = due + D.todayDone; const pct = total ? Math.round((D.todayDone / total) * 100) : 0;
  document.getElementById('ringPct').textContent = pct + '%'; document.getElementById('ringC').style.strokeDashoffset = 201.06 - (201.06 * pct / 100);
  renderCalendar();
}

function renderDecks() {
  const el = document.getElementById('deckList');
  if (!D.decks.length) { el.innerHTML='<div class="empty"><div class="empty-title">No Decks</div></div>'; return; }
  el.innerHTML = `<div class="deck-grid">` + D.decks.map(d => {
    const ws = D.words.filter(w => w.deckId === d.id);
    let newC = 0, lrnC = 0, dueC = 0;
    ws.forEach(w => { if (w.reps === 0) newC++; else if (isDue(w)) { if (w.interval < 21) lrnC++; else dueC++; } });
    return `<div class="deck-card" onclick="showDeckOverview('${d.id}')">
      <div class="deck-info">
        <div class="deck-name" style="color: ${d.color || 'var(--ink)'}">${d.name}</div>
        <div class="deck-stats"><span class="d-stat">New <b>${newC}</b></span><span class="d-stat">Learn <b>${lrnC}</b></span><span class="d-stat">Due <b>${dueC}</b></span></div>
      </div><div class="deck-gear" onclick="openDeckMenu('${d.id}', event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></div>
    </div>`;
  }).join('') + `</div>`;
}

function openDeckMenu(id, e) { e.stopPropagation(); activeMenuDeckId = id; openO('deckMenuModal'); }
function handleDeckMenu(action) {
  closeO('deckMenuModal');
  setTimeout(() => {
    if(action === 'rename') openDeckModal(activeMenuDeckId);
    if(action === 'manage') { currentStudyDeckId = activeMenuDeckId; viewDeckCards(); }
    if(action === 'import') triggerImport(activeMenuDeckId);
    if(action === 'export') exportCSV(activeMenuDeckId);
    if(action === 'delete') {
      editDeckId = activeMenuDeckId;
      if (confirm('Delete this deck? All cards will be moved to Default.')) {
        const fb = D.decks.find(d=>d.id!==editDeckId) || D.decks[0];
        D.words.forEach(w => { if (w.deckId===editDeckId) w.deckId = fb?fb.id:'d1'; });
        D.decks = D.decks.filter(d=>d.id!==editDeckId); save(); renderDecks(); toast('Deleted');
      }
    }
  }, 100);
}

function openDeckModal(id) {
  editDeckId = id || null; document.getElementById('dmTitle').textContent = id ? 'Edit Deck' : 'New Deck';
  const d = id ? D.decks.find(x => x.id===id) : null;
  document.getElementById('dName').value = d ? d.name : ''; document.getElementById('dDesc').value = d ? (d.desc||'') : '';
  selDC(d ? d.color : '#09090b'); openO('deckModal');
}
function selDC(colorHex) { 
  selDCol = colorHex; 
  document.querySelectorAll('.csw').forEach(s => { s.classList.remove('sel'); s.innerHTML = ''; });
  const customBtn = document.getElementById('customColorWrapper');
  customBtn.classList.remove('sel'); customBtn.style.borderColor = 'transparent'; 
  let matched = Array.from(document.querySelectorAll('.csw')).find(s => s.dataset.c && s.dataset.c.toLowerCase() === colorHex.toLowerCase());
  if (matched) { matched.classList.add('sel'); } 
  else { customBtn.classList.add('sel'); customBtn.style.borderColor = colorHex; document.getElementById('customColorPicker').value = colorHex; }
}
function saveDeck() {
  const name = document.getElementById('dName').value.trim(); if (!name) return toast('Name is required');
  if (editDeckId) { const d = D.decks.find(x=>x.id===editDeckId); d.name=name; d.desc=document.getElementById('dDesc').value.trim(); d.color=selDCol; } 
  else { D.decks.push({ id:'d'+Date.now(), name, desc:document.getElementById('dDesc').value.trim(), color:selDCol, options: { newPerDay: 25, revPerDay: 999, ignoreRev: false, limitsTop: false, learnSteps: '1m 10m', insertOrder: 'seq', reLearnSteps: '10m', leechThresh: 8, leechAction: 'tag' } }); }
  save(); closeO('deckModal'); renderDecks(); toast('Saved');
}

function openDeckOptionsModal(id) {
  const targetId = id || currentStudyDeckId;
  const d = D.decks.find(x => String(x.id) === String(targetId));
  if (!d) return;
  editDeckId = d.id;

  const titleEl = document.getElementById('deckOptTitle') || document.getElementById('optDeckTitle');
  if (titleEl) titleEl.textContent = `${d.name} Settings`;

  const opts = d.options || {};
  const newPerDayEl = document.getElementById('optNewPerDay');
  if (newPerDayEl) newPerDayEl.value = opts.newPerDay || 20;

  const revPerDayEl = document.getElementById('optRevPerDay');
  if (revPerDayEl) revPerDayEl.value = opts.revPerDay || 100;

  const newOrderEl = document.getElementById('optNewOrder');
  if (newOrderEl) {
    const validOrders = ['added', 'random', 'sequential'];
    newOrderEl.value = validOrders.includes(opts.newOrder) ? opts.newOrder : 'added';
  }

  const autoAudioEl = document.getElementById('optAutoPlayAudio') || document.getElementById('optAutoAudio');
  if (autoAudioEl) {
    autoAudioEl.checked = opts.autoAudio !== undefined ? !!opts.autoAudio : (D.profile?.autoPlay !== false);
  }

  const paceEl = document.getElementById('optReviewPace');
  if (paceEl) {
    if (opts.intMod && opts.intMod > 1.1) paceEl.value = 'relaxed';
    else if (opts.intMod && opts.intMod < 0.9) paceEl.value = 'intensive';
    else paceEl.value = 'standard';
  }

  openO('deckOptionsModal');
}

function saveDeckOptions() {
  const targetId = editDeckId || currentStudyDeckId;
  const d = D.decks.find(x => String(x.id) === String(targetId));
  if (!d) return;

  const newPerDay = Math.max(1, Math.min(500, parseInt(document.getElementById('optNewPerDay')?.value, 10) || 20));
  const revPerDay = Math.max(1, Math.min(9999, parseInt(document.getElementById('optRevPerDay')?.value, 10) || 100));
  const newOrder = document.getElementById('optNewOrder')?.value || 'added';
  const autoAudio = !!(document.getElementById('optAutoPlayAudio')?.checked ?? document.getElementById('optAutoAudio')?.checked);
  const pace = document.getElementById('optReviewPace')?.value || 'standard';

  let intMod = 1.0;
  let easyInt = 4;
  if (pace === 'relaxed') {
    intMod = 1.25;
    easyInt = 6;
  } else if (pace === 'intensive') {
    intMod = 0.8;
    easyInt = 3;
  }

  d.options = Object.assign({}, d.options || {}, {
    newPerDay,
    revPerDay,
    newOrder,
    autoAudio,
    intMod,
    easyInt
  });

  if (D.profile) {
    D.profile.autoPlay = autoAudio;
  }

  save();
  closeDeckOptionsModal();
  toast('Settings saved');

  if (typeof showDeckOverview === 'function' && currentStudyDeckId === d.id && curPage === 'deck-overview') {
    showDeckOverview(d.id);
  }
}

function closeDeckOptionsModal() {
  closeO('deckOptionsModal');
}

function resetDeckOptionsDefault() {
  const targetId = editDeckId || currentStudyDeckId;
  const d = D.decks.find(x => String(x.id) === String(targetId));
  if (!d) return;

  d.options = null;
  const newPerDayEl = document.getElementById('optNewPerDay');
  if (newPerDayEl) newPerDayEl.value = 20;
  const revPerDayEl = document.getElementById('optRevPerDay');
  if (revPerDayEl) revPerDayEl.value = 100;
  const newOrderEl = document.getElementById('optNewOrder');
  if (newOrderEl) newOrderEl.value = 'added';
  const autoAudioEl = document.getElementById('optAutoPlayAudio') || document.getElementById('optAutoAudio');
  if (autoAudioEl) autoAudioEl.checked = true;
  const paceEl = document.getElementById('optReviewPace');
  if (paceEl) paceEl.value = 'standard';

  toast('Reset to clean defaults');
}

// DECK OVERVIEW
function showDeckOverview(deckId) {
  currentStudyDeckId = deckId;
  const d = D.decks.find(x => x.id === deckId);
  if (!d) return;
  document.getElementById('ovTitle').textContent = d.name;
  document.getElementById('ovTitle').style.color = d.color || 'var(--ink)';
  document.getElementById('ovDesc').textContent = d.desc || '';
  const ws = D.words.filter(w => w.deckId === deckId);
  let newC = 0, lrnC = 0, revC = 0;
  ws.forEach(w => {
    if (w.reps === 0) { newC++; }
    else if (isDue(w)) { if (w.interval < 21) lrnC++; else revC++; }
  });
  document.getElementById('ovNew').textContent = newC;
  document.getElementById('ovLrn').textContent = lrnC;
  document.getElementById('ovRev').textContent = revC;
  document.getElementById('ovTotal').textContent = ws.length;
  nav('deck-overview');
}

// WORDS LIST (Global)
function escapeHTML(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getWordTypes(w) {
  return String(w.type || 'N')
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);
}

function getWordLang(w) {
  return String(w.lang || 'en').toLowerCase();
}

function getDeckName(deckId) {
  const d = D.decks.find(x => x.id === deckId);
  return d ? d.name : '';
}

function openWordFilterModal() {
  renderWordFilterUI();
  openO('wordFilterModal');
}

function setWordTypeFilter(type) {
  wordFilters.type = String(type || '').toUpperCase();
  renderWordFilterUI();
  renderWords();
}

function toggleStarredFilter() {
  wordFilters.starred = !wordFilters.starred;
  renderWordFilterUI();
  renderWords();
}

function setWordLangFilter(lang) {
  wordFilters.lang = lang || 'all';
  renderWordFilterUI();
  renderWords();
}

function resetWordFilters() {
  wordFilters = {
    type: '',
    starred: false,
    lang: 'all'
  };

  renderWordFilterUI();
  renderWords();
}

function setCheck(id, on) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('on', !!on);
}

function renderWordFilterUI() {
  const type = wordFilters.type || '';
  const lang = wordFilters.lang || 'all';

  setCheck('fltTypeAll', !type);
  ['N','V','ADJ','ADV','ART','PRON','PHR','IDM'].forEach(t => {
    setCheck(`fltType${t}`, type === t);
  });

  setCheck('fltStarred', !!wordFilters.starred);

  setCheck('fltLangAll', lang === 'all');
  setCheck('fltLangEn', lang === 'en');
  setCheck('fltLangJa', lang === 'ja');

  const parts = [];

  if (type) parts.push(type);
  else parts.push('All types');

  if (wordFilters.starred) parts.push('Starred');

  if (lang === 'en') parts.push('English');
  else if (lang === 'ja') parts.push('Japanese');
  else parts.push('All languages');

  const summary = document.getElementById('wordFilterSummary');
  if (summary) summary.textContent = parts.join(' · ');
}

function renderWords() {
  const q = (document.getElementById('si')?.value || '').trim().toLowerCase();
  const el = document.getElementById('wordList');
  if (!el) return;

  let list = D.words.filter(w => {
    const types = getWordTypes(w);
    const deckName = getDeckName(w.deckId);
    const lang = getWordLang(w);

    const searchableText = [
      w.word,
      w.meaning,
      w.pronunciation,
      w.example,
      w.notes,
      w.type,
      deckName,
      lang
    ].join(' ').toLowerCase();

    if (q && !searchableText.includes(q)) return false;

    if (wordFilters.starred && !w.starred) return false;

    if (wordFilters.type && !types.includes(wordFilters.type)) return false;

    if (wordFilters.lang !== 'all' && lang !== wordFilters.lang) return false;

    return true;
  });

  list = list.slice().reverse();

  renderWordFilterUI();

  if (!list.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-title">No words found</div>
        <div class="empty-sub">Try another keyword or filter.</div>
      </div>
    `;
    return;
  }

  el.innerHTML = list.map(w => {
    const types = getWordTypes(w);
    const typeDisplay = types[0] || 'N';
    const pron = w.pronunciation
      ? `<div class="wpn">${escapeHTML(w.pronunciation)}</div>`
      : '';

    return `
      <div class="wr" onclick="showDetail('${w.id}')">
        <div class="wm">
          <div class="wen">${escapeHTML(w.word)}</div>
          ${pron}
          <div class="wth">${escapeHTML(w.meaning)}</div>
        </div>

        <div class="wr-right">
          <span class="tt">${escapeHTML(typeDisplay)}</span>
          <button class="star-btn ${w.starred ? 'on' : ''}" onclick="event.stopPropagation(); toggleStar('${w.id}')">
            <svg viewBox="0 0 24 24" fill="${w.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function toggleStar(id) {
  const w = D.words.find(x => x.id === id);
  if (!w) return;

  w.starred = !w.starred;
  save();
  renderWords();
}
