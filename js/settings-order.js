// WordJar Settings Order V3
// Single synchronous ordering pass for Account settings rows.

(function installSettingsOrder() {
  if (window.__wordjarSettingsOrderInstalledV3) return;
  window.__wordjarSettingsOrderInstalledV3 = true;

  const PROFILE_STUDY = ['Edit Profile', 'Voice Settings', 'Study Auto Run',
    'Flashcard Display', 'Dashboard Statistics', 'Calendar Settings'];
  const HIDDEN_ROWS = new Set(['Sync Settings', 'Storage Health', 'System Deck', 'Private API Key']);

  function rowLabel(row) {
    return row?.querySelector?.('.ml')?.textContent?.trim() || row?.textContent?.trim() || '';
  }

  function orderSettingsRows() {
    const menu = document.getElementById('settingsProfileMenu');
    if (!menu) return;

    const rows = Array.from(menu.querySelectorAll(':scope > .mr'));
    const used = new Set();
    ORDER.forEach(label => {
      const row = rows.find(r => rowLabel(r) === label && !used.has(r));
      if (row) {
        menu.appendChild(row);
        used.add(row);
      }
    });

    rows
      .filter(r => !used.has(r))
      .sort((a, b) => rowLabel(a).localeCompare(rowLabel(b)))
      .forEach(row => menu.appendChild(row));
  }

  window.WordJarSettingsOrder = { orderSettingsRows };
})();
