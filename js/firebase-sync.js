// Firebase cloud backup sync + staged module loader
// Cloud backup uses one Firestore document only. Storage is not required.

let wordjarCloudStatusUid = null;
let wordjarCloudStatusRunning = false;
let wordjarCloudOperationRunning = false;

const WORDJAR_CLOUD_MAX_BYTES = 850 * 1024;
const WORDJAR_CLOUD_QUOTA_CODES = new Set(['22', 'resource-exhausted', 'quota-exceeded']);

function setCloudSignedInState(isSignedIn) {
  const out = document.getElementById('cloudSignedOutActions');
  const inn = document.getElementById('cloudSignedInActions');
  if (!out || !inn) return;
  out.style.display = isSignedIn ? 'none' : 'flex';
  inn.style.display = isSignedIn ? 'block' : 'none';
}

function setCloudStatus(message, type = 'warn') {
  const el = document.getElementById('cloudStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `sync-status ${type}`;
}

function isCloudQuotaError(err) {
  const code = err?.code ? String(err.code).toLowerCase() : '';
  const message = err?.message ? String(err.message).toLowerCase() : '';
  return WORDJAR_CLOUD_QUOTA_CODES.has(code) || message.includes('quota') || message.includes('resource exhausted');
}

function getFirebaseErrorText(err) {
  const code = err?.code ? String(err.code) : 'unknown';
  const message = err?.message ? String(err.message).replace(/^FirebaseError:\s*/i, '') : 'Unknown Firebase error';

  if (isCloudQuotaError(err)) {
    return 'Firestore free quota is temporarily exceeded. Try again later, or use Export JSON / Import JSON.';
  }

  const help = {
    'permission-denied': 'Firestore Rules are blocking this path. Keep the WordJar Firestore rules in Firebase Console > Firestore Database > Rules.',
    'unauthenticated': 'Google sign-in is not active. Sign out, sign in again, then retry.',
    'failed-precondition': 'Firestore database may not be created or rules are not ready in Firebase Console.',
    'unavailable': 'Firebase is temporarily unavailable or the network is offline. Retry after reconnecting.',
    'invalid-argument': 'The backup payload contains a value Firestore cannot store. Export JSON as a fallback.'
  }[code];

  return `${code}: ${message}${help ? ` ${help}` : ''}`;
}

function getJsonSafeData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function getCloudPayloadByteSize(text) {
  try {
    return new Blob([text]).size;
  } catch (err) {
    return String(text || '').length;
  }
}

function getCloudBackupPayload() {
  const data = getJsonSafeData(D);
  data.meta = data.meta || {};
  data.meta.updatedAt = new Date().toISOString();
  data.meta.updatedBy = 'firestore-cloud-save';

  return {
    app: 'Jarble',
    version: SK,
    backupType: 'firestore-single-document',
    updatedAtClient: data.meta.updatedAt,
    data
  };
}

function firebaseConfigReady() {
  return FIREBASE_CONFIG &&
    typeof FIREBASE_CONFIG === 'object' &&
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.projectId &&
    !FIREBASE_CONFIG.apiKey.includes('YOUR_API_KEY_HERE') &&
    !FIREBASE_CONFIG.projectId.includes('your-project-id');
}

async function loadPrivateApiKeyAfterAuth() {
  if (window.WordJarPrivateApiKeyCloud?.handleAuthStateApiKeyLoad) {
    return WordJarPrivateApiKeyCloud.handleAuthStateApiKeyLoad();
  }
  if (typeof window.loadApiKeyFromCloud === 'function') {
    return window.loadApiKeyFromCloud();
  }
  return '';
}

function initCloudSync() {
  if (!firebaseConfigReady()) {
    setCloudStatus('Cloud sync is not configured yet. JSON backup works without setup.', 'warn');
    setCloudSignedInState(false);
    loadPrivateApiKeyAfterAuth();
    return;
  }

  if (!window.firebase) {
    setCloudStatus('Firebase SDK failed to load.', 'err');
    setCloudSignedInState(false);
    loadPrivateApiKeyAfterAuth();
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    cloudAuth = firebase.auth();
    cloudDb = firebase.firestore();

    cloudAuth.onAuthStateChanged(async user => {
      cloudUser = user || null;
      await loadPrivateApiKeyAfterAuth();

      if (user) {
        setCloudSignedInState(true);
        checkCloudBackupStatus(user);
      } else {
        wordjarCloudStatusUid = null;
        wordjarCloudStatusRunning = false;
        wordjarCloudOperationRunning = false;
        setCloudStatus('Not signed in. Sign in to use cloud backup.', 'warn');
        setCloudSignedInState(false);
      }
    });

    cloudAuth.getRedirectResult().catch(() => {});
  } catch (err) {
    setCloudStatus(`Cloud sync is not available. ${getFirebaseErrorText(err)}`, 'err');
    setCloudSignedInState(false);
    loadPrivateApiKeyAfterAuth();
  }
}

async function signInCloud() {
  if (!cloudAuth) return toast('Cloud sync is not ready');

  const provider = new firebase.auth.GoogleAuthProvider();

  try {
    await cloudAuth.signInWithPopup(provider);
  } catch (err) {
    try {
      await cloudAuth.signInWithRedirect(provider);
    } catch (redirectErr) {
      setCloudStatus(`Sign in failed. ${getFirebaseErrorText(redirectErr)}`, 'err');
      toast('Sign in failed');
    }
  }
}

async function signOutCloud() {
  if (!cloudAuth) return toast('Cloud is not configured');
  await cloudAuth.signOut();
  toast('Signed out');
}

function cloudBackupRef(user = cloudUser) {
  if (!cloudDb || !user) return null;
  return cloudDb.collection('wordjarUsers').doc(user.uid).collection('backups').doc('main');
}

function getCloudUpdatedText(raw) {
  if (!raw) return '';
  const updatedAt = raw.updatedAt;
  if (updatedAt?.toDate) return updatedAt.toDate().toLocaleString();
  if (raw.updatedAtClient) return new Date(raw.updatedAtClient).toLocaleString();
  if (raw.data?.meta?.updatedAt) return new Date(raw.data.meta.updatedAt).toLocaleString();
  return '';
}

function getCloudBackupSummary(raw) {
  if (!raw) return '';
  if (raw.chunked) return ' · old chunked backup';
  if (!raw.data) return '';
  const sizeKb = raw.byteSize ? ` · ${Math.round(raw.byteSize / 1024)} KB` : '';
  return ` · Firestore single document${sizeKb}`;
}

async function checkCloudBackupStatus(user) {
  if (!cloudDb || !user || wordjarCloudStatusRunning) return;
  if (wordjarCloudStatusUid === user.uid) return;

  wordjarCloudStatusRunning = true;
  wordjarCloudStatusUid = user.uid;

  try {
    const snap = await cloudBackupRef(user).get();

    if (!snap.exists) {
      setCloudStatus(`Signed in: ${user.email || user.uid}. No cloud backup yet. Tap Save to Cloud to create one.`, 'warn');
      return;
    }

    const raw = snap.data();
    const updatedText = getCloudUpdatedText(raw);
    const summary = getCloudBackupSummary(raw);
    const note = raw.chunked ? ' Tap Save to Cloud to replace it with the free single-document backup.' : ' Tap Load only when you want to replace local data.';
    setCloudStatus(`Signed in: ${user.email || user.uid}. Cloud backup found${summary}${updatedText ? ` (${updatedText})` : ''}.${note}`, raw.chunked ? 'warn' : 'ok');
  } catch (err) {
    setCloudStatus(`Signed in: ${user.email || user.uid}. Could not check cloud backup. ${getFirebaseErrorText(err)}`, 'err');
  } finally {
    wordjarCloudStatusRunning = false;
  }
}

async function saveCloudBackup() {
  if (wordjarCloudOperationRunning) return toast('Cloud sync is already running');
  if (typeof flushWordJarSave === 'function') flushWordJarSave();

  const ref = cloudBackupRef();
  if (!ref) return toast('Sign in first');

  wordjarCloudOperationRunning = true;

  try {
    const payload = getCloudBackupPayload();
    const payloadText = JSON.stringify(payload);
    const byteSize = getCloudPayloadByteSize(payloadText);
    const sizeKb = Math.round(byteSize / 1024);

    if (byteSize > WORDJAR_CLOUD_MAX_BYTES) {
      const limitKb = Math.round(WORDJAR_CLOUD_MAX_BYTES / 1024);
      setCloudStatus(`Cloud backup is ${sizeKb} KB, above the free Firestore safe limit ${limitKb} KB. Use Export JSON for this backup.`, 'err');
      toast('Cloud backup too large');
      return;
    }

    setCloudStatus(`Signed in: ${cloudUser.email || cloudUser.uid}. Saving Firestore backup · ${sizeKb} KB...`, 'warn');

    await ref.set({
      ...payload,
      uid: cloudUser.uid,
      chunked: false,
      byteSize,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: false });

    D.meta = payload.data.meta;
    save();
    setCloudStatus(`Signed in: ${cloudUser.email || cloudUser.uid}. Saved to cloud just now · ${sizeKb} KB.`, 'ok');
    toast('Saved to cloud');
  } catch (err) {
    console.error('WordJar cloud save failed:', err);
    setCloudStatus(`Cloud save failed. ${getFirebaseErrorText(err)}`, 'err');
    toast(isCloudQuotaError(err) ? 'Firestore quota exceeded' : 'Cloud save failed');
  } finally {
    wordjarCloudOperationRunning = false;
  }
}

function applyCloudBackupData(restored) {
  D = restored;
  window.D = D;
  D.meta = D.meta || {};
  D.meta.updatedAt = new Date().toISOString();
  D.meta.updatedBy = 'cloud-load';

  if (typeof normalizeWordDeckIds === 'function') normalizeWordDeckIds();
  if (window.WordJarFSRS?.migrateAllCards) WordJarFSRS.migrateAllCards();
  if (window.WordJarAppIntegrity?.run) WordJarAppIntegrity.run({ silent: true });
  if (typeof flushWordJarSave === 'function') flushWordJarSave();
  save();
  refreshAllVisibleUI();
}

async function autoLoadCloudBackupAfterSignIn(user) {
  await checkCloudBackupStatus(user);
}

async function loadCloudBackup() {
  if (wordjarCloudOperationRunning) return toast('Cloud sync is already running');

  const ref = cloudBackupRef();
  if (!ref) return toast('Sign in first');

  wordjarCloudOperationRunning = true;

  try {
    setCloudStatus(`Signed in: ${cloudUser.email || cloudUser.uid}. Checking cloud backup...`, 'warn');

    const snap = await ref.get();
    if (!snap.exists) {
      setCloudStatus(`Signed in: ${cloudUser.email || cloudUser.uid}. No cloud backup found.`, 'warn');
      return toast('No cloud backup found');
    }

    const raw = snap.data();
    if (raw.chunked && !raw.data) {
      setCloudStatus('This is an old chunked Firestore backup. To avoid quota problems, WordJar will not read chunks. Use local JSON backup or tap Save to Cloud to replace it.', 'err');
      return toast('Old cloud backup format');
    }

    const restored = normalizeWordJarData(raw.data || raw);
    const summary = getCloudBackupSummary(raw);
    const updatedText = getCloudUpdatedText(raw);
    const confirmed = window.WordJarDialog
      ? await WordJarDialog.confirm({ title: 'Load Cloud Backup', message: 'Load cloud backup and replace current local data?', confirmText: 'Load', cancelText: 'Cancel', danger: true })
      : confirm('Load cloud backup and replace current local data?');

    if (confirmed) {
      applyCloudBackupData(restored);
      setCloudStatus(`Signed in: ${cloudUser.email || cloudUser.uid}. Loaded from cloud${summary}${updatedText ? ` (${updatedText})` : ''}.`, 'ok');
      toast('Loaded from cloud');
    } else {
      setCloudStatus(`Signed in: ${cloudUser.email || cloudUser.uid}. Load canceled.`, 'warn');
    }
  } catch (err) {
    setCloudStatus(`Cloud load failed. ${getFirebaseErrorText(err)}`, 'err');
    toast(isCloudQuotaError(err) ? 'Firestore quota exceeded' : 'Cloud load failed');
  } finally {
    wordjarCloudOperationRunning = false;
  }
}

function loadWordJarModule(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-wordjar-module="${src}"]`)) {
      resolve();
      return;
    }

    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.dataset.wordjarModule = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

function runWhenIdle(fn) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1600 });
  else setTimeout(fn, 450);
}

function loadModulesSequentially(modules) {
  return modules.reduce((chain, src) => chain.then(() => loadWordJarModule(src)), Promise.resolve());
}

function refreshActivePageUI() {
  const page = curPage || 'home';

  if (page === 'home' && typeof updateHome === 'function') updateHome();
  else if (page === 'decks' && typeof renderDecks === 'function') renderDecks();
  else if (page === 'words' && typeof renderWords === 'function') renderWords();
  else if (page === 'account' && typeof updateAccount === 'function') updateAccount();
  else if (page === 'fc' && typeof renderFC === 'function') renderFC();
  else if (page === 'learn' && typeof renderLearn === 'function') renderLearn();
  else if (page === 'deck-overview' && currentStudyDeckId && typeof showDeckOverview === 'function') showDeckOverview(currentStudyDeckId);
  else if (page === 'deck-cards' && typeof renderDeckCards === 'function') renderDeckCards();

  if (page === 'fc' && window.WordJarFSRSUI?.updateRatingPreview) WordJarFSRSUI.updateRatingPreview();
  if (page === 'account' && window.WordJarSettingsOrder?.orderSettingsRows) WordJarSettingsOrder.orderSettingsRows();
}

function refreshAllVisibleUI() {
  if (typeof updateHome === 'function') updateHome();
  if (typeof renderDecks === 'function') renderDecks();
  if (typeof updateAccount === 'function') updateAccount();
  if (curPage === 'words' && typeof renderWords === 'function') renderWords();
  if (curPage === 'fc' && typeof renderFC === 'function') renderFC();
  if (curPage === 'deck-overview' && currentStudyDeckId && typeof showDeckOverview === 'function') showDeckOverview(currentStudyDeckId);
  if (curPage === 'deck-cards' && typeof renderDeckCards === 'function') renderDeckCards();
  if (window.WordJarFSRSUI?.updateRatingPreview) WordJarFSRSUI.updateRatingPreview();
  if (window.WordJarSettingsOrder?.orderSettingsRows) WordJarSettingsOrder.orderSettingsRows();
}

function loadWordJarLateModules() {
  const startupModules = [
    'js/wordjar-dialogs.js',
    'js/english-ui-messages.js',
    'js/ios-comfort-typography.js',
    'js/type-consistency-fix.js',
    'js/share-card-options-complete.js',
    'js/save-performance.js',
    'js/free-first-maintenance.js',
    'js/app-integrity.js',
    'js/fsrs-scheduler.js',
    'js/fsrs-ui.js',
    'js/deck-ui.js',
    'js/deck-performance.js',
    'js/deck-overview-performance.js',
    'js/deck-cards-performance.js',
    'js/dashboard-stats.js',
    'js/calendar-performance.js',
    'js/home-performance.js',
    'js/dictionary-filters.js',
    'js/dictionary-filter-smooth.js',
    'js/csv-format-guide.js',
    'js/performance-lite.js',
    'js/word-actions-performance.js',
    'js/flashcard-display-settings.js',
    'js/sync-settings.js',
    'js/private-api-key-cloud.js',
    'js/smart-fill-ai.js',
    'js/ai-high-end-model-config.js',
    'js/ai-gemini-model-fix.js',
    'js/deck-clean-smart-actions.js',
    'js/select-smart-fill-polish.js',
    'js/select-smart-all-batch.js',
    'js/profile-user-level.js',
    'js/settings-order.js',
    'js/settings-lazy-loader.js',
    'js/ui-standardize.js',
    'js/performance-scheduler.js'
  ];

  const idleModules = [
    'js/word-form-enhancements.js',
    'js/storage-health.js',
    'js/study-ui.js'
  ];

  loadModulesSequentially(startupModules)
    .then(refreshActivePageUI)
    .then(() => {
      runWhenIdle(() => {
        loadModulesSequentially(idleModules)
          .then(refreshActivePageUI)
          .catch(() => console.warn('Some WordJar idle modules failed to load'));
      });
    })
    .catch(() => console.warn('Some WordJar startup modules failed to load'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadWordJarLateModules, { once: true });
} else {
  loadWordJarLateModules();
}
