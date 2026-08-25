// WordJar AI High-End Model Config V1
// Primary target: gemini-3.1-pro via v1beta. Falls back when a key/region has no access yet.

(function installWordJarAIHighEndModelConfig() {
  if (window.__wordjarAIHighEndModelConfigInstalled) return;
  window.__wordjarAIHighEndModelConfigInstalled = true;

  const API_VERSION = 'v1beta';
  const HIGH_END_MODELS = [
    'gemini-3.1-pro',
    'gemini-3.1-pro-preview',
    'gemini-3-pro-preview',
    'gemini-pro-latest',
    'gemini-flash-latest'
  ];

  const SMART_FILL_MAX_TOKENS = 900;
  const ANALYSIS_MAX_TOKENS = 1400;
  const BULK_CONCURRENCY = 1;

  let smartFillRunning = false;
  let analysisRunning = false;

  function safeToast(message) {
    if (typeof toast === 'function') toast(message);
  }

  function setStatus(message, state) {
    if (typeof setAutoFillStatus === 'function') {
      setAutoFillStatus(message, state);
      return;
    }
    safeToast(message);
  }

  function safeText(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(value);
    if (typeof escHTML === 'function') return escHTML(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeWord(value) {
    return String(value || '').trim();
  }

  async function ensureApiKey() {
    if (typeof window.initAppConfig === 'function') await window.initAppConfig();
    const key = String(window.globalApiKey || window.getApiKeyFromMemory?.() || '').trim();
    if (!key) throw new Error('NO_API_KEY');
    return key;
  }

  function geminiEndpoint(model, apiKey) {
    return `https://generativelanguage.googleapis.com/${API_VERSION}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }

  function extractJSON(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('EMPTY_AI_RESPONSE');

    try { return JSON.parse(raw); } catch (err) {}

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));

    throw new Error('INVALID_AI_JSON');
  }

  function shouldTryNextModel(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 404 ||
      error?.status === 400 ||
      message.includes('not found') ||
      message.includes('unsupported') ||
      message.includes('responsemimetype') ||
      message.includes('model');
  }

  function buildGeminiBody(prompt, maxTokens, forceJson = true) {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.15,
        topP: 0.8,
        maxOutputTokens: maxTokens
      }
    };

    if (forceJson) body.generationConfig.responseMimeType = 'application/json';
    return body;
  }

  async function callGeminiModel({ apiKey, model, prompt, maxTokens, forceJson = true }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(geminiEndpoint(model, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(buildGeminiBody(prompt, maxTokens, forceJson))
      });

      const raw = await response.text();
      let payload = null;
      try { payload = JSON.parse(raw); } catch (err) {}

      if (!response.ok) {
        const apiMessage = payload?.error?.message || raw || `HTTP ${response.status}`;
        const error = new Error(`AI_${response.status}: ${apiMessage}`);
        error.status = response.status;
        error.model = model;
        error.apiMessage = apiMessage;
        throw error;
      }

      const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
      if (!text.trim()) throw new Error(`EMPTY_AI_RESPONSE from ${model}`);
      window.WordJarAIConfig.lastModel = model;
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async function callHighEndGemini(prompt, options = {}) {
    const apiKey = await ensureApiKey();
    const models = options.models || HIGH_END_MODELS;
    const maxTokens = options.maxTokens || 900;
    let lastError = null;

    for (const model of models) {
      try {
        return await callGeminiModel({ apiKey, model, prompt, maxTokens, forceJson: options.forceJson !== false });
      } catch (err) {
        lastError = err;
        console.warn(`WordJar AI failed with ${model}`, err);

        if (options.forceJson !== false && shouldTryNextModel(err)) {
          try {
            return await callGeminiModel({ apiKey, model, prompt, maxTokens, forceJson: false });
          } catch (retryErr) {
            lastError = retryErr;
            console.warn(`WordJar AI retry failed with ${model}`, retryErr);
          }
        }

        if (!shouldTryNextModel(lastError)) break;
      }
    }

    throw lastError || new Error('AI_CALL_FAILED');
  }

  function userFacingError(error) {
    const message = String(error?.message || '');
    if (message.includes('NO_API_KEY')) return 'Add Private API Key in Settings first.';
    if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) return 'API Key is invalid. Check Private API Key.';
    if (message.includes('PERMISSION_DENIED') || message.includes('403')) return 'API Key has no permission for this Gemini model or referrer is blocked.';
    if (message.includes('429')) return 'Gemini quota/rate limit reached. Try again later.';
    if (message.includes('404')) return 'High-end model is not available for this key yet. Fallback models also failed.';
    if (message.includes('Failed to fetch')) return 'Network/CORS failed. Check internet or API key restrictions.';
    return 'AI request failed. Check API Key or try again.';
  }

  function getUserLevel() {
    return String(
      D?.profile?.userLevel ||
      D?.profile?.englishLevel ||
      D?.profile?.cefrLevel ||
      D?.reader?.userLevel ||
      'A2'
    ).trim().toUpperCase() || 'A2';
  }

  function buildSmartFillPrompt(word) {
    const mode = D?.reader?.mode || 'en-th';
    const targetMeaning = mode === 'en-th' ? 'Thai meaning for an English learner' : 'clear English learner definition';

    return `You are a high-accuracy vocabulary analyst for Thai learners.\n\nTask: Smart Fill vocabulary card.\nLearner level: ${getUserLevel()}\nWord or phrase: ${word}\n\nReturn ONLY valid JSON. No markdown.\nSchema:\n{\n  "word": "base word or phrase",\n  "type": "N | V | ADJ | ADV | ART | PRON | PHR",\n  "pronunciation": "/Precise IPA, General British if applicable/",\n  "meaning": "${targetMeaning}, context-aware when possible",\n  "example": "short natural ${getUserLevel()}-level example sentence using the word",\n  "notes": "short helpful Thai note, include nuance, register, common confusion, or story-context usage"\n}\n\nAccuracy rules:\n- Prefer precise IPA.\n- For unusual story words like hoghouse, give the concrete definition, not a generic guess.\n- Keep Thai natural and polished.\n- If the entry is a phrase, type must be PHR.`;
  }

  function normalizeSmartFillResult(data) {
    const item = data || {};
    const type = String(item.type || 'N').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'N';
    return {
      word: String(item.word || '').trim(),
      type: ['N', 'V', 'ADJ', 'ADV', 'ART', 'PRON', 'PHR'].includes(type) ? type : 'N',
      pronunciation: String(item.pronunciation || '').trim(),
      meaning: String(item.meaning || '').trim(),
      example: String(item.example || '').trim(),
      notes: String(item.notes || '').trim()
    };
  }

  async function fetchHighEndSmartFill(word) {
    const text = await callHighEndGemini(buildSmartFillPrompt(word), {
      maxTokens: SMART_FILL_MAX_TOKENS,
      forceJson: true
    });
    return normalizeSmartFillResult(extractJSON(text));
  }

  function fillField(id, value, overwrite = true) {
    const el = document.getElementById(id);
    const clean = String(value || '').trim();
    if (!el || !clean) return false;
    if (!overwrite && el.value.trim()) return false;
    el.value = clean;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function selectSmartType(type) {
    if (typeof selectOnlyType === 'function') {
      selectOnlyType(type);
      return;
    }

    const safeType = String(type || 'N').toUpperCase();
    try {
      if (selectedTypes?.clear) selectedTypes.clear();
    } catch (err) {}
    document.querySelectorAll('#typePills .tp').forEach(btn => btn.classList.remove('sel'));
    const target = document.querySelector(`#typePills .tp[data-t="${safeType}"]`) || document.querySelector('#typePills .tp[data-t="N"]');
    if (target) {
      target.classList.add('sel');
      try { selectedTypes?.add?.(target.dataset.t); } catch (err) {}
    }
  }

  function applySmartFillToForm(result) {
    if (!result) return 0;
    let count = 0;
    if (fillField('fWord', result.word, false)) count++;
    if (fillField('fPron', result.pronunciation, true)) count++;
    if (fillField('fMeaning', result.meaning, true)) count++;
    if (fillField('fEx', result.example, true)) count++;
    if (fillField('fNotes', result.notes || 'Smart-filled with high-end AI. Please check before saving.', true)) count++;
    selectSmartType(result.type);
    return count + 1;
  }

  function applySmartFillToWordObject(card, result) {
    if (!card || !result) return false;
    let changed = false;
    if (result.type) { card.type = result.type; changed = true; }
    if (result.pronunciation) { card.pronunciation = result.pronunciation; changed = true; }
    if (result.meaning) { card.meaning = result.meaning; changed = true; }
    if (result.example) { card.example = result.example; changed = true; }
    if (result.notes) { card.notes = result.notes; changed = true; }
    return changed;
  }

  async function smartFillWordHighEnd() {
    if (smartFillRunning) return;

    const word = normalizeWord(document.getElementById('fWord')?.value);
    if (!word) {
      setStatus('Type a word first.', 'err');
      safeToast('Type a word first');
      return;
    }

    smartFillRunning = true;
    const btn = document.getElementById('wordjarSmartFillBtn');
    const oldText = btn?.textContent || 'Smart Fill';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Pro...';
    }

    setStatus('High-end Smart Fill is thinking...', 'loading');

    try {
      const result = await fetchHighEndSmartFill(word);
      const filled = applySmartFillToForm(result);
      setStatus(filled ? `Smart Fill completed with ${window.WordJarAIConfig.lastModel || 'Gemini'}.` : 'Smart Fill found no usable result.', filled ? 'ok' : 'err');
      safeToast(filled ? 'Smart-filled' : 'No AI result');
    } catch (err) {
      console.warn('smartFillWordHighEnd failed', err);
      const message = userFacingError(err);
      setStatus(message, 'err');
      safeToast(message);
    } finally {
      smartFillRunning = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    }
  }

  function getSmartFillTargetCardIds() {
    try {
      if (typeof isSelectMode === 'undefined' || !isSelectMode) return [];
      if (selectedCards?.size > 0) return Array.from(selectedCards).map(String);
      return (D.words || []).filter(w => String(w.deckId) === String(currentStudyDeckId)).map(w => String(w.id));
    } catch (err) {
      return [];
    }
  }

  async function runPool(items, worker, limit, onProgress) {
    let index = 0;
    let done = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++];
        await worker(item);
        done++;
        onProgress?.(done, items.length);
      }
    });
    await Promise.all(workers);
  }

  async function smartFillSelectedCardsHighEnd() {
    if (smartFillRunning) return;

    const targetIds = getSmartFillTargetCardIds();
    if (!targetIds.length) {
      safeToast('No cards available');
      return;
    }

    try {
      await ensureApiKey();
    } catch (err) {
      safeToast('Add API Key first');
      return;
    }

    const idSet = new Set(targetIds);
    const targets = (D.words || []).filter(w => idSet.has(String(w.id)) && normalizeWord(w.word));
    const btn = document.getElementById('btnSmartFillSelectedCards');
    const badge = document.getElementById('selectCountBadge');
    const oldText = btn?.textContent || 'Smart';
    let filled = 0;
    let failed = 0;
    let saveCounter = 0;

    smartFillRunning = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Pro...';
    }

    try {
      await runPool(
        targets,
        async card => {
          try {
            const result = await fetchHighEndSmartFill(card.word);
            if (applySmartFillToWordObject(card, result)) {
              filled++;
              saveCounter++;
              if (saveCounter >= 5) {
                saveCounter = 0;
                if (typeof save === 'function') save();
              }
            }
          } catch (err) {
            failed++;
            console.warn('High-end smart fill item failed', card?.word, err);
          }
        },
        BULK_CONCURRENCY,
        (done, total) => {
          if (btn) btn.textContent = `${done}/${total}`;
          if (badge) badge.textContent = `Smart Filling ${done}/${total}`;
        }
      );

      if (typeof save === 'function') save();
      if (typeof renderDeckCards === 'function') renderDeckCards();
      if (typeof renderWords === 'function') renderWords();
      if (typeof renderDecks === 'function') renderDecks();
      if (typeof updateHome === 'function') updateHome();
      safeToast(`Smart Fill done: ${filled} filled${failed ? `, ${failed} failed` : ''}`);
    } finally {
      smartFillRunning = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
      if (typeof updateSelectActions === 'function') updateSelectActions();
    }
  }

  function buildAnalysisPrompt(text, userLevel) {
    return `You are an expert English-to-Thai literary translator and English learning tutor.\n\nTask: Smart_Translation_and_Analysis\nUser level: ${userLevel}\nText: ${text}\n\nReturn ONLY valid JSON. No markdown.\nSchema:\n{\n  "translation": "Contextual Thai translation that is polished and natural for a story",\n  "grammar_explanation": "Explain difficult grammar simply for ${userLevel} learner in Thai",\n  "vocabulary_focus": [\n    {\n      "word": "important word or phrase",\n      "meaning": "Thai meaning in this context",\n      "why_important": "why this item matters for this level"\n    }\n  ]\n}\n\nHigh-accuracy requirements:\n- Translate by context, not word-by-word.\n- Explain story nuance clearly.\n- For concrete story vocabulary such as hoghouse, give the exact meaning in context.\n- Keep explanations simple enough for ${userLevel}.\n- Choose 2-5 useful vocabulary items.`;
  }

  function normalizeAnalysis(data) {
    const item = data || {};
    const vocab = Array.isArray(item.vocabulary_focus) ? item.vocabulary_focus : [];
    return {
      translation: String(item.translation || '').trim(),
      grammar_explanation: String(item.grammar_explanation || item.explanation || '').trim(),
      vocabulary_focus: vocab.map(v => ({
        word: String(v?.word || '').trim(),
        meaning: String(v?.meaning || '').trim(),
        why_important: String(v?.why_important || v?.note || '').trim()
      })).filter(v => v.word || v.meaning || v.why_important).slice(0, 5)
    };
  }

  async function smartTranslateAndAnalyzeHighEnd(text, userLevel = getUserLevel()) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) throw new Error('EMPTY_TEXT');

    const output = await callHighEndGemini(buildAnalysisPrompt(cleanText, userLevel), {
      maxTokens: ANALYSIS_MAX_TOKENS,
      forceJson: true
    });
    return normalizeAnalysis(extractJSON(output));
  }

  function bindButtons() {
    const wordBtn = document.getElementById('wordjarSmartFillBtn');
    if (wordBtn) wordBtn.onclick = smartFillWordHighEnd;

    const deckBtn = document.getElementById('btnSmartFillSelectedCards');
    if (deckBtn) deckBtn.onclick = smartFillSelectedCardsHighEnd;
  }

  function boot() {
    bindButtons();
  }

  window.WordJarAIConfig = {
    apiVersion: API_VERSION,
    primaryModel: HIGH_END_MODELS[0],
    modelFallbacks: HIGH_END_MODELS.slice(1),
    lastModel: '',
    callHighEndGemini
  };

  window.smartFillWord = smartFillWordHighEnd;
  window.smartFillSelectedCards = smartFillSelectedCardsHighEnd;
  window.WordJarHighEndAI = {
    fetchHighEndSmartFill,
    smartFillWord: smartFillWordHighEnd,
    smartFillSelectedCards: smartFillSelectedCardsHighEnd
  };

  boot();
  setTimeout(boot, 0);
  setTimeout(boot, 400);
  document.addEventListener('click', () => setTimeout(boot, 0), true);
})();
