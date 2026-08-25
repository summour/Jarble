// WordJar Study UI & Targeted Study Mode
// -----------------------------------------------------------------------------
// Implements targeted word selection for Study Mode (Recite mode):
// 1. Deck selection -> pick a deck to study
// 2. Word selection -> pick specific words to memorize
// 3. Dedicated Recitation session -> Word, Phonetics, Meaning, Example, Notes, TTS audio
// 4. Session completion & repetition controls
// 5. Mobile-safe touch handling & Flashcard helpers
// -----------------------------------------------------------------------------

(function installWordJarStudyUI() {
  let fcTapLock = false;
  let studySelectedWordIds = new Set();
  let currentStudyDeckTargetId = null;
  let studyPreviousScreen = 'home';
  let lLearnedThisSession = 0;
  let cachedFilteredStudyWords = [];
  let renderedStudyCount = 0;
  const STUDY_CHUNK_SIZE = 80;
  let searchDebounceTimer = null;

  function injectStyles() {
    if (document.getElementById('studySkipStyle')) return;
    const style = document.createElement('style');
    style.id = 'studySkipStyle';
    style.textContent = `
      #pg-fc #fcMain, #pg-learn #lMain {
        position: relative !important;
        isolation: isolate !important;
      }

      #pg-fc .fc-scene, #pg-learn .fc-scene {
        position: relative !important;
        z-index: 1 !important;
        pointer-events: auto !important;
      }

      #pg-fc .fc-action-area, #pg-learn .fc-action-area {
        position: relative !important;
        z-index: 30 !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        -webkit-user-select: none !important;
        user-select: none !important;
      }

      #pg-fc .fc-action-area button,
      #pg-fc .rb,
      #pg-fc .fc-skip-btn,
      #pg-learn .fc-action-area button {
        position: relative !important;
        z-index: 31 !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
      }

      .fc-skip-row {
        display: flex !important;
        justify-content: center !important;
        margin-bottom: 10px !important;
        position: relative !important;
        z-index: 31 !important;
        pointer-events: auto !important;
      }
      .fc-skip-btn {
        min-width: 96px !important;
        height: 38px !important;
        border-radius: 999px !important;
        font-size: 13px !important;
        font-weight: 800 !important;
      }

      .study-deck-card {
        background: var(--sur);
        border: 1px solid var(--bdr);
        border-radius: 16px;
        padding: 16px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .study-deck-card:hover {
        background: var(--sur2);
        border-color: var(--bdr2);
      }
      .study-deck-card:active {
        transform: scale(0.985);
      }

      .study-word-item {
        background: var(--sur);
        border: 1px solid var(--bdr);
        border-radius: 16px;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        cursor: pointer;
        transition: all 0.18s ease;
        user-select: none;
      }
      .study-word-item:hover {
        border-color: var(--bdr2);
      }
      .study-word-item.selected {
        background: var(--sur2);
        border-color: var(--ink);
      }
      .study-word-item:active {
        transform: scale(0.985);
      }
    `;
    document.head.appendChild(style);
  }

  function stopControlEvent(event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  function runOncePerTap(fn) {
    if (fcTapLock) return;
    fcTapLock = true;
    try { fn(); }
    finally { setTimeout(() => { fcTapLock = false; }, 180); }
  }

  function safeRateFC(q) {
    if (typeof window.rateFC === 'function') {
      window.rateFC(q);
      return;
    }
    if (typeof rateFC === 'function') rateFC(q);
  }

  function handleControlTap(event, fn) {
    stopControlEvent(event);
    runOncePerTap(fn);
  }

  function bindControl(button, fn) {
    if (!button || button.dataset.wordjarTouchBound === 'true') return;
    button.dataset.wordjarTouchBound = 'true';

    button.addEventListener('pointerup', event => handleControlTap(event, fn), { passive: false });
    button.addEventListener('touchend', event => handleControlTap(event, fn), { passive: false });
    button.addEventListener('click', event => handleControlTap(event, fn), { passive: false });
  }

  function hardenFlashcardControls() {
    injectStyles();
    const actionArea = document.querySelector('#pg-fc #fcMain .fc-action-area');
    const ratingMode = document.getElementById('fcRatingMode');
    if (actionArea && ratingMode && !document.getElementById('btnSkipFC')) {
      const row = document.createElement('div');
      row.className = 'fc-skip-row';
      row.innerHTML = `<button id="btnSkipFC" class="btn btn-s fc-skip-btn" type="button">Skip</button>`;
      actionArea.insertBefore(row, ratingMode);
      const skip = document.getElementById('btnSkipFC');
      if (skip) bindControl(skip, () => window.skipFC());
    }

    const pairs = [
      ['.rb-a', 0],
      ['.rb-h', 3],
      ['.rb-g', 4],
      ['.rb-e', 5]
    ];

    pairs.forEach(([selector, rating]) => {
      const btn = document.querySelector(`#pg-fc ${selector}`);
      if (!btn) return;
      btn.removeAttribute('onclick');
      bindControl(btn, () => safeRateFC(rating));
    });

    if (actionArea && actionArea.dataset.wordjarStopBound !== 'true') {
      actionArea.dataset.wordjarStopBound = 'true';
      ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(type => {
        actionArea.addEventListener(type, event => {
          if (event.target?.closest?.('button')) event.stopPropagation();
        }, { passive: true });
      });
    }
  }

  // --- STUDY MODE FLOW ---

  /**
   * Open the Deck Selection view for Study Mode.
   */
  window.openStudyDeckPicker = function openStudyDeckPicker() {
    injectStyles();
    studyPreviousScreen = 'home';
    const listEl = document.getElementById('studyDeckList');
    if (!listEl) return;

    if (!D.words || D.words.length === 0) {
      listEl.innerHTML = `
        <div class="empty" style="padding: 40px 20px;">
          <div class="empty-title" style="font-size:18px;">No Words in Library</div>
          <div class="empty-sub" style="font-size:13px;">Add some words first to start studying.</div>
          <button class="btn btn-p" style="margin-top:16px; padding:12px 24px;" onclick="openAddWordModal()">Add Word</button>
        </div>
      `;
      nav('study-deck-select');
      return;
    }

    let html = `
      <div class="study-deck-card" onclick="openStudyWordSelect(null, 'study-deck-select')">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:16px; font-weight:700; color:var(--ink);">All Words (Library)</div>
          <div style="font-size:13px; color:var(--ink2);">${D.words.length} total words</div>
        </div>
        <div style="font-size:13px; font-weight:700; color:var(--ink); background:var(--sur2); border:1px solid var(--bdr); border-radius:10px; padding:6px 12px;">
          Select →
        </div>
      </div>
    `;

    (D.decks || []).forEach(deck => {
      const count = D.words.filter(w => String(w.deckId) === String(deck.id)).length;
      html += `
        <div class="study-deck-card" onclick="openStudyWordSelect('${deck.id}', 'study-deck-select')">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="font-size:16px; font-weight:700; color:${deck.color || 'var(--ink)'};">${escHTML(deck.name)}</div>
            <div style="font-size:13px; color:var(--ink2);">${count} words${deck.desc ? ` · ${escHTML(deck.desc)}` : ''}</div>
          </div>
          <div style="font-size:13px; font-weight:700; color:var(--ink); background:var(--sur2); border:1px solid var(--bdr); border-radius:10px; padding:6px 12px;">
            Select →
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
    nav('study-deck-select');
  };

  /**
   * Open the Word Selection view for a given deck.
   *
   * @param {?string} deckId
   * @param {string} [fromScreen='home']
   */
  window.openStudyWordSelect = function openStudyWordSelect(deckId = null, fromScreen = 'home') {
    injectStyles();
    currentStudyDeckTargetId = deckId;
    studyPreviousScreen = fromScreen || 'home';

    const deck = (D.decks || []).find(d => String(d.id) === String(deckId));
    const titleEl = document.getElementById('studyWordSelectDeckTitle');
    const headerEl = document.getElementById('studyWordSelectHeader');
    const subEl = document.getElementById('studyWordSelectSub');
    const searchInput = document.getElementById('studyWordSearch');

    if (searchInput) searchInput.value = '';

    const wordsInDeck = (D.words || []).filter(w => {
      if (!deckId) return true;
      return String(w.deckId) === String(deckId);
    });

    if (titleEl) titleEl.textContent = deck ? deck.name : 'All Words';
    if (headerEl) headerEl.textContent = deck ? `Select from "${deck.name}"` : 'Select Words to Recite';
    if (subEl) subEl.textContent = `${wordsInDeck.length} words available in this deck`;

    // Pre-select all words in this deck by default for fast start
    studySelectedWordIds = new Set(wordsInDeck.map(w => String(w.id)));

    renderStudyWordSelectList();
    nav('study-word-select');
  };

  /**
   * Back button handler from Word Selection screen.
   */
  window.backFromStudyWordSelect = function backFromStudyWordSelect() {
    if (studyPreviousScreen === 'deck-overview') {
      if (typeof showDeckOverview === 'function' && currentStudyDeckTargetId) {
        showDeckOverview(currentStudyDeckTargetId);
      } else {
        nav('decks');
      }
    } else if (studyPreviousScreen === 'study-deck-select') {
      openStudyDeckPicker();
    } else if (studyPreviousScreen === 'decks') {
      nav('decks');
    } else {
      nav('home');
    }
  };

  function buildWordItemHTML(w) {
    const id = String(w.id);
    const isSel = studySelectedWordIds.has(id);
    const typeStr = (w.type || 'N').split(',')[0].toUpperCase();
    return `
      <div class="study-word-item ${isSel ? 'selected' : ''}" data-word-id="${escHTML(id)}">
        <div class="select-circle ${isSel ? 'selected' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="wm" style="padding-right:0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="wen">${escHTML(w.word)}</span>
            <span class="tt">${escHTML(typeStr)}</span>
          </div>
          ${w.pronunciation ? `<div class="wpn">${escHTML(w.pronunciation)}</div>` : ''}
          <div class="wth">${escHTML(w.meaning)}</div>
        </div>
      </div>
    `;
  }

  function appendStudyWordChunk() {
    const listEl = document.getElementById('studyWordSelectList');
    if (!listEl || renderedStudyCount >= cachedFilteredStudyWords.length) return;

    const nextBatch = cachedFilteredStudyWords.slice(renderedStudyCount, renderedStudyCount + STUDY_CHUNK_SIZE);
    if (!nextBatch.length) return;

    const fragmentHtml = nextBatch.map(buildWordItemHTML).join('');
    listEl.insertAdjacentHTML('beforeend', fragmentHtml);
    renderedStudyCount += nextBatch.length;
  }

  function setupStudyWordScrollListener() {
    const listEl = document.getElementById('studyWordSelectList');
    const pageEl = document.getElementById('pg-study-word-select') || window;
    if (!listEl) return;

    if (!listEl.dataset.scrollBound) {
      listEl.dataset.scrollBound = 'true';
      const onScroll = () => {
        if (curPage !== 'study-word-select') return;
        const scrollBottom = (document.documentElement.scrollHeight || document.body.scrollHeight) - (window.scrollY + window.innerHeight);
        if (scrollBottom < 600) {
          appendStudyWordChunk();
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    if (!listEl.dataset.clickBound) {
      listEl.dataset.clickBound = 'true';
      listEl.addEventListener('click', (e) => {
        const item = e.target.closest('.study-word-item');
        if (!item) return;
        const wordId = item.dataset.wordId;
        if (wordId) toggleStudyWordSelection(wordId, item);
      });
    }
  }

  /**
   * Renders the interactive word list inside Word Selection page.
   */
  window.renderStudyWordSelectList = function renderStudyWordSelectList() {
    const listEl = document.getElementById('studyWordSelectList');
    const searchVal = (document.getElementById('studyWordSearch')?.value || '').trim().toLowerCase();

    if (!listEl) return;
    setupStudyWordScrollListener();

    const allDeckWords = (D.words || []).filter(w => {
      if (!currentStudyDeckTargetId) return true;
      return String(w.deckId) === String(currentStudyDeckTargetId);
    });

    cachedFilteredStudyWords = allDeckWords.filter(w => {
      if (!searchVal) return true;
      const wordText = (w.word || '').toLowerCase();
      const meaningText = (w.meaning || '').toLowerCase();
      return wordText.includes(searchVal) || meaningText.includes(searchVal);
    });

    renderedStudyCount = 0;

    if (!cachedFilteredStudyWords.length) {
      listEl.innerHTML = `
        <div class="empty" style="padding: 30px 10px;">
          <div class="empty-title" style="font-size:16px;">No words found</div>
          <div class="empty-sub" style="font-size:13px;">Try a different search query</div>
        </div>
      `;
    } else {
      const initialBatch = cachedFilteredStudyWords.slice(0, STUDY_CHUNK_SIZE);
      listEl.innerHTML = initialBatch.map(buildWordItemHTML).join('');
      renderedStudyCount = initialBatch.length;
    }

    syncStudySelectionUI();
  };

  /**
   * Debounced search handler for smooth 60fps typing even with 3000+ words.
   */
  window.handleStudyWordSearchInput = function handleStudyWordSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderStudyWordSelectList();
    }, 100);
  };

  /**
   * Syncs the badges and buttons without re-rendering the whole DOM tree (critical for instant responsiveness).
   */
  window.syncStudySelectionUI = function syncStudySelectionUI() {
    const badgeEl = document.getElementById('studySelectedBadge');
    const startBtn = document.getElementById('btnStartRecite');
    const allDeckWords = (D.words || []).filter(w => {
      if (!currentStudyDeckTargetId) return true;
      return String(w.deckId) === String(currentStudyDeckTargetId);
    });

    const selCount = studySelectedWordIds.size;
    const totalCount = allDeckWords.length;

    if (badgeEl) {
      badgeEl.textContent = `${selCount} of ${totalCount} selected`;
    }

    if (startBtn) {
      if (selCount === 0) {
        startBtn.textContent = 'Select words to start';
        startBtn.style.opacity = '0.5';
        startBtn.style.pointerEvents = 'none';
      } else {
        startBtn.textContent = `Start Reciting (${selCount} ${selCount === 1 ? 'word' : 'words'})`;
        startBtn.style.opacity = '1';
        startBtn.style.pointerEvents = 'auto';
      }
    }
  };

  window.isStudyWordSelected = function isStudyWordSelected(wordId) {
    return studySelectedWordIds.has(String(wordId));
  };

  window.setStudyWordSelected = function setStudyWordSelected(wordId, select) {
    const id = String(wordId);
    if (select) studySelectedWordIds.add(id);
    else studySelectedWordIds.delete(id);
  };

  /**
   * Ultra-fast single-card toggle with zero lag (O(1) DOM mutation, no list rebuild).
   *
   * @param {string} wordId
   * @param {HTMLElement} [targetEl]
   */
  window.toggleStudyWordSelection = function toggleStudyWordSelection(wordId, targetEl = null) {
    const id = String(wordId);
    const isSel = !studySelectedWordIds.has(id);

    if (isSel) {
      studySelectedWordIds.add(id);
    } else {
      studySelectedWordIds.delete(id);
    }

    const listEl = document.getElementById('studyWordSelectList');
    const el = targetEl || listEl?.querySelector(`[data-word-id="${id}"]`);
    if (el) {
      el.classList.toggle('selected', isSel);
      const circle = el.querySelector('.select-circle');
      if (circle) circle.classList.toggle('selected', isSel);
    }

    syncStudySelectionUI();
  };

  /**
   * Fast Select All or Clear selection in Word Selection.
   *
   * @param {boolean} selectAll
   */
  window.studySelectAllWords = function studySelectAllWords(selectAll) {
    const allDeckWords = (D.words || []).filter(w => {
      if (!currentStudyDeckTargetId) return true;
      return String(w.deckId) === String(currentStudyDeckTargetId);
    });

    if (selectAll) {
      allDeckWords.forEach(w => studySelectedWordIds.add(String(w.id)));
    } else {
      studySelectedWordIds.clear();
    }

    const listEl = document.getElementById('studyWordSelectList');
    if (listEl) {
      const items = listEl.querySelectorAll('.study-word-item');
      items.forEach(el => {
        el.classList.toggle('selected', selectAll);
        const circle = el.querySelector('.select-circle');
        if (circle) circle.classList.toggle('selected', selectAll);
      });
    }

    syncStudySelectionUI();
  };

  /**
   * Launch the recitation session with the specifically chosen words.
   */
  window.startRecitingSelectedWords = function startRecitingSelectedWords() {
    if (studySelectedWordIds.size === 0) {
      toast('Please select at least 1 word to recite!');
      return;
    }

    let selectedWords = (D.words || []).filter(w => studySelectedWordIds.has(String(w.id)));
    if (!selectedWords.length) {
      toast('Selected words could not be found.');
      return;
    }

    const shouldShuffle = document.getElementById('studyShuffleToggle')?.checked ?? true;
    if (shouldShuffle) {
      selectedWords = [...selectedWords].sort(() => Math.random() - 0.5);
    }

    lList = selectedWords;
    lI = 0;
    lLearnedThisSession = 0;
    currentStudyDeckId = currentStudyDeckTargetId;

    nav('learn');
    renderLearn();
  };

  /**
   * Main entry point for Study Mode.
   *
   * @param {?string} deckId
   */
  window.startLearn = function startLearn(deckId = null) {
    if (deckId) {
      openStudyWordSelect(deckId, 'deck-overview');
    } else {
      openStudyDeckPicker();
    }
  };

  /**
   * Render the current recitation word in Study Mode.
   */
  window.renderLearn = function renderLearn() {
    const done = document.getElementById('lDone');
    const main = document.getElementById('lMain');
    if (!done || !main) return;

    if (!Array.isArray(lList) || lList.length === 0 || lI >= lList.length) {
      main.style.display = 'none';
      done.style.display = 'flex';
      const statsEl = document.getElementById('lDoneStats');
      if (statsEl) {
        const total = Array.isArray(lList) ? lList.length : 0;
        statsEl.textContent = `You recited ${total} words in this session (${lLearnedThisSession} marked as learned).`;
      }
      return;
    }

    main.style.display = 'flex';
    done.style.display = 'none';

    const w = lList[lI];
    const deck = (D.decks || []).find(d => String(d.id) === String(w.deckId));

    const cntEl = document.getElementById('lCnt');
    if (cntEl) cntEl.textContent = `Word ${lI + 1} of ${lList.length}`;

    const wordEl = document.getElementById('lWord');
    if (wordEl) wordEl.textContent = w.word || '';

    const pronEl = document.getElementById('lPron');
    if (pronEl) pronEl.textContent = w.pronunciation ? `/${w.pronunciation}/` : '';

    const meaningEl = document.getElementById('lMeaning');
    if (meaningEl) meaningEl.textContent = w.meaning || '';

    const deckBadge = document.getElementById('lDeckBadge');
    if (deckBadge) {
      if (deck) {
        deckBadge.style.display = 'block';
        deckBadge.style.color = deck.color || 'var(--ink)';
        deckBadge.textContent = deck.name;
      } else {
        deckBadge.style.display = 'none';
      }
    }

    const typeDisplay = (w.type || 'N').split(',')[0].toUpperCase();
    const tagsEl = document.getElementById('lTags');
    if (tagsEl) tagsEl.innerHTML = `<div class="tag-pill">${escHTML(typeDisplay)}</div>`;

    const exWrap = document.getElementById('lExWrap');
    const sentenceEl = document.getElementById('lSentence');
    const btnPlayEx = document.getElementById('lPlayEx');

    if (w.example && w.example.trim()) {
      if (exWrap) exWrap.style.display = 'block';
      if (btnPlayEx) btnPlayEx.style.display = 'flex';
      const safeEx = escHTML(w.example);
      const safeWord = escHTML(w.word);
      const highlighted = safeEx.replace(
        new RegExp('\\b' + safeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'),
        m => `<span class="hl">${m}</span>`
      );
      if (sentenceEl) sentenceEl.innerHTML = `"${highlighted}"`;
    } else {
      if (exWrap) exWrap.style.display = 'none';
      if (btnPlayEx) btnPlayEx.style.display = 'none';
    }

    const notesWrap = document.getElementById('lNotesWrap');
    const notesEl = document.getElementById('lNotes');
    if (w.notes && w.notes.trim() !== '' && w.notes.trim() !== '-') {
      if (notesWrap) notesWrap.style.display = 'block';
      if (notesEl) notesEl.textContent = w.notes;
    } else {
      if (notesWrap) notesWrap.style.display = 'none';
    }

    const prevBtn = document.getElementById('btnPrevLearn');
    if (prevBtn) {
      if (lI === 0) {
        prevBtn.style.opacity = '0.4';
        prevBtn.style.pointerEvents = 'none';
      } else {
        prevBtn.style.opacity = '1';
        prevBtn.style.pointerEvents = 'auto';
      }
    }

    const autoPlayBtn = document.getElementById('btnStudyAutoPlay');
    if (autoPlayBtn) {
      autoPlayBtn.style.opacity = D.profile?.autoPlay ? '1' : '0.4';
    }

    if (D.profile?.autoPlay && typeof speak === 'function') {
      setTimeout(() => speak(w.word), 150);
    }
  };

  /**
   * Previous word in recitation.
   */
  window.prevLearn = function prevLearn() {
    if (lI > 0) {
      lI--;
      renderLearn();
    }
  };

  /**
   * Skip current word to next word without incrementing learned count.
   */
  window.skipLearn = function skipLearn() {
    if (!Array.isArray(lList) || !lList.length) return;
    lI++;
    renderLearn();
  };

  /**
   * Mark current word as learned and advance.
   */
  window.nextLearn = function nextLearn() {
    if (!Array.isArray(lList) || !lList.length) return;
    D.todayDone = Number(D.todayDone || 0) + 1;
    if (typeof markStudied === 'function') markStudied();
    if (typeof save === 'function') save();
    lLearnedThisSession++;
    lI++;
    renderLearn();
    if (typeof updateHome === 'function') updateHome();
  };

  /**
   * Repeat the exact same session of selected words.
   */
  window.restartCurrentStudySession = function restartCurrentStudySession() {
    const shouldShuffle = document.getElementById('studyShuffleToggle')?.checked ?? false;
    if (shouldShuffle && Array.isArray(lList)) {
      lList = [...lList].sort(() => Math.random() - 0.5);
    }
    lI = 0;
    lLearnedThisSession = 0;
    renderLearn();
  };

  /**
   * Confirm or exit Study Mode back to word selector or home.
   */
  window.confirmExitStudy = function confirmExitStudy() {
    if (currentStudyDeckTargetId) {
      openStudyWordSelect(currentStudyDeckTargetId, studyPreviousScreen);
    } else {
      nav('home');
    }
  };

  /**
   * Toggle auto-pronounce in Study Mode.
   */
  window.toggleStudyAudioAutoPlay = function toggleStudyAudioAutoPlay() {
    if (!D.profile) D.profile = {};
    D.profile.autoPlay = !D.profile.autoPlay;
    if (typeof save === 'function') save();
    toast(`Auto Pronounce: ${D.profile.autoPlay ? 'ON' : 'OFF'}`);
    const autoPlayBtn = document.getElementById('btnStudyAutoPlay');
    if (autoPlayBtn) {
      autoPlayBtn.style.opacity = D.profile.autoPlay ? '1' : '0.4';
    }
  };

  window.skipFC = function skipFC() {
    if (!Array.isArray(fcQ) || !fcQ.length) return;
    fcI++;
    renderFC();
  };

  const originalRenderFC = window.renderFC;
  window.renderFC = function renderFCWithMobileSafeControls() {
    if (typeof originalRenderFC === 'function') originalRenderFC();
    hardenFlashcardControls();
  };

  document.addEventListener('DOMContentLoaded', () => {
    hardenFlashcardControls();
  }, { once: true });

  setTimeout(() => {
    hardenFlashcardControls();
  }, 0);
})();
