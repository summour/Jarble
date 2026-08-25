// Auto Fill / dictionary fill
// Owns single-word Auto Fill and deck bulk Fill behavior.

const WORDJAR_DICT_CACHE_KEY = 'wordjar_dict_cache_v1';
const WORDJAR_DICT_CACHE_LIMIT = 1500;
const WORDJAR_BULK_CONCURRENCY = 6;
const WORDJAR_BULK_RETRIES = 2;
let wordjarBulkFillRunning = false;

function cleanIPA(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/^\[+|\]+$/g, '')
    .replace(/\s+/g, ' ');
}

function formatIPA(value) {
  const clean = cleanIPA(value);
  return clean ? `/${clean}/` : '';
}

function normalizeDictionaryWord(word) {
  return String(word || '').trim().toLowerCase();
}

function isJapaneseWord(word) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(word || ''));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setAutoFillStatus(msg, state) {
  const el = document.getElementById('autoFillStatus');
  if (!el) return;

  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
  el.style.color = state === 'err' ? '#991b1b' : state === 'ok' ? '#166534' : 'var(--ink2)';
}

function mapPartOfSpeech(pos) {
  const p = String(pos || '').toLowerCase();
  if (p === 'noun') return 'N';
  if (p === 'verb') return 'V';
  if (p === 'adjective') return 'ADJ';
  if (p === 'adverb') return 'ADV';
  if (p === 'article') return 'ART';
  if (p === 'pronoun') return 'PRON';
  return 'N';
}

function fillIfEmpty(id, value) {
  const el = document.getElementById(id);
  const clean = String(value || '').trim();
  if (!el || !clean || el.value.trim()) return false;
  el.value = clean;
  return true;
}

function readDictionaryCache() {
  try {
    return JSON.parse(localStorage.getItem(WORDJAR_DICT_CACHE_KEY) || '{}') || {};
  } catch (err) {
    return {};
  }
}

function writeDictionaryCache(cache) {
  try {
    const entries = Object.entries(cache);
    const trimmed = entries.length > WORDJAR_DICT_CACHE_LIMIT
      ? Object.fromEntries(entries.slice(entries.length - WORDJAR_DICT_CACHE_LIMIT))
      : cache;
    localStorage.setItem(WORDJAR_DICT_CACHE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // Cache is optional. Ignore storage limits/private mode failures.
  }
}

function getBestDictionaryEntry(data) {
  if (!Array.isArray(data) || !data.length) return null;
  return data.find(entry => entry.meanings && entry.meanings.length) || data[0];
}

function getBestMeaning(entry) {
  const meanings = entry?.meanings || [];
  let firstDefinition = '';
  let firstExample = '';
  let firstType = 'N';

  for (const meaning of meanings) {
    const defs = meaning?.definitions || [];
    if (!firstType && meaning?.partOfSpeech) firstType = mapPartOfSpeech(meaning.partOfSpeech);

    for (const def of defs) {
      if (!firstDefinition && def?.definition) {
        firstDefinition = def.definition;
        firstType = mapPartOfSpeech(meaning?.partOfSpeech);
      }
      if (!firstExample && def?.example) firstExample = def.example;
      if (firstDefinition && firstExample) break;
    }

    if (firstDefinition && firstExample) break;
  }

  return {
    type: firstType || 'N',
    definition: firstDefinition || '',
    example: firstExample || ''
  };
}

function phoneticAccentScore(phonetic, preferredAccent) {
  if (!phonetic) return 0;
  const text = [phonetic.text || '', phonetic.audio || '', phonetic.sourceUrl || ''].join(' ').toLowerCase();
  if (preferredAccent === 'any') return phonetic.text ? 10 : 0;

  const usHints = ['us', 'american', 'en-us', '_us_', '-us-', 'us.mp3', 'us.ogg'];
  const ukHints = ['uk', 'gb', 'british', 'en-gb', '_gb_', '-gb-', '_uk_', '-uk-', 'uk.mp3', 'gb.mp3'];
  const hints = preferredAccent === 'uk' ? ukHints : usHints;

  let score = phonetic.text ? 10 : 0;
  if (hints.some(h => text.includes(h))) score += 100;
  if (phonetic.audio) score += 5;
  return score;
}

function getBestPronunciation(entry) {
  const phonetics = (entry?.phonetics || []).filter(p => p && p.text);
  const preferredAccent = D?.profile?.ipaAccent || 'us';
  if (!phonetics.length) return entry?.phonetic || '';
  if (preferredAccent === 'any') return phonetics[0].text || entry?.phonetic || '';

  return phonetics
    .map(p => ({ item: p, score: phoneticAccentScore(p, preferredAccent) }))
    .sort((a, b) => b.score - a.score)[0]?.item?.text || entry?.phonetic || '';
}

function selectOnlyType(type) {
  const safeType = String(type || 'N').toUpperCase();
  if (typeof selectedTypes !== 'undefined' && selectedTypes.clear) selectedTypes.clear();

  document.querySelectorAll('#typePills .tp').forEach(btn => btn.classList.remove('sel'));
  const target = document.querySelector(`#typePills .tp[data-t="${safeType}"]`) || document.querySelector('#typePills .tp[data-t="N"]');

  if (target) {
    target.classList.add('sel');
    if (typeof selectedTypes !== 'undefined' && selectedTypes.add) selectedTypes.add(target.dataset.t);
  }
}

async function fetchDictionaryEntry(word) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: controller.signal
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`dictionary ${res.status}`);

    const data = await res.json();
    const entry = getBestDictionaryEntry(data);
    if (!entry) return null;

    const meaning = getBestMeaning(entry);
    return {
      pronunciation: formatIPA(getBestPronunciation(entry)),
      meaning: meaning.definition || '',
      example: meaning.example || '',
      type: meaning.type || 'N'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getDictionaryAutoFill(word, options = {}) {
  const cleanWord = normalizeDictionaryWord(word);
  if (!cleanWord || isJapaneseWord(cleanWord)) return null;

  const useCache = options.useCache !== false;
  const cache = useCache ? readDictionaryCache() : {};

  if (useCache && Object.prototype.hasOwnProperty.call(cache, cleanWord)) {
    return cache[cleanWord];
  }

  const result = await fetchDictionaryEntry(cleanWord);

  if (useCache) {
    cache[cleanWord] = result;
    writeDictionaryCache(cache);
  }

  return result;
}

async function getDictionaryAutoFillWithRetry(word, retries = WORDJAR_BULK_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getDictionaryAutoFill(word);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(450 + attempt * 850);
    }
  }
  return null;
}

function applyAutoFillToWordObject(w, result) {
  if (!w || !result) return false;

  let changed = false;
  if (!String(w.pronunciation || '').trim() && result.pronunciation) { w.pronunciation = result.pronunciation; changed = true; }
  if (!String(w.meaning || '').trim() && result.meaning) { w.meaning = result.meaning; changed = true; }
  if (!String(w.example || '').trim() && result.example) { w.example = result.example; changed = true; }
  if (!String(w.type || '').trim() && result.type) { w.type = result.type; changed = true; }

  if (changed && !String(w.notes || '').trim()) {
    w.notes = 'Auto-filled from dictionary. Please check before studying.';
  }

  return changed;
}

async function runLimitedPool(items, worker, limit, onProgress) {
  let index = 0;
  let done = 0;
  const workerCount = Math.min(limit, items.length);

  async function runWorker() {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function autoFillWord() {
  const word = document.getElementById('fWord')?.value.trim();
  if (!word) {
    setAutoFillStatus('Type a word first.', 'err');
    toast('Type a word first');
    return;
  }

  if (isJapaneseWord(word)) {
    setAutoFillStatus('Auto Fill currently supports English dictionary only.', 'err');
    toast('English only for now');
    return;
  }

  setAutoFillStatus('Searching dictionary...', 'loading');

  try {
    const result = await getDictionaryAutoFillWithRetry(word);
    if (!result) {
      setAutoFillStatus('No dictionary result found. Fill manually for this word.', 'err');
      toast('No result found');
      return;
    }

    let filledCount = 0;
    if (fillIfEmpty('fPron', result.pronunciation)) filledCount++;
    if (fillIfEmpty('fMeaning', result.meaning)) filledCount++;
    if (fillIfEmpty('fEx', result.example)) filledCount++;

    if (typeof selectedTypes !== 'undefined' && selectedTypes && selectedTypes.size === 0) {
      selectOnlyType(result.type);
      filledCount++;
    }

    if (filledCount > 0 && fillIfEmpty('fNotes', 'Auto-filled from dictionary. Please check before saving.')) filledCount++;

    setAutoFillStatus(
      filledCount > 0 ? 'Filled empty fields. Check the result before saving.' : 'Nothing changed because all fields already have content.',
      'ok'
    );
    toast(filledCount > 0 ? 'Auto-filled' : 'Already filled');
  } catch (err) {
    setAutoFillStatus('Auto Fill failed. Check internet connection or try again.', 'err');
    toast('Auto Fill failed');
  }
}

// Deck card bulk actions. One owner for select-mode UI, all-mode actions, and selected-card actions.
(function installDeckCardBulkUI() {
  const STYLE_ID = 'deckBulkActionStyle';

  function escDeck(value) {
    if (typeof escHTML === 'function') return escHTML(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getDeckCards() {
    return D.words.filter(w => String(w.deckId) === String(currentStudyDeckId));
  }

  function getDeckCardIds() {
    return getDeckCards().map(w => String(w.id));
  }

  function isAllMode() {
    return !!isSelectMode && (!selectedCards || selectedCards.size === 0);
  }

  function getTargetCardIds() {
    if (!isSelectMode) return [];
    if (selectedCards && selectedCards.size > 0) return Array.from(selectedCards).map(String);
    return getDeckCardIds();
  }

  function setSelectButtonText() {
    const btn = document.getElementById('btnSelectCards');
    if (btn) btn.textContent = isSelectMode ? 'Cancel' : 'Select';
  }

  function injectDeckBulkStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html body #cardSelectActions.select-action-bar {
        display: none;
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
        width: 100% !important;
        max-width: none !important;
        transform: none !important;
        padding: 0 !important;
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        z-index: 2000 !important;
        pointer-events: none !important;
      }

      html body #cardSelectActions.select-action-bar .select-action-panel {
        width: calc(100vw - 32px) !important;
        max-width: 430px !important;
        margin: 0 auto !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 8px !important;
        pointer-events: auto !important;
      }

      html body #cardSelectActions.select-action-bar .select-count-badge {
        max-width: 100% !important;
        min-height: 30px !important;
        padding: 7px 12px !important;
        border-radius: 999px !important;
        background: rgba(255,255,255,.96) !important;
        border: 1px solid var(--bdr) !important;
        color: var(--ink2) !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        line-height: 1.1 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.08) !important;
        backdrop-filter: blur(10px) !important;
      }

      html body #cardSelectActions.select-action-bar .select-action-buttons {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      html body #cardSelectActions.select-action-bar .select-action-buttons .btn {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        min-height: 50px !important;
        border-radius: 16px !important;
        font-size: clamp(12px, 3.4vw, 14px) !important;
        font-weight: 800 !important;
        line-height: 1.1 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 6px !important;
        pointer-events: auto !important;
      }

      html body #cardSelectActions.select-action-bar .select-action-buttons .btn:disabled {
        opacity: .5 !important;
        pointer-events: none !important;
      }

      html body #cardSelectActions.select-action-bar .btn-danger-soft {
        background: #fff7f7 !important;
        border: 1px solid #f0aaaa !important;
        color: #e15249 !important;
      }

      html body #cardSelectActions.select-action-bar .btn-soft-fill {
        background: #fff !important;
        border: 1px solid var(--bdr) !important;
        color: var(--ink) !important;
      }

      @media (max-width: 360px) {
        html body #cardSelectActions.select-action-bar .select-action-panel {
          width: calc(100vw - 24px) !important;
        }

        html body #cardSelectActions.select-action-bar .select-action-buttons {
          gap: 6px !important;
        }

        html body #cardSelectActions.select-action-bar .select-action-buttons .btn {
          min-height: 46px !important;
          border-radius: 15px !important;
          font-size: 12px !important;
          padding: 0 4px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function buildDeckBulkBar() {
    const bar = document.getElementById('cardSelectActions');
    if (!bar) return;

    injectDeckBulkStyle();

    bar.className = 'select-action-bar';
    bar.innerHTML = `
      <div class="select-action-panel">
        <div id="selectCountBadge" class="select-count-badge">0 selected</div>
        <div class="select-action-buttons">
          <button id="btnDeleteSelectedCards" class="btn btn-danger-soft" type="button">Delete</button>
          <button id="btnAutoFillSelectedCards" class="btn btn-soft-fill" type="button">Fill</button>
          <button id="btnMoveSelectedCards" class="btn btn-p" type="button">Move</button>
        </div>
      </div>
    `;

    document.getElementById('btnDeleteSelectedCards').onclick = () => deleteSelectedCards();
    document.getElementById('btnAutoFillSelectedCards').onclick = () => autoFillSelectedCards();
    document.getElementById('btnMoveSelectedCards').onclick = () => openMoveSelectedModal();
  }

  function ensureDeckBulkBar() {
    const bar = document.getElementById('cardSelectActions');
    if (!bar) return;
    if (!bar.querySelector('#btnAutoFillSelectedCards') || !bar.querySelector('.select-action-panel')) {
      buildDeckBulkBar();
    }
  }

  function updateDeckBulkActions() {
    const bar = document.getElementById('cardSelectActions');
    const listWrap = document.getElementById('deckCardsList');
    if (!bar || !listWrap) return;

    ensureDeckBulkBar();
    setSelectButtonText();

    const total = getDeckCardIds().length;
    const selectedCount = selectedCards?.size || 0;
    const allMode = isAllMode();
    const targetCount = allMode ? total : selectedCount;

    const badge = document.getElementById('selectCountBadge');
    const btnDelete = document.getElementById('btnDeleteSelectedCards');
    const btnFill = document.getElementById('btnAutoFillSelectedCards');
    const btnMove = document.getElementById('btnMoveSelectedCards');

    if (badge) {
      badge.textContent = allMode
        ? (total === 1 ? 'All 1 card' : `All ${total} cards`)
        : (selectedCount === 1 ? '1 selected' : `${selectedCount} selected`);
    }

    if (!wordjarBulkFillRunning) {
      if (btnDelete) btnDelete.textContent = allMode ? 'Delete All' : 'Delete';
      if (btnFill) btnFill.textContent = allMode ? 'Fill All' : 'Fill';
      if (btnMove) btnMove.textContent = allMode ? 'Move All' : 'Move';
    }

    [btnDelete, btnFill, btnMove].forEach(btn => {
      if (btn) btn.disabled = wordjarBulkFillRunning || (isSelectMode && targetCount === 0);
    });

    if (isSelectMode) {
      bar.style.display = 'block';
      listWrap.style.paddingBottom = '170px';
    } else {
      bar.style.display = 'none';
      listWrap.style.paddingBottom = '20px';
    }
  }

  function renderDeckCardsBulk() {
    const list = getDeckCards();
    const el = document.getElementById('deckCardsList');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `<div class="empty"><div class="empty-title">No cards found</div></div>`;
      updateDeckBulkActions();
      return;
    }

    el.innerHTML = list.slice().reverse().map(w => {
      const id = String(w.id || '');
      const isSel = selectedCards.has(id);
      const safeId = escDeck(id);
      const selectCircle = isSelectMode ? `
        <div class="select-circle ${isSel ? 'selected' : ''}">
          ${isSel ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
      ` : '';

      const clickAction = isSelectMode ? `toggleCardSelection('${safeId}')` : `showDetail('${safeId}')`;

      return `
        <div class="wr deck-card-selectable ${isSel ? 'selected-card' : ''}" data-card-id="${safeId}" onclick="${clickAction}">
          ${selectCircle}
          <div class="wm">
            <div class="wen">${escDeck(w.word)}</div>
            <div class="wth">${escDeck(w.meaning)}</div>
          </div>
        </div>
      `;
    }).join('');

    updateDeckBulkActions();
  }

  function toggleDeckSelectMode() {
    if (wordjarBulkFillRunning) return;
    isSelectMode = !isSelectMode;
    selectedCards.clear();
    setSelectButtonText();
    updateDeckBulkActions();
    renderDeckCardsBulk();
  }

  function toggleDeckCardSelection(id) {
    if (!isSelectMode || wordjarBulkFillRunning) return;

    const sid = String(id);
    if (selectedCards.has(sid)) selectedCards.delete(sid);
    else selectedCards.add(sid);

    updateDeckBulkActions();
    renderDeckCardsBulk();
  }

  async function autoFillSelectedCards() {
    if (wordjarBulkFillRunning) return;

    const targetIds = getTargetCardIds();
    if (!targetIds.length) {
      toast('No cards available');
      return;
    }

    const idSet = new Set(targetIds.map(String));
    const targets = D.words.filter(w => idSet.has(String(w.id)));
    const btn = document.getElementById('btnAutoFillSelectedCards');
    const badge = document.getElementById('selectCountBadge');
    const originalText = btn?.textContent || 'Fill';

    let filledCards = 0;
    let skippedCards = 0;
    let notFoundCards = 0;
    let failedCards = 0;
    let saveCounter = 0;

    wordjarBulkFillRunning = true;
    updateDeckBulkActions();

    try {
      await runLimitedPool(
        targets,
        async w => {
          if (!w || !String(w.word || '').trim() || isJapaneseWord(w.word)) {
            notFoundCards++;
            return;
          }

          try {
            const result = await getDictionaryAutoFillWithRetry(w.word);
            if (!result) {
              notFoundCards++;
              return;
            }

            if (applyAutoFillToWordObject(w, result)) {
              filledCards++;
              saveCounter++;
              if (saveCounter >= 25) {
                saveCounter = 0;
                save();
              }
            } else {
              skippedCards++;
            }
          } catch (err) {
            failedCards++;
          }
        },
        WORDJAR_BULK_CONCURRENCY,
        (done, total) => {
          if (btn) btn.textContent = `${done}/${total}`;
          if (badge) badge.textContent = `Filling ${done}/${total}`;
        }
      );

      save();
      renderDeckCardsBulk();
      if (typeof renderWords === 'function') renderWords();
      if (typeof renderDecks === 'function') renderDecks();
      if (typeof updateHome === 'function') updateHome();

      const unavailable = notFoundCards + failedCards;
      toast(`Fill done: ${filledCards} filled, ${skippedCards} skipped${unavailable ? `, ${unavailable} unavailable` : ''}`);
    } finally {
      wordjarBulkFillRunning = false;
      if (btn) btn.textContent = originalText;
      updateDeckBulkActions();
    }
  }

  function deleteSelectedCardsBulk() {
    if (wordjarBulkFillRunning) return;
    const targetIds = getTargetCardIds();

    if (!targetIds.length) {
      toast('No cards available');
      return;
    }

    const count = targetIds.length;
    const ok = window.confirm(isAllMode() ? `Delete all ${count} cards in this deck?` : `Delete ${count} selected cards?`);
    if (!ok) return;

    const targetSet = new Set(targetIds);
    D.words = D.words.filter(w => !targetSet.has(String(w.id)));

    selectedCards.clear();
    isSelectMode = false;
    setSelectButtonText();

    save();
    updateDeckBulkActions();
    renderDeckCardsBulk();
    if (typeof renderWords === 'function') renderWords();
    if (typeof renderDecks === 'function') renderDecks();
    if (typeof updateHome === 'function') updateHome();

    toast(`${count} cards deleted`);
  }

  function openMoveSelectedModalBulk() {
    if (wordjarBulkFillRunning) return;
    const targetIds = getTargetCardIds();

    if (!targetIds.length) {
      toast('No cards available');
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
      .map(d => `<option value="${escDeck(d.id)}">${escDeck(d.name)}</option>`)
      .join('');

    openO('moveCardsModal');
  }

  function moveSelectedCardsBulk() {
    if (wordjarBulkFillRunning) return;
    const targetIds = getTargetCardIds();

    if (!targetIds.length) {
      toast('No cards available');
      return;
    }

    const targetId = document.getElementById('moveDestDeck')?.value;
    if (!targetId) {
      toast('No destination deck');
      return;
    }

    const targetSet = new Set(targetIds);
    let count = 0;

    D.words.forEach(w => {
      if (targetSet.has(String(w.id))) {
        w.deckId = targetId;
        count++;
      }
    });

    selectedCards.clear();
    isSelectMode = false;
    setSelectButtonText();

    closeO('moveCardsModal');
    save();
    updateDeckBulkActions();
    renderDeckCardsBulk();
    if (typeof renderWords === 'function') renderWords();
    if (typeof renderDecks === 'function') renderDecks();
    if (typeof updateHome === 'function') updateHome();

    toast(`${count} cards moved`);
  }

  function installDeckBulkUI() {
    buildDeckBulkBar();

    try { renderDeckCards = renderDeckCardsBulk; } catch (e) {}
    try { updateSelectActions = updateDeckBulkActions; } catch (e) {}
    try { toggleSelectMode = toggleDeckSelectMode; } catch (e) {}
    try { toggleCardSelection = toggleDeckCardSelection; } catch (e) {}
    try { deleteSelectedCards = deleteSelectedCardsBulk; } catch (e) {}
    try { openMoveSelectedModal = openMoveSelectedModalBulk; } catch (e) {}
    try { moveSelectedCards = moveSelectedCardsBulk; } catch (e) {}

    window.renderDeckCards = renderDeckCardsBulk;
    window.updateSelectActions = updateDeckBulkActions;
    window.toggleSelectMode = toggleDeckSelectMode;
    window.toggleCardSelection = toggleDeckCardSelection;
    window.autoFillSelectedCards = autoFillSelectedCards;
    window.deleteSelectedCards = deleteSelectedCardsBulk;
    window.openMoveSelectedModal = openMoveSelectedModalBulk;
    window.moveSelectedCards = moveSelectedCardsBulk;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installDeckBulkUI, { once: true });
  } else {
    installDeckBulkUI();
  }
})();
