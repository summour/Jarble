// WordJar Settings Order V3
// Single synchronous ordering pass for Account settings rows.

(function installSettingsOrder() {
  if (window.__wordjarSettingsOrderInstalledV3) return;
  window.__wordjarSettingsOrderInstalledV3 = true;

  const ORDER = [
    'Edit Profile',
    'Voice Settings',
    'Flashcard Display',
    'Dashboard Statistics',
    'System Deck',
    'Sync Settings',
    'Storage Health'
  ];

  function rowLabel(row) {
    return row?.querySelector?.('.ml')?.textContent?.trim() || row?.textContent?.trim() || '';
  }

  function orderSettingsRows() {
    const menu = document.querySelector('#pg-account .menu-sec');
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
