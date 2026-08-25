// WordJar Settings Loader V3
// Eagerly loads all Account settings modules during app startup so Settings is complete
// before the user opens the Account page. Navigation still refreshes the page if needed.

(function installSettingsLoader() {
  if (window.__wordjarSettingsLoaderInstalledV3) return;
  window.__wordjarSettingsLoaderInstalledV3 = true;

  let settingsLoadPromise = null;

  function loadSettingsModules() {
    if (
      window.WordJarSettingsOrder?.orderSettingsRows &&
      window.openFlashcardDisplayModal &&
      window.openSyncSettingsModal
    ) {
      return Promise.resolve();
    }
    if (settingsLoadPromise) return settingsLoadPromise;

    settingsLoadPromise = Promise.resolve()
      .then(() => loadWordJarModule('js/flashcard-display-settings.js'))
      .then(() => loadWordJarModule('js/sync-settings.js'))
      .then(() => loadWordJarModule('js/settings-order.js'))
      .catch(err => {
        settingsLoadPromise = null;
        throw err;
      });

    return settingsLoadPromise;
  }

  function refreshAccountOnce() {
    if (curPage === 'account' && typeof updateAccount === 'function') updateAccount();
    if (window.WordJarSettingsOrder?.orderSettingsRows) WordJarSettingsOrder.orderSettingsRows();
  }

  function loadAndRefreshSettings({ showToastOnError = false } = {}) {
    return loadSettingsModules()
      .then(refreshAccountOnce)
      .catch(err => {
        console.warn('Settings modules failed to load', err);
        if (showToastOnError && typeof toast === 'function') toast('Settings failed to load');
      });
  }

  const originalNav = window.nav;
  window.nav = function navWithReadySettings(page) {
    if (typeof originalNav === 'function') originalNav(page);
    if (page === 'account') loadAndRefreshSettings({ showToastOnError: true });
  };

  window.WordJarSettingsLazyLoader = {
    loadSettingsModules,
    refreshAccountOnce,
    ready: () => loadAndRefreshSettings({ showToastOnError: false })
  };

  // Start loading settings immediately during app startup instead of waiting for Account navigation.
  loadAndRefreshSettings({ showToastOnError: false });
})();
