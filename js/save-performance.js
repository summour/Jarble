// WordJar Save Safety V6
// Fixes data disappearing after reopening when JSON backups are too large for localStorage.
// localStorage is still used for fast startup, but IndexedDB is the durable source for large backups.

(function installSavePerformance() {
  if (window.__wordjarSavePerformanceInstalled) return;
  window.__wordjarSavePerformanceInstalled = true;

  const originalSave = window.save;
  const originalClearAll = window.clearAll;
  const DURABLE_BACKUP_KEY = `${SK}_last_good_local_backup`;
  const LAST_IMPORTED_BACKUP_KEY = `${SK}_last_imported_json_backup`;
  const IDB_DB = 'wordjar_durable_storage_v1';
  const IDB_STORE = 'keyval';
  const IDB_MAIN_KEY = `${SK}_indexeddb_main`;
  const IDB_IMPORTED_KEY = `${SK}_indexeddb_last_imported`;

  if (typeof originalSave !== 'function') return;

  function safeNow() {
    try { return new Date().toISOString(); }
    catch (err) { return String(Date.now()); }
  }

  function stampLocalChange(reason = 'local-save') {
    try {
      D.meta = D.meta || {};
      D.meta.updatedAt = safeNow();
      D.meta.updatedBy = reason;
    } catch (err) {}
  }

  function countWords(data) { return Array.isArray(data?.words) ? data.words.length : 0; }
  function countDecks(data) { return Array.isArray(data?.decks) ? data.decks.length : 0; }

  function getUpdatedAtMs(data) {
    const value = data?.meta?.updatedAt || data?.exportedAt || data?.updatedAt || data?.updatedAtClient;
    const ms = value ? Date.parse(value) : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function clearTransientStorage() {
    ['wordjar_reader_lookup_cache_v1', 'wordjar_reader_quality_cache_v1'].forEach(key => localStorage.removeItem(key));
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('wordjar_reader_') && key !== 'wordjar_reader_note_v1') localStorage.removeItem(key);
    });
  }

  function tryWriteLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (firstError) {
      try {
        clearTransientStorage();
        localStorage.setItem(key, value);
        return true;
      } catch (secondError) {
        console.warn('WordJar localStorage write failed; IndexedDB backup will be used.', secondError);
        return false;
      }
    }
  }

  function openDurableDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not available'));
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open IndexedDB'));
    });
  }

  async function idbSet(key, value) {
    const db = await openDurableDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB write failed')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB write aborted')); };
    });
  }

  async function idbGet(key) {
    const db = await openDurableDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
      tx.onabort = () => db.close();
    });
  }

  async function idbDelete(key) {
    const db = await openDurableDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB delete failed')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB delete aborted')); };
    });
  }

  function parseStoredPayload(value) {
    if (!value) return null;
    try {
      if (typeof value === 'string') return JSON.parse(value);
      if (typeof value === 'object') return value;
      return null;
    } catch (err) {
      return null;
    }
  }

  function looksLikeWordJarData(data) {
    return !!data && typeof data === 'object' && Array.isArray(data.words);
  }

  function parsePossiblyStringified(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Empty backup value');
    return JSON.parse(trimmed);
  }

  function extractWordJarData(parsed, depth = 0) {
    if (depth > 4) throw new Error('Backup nesting is too deep');
    const value = parsePossiblyStringified(parsed);
    if (!value || typeof value !== 'object') throw new Error('Invalid backup file');
    if (looksLikeWordJarData(value.data)) return value.data;
    if (looksLikeWordJarData(value)) return value;
    if (value[SK]) return extractWordJarData(value[SK], depth + 1);
    if (value.wordjar_v4) return extractWordJarData(value.wordjar_v4, depth + 1);
    if (value.localStorage?.[SK]) return extractWordJarData(value.localStorage[SK], depth + 1);
    if (value.storage?.[SK]) return extractWordJarData(value.storage[SK], depth + 1);
    if (Array.isArray(value.cards)) return { ...value, words: value.cards, decks: Array.isArray(value.decks) ? value.decks : [] };
    throw new Error('This JSON does not contain WordJar words data');
  }

  function normalizeImportedWordJarData(parsed) {
    const data = extractWordJarData(parsed);
    const normalized = typeof normalizeWordJarData === 'function' ? normalizeWordJarData(data) : { ...data };
    if (!Array.isArray(normalized.words)) throw new Error('Invalid backup: words must be an array');
    if (!Array.isArray(normalized.decks)) normalized.decks = [];
    normalized.profile = normalized.profile || {};
    normalized.studyDays = normalized.studyDays || {};
    normalized.settings = normalized.settings || {};
    normalized.meta = normalized.meta || {};
    normalized.meta.updatedAt = safeNow();
    normalized.meta.updatedBy = 'json-import';
    return normalized;
  }

  window.normalizeWordJarImportedBackup = normalizeImportedWordJarData;

  function localCandidates() {
    return [
      { source: 'main-localStorage', data: readJSON(SK), priority: 1 },
      { source: 'last-good-localStorage', data: readJSON(DURABLE_BACKUP_KEY), priority: 2 },
      { source: 'last-imported-localStorage', data: readJSON(LAST_IMPORTED_BACKUP_KEY), priority: 3 }
    ].filter(item => item.data && Array.isArray(item.data.words));
  }

  function sortCandidates(candidates) {
    return candidates.sort((a, b) => {
      const wordDiff = countWords(b.data) - countWords(a.data);
      if (wordDiff) return wordDiff;
      const deckDiff = countDecks(b.data) - countDecks(a.data);
      if (deckDiff) return deckDiff;
      const timeDiff = getUpdatedAtMs(b.data) - getUpdatedAtMs(a.data);
      if (timeDiff) return timeDiff;
      return b.priority - a.priority;
    });
  }

  async function allRecoveryCandidates() {
    const candidates = localCandidates();
    try {
      const idbMain = parseStoredPayload(await idbGet(IDB_MAIN_KEY));
      if (idbMain && Array.isArray(idbMain.words)) candidates.push({ source: 'main-indexedDB', data: idbMain, priority: 4 });
    } catch (err) {}
    try {
      const idbImported = parseStoredPayload(await idbGet(IDB_IMPORTED_KEY));
      if (idbImported && Array.isArray(idbImported.words)) candidates.push({ source: 'last-imported-indexedDB', data: idbImported, priority: 5 });
    } catch (err) {}
    return sortCandidates(candidates);
  }

  function bestLocalCandidate() {
    const candidates = sortCandidates(localCandidates());
    return candidates[0] || null;
  }

  function shouldBlockEmptyOrSampleSave(reason) {
    const explicitReplaceReasons = new Set(['json-import', 'cloud-load']);
    if (explicitReplaceReasons.has(reason)) return false;
    const best = bestLocalCandidate();
    if (!best) return false;
    const currentWords = countWords(D);
    const bestWords = countWords(best.data);
    return bestWords > 0 && (currentWords === 0 || (currentWords <= 3 && bestWords > currentWords));
  }

  function refreshUI() {
    if (typeof refreshAllVisibleUI === 'function') refreshAllVisibleUI();
    else {
      if (typeof updateHome === 'function') updateHome();
      if (typeof renderWords === 'function') renderWords();
      if (typeof renderDecks === 'function') renderDecks();
      if (typeof updateAccount === 'function') updateAccount();
    }
  }

  function writeLocalMirrors(payload, reason) {
    const mainOk = tryWriteLocalStorage(SK, payload);
    try {
      const mirror = readJSON(DURABLE_BACKUP_KEY);
      if (countWords(D) > 0 && countWords(D) >= countWords(mirror)) tryWriteLocalStorage(DURABLE_BACKUP_KEY, payload);
      if (reason === 'json-import' || reason === 'cloud-load') tryWriteLocalStorage(LAST_IMPORTED_BACKUP_KEY, payload);
    } catch (err) {}
    return mainOk;
  }

  async function persistIndexedDB(payload, reason) {
    const data = parseStoredPayload(payload);
    if (!data || !Array.isArray(data.words)) return false;
    await idbSet(IDB_MAIN_KEY, payload);
    if (reason === 'json-import' || reason === 'cloud-load') await idbSet(IDB_IMPORTED_KEY, payload);
    return true;
  }

  function applyRecoveredData(data, source, toastUser = false) {
    if (!data || !Array.isArray(data.words)) return false;
    D = data;
    window.D = D;
    if (typeof normalizeWordDeckIds === 'function') normalizeWordDeckIds();
    stampLocalChange(`restore-${source}`);
    const payload = JSON.stringify(D);
    writeLocalMirrors(payload, `restore-${source}`);
    persistIndexedDB(payload, `restore-${source}`).catch(() => {});
    refreshUI();
    if (toastUser && typeof toast === 'function') toast(`Restored ${countWords(D)} words from durable backup`);
    return true;
  }

  function persistWordJarData(reason = 'local-save') {
    if (shouldBlockEmptyOrSampleSave(reason)) {
      const best = bestLocalCandidate();
      if (best && applyRecoveredData(best.data, best.source, true)) return;
    }

    stampLocalChange(reason);
    const payload = JSON.stringify(D);
    writeLocalMirrors(payload, reason);
    persistIndexedDB(payload, reason).catch(err => console.warn('WordJar IndexedDB save failed', err));
  }

  async function restoreDurableBackupIfNeeded(toastUser = false) {
    const candidates = await allRecoveryCandidates();
    const best = candidates[0];
    if (!best) return false;

    const currentWords = countWords(D);
    const mainWords = countWords(readJSON(SK));
    const bestWords = countWords(best.data);
    const shouldRestore =
      bestWords > Math.max(currentWords, mainWords) ||
      (!readJSON(SK) && bestWords > 0) ||
      (mainWords === 0 && bestWords > 0) ||
      (currentWords === 0 && bestWords > 0) ||
      (currentWords <= 3 && bestWords > currentWords);

    if (!shouldRestore) return false;
    return applyRecoveredData(best.data, best.source, toastUser);
  }

  window.flushWordJarSave = function flushWordJarSave() { persistWordJarData('flush-save'); };
  window.save = function saveImmediate() { persistWordJarData('local-save'); };
  window.restoreWordJarLocalBackup = function restoreWordJarLocalBackup() {
    restoreDurableBackupIfNeeded(true);
  };

  window.handleJSONImport = function handleJSONImportDurable(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target.result);
        const restored = normalizeImportedWordJarData(parsed);
        const restoredWordCount = countWords(restored);
        const restoredDeckCount = countDecks(restored);
        const currentWordCount = countWords(D);

        if (restoredWordCount === 0 && currentWordCount > 0) {
          const allowEmpty = confirm('This JSON backup has 0 words. Restoring it will erase the current local words. Continue?');
          if (!allowEmpty) return;
        }

        const confirmed = confirm(`Restore this JSON backup?\n\nWords: ${restoredWordCount}\nDecks: ${restoredDeckCount}\n\nThis will replace current local WordJar data.`);
        if (!confirmed) return;

        D = restored;
        window.D = D;
        if (typeof normalizeWordDeckIds === 'function') normalizeWordDeckIds();
        if (window.WordJarFSRS?.migrateAllCards) WordJarFSRS.migrateAllCards();
        if (window.WordJarAppIntegrity?.run) WordJarAppIntegrity.run({ silent: true });
        stampLocalChange('json-import');

        const payload = JSON.stringify(D);
        const localOk = writeLocalMirrors(payload, 'json-import');
        await persistIndexedDB(payload, 'json-import');

        const verifiedIdb = parseStoredPayload(await idbGet(IDB_IMPORTED_KEY));
        if (countWords(verifiedIdb) !== countWords(D) || countDecks(verifiedIdb) !== countDecks(D)) {
          throw new Error('Imported data was not written correctly to IndexedDB');
        }

        refreshUI();
        toast(`JSON backup restored · ${countWords(D)} words saved ${localOk ? 'locally' : 'to durable storage'}`);
      } catch (err) {
        console.error('WordJar JSON import failed:', err);
        alert(`Import failed. No data was changed.\n\n${err?.message || 'Invalid WordJar JSON backup.'}`);
      } finally {
        if (event?.target) event.target.value = '';
      }
    };

    reader.onerror = () => {
      alert('Could not read this JSON file. No data was changed.');
      if (event?.target) event.target.value = '';
    };

    reader.readAsText(file, 'UTF-8');
  };

  if (typeof originalClearAll === 'function') {
    window.clearAll = function clearAllWithDurableCleanup() {
      const result = originalClearAll.apply(this, arguments);
      try {
        const mainData = readJSON(SK);
        if (!mainData || countWords(mainData) === 0) {
          localStorage.removeItem(DURABLE_BACKUP_KEY);
          localStorage.removeItem(LAST_IMPORTED_BACKUP_KEY);
          idbDelete(IDB_MAIN_KEY).catch(() => {});
          idbDelete(IDB_IMPORTED_KEY).catch(() => {});
        }
      } catch (err) {}
      return result;
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    try { persistWordJarData('page-hidden'); } catch (err) { console.warn('WordJar page-hidden save failed', err); }
  });

  window.addEventListener('pagehide', () => {
    try { persistWordJarData('page-hide'); } catch (err) { console.warn('WordJar page-hide save failed', err); }
  });

  window.addEventListener('pageshow', () => {
    restoreDurableBackupIfNeeded(true).catch(err => console.warn('WordJar pageshow restore failed', err));
  });

  window.addEventListener('beforeunload', () => {
    try { persistWordJarData('before-unload'); } catch (err) { console.warn('WordJar before-unload save failed', err); }
  });

  setTimeout(() => restoreDurableBackupIfNeeded(true).catch(() => {}), 0);
  setTimeout(() => restoreDurableBackupIfNeeded(true).catch(() => {}), 1200);
})();
