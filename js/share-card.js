// share card / export image
const DEFAULT_SHARE_CARD_OPTIONS = {
  type: true,
  pron: true,
  stats: true,
  meaning: true,
  synonyms: true,
  example: true,
  notes: true,
  deck: true,
  watermark: true,
  logo: true,
  theme: 'light'
};

let currentShareTheme = 'light';

function getShareCardOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem('wordjar_share_card_options') || '{}');
    return { ...DEFAULT_SHARE_CARD_OPTIONS, ...saved };
  } catch (e) {
    return { ...DEFAULT_SHARE_CARD_OPTIONS };
  }
}

function saveShareCardOptions(options) {
  localStorage.setItem('wordjar_share_card_options', JSON.stringify(options));
}

function setDisplayById(id, show, displayType = 'block') {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = show ? displayType : 'none';
}

function getSafeFileName(text) {
  return String(text || 'word')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9ก-๙ぁ-んァ-ン一-龯-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'word';
}

function getDeckNameForShare(deckId) {
  const d = D.decks.find(x => x.id === deckId);
  return d ? d.name : 'General';
}

function cleanShareText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function escapeShareHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function splitShareSynonyms(value) {
  return cleanShareText(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function ensureShareSynonymsBlock() {
  let wrap = document.getElementById('shareCardSynonymsWrap');
  if (wrap) return wrap;

  const card = document.getElementById('shareCard');
  if (!card) return null;

  const exampleWrap = document.getElementById('shareCardExampleWrap');
  const meaningWrap = document.getElementById('shareCardMeaningWrap');
  const anchor = exampleWrap || meaningWrap;
  if (!anchor) return null;

  wrap = document.createElement('div');
  wrap.id = 'shareCardSynonymsWrap';
  wrap.className = 'share-card-section share-card-synonyms-wrap';
  wrap.innerHTML = `
    <div class="share-card-label">Synonyms:</div>
    <div id="shareCardSynonyms" class="share-card-synonyms"></div>
  `;

  anchor.insertAdjacentElement('beforebegin', wrap);
  return wrap;
}

function fillShareSynonyms(w, options) {
  const wrap = ensureShareSynonymsBlock();
  if (!wrap) return;

  const list = document.getElementById('shareCardSynonyms');
  const synonyms = splitShareSynonyms(w?.synonyms || w?.syns || w?.similarWords || '');
  const shouldShow = options.synonyms !== false && synonyms.length > 0;

  wrap.style.display = shouldShow ? 'block' : 'none';
  if (!list) return;

  list.innerHTML = shouldShow
    ? synonyms.map(item => `<span class="share-syn-pill">${escapeShareHTML(item)}</span>`).join('')
    : '';
}

function selectShareTheme(theme) {
  currentShareTheme = theme === 'dark' ? 'dark' : 'light';

  const lightBtn = document.getElementById('shareThemeLight');
  const darkBtn = document.getElementById('shareThemeDark');

  if (lightBtn) lightBtn.classList.toggle('sel', currentShareTheme === 'light');
  if (darkBtn) darkBtn.classList.toggle('sel', currentShareTheme === 'dark');

  updateSharePreview();
}

function applyShareTheme(theme) {
  const card = document.getElementById('shareCard');
  if (!card) return;

  card.classList.remove('share-theme-light', 'share-theme-dark');
  card.classList.add(theme === 'dark' ? 'share-theme-dark' : 'share-theme-light');
}

function openShareAdjustModal() {
  const w = D.words.find(x => x.id === detailWordId);
  if (!w) return toast('No word selected');

  const modal = document.getElementById('shareAdjustModal');
  if (!modal) return shareDetailWord();

  const opt = getShareCardOptions();

  const fields = {
    shareOptType: opt.type,
    shareOptPron: opt.pron,
    shareOptStats: opt.stats,
    shareOptMeaning: opt.meaning,
    shareOptSynonyms: opt.synonyms,
    shareOptExample: opt.example,
    shareOptNotes: opt.notes,
    shareOptDeck: opt.deck,
    shareOptWatermark: opt.watermark,
    shareOptLogo: opt.logo
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  });

  currentShareTheme = opt.theme === 'dark' ? 'dark' : 'light';
  selectShareTheme(currentShareTheme);

  openO('shareAdjustModal');
  toggleShareOptionsPanel(false);
  requestAnimationFrame(updateSharePreview);
}

function getShareOptionsFromModal() {
  const fallback = getShareCardOptions();

  const checked = (id, fallbackValue) => {
    const el = document.getElementById(id);
    return el ? el.checked : fallbackValue;
  };

  return {
    type: checked('shareOptType', fallback.type),
    pron: checked('shareOptPron', fallback.pron),
    stats: checked('shareOptStats', fallback.stats),
    meaning: checked('shareOptMeaning', fallback.meaning),
    synonyms: checked('shareOptSynonyms', fallback.synonyms),
    example: checked('shareOptExample', fallback.example),
    notes: checked('shareOptNotes', fallback.notes),
    deck: checked('shareOptDeck', fallback.deck),
    watermark: checked('shareOptWatermark', fallback.watermark),
    logo: checked('shareOptLogo', fallback.logo),
    theme: currentShareTheme === 'dark' ? 'dark' : 'light'
  };
}

function fillShareCard(w, options = getShareCardOptions()) {
  const typeDisplay = (w.type || 'N').split(',')[0].trim().toUpperCase();
  const exampleText = cleanShareText(w.example || '');
  const notesText = cleanShareText(w.notes || '');

  applyShareTheme(options.theme || 'light');

  document.getElementById('shareCardType').textContent = typeDisplay || 'N';
  document.getElementById('shareCardWord').textContent = cleanShareText(w.word);
  document.getElementById('shareCardPron').textContent = cleanShareText(w.pronunciation || '');
  document.getElementById('shareCardMeaning').textContent = cleanShareText(w.meaning || '');

  document.getElementById('shareCardStats').innerHTML = `
    <div><b>${w.interval || 1}d</b><span>Interval</span></div>
    <div><b>${w.ef || 2.5}</b><span>Ease</span></div>
    <div><b>${w.reps || 0}</b><span>Reps</span></div>
  `;

  document.getElementById('shareCardExample').textContent = `“${exampleText.replace(/^["“]|["”]$/g, '')}”`;
  document.getElementById('shareCardNotes').textContent = notesText;
  document.getElementById('shareCardDeck').textContent = getDeckNameForShare(w.deckId);
  document.getElementById('shareCardWatermark').textContent = 'wordjar';

  setDisplayById('shareCardType', options.type, 'flex');

  const logoBadge = document.getElementById('shareCardLogoBadge');
  if (logoBadge) logoBadge.style.display = options.logo ? 'flex' : 'none';

  setDisplayById('shareCardHead', !!options.type || !!options.logo, 'flex');
  setDisplayById('shareCardPron', options.pron && !!cleanShareText(w.pronunciation), 'block');
  setDisplayById('shareCardStats', options.stats, 'flex');
  setDisplayById('shareCardMeaningWrap', options.meaning && !!cleanShareText(w.meaning), 'block');
  fillShareSynonyms(w, options);
  setDisplayById('shareCardExampleWrap', options.example && !!exampleText, 'block');
  setDisplayById('shareCardNotesWrap', options.notes && !!notesText, 'block');
  setDisplayById('shareCardFoot', !!options.deck || !!options.watermark, 'flex');
  setDisplayById('shareCardDeck', !!options.deck, 'inline-flex');
  setDisplayById('shareCardWatermark', !!options.watermark, 'inline-flex');
}

function updateSharePreview() {
  const mount = document.getElementById('sharePreviewMount');
  const source = document.getElementById('shareCard');
  const w = D.words.find(x => x.id === detailWordId);

  if (!mount || !source || !w) return;

  const options = getShareOptionsFromModal();
  fillShareCard(w, options);

  const clone = source.cloneNode(true);
  clone.id = 'shareCardPreview';
  clone.classList.add('share-card-preview-clone');
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

  mount.innerHTML = '';

  const sourceWidth = 760;
  const sourceHeight = source.scrollHeight || source.offsetHeight || 500;
  const mountWidth = mount.clientWidth || 300;
  const scale = mountWidth / sourceWidth;

  clone.style.width = sourceWidth + 'px';
  clone.style.transformOrigin = 'top left';
  clone.style.transform = `scale(${scale})`;
  clone.style.margin = '0';

  mount.style.height = `${Math.ceil(sourceHeight * scale)}px`;
  mount.appendChild(clone);
}

function toggleShareOptionsPanel(force) {
  const panel = document.getElementById('shareOptionsPanel');
  const chevron = document.getElementById('shareOptionsChevron');
  if (!panel) return;

  const shouldOpen = typeof force === 'boolean'
    ? force
    : !panel.classList.contains('open');

  panel.classList.toggle('open', shouldOpen);
  if (chevron) chevron.textContent = shouldOpen ? '⌃' : '⌄';

  requestAnimationFrame(updateSharePreview);
}

async function waitForShareImages() {
  const imgs = Array.from(document.querySelectorAll('#shareCard img'));

  await Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();

    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

async function createDetailCardImageFile(options = getShareCardOptions()) {
  const w = D.words.find(x => x.id === detailWordId);
  if (!w) throw new Error('No word selected');

  fillShareCard(w, options);

  const card = document.getElementById('shareCard');
  if (!card) throw new Error('Share card not found');

  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await waitForShareImages();
  await new Promise(resolve => requestAnimationFrame(resolve));

  const rect = card.getBoundingClientRect();
  const canvas = await html2canvas(card, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    logging: false,
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
    windowWidth: Math.ceil(rect.width),
    windowHeight: Math.ceil(rect.height)
  });

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) throw new Error('Could not create image');

  return new File([blob], `wordjar-${getSafeFileName(w.word)}.png`, {
    type: 'image/png'
  });
}

async function shareAdjustedDetailWord() {
  try {
    const w = D.words.find(x => x.id === detailWordId);
    if (!w) return toast('No word selected');

    const options = getShareOptionsFromModal();
    saveShareCardOptions(options);
    closeO('shareAdjustModal');
    toast('Preparing card...');

    const file = await createDetailCardImageFile(options);

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Jarble: ${w.word}`,
        text: `${w.word} — ${w.meaning || ''}`,
        files: [file]
      });
      return;
    }

    saveDetailCardImage(file);
  } catch (err) {
    console.error(err);
    toast('Could not share card');
  }
}

async function saveAdjustedDetailCardOnly() {
  try {
    const options = getShareOptionsFromModal();
    saveShareCardOptions(options);
    closeO('shareAdjustModal');
    toast('Preparing image...');

    const file = await createDetailCardImageFile(options);
    saveDetailCardImage(file);
  } catch (err) {
    console.error(err);
    toast('Could not save image');
  }
}

async function shareDetailWord() {
  try {
    const w = D.words.find(x => x.id === detailWordId);
    if (!w) return toast('No word selected');

    toast('Preparing card...');
    const file = await createDetailCardImageFile(getShareCardOptions());

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Jarble: ${w.word}`,
        text: `${w.word} — ${w.meaning || ''}`,
        files: [file]
      });
      return;
    }

    saveDetailCardImage(file);
  } catch (err) {
    console.error(err);
    toast('Could not share card');
  }
}

function saveDetailCardImage(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');

  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Image saved');
}
