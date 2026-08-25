// localStorage / CSV / JSON
// DATA LAYER
var SK = window.SK || 'wordjar_v4';
window.SK = SK;

var D = window.D || {
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
window.D = D;

const SYSTEM_NO_DECK_ID = '__wordjar_system_no_deck__';
const SYSTEM_NO_DECK_NAME = 'No Deck';

function defaultDeckOptions() {
  return {
    newPerDay: 25,
    revPerDay: 999,
    ignoreRev: false,
    limitsTop: false,
    learnSteps: '1m 10m',
    insertOrder: 'seq',
    reLearnSteps: '10m',
    leechThresh: 8,
    leechAction: 'tag'
  };
}

function ensureAppSettings() {
  D.settings = D.settings || {};
  if (D.settings.showSystemNoDeck === undefined) D.settings.showSystemNoDeck = true;
}

function isSystemNoDeckId(deckId) {
  return String(deckId || '') === SYSTEM_NO_DECK_ID;
}

function isRealDeckId(deckId) {
  return D.decks.some(d => String(d.id) === String(deckId));
}

function normalizeWordDeckIds() {
  const realIds = new Set(D.decks.map(d => String(d.id)));
  D.words.forEach(w => {
    const id = String(w.deckId || '');
    if (!id || (id === 'd1' && !realIds.has('d1')) || (!realIds.has(id) && id !== SYSTEM_NO_DECK_ID)) {
      w.deckId = SYSTEM_NO_DECK_ID;
    }
  });
}

function getSystemNoDeckWords() {
  return D.words.filter(w => isSystemNoDeckId(w.deckId) || !isRealDeckId(w.deckId));
}

function load() {
  let hasSavedData = false;

  try {
    const raw = localStorage.getItem(SK);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved) {
        D = saved;
        window.D = D;
        hasSavedData = true;
      }
    }
  } catch(e) {}

  const td = new Date().toDateString();
  if (D.lastDate !== td) { D.todayDone = 0; D.lastDate = td; }

  D.studyDays = D.studyDays || {};
  D.profile = D.profile || {};
  if (!D.profile.name) D.profile.name = 'User';
  if (!D.profile.id) D.profile.id = 'wj-' + Math.random().toString(36).slice(2,8);
  if (!D.profile.avatar) D.profile.avatar = 'idle';
  if (!D.profile.voice) D.profile.voice = 'en-US';
  if (!D.profile.voiceSpeed) D.profile.voiceSpeed = 0.95;
  if (D.profile.autoPlay === undefined) D.profile.autoPlay = true;
  if (!D.profile.ipaAccent) D.profile.ipaAccent = 'us';

  const cMap = ['#09090b', '#f59e0b', '#3b82f6', '#ef4444', '#10b981'];
  if (!Array.isArray(D.words)) D.words = [];
  if (!Array.isArray(D.decks)) D.decks = [];
  D.decks = D.decks.filter(d => !isSystemNoDeckId(d.id));

  if (!hasSavedData && !D.decks.length) {
    D.decks = [{ id: 'd1', name: 'Default', desc: '', color: '#09090b' }];
  }

  D.decks.forEach(d => {
    if(typeof d.color === 'number') d.color = cMap[d.color] || '#09090b';
    if(!d.options) d.options = defaultDeckOptions();
  });

  ensureAppSettings();
  normalizeWordDeckIds();
  save();
}

function save() { localStorage.setItem(SK, JSON.stringify(D)); }
function markStudied() { const td = new Date().toDateString(); D.studyDays[td] = true; save(); }
function today() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function daysAhead(n) { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }

function seedIfEmpty() {
  if (D.words.length) return;
  if (!D.decks.length) D.decks = [{ id: 'd1', name: 'Default', desc: '', color: '#09090b' }];
  D.words = [
    { id:'w1', word:'aggravate', type:'V', pronunciation:'/ˈæɡ.rə.veɪt/', meaning:'to make a situation worse; to annoy', example:'Stop aggravating the situation.', notes:'', deckId:'d1', starred:false, addedDate:today(), interval:1, reps:0, ef:2.5, nextReview:null },
    { id:'w2', word:'wary', type:'ADJ', pronunciation:'/ˈweə.ri/', meaning:'feeling cautious about possible dangers or problems', example:'Be wary of strangers online.', notes:'', deckId:'d1', starred:true, addedDate:daysAgo(1), interval:3, reps:2, ef:2.3, nextReview:today() },
    { id:'w3', word:'ephemeral', type:'ADJ', pronunciation:'/ɪˈfem.ər.əl/', meaning:'lasting for only a short time', example:'Fame is ephemeral.', notes:'From Greek "ephemeros" (lasting a day)', deckId:'d1', starred:false, addedDate:daysAgo(2), interval:6, reps:3, ef:2.5, nextReview:daysAhead(5) }
  ];
  save();
}

// CSV IMPORT / EXPORT
function exportCSV(filterDeckId) {
  const h = ['Word','Type','Pronunciation','Meaning','Example','Notes','Deck','Interval','EaseFactor','Reps','NextReview','AddedDate','Starred'];
  const listToExport = filterDeckId ? D.words.filter(w => String(w.deckId) === String(filterDeckId)) : D.words;
  if(listToExport.length === 0) return toast('No words to export');

  const rows = listToExport.map(w => {
    const d = D.decks.find(dk => String(dk.id) === String(w.deckId));
    const deckName = isSystemNoDeckId(w.deckId) ? SYSTEM_NO_DECK_NAME : (d ? d.name : '');
    return [w.word,w.type,w.pronunciation,w.meaning,w.example,w.notes,deckName,w.interval||1,w.ef||2.5,w.reps||0,w.nextReview||'',w.addedDate||'',w.starred?'1':'0']
      .map(v => `"${String(v||'').replace(/"/g,'""')}"`);
  });

  const csv = '\uFEFF' + [h,...rows].map(r=>r.join(',')).join('\n');
  Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),
    download: 'wordjar_export.csv'
  }).click();
  toast('Exported!');
}

function triggerImport(deckId = null) {
  importTargetDeckId = deckId;
  document.getElementById('csvInput').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => processCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function makeImportedWord(cols, targetDeckId, index) {
  const wordStr = String(cols[0] || '').trim();
  if (!wordStr || cols.length < 4) return null;

  return {
    id: 'w' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 6),
    word: wordStr,
    type: cols[1] || 'N',
    pronunciation: cols[2] || '',
    meaning: cols[3] || '',
    example: cols[4] || '',
    notes: cols[5] || '',
    deckId: targetDeckId || SYSTEM_NO_DECK_ID,
    lang: /[\u3040-\u30ff\u3400-\u9fff]/.test(wordStr) ? 'ja' : 'en',
    starred: cols[12] === '1',
    addedDate: today(),
    interval: 1,
    reps: 0,
    ef: 2.5,
    nextReview: null
  };
}

function ensureImportDuplicateModal() {
  let modal = document.getElementById('importDuplicateChoiceModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'importDuplicateChoiceModal';
  modal.className = 'overlay';
  modal.innerHTML = `
    <div class="modal-card" onclick="event.stopPropagation()">
      <div class="modal-header" style="margin-bottom:14px;">
        <div>
          <div class="sh-title">Duplicate Words</div>
          <div id="importDuplicateSubtitle" class="modal-subtitle" style="margin-top:4px; color:var(--ink2); font-size:13px; line-height:1.4;"></div>
        </div>
        <button class="btn-close" type="button" id="importDuplicateCloseBtn" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="format-label" id="importDuplicateNote" style="margin-bottom:14px;"></div>
      <div class="form-row" style="margin-top:0;">
        <button class="btn btn-s" type="button" id="importDuplicateSkipBtn" style="flex:1;">Skip Duplicates</button>
        <button class="btn btn-p" type="button" id="importDuplicateImportBtn" style="flex:1;">Import Duplicates</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('open');
  });

  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') modal.classList.remove('open');
    if (e.key === 'Enter') e.preventDefault();
  });

  document.body.appendChild(modal);
  return modal;
}

function askDuplicateImportChoice(count, deckName) {
  return new Promise(resolve => {
    const modal = ensureImportDuplicateModal();
    const subtitle = document.getElementById('importDuplicateSubtitle');
    const note = document.getElementById('importDuplicateNote');
    const skipBtn = document.getElementById('importDuplicateSkipBtn');
    const importBtn = document.getElementById('importDuplicateImportBtn');
    const closeBtn = document.getElementById('importDuplicateCloseBtn');

    subtitle.textContent = `${count} word${count === 1 ? '' : 's'} already exist in "${deckName}".`;
    note.textContent = 'Choose Skip Duplicates to import only new words, or Import Duplicates to add another copy into this deck.';

    const finish = value => {
      modal.classList.remove('open');
      skipBtn.onclick = null;
      importBtn.onclick = null;
      closeBtn.onclick = null;
      resolve(value);
    };

    skipBtn.onclick = () => finish(false);
    importBtn.onclick = () => finish(true);
    closeBtn.onclick = () => finish(false);

    modal.classList.add('open');
    skipBtn.focus();
  });
}

async function processCSV(text) {
  try {
    const lines = String(text || '').split(/\r?\n/);
    const targetDeck = importTargetDeckId || D.decks[0]?.id || SYSTEM_NO_DECK_ID;
    const targetDeckName = isSystemNoDeckId(targetDeck)
      ? SYSTEM_NO_DECK_NAME
      : (D.decks.find(d => String(d.id) === String(targetDeck))?.name || SYSTEM_NO_DECK_NAME);

    const importable = [];
    const duplicateSameDeck = [];
    let invalidCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      const item = makeImportedWord(cols, targetDeck, i);
      if (!item) {
        invalidCount++;
        continue;
      }

      const lowerWord = item.word.toLowerCase().trim();
      const existsInTargetDeck = D.words.some(w =>
        String(w.word || '').toLowerCase().trim() === lowerWord &&
        String(w.deckId || '') === String(targetDeck || '')
      );

      if (existsInTargetDeck) duplicateSameDeck.push(item);
      else importable.push(item);
    }

    let finalImport = [...importable];
    let skippedDuplicateCount = 0;

    if (duplicateSameDeck.length > 0) {
      const includeDupes = await askDuplicateImportChoice(duplicateSameDeck.length, targetDeckName);
      if (includeDupes) finalImport = finalImport.concat(duplicateSameDeck);
      else skippedDuplicateCount = duplicateSameDeck.length;
    }

    if (!finalImport.length) {
      alert(`No words imported.${skippedDuplicateCount ? ` ${skippedDuplicateCount} duplicates were skipped.` : ''}${invalidCount ? ` ${invalidCount} invalid rows.` : ''}`.trim());
      return;
    }

    const skipped = skippedDuplicateCount ? `\nSkipped ${skippedDuplicateCount} duplicates already in this deck.` : '';
    const invalid = invalidCount ? `\nIgnored ${invalidCount} invalid rows.` : '';

    if (confirm(`Import ${finalImport.length} words to "${targetDeckName}"?${skipped}${invalid}`)) {
      D.words = [...D.words, ...finalImport];
      save();
      updateHome();
      renderWords();
      renderDecks();
      if (currentStudyDeckId && (isSystemNoDeckId(currentStudyDeckId) || D.decks.some(d => String(d.id) === String(currentStudyDeckId)))) showDeckOverview(currentStudyDeckId);
      if (curPage === 'deck-cards') renderDeckCards();
      toast('Imported successfully!');
    }
  } catch(err) {
    toast('Import failed');
  }

  document.getElementById('csvInput').value = '';
}

// JSON BACKUP
function normalizeWordJarData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup');
  data.words = Array.isArray(data.words) ? data.words : [];
  data.decks = Array.isArray(data.decks) ? data.decks.filter(d => !isSystemNoDeckId(d.id)) : [];
  data.settings = data.settings || {};
  if (data.settings.showSystemNoDeck === undefined) data.settings.showSystemNoDeck = true;
  data.profile = data.profile || {};
  if (!data.profile.name) data.profile.name = 'User';
  if (!data.profile.id) data.profile.id = 'wj-' + Math.random().toString(36).slice(2,8);
  if (!data.profile.avatar) data.profile.avatar = 'idle';
  if (!data.profile.voice) data.profile.voice = 'en-US';
  if (!data.profile.voiceSpeed) data.profile.voiceSpeed = 0.95;
  if (data.profile.autoPlay === undefined) data.profile.autoPlay = true;
  if (!data.profile.ipaAccent) data.profile.ipaAccent = 'us';
  data.studyDays = data.studyDays || {};
  data.todayDone = Number(data.todayDone || 0);
  data.lastDate = data.lastDate || new Date().toDateString();
  return data;
}

function exportJSONBackup() {
  const payload = { app: 'Jarble', version: SK, exportedAt: new Date().toISOString(), data: D };
  const json = JSON.stringify(payload, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  a.download = `jarble-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('JSON backup exported');
}

function handleJSONImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const restored = normalizeWordJarData(parsed.data || parsed);
      if (!Array.isArray(restored.words) || !Array.isArray(restored.decks)) throw new Error('Invalid structure');
      if (confirm('Restore this JSON backup? This will replace current local Jarble data.')) {
        D = restored;
        window.D = D;
        normalizeWordDeckIds();
        save();
        updateHome(); renderWords(); renderDecks(); updateAccount();
        toast('JSON backup restored');
      }
    } catch (err) {
      alert('Invalid Jarble JSON backup. No data was changed.');
    }
    event.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

// Deck deletion, system No Deck, and orphan-card fixes. Installed after ui.js so these functions become the single owner.
function installDeckDataIntegrityFixes() {
  function closeDeckDeleteModal() {
    const modal = document.getElementById('deckDeleteChoiceModal');
    if (modal) modal.classList.remove('open');
  }

  function ensureDeckDeleteModal() {
    let modal = document.getElementById('deckDeleteChoiceModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'deckDeleteChoiceModal';
    modal.className = 'overlay';
    modal.addEventListener('click', e => {
      if (e.target === modal) closeDeckDeleteModal();
    });

    modal.innerHTML = `
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header" style="margin-bottom:14px;">
          <div>
            <div class="sh-title">Delete Deck</div>
            <div id="deckDeleteSubtitle" class="modal-subtitle" style="margin-top:4px; color:var(--ink2); font-size:13px; line-height:1.4;"></div>
          </div>
          <button class="btn-close" type="button" id="deckDeleteCloseBtn" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div id="deckDeleteOptions" style="display:flex; flex-direction:column; gap:10px;"></div>
        <div id="deckDeleteMoveWrap" style="display:none; margin-top:12px;">
          <label class="fl">Move cards to</label>
          <select class="fi" id="deckDeleteMoveTarget"></select>
        </div>
        <div class="form-row" style="margin-top:18px;">
          <button class="btn btn-s" type="button" id="deckDeleteCancelBtn" style="flex:1;">Cancel</button>
          <button class="btn btn-d" type="button" id="deckDeleteConfirmBtn" style="flex:1;" disabled>Delete Deck</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('deckDeleteCloseBtn').onclick = closeDeckDeleteModal;
    document.getElementById('deckDeleteCancelBtn').onclick = closeDeckDeleteModal;
    modal.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.preventDefault();
      if (e.key === 'Escape') closeDeckDeleteModal();
    });
    return modal;
  }

  function optionHTML(value, title, detail, danger = false) {
    return `
      <label class="deck-delete-option" style="display:flex; gap:10px; align-items:flex-start; padding:12px; border:1px solid var(--bdr); border-radius:14px; background:var(--sur); cursor:pointer;">
        <input type="radio" name="deckDeleteChoice" value="${value}" style="margin-top:3px; accent-color:${danger ? '#ef4444' : 'var(--ink)'};">
        <span style="display:block; min-width:0;">
          <span style="display:block; font-weight:800; color:${danger ? '#ef4444' : 'var(--ink)'}; font-size:14px;">${title}</span>
          <span style="display:block; color:var(--ink2); font-size:12px; line-height:1.4; margin-top:2px;">${detail}</span>
        </span>
      </label>
    `;
  }

  function applyDeckDelete(deckId, action, moveTargetId) {
    if (isSystemNoDeckId(deckId)) {
      toast('System deck cannot be deleted');
      return false;
    }

    if (action === 'keep') {
      D.words.forEach(w => { if (String(w.deckId || '') === String(deckId)) w.deckId = SYSTEM_NO_DECK_ID; });
    } else if (action === 'delete') {
      D.words = D.words.filter(w => String(w.deckId || '') !== String(deckId));
    } else if (action === 'move') {
      if (!moveTargetId) return false;
      D.words.forEach(w => { if (String(w.deckId || '') === String(deckId)) w.deckId = moveTargetId; });
    }

    D.decks = D.decks.filter(d => String(d.id) !== String(deckId));
    normalizeWordDeckIds();
    if (String(currentStudyDeckId || '') === String(deckId)) currentStudyDeckId = null;
    if (String(editDeckId || '') === String(deckId)) editDeckId = null;

    save();
    renderDecks();
    renderWords();
    updateHome();
    nav('decks');
    toast('Deck deleted');
    return true;
  }

  function getDeckCardHtml(d) {
    const ws = D.words.filter(w => String(w.deckId || '') === String(d.id));
    let newC = 0, lrnC = 0, dueC = 0;
    ws.forEach(w => { if (w.reps === 0) newC++; else if (isDue(w)) { if (w.interval < 21) lrnC++; else dueC++; } });
    return `<div class="deck-card" onclick="showDeckOverview('${d.id}')">
      <div class="deck-info">
        <div class="deck-name" style="color: ${d.color || 'var(--ink)'}">${escapeHTML(d.name)}</div>
        <div class="deck-stats"><span class="d-stat">New <b>${newC}</b></span><span class="d-stat">Learn <b>${lrnC}</b></span><span class="d-stat">Due <b>${dueC}</b></span></div>
      </div><div class="deck-gear" onclick="openDeckMenu('${d.id}', event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></div>
    </div>`;
  }

  function getSystemDeckCardHtml() {
    const ws = getSystemNoDeckWords();
    let newC = 0, lrnC = 0, dueC = 0;
    ws.forEach(w => { if (w.reps === 0) newC++; else if (isDue(w)) { if (w.interval < 21) lrnC++; else dueC++; } });
    return `<div class="deck-card system-deck-card" onclick="showDeckOverview('${SYSTEM_NO_DECK_ID}')">
      <div class="deck-info">
        <div class="deck-name" style="color: var(--ink)">${SYSTEM_NO_DECK_NAME} <span class="d-stat" style="margin-left:8px;">System</span></div>
        <div class="deck-stats"><span class="d-stat">New <b>${newC}</b></span><span class="d-stat">Learn <b>${lrnC}</b></span><span class="d-stat">Due <b>${dueC}</b></span></div>
      </div>
    </div>`;
  }

  function injectSystemDeckSetting() {
    ensureAppSettings();
    const accountPage = document.getElementById('pg-account');
    if (!accountPage || document.getElementById('systemDeckSettingsCard')) return;

    const cloudPanel = document.getElementById('cloudSyncPanel');
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.id = 'systemDeckSettingsCard';
    card.innerHTML = `
      <div class="settings-card-title">System Deck</div>
      <div class="opt-row" style="display:flex; align-items:center; justify-content:space-between; gap:14px; padding:2px 0; border:0;">
        <div>
          <div class="opt-label" style="font-weight:700;">Show No Deck</div>
          <div class="format-label" style="margin-top:8px;">Shows a protected system deck for cards without a user deck. It can be hidden, but it cannot be deleted.</div>
        </div>
        <label class="switch" style="flex-shrink:0;"><input type="checkbox" id="showSystemNoDeckToggle"><span class="slider"></span></label>
      </div>
    `;

    if (cloudPanel) accountPage.insertBefore(card, cloudPanel);
    else accountPage.appendChild(card);

    const toggle = document.getElementById('showSystemNoDeckToggle');
    toggle.checked = D.settings.showSystemNoDeck !== false;
    toggle.onchange = () => {
      D.settings.showSystemNoDeck = toggle.checked;
      save();
      renderDecks();
      toast(toggle.checked ? 'No Deck shown' : 'No Deck hidden');
    };
  }

  const originalUpdateAccount = window.updateAccount;
  window.updateAccount = function updateAccountWithSystemDeckSetting() {
    if (typeof originalUpdateAccount === 'function') originalUpdateAccount();
    injectSystemDeckSetting();
  };

  window.getDeckName = function getDeckName(deckId) {
    if (isSystemNoDeckId(deckId) || !isRealDeckId(deckId)) return SYSTEM_NO_DECK_NAME;
    const d = D.decks.find(x => String(x.id) === String(deckId));
    return d ? d.name : SYSTEM_NO_DECK_NAME;
  };

  window.renderDecks = function renderDecks() {
    ensureAppSettings();
    normalizeWordDeckIds();
    const el = document.getElementById('deckList');
    if (!el) return;
    const showSystem = D.settings.showSystemNoDeck !== false && getSystemNoDeckWords().length > 0;
    const parts = D.decks.map(getDeckCardHtml);
    if (showSystem) parts.push(getSystemDeckCardHtml());
    if (!parts.length) {
      el.innerHTML = '<div class="empty"><div class="empty-title">No Decks</div><div class="empty-sub">Words without a deck can stay in the protected system deck.</div></div>';
      return;
    }
    el.innerHTML = `<div class="deck-grid">${parts.join('')}</div>`;
  };

  window.showDeckOverview = function showDeckOverviewPatched(deckId) {
    currentStudyDeckId = deckId;
    const isSystem = isSystemNoDeckId(deckId);
    const d = isSystem ? { id: SYSTEM_NO_DECK_ID, name: SYSTEM_NO_DECK_NAME, desc: 'System deck for cards without a user deck.', color: 'var(--ink)' } : D.decks.find(x => String(x.id) === String(deckId));
    if (!d) return;
    document.getElementById('ovTitle').textContent = d.name;
    document.getElementById('ovTitle').style.color = d.color || 'var(--ink)';
    document.getElementById('ovDesc').textContent = d.desc || '';
    const ws = isSystem ? getSystemNoDeckWords() : D.words.filter(w => String(w.deckId) === String(deckId));
    let newC = 0, lrnC = 0, revC = 0;
    ws.forEach(w => { if (w.reps === 0) newC++; else if (isDue(w)) { if (w.interval < 21) lrnC++; else revC++; } });
    document.getElementById('ovNew').textContent = newC;
    document.getElementById('ovLrn').textContent = lrnC;
    document.getElementById('ovRev').textContent = revC;
    document.getElementById('ovTotal').textContent = ws.length;
    const optBtn = document.querySelector('#pg-deck-overview button[onclick^="openDeckOptionsModal"]');
    if (optBtn) optBtn.style.display = isSystem ? 'none' : 'flex';
    nav('deck-overview');
  };

  window.viewDeckCards = function viewDeckCardsPatched() {
    prevDeckCardsPage = curPage;
    const isSystem = isSystemNoDeckId(currentStudyDeckId);
    const d = isSystem ? { name: SYSTEM_NO_DECK_NAME, color: 'var(--ink)' } : D.decks.find(x => String(x.id) === String(currentStudyDeckId));
    if (!d) return;
    document.getElementById('dcTitle').textContent = `Cards in ${d.name}`;
    document.getElementById('dcTitle').style.color = d.color || 'var(--ink)';
    isSelectMode = false;
    selectedCards.clear();
    document.getElementById('btnSelectCards').textContent = 'Select';
    updateSelectActions();
    renderDeckCards();
    nav('deck-cards');
  };

  window.deleteDeckWithChoice = function deleteDeckWithChoice(deckId) {
    if (isSystemNoDeckId(deckId)) return toast('System deck cannot be deleted');
    const deck = D.decks.find(d => String(d.id) === String(deckId));
    if (!deck) return;
    const deckWords = D.words.filter(w => String(w.deckId || '') === String(deckId));
    const otherDecks = D.decks.filter(d => String(d.id) !== String(deckId));
    const modal = ensureDeckDeleteModal();
    const subtitle = document.getElementById('deckDeleteSubtitle');
    const options = document.getElementById('deckDeleteOptions');
    const moveWrap = document.getElementById('deckDeleteMoveWrap');
    const moveTarget = document.getElementById('deckDeleteMoveTarget');
    const confirmBtn = document.getElementById('deckDeleteConfirmBtn');

    subtitle.textContent = `"${deck.name}" has ${deckWords.length} card${deckWords.length === 1 ? '' : 's'}. Choose what to do with them before deleting the deck.`;
    options.innerHTML = deckWords.length
      ? optionHTML('keep', 'Keep cards', `Move cards to the protected ${SYSTEM_NO_DECK_NAME} system deck.`) + optionHTML('delete', 'Delete cards too', `Delete this deck and its ${deckWords.length} card${deckWords.length === 1 ? '' : 's'}.`, true) + (otherDecks.length ? optionHTML('move', 'Move cards', 'Move cards to another deck, then delete this deck.') : '')
      : optionHTML('delete', 'Delete empty deck', 'This deck has no cards. Only the deck will be deleted.', true);
    moveTarget.innerHTML = otherDecks.map(d => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.name)}</option>`).join('');
    moveWrap.style.display = 'none';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Delete Deck';

    options.querySelectorAll('input[name="deckDeleteChoice"]').forEach(input => {
      input.checked = false;
      input.onchange = () => {
        moveWrap.style.display = input.value === 'move' ? 'block' : 'none';
        confirmBtn.disabled = false;
        confirmBtn.textContent = input.value === 'delete' ? 'Delete Deck' : 'Continue';
      };
    });

    confirmBtn.onclick = () => {
      const choice = options.querySelector('input[name="deckDeleteChoice"]:checked')?.value;
      if (!choice) return;
      const targetId = choice === 'move' ? moveTarget.value : '';
      if (choice === 'delete' && deckWords.length) {
        const ok = confirm(`Delete "${deck.name}" and ${deckWords.length} card${deckWords.length === 1 ? '' : 's'}? This cannot be undone.`);
        if (!ok) return;
      }
      if (applyDeckDelete(deckId, choice, targetId)) closeDeckDeleteModal();
    };

    modal.classList.add('open');
    document.getElementById('deckDeleteCancelBtn')?.focus();
  };

  window.handleDeckMenu = function handleDeckMenu(action) {
    closeO('deckMenuModal');
    setTimeout(() => {
      if(action === 'rename') openDeckModal(activeMenuDeckId);
      if(action === 'manage') { currentStudyDeckId = activeMenuDeckId; viewDeckCards(); }
      if(action === 'import') triggerImport(activeMenuDeckId);
      if(action === 'export') exportCSV(activeMenuDeckId);
      if(action === 'delete') deleteDeckWithChoice(activeMenuDeckId);
    }, 100);
  };

  ensureAppSettings();
  normalizeWordDeckIds();
  if (curPage === 'account') injectSystemDeckSetting();
}

setTimeout(installDeckDataIntegrityFixes, 0);
setTimeout(installDeckDataIntegrityFixes, 300);
window.addEventListener('load', installDeckDataIntegrityFixes);
