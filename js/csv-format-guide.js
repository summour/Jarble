// WordJar CSV Format Guide V5
// New standard order: Word, Type, Pronunciation, Meaning, Synonyms, Example1, Example2, Example3, Notes.
// Legacy CSVs with a single Example column remain importable.

(function installCSVFormatGuide() {
  if (window.__wordjarCSVFormatGuideInstalledV5) return;
  window.__wordjarCSVFormatGuideInstalledV5 = true;

  const CSV_COLUMNS = [
    'Word','Type','Pronunciation','Meaning','Synonyms',
    'Example1','Example2','Example3','Notes','Deck','Language','Starred',
    'Interval','EaseFactor','Reps','NextReview','AddedDate'
  ];

  function csvEscape(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function parseSynonyms(value) {
    const parts = Array.isArray(value) ? value : [value];
    return [...new Set(parts
      .flatMap(item => String(item || '').split(/[,;|/]+/))
      .map(item => item.trim())
      .filter(Boolean))];
  }

  function synonymsToCSV(value) { return parseSynonyms(value).join('; '); }

  function splitExamples(word) {
    const explicit = [word.example1, word.example2, word.example3].map(v => String(v || '').trim());
    if (explicit.some(Boolean)) return explicit;
    const legacy = String(word.example || '').split(/\r?\n|\s*\|\s*/).map(v => v.trim()).filter(Boolean);
    return [legacy[0] || '', legacy[1] || '', legacy[2] || ''];
  }

  function combinedExample(examples) {
    return examples.map(v => String(v || '').trim()).filter(Boolean).join('\n');
  }

  function deckNameFor(deckId) {
    if (typeof isSystemNoDeckId === 'function' && isSystemNoDeckId(deckId)) return SYSTEM_NO_DECK_NAME || 'No Deck';
    const d = (D.decks || []).find(deck => String(deck.id) === String(deckId));
    return d ? d.name : '';
  }

  function langFor(word) {
    if (word.lang) return word.lang;
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(word.word || '')) ? 'ja' : 'en';
  }

  window.exportCSV = function exportCSVCurrent(filterDeckId) {
    const listToExport = filterDeckId
      ? (D.words || []).filter(w => String(w.deckId) === String(filterDeckId))
      : (D.words || []);
    if (!listToExport.length) return toast('No words to export');

    const rows = listToExport.map(w => {
      const ex = splitExamples(w);
      return [
        w.word || '', w.type || '', w.pronunciation || '', w.meaning || '',
        synonymsToCSV(w.synonyms || w.synonym || ''), ex[0], ex[1], ex[2], w.notes || '',
        deckNameFor(w.deckId), langFor(w), w.starred ? '1' : '0',
        w.interval ?? w.scheduledDays ?? '', w.ef ?? '', w.reps ?? 0,
        w.nextReview || w.dueAt || '', w.addedDate || ''
      ].map(csvEscape);
    });

    const csv = '\uFEFF' + [CSV_COLUMNS.map(csvEscape), ...rows].map(row => row.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'wordjar_export.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exported!');
  };

  window.makeImportedWord = function makeImportedWordCurrent(cols, targetDeckId, index) {
    const wordStr = String(cols[0] || '').trim();
    const meaning = String(cols[3] || '').trim();
    if (!wordStr || cols.length < 4) return null;

    // New learner CSVs normally have 9 columns; full V5 exports have 17.
    // Everything else follows the previous V4 layout for backwards compatibility.
    const isV5 = cols.length === 9 || cols.length >= 17;
    const examples = isV5
      ? [cols[5] || '', cols[6] || '', cols[7] || ''].map(v => String(v).trim())
      : [cols[5] || '', '', ''].map(v => String(v).trim());
    const notesIndex = isV5 ? 8 : 6;
    const deckIndex = isV5 ? 9 : 7;
    const langIndex = isV5 ? 10 : 8;
    const starredIndex = isV5 ? 11 : 9;
    const intervalIndex = isV5 ? 12 : 10;
    const efIndex = isV5 ? 13 : 11;
    const repsIndex = isV5 ? 14 : 12;
    const nextReviewIndex = isV5 ? 15 : 13;
    const addedDateIndex = isV5 ? 16 : 14;

    const lang = String(cols[langIndex] || '').trim() || (/[\u3040-\u30ff\u3400-\u9fff]/.test(wordStr) ? 'ja' : 'en');
    const interval = Number(cols[intervalIndex] || 1) || 1;
    const ef = Number(cols[efIndex] || 2.5) || 2.5;
    const reps = Number(cols[repsIndex] || 0) || 0;
    const nextReview = String(cols[nextReviewIndex] || '').trim() || null;
    const addedDate = String(cols[addedDateIndex] || '').trim() || (typeof today === 'function' ? today() : new Date().toISOString().split('T')[0]);

    return {
      id: 'w' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 6),
      word: wordStr,
      type: cols[1] || 'N',
      pronunciation: cols[2] || '',
      meaning,
      synonyms: parseSynonyms(cols[4] || ''),
      example1: examples[0],
      example2: examples[1],
      example3: examples[2],
      // Keep the legacy field populated so Study, Flashcards, search and TTS work without migration.
      example: combinedExample(examples),
      notes: cols[notesIndex] || '',
      deckId: targetDeckId || (typeof SYSTEM_NO_DECK_ID !== 'undefined' ? SYSTEM_NO_DECK_ID : '__wordjar_system_no_deck__'),
      lang,
      starred: ['1','true','yes','y','starred'].includes(String(cols[starredIndex] || '').trim().toLowerCase()),
      addedDate, interval, scheduledDays: interval, reps, ef, nextReview,
      srsState: reps > 0 || nextReview ? 'review' : 'new',
      lapses: 0
    };
  };

  function updateCSVHelpText() {
    const account = document.getElementById('pg-account');
    if (!account) return;
    const labels = Array.from(account.querySelectorAll('.format-label'));
    const csvLabel = labels.find(el => /CSV Format/i.test(el.textContent || ''));
    if (!csvLabel) return;
    csvLabel.innerHTML = `
      <span style="font-weight:700; color:var(--ink);">CSV Format:</span><br>
      Required: <b>Word, Type, Pronunciation, Meaning</b><br>
      Optional order: Synonyms, Example1, Example2, Example3, Notes<br>
      Synonyms can be separated with comma or semicolon.
    `;
  }

  // Preserve line breaks when the compatibility `example` field is rendered.
  function installExampleLineBreakStyle() {
    if (document.getElementById('wordjarExampleLineBreakStyle')) return;
    const style = document.createElement('style');
    style.id = 'wordjarExampleLineBreakStyle';
    style.textContent = '#lSentence, #fcEx { white-space: pre-line !important; }';
    document.head.appendChild(style);
  }

  const originalUpdateAccount = window.__wordjarOriginalUpdateAccountForCSVGuide || window.updateAccount;
  window.__wordjarOriginalUpdateAccountForCSVGuide = originalUpdateAccount;
  window.updateAccount = function updateAccountWithCSVGuide() {
    if (typeof originalUpdateAccount === 'function') originalUpdateAccount();
    updateCSVHelpText();
  };

  installExampleLineBreakStyle();
  setTimeout(updateCSVHelpText, 0);
  window.WordJarCSVFormat = { columns: CSV_COLUMNS, updateCSVHelpText, parseSynonyms, splitExamples };
})();
