// WordJar Study Service
// Handles study sessions, queues, and progress tracking

(function installWordJarStudyService() {
  if (window.__wordjarStudyServiceInstalled) return;
  window.__wordjarStudyServiceInstalled = true;

  /**
   * Build the flashcard queue for quick study or deck study.
   *
   * @param {WordJarWord[]} [words=[]]
   * @param {?string} [deckId=null]
   * @param {{currentDate?: string, fallbackLimit?: number}} [options={}]
   * @returns {WordJarWord[]}
   */
  function getFlashcardQueue(words = [], deckId = null, options = {}) {
    const fallbackLimit = Number(options.fallbackLimit || 12);
    const currentDate = options.currentDate || WordJarUtils.todayISO();
    const hasDeck = deckId !== null && deckId !== undefined && deckId !== '';

    const scopedWords = hasDeck
      ? words.filter(word => WordJarUtils.normalizeId(word.deckId) === WordJarUtils.normalizeId(deckId))
      : [...words];

    const dueWords = scopedWords.filter(word => WordJarScheduling.isWordDue(word, currentDate));
    if (dueWords.length) return dueWords;

    return [...scopedWords]
      .sort(() => Math.random() - 0.5)
      .slice(0, fallbackLimit);
  }

  /**
   * Count New / Learning / Review cards remaining in a flashcard queue.
   *
   * @param {WordJarWord[]} [queue=[]]
   * @param {number} [startIndex=0]
   * @returns {{new: number, learning: number, review: number}}
   */
  function getFlashcardStats(queue = [], startIndex = 0) {
    return queue.slice(startIndex).reduce((stats, word) => {
      if (Number(word.reps || 0) === 0) stats.new += 1;
      else if (Number(word.interval || 1) < 21) stats.learning += 1;
      else stats.review += 1;
      return stats;
    }, { new: 0, learning: 0, review: 0 });
  }

  /**
   * Build the Study Mode list from custom selected word IDs or deck words.
   *
   * @param {WordJarWord[]} [words=[]]
   * @param {{selectedIds?: (string|number)[]|Set<string|number>, deckId?: string|null, shuffle?: boolean, limit?: number}} [options={}]
   * @returns {WordJarWord[]}
   */
  function buildLearnList(words = [], options = {}) {
    let result = [];
    if (options.selectedIds) {
      const idSet = options.selectedIds instanceof Set
        ? options.selectedIds
        : new Set((options.selectedIds || []).map(id => String(id)));

      result = words.filter(w => idSet.has(String(w.id)));
    } else if (options.deckId) {
      result = words.filter(w => WordJarUtils.normalizeId(w.deckId) === WordJarUtils.normalizeId(options.deckId));
    } else {
      result = [...words];
    }

    if (options.shuffle !== false) {
      result = [...result].sort(() => Math.random() - 0.5);
    }

    if (options.limit && options.limit > 0) {
      result = result.slice(0, Number(options.limit));
    }

    return result;
  }

  /**
   * Get words belonging to a deck (or all words if deckId is null/empty).
   *
   * @param {WordJarWord[]} [words=[]]
   * @param {?string} [deckId=null]
   * @returns {WordJarWord[]}
   */
  function getWordsForDeck(words = [], deckId = null) {
    if (!deckId) return [...words];
    return words.filter(w => WordJarUtils.normalizeId(w.deckId) === WordJarUtils.normalizeId(deckId));
  }

  /**
   * Return copied app data with study progress incremented.
   *
   * @param {WordJarData} [data={}]
   * @param {Date|string|number} [date=new Date()]
   * @returns {WordJarData}
   */
  function markStudied(data = {}, date = new Date()) {
    return {
      ...data,
      todayDone: Number(data.todayDone || 0) + 1,
      studyDays: {
        ...(data.studyDays || {}),
        [WordJarUtils.dateKey(date)]: true
      }
    };
  }

  /**
   * Calculate consecutive study-day streak from today backwards.
   *
   * @param {Record<string, boolean>} [studyDays={}]
   * @param {{date?: Date|string|number, maxDays?: number}} [options={}]
   * @returns {number}
   */
  function calculateStreak(studyDays = {}, options = {}) {
    let streak = 0;
    const baseDate = new Date(options.date || new Date());
    const maxDays = Number(options.maxDays || 365);

    for (let i = 0; i < maxDays; i += 1) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() - i);
      if (studyDays[date.toDateString()]) streak += 1;
      else break;
    }

    return streak;
  }

  window.WordJarStudyService = {
    getFlashcardQueue,
    getFlashcardStats,
    buildLearnList,
    getWordsForDeck,
    markStudied,
    calculateStreak
  };
})();