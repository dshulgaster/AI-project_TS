// TrackStudio CyberOS Helper - Effort Allocator Core Module (v7.6.1)
// Pure, deterministic business logic for 5-Interval SDLC Effort Allocation

(function (exports) {
  'use strict';

  // Target Category Rules with defaultPhase fallbacks
  const targetCategoryRules = [
    { key: 'bugfix', check: (t) => t.includes('исправление') || t.includes('ошибк') || t.includes('дефект') || t.includes('замечани'), defaultPhase: 'dev' },
    { key: 'constructor', check: (t) => t.includes('конструктор'), defaultPhase: 'po' },
    { key: 'analyst', check: (t) => (t.includes('аналитик') || t.includes('анализ доработки')) && !t.includes('конструктор'), defaultPhase: 'po' },
    { key: 'planning', check: (t) => t.includes('организация') || t.includes('планирование') || t.includes('официальный ответ') || t.includes('оценка от') || t.includes('оценка работ отделом') || t.includes('методика'), defaultPhase: 'oa' },
    { key: 'consultation', check: (t) => t.includes('консультац'), defaultPhase: 'dev' },
    { key: 'dev', check: (t) => t.includes('разработк') && !t.includes('анализ') && !t.includes('коммуникац') && !t.includes('требований'), defaultPhase: 'dev' },
    { key: 'qa', check: (t) => (t.includes('тестирован') || t.includes('испытан') || t.includes('обеспечения качества')) && !t.includes('методика') && !t.includes('оценка от'), defaultPhase: 'dev' },
    { key: 'deploy', check: (t) => t.includes('тираж') || t.includes('сборк') || t.includes('дистрибутив'), defaultPhase: 'dev' },
    { key: 'doc', check: (t) => t.includes('документаци'), defaultPhase: 'dev' },
    { key: 'accept_task', check: (t) => t.includes('приёмку работы') || t.includes('приемку работы') || t.includes('приёмка работы') || t.includes('приемка работы'), defaultPhase: 'accept' },
    { key: 'accept', check: (t) => (t.includes('приёмка работы') || t.includes('приемка работы')) && !t.includes('задача на'), defaultPhase: 'accept' },
    { key: 'stab', check: (t) => t.includes('внедрения') || t.includes('стабилизац') || t.includes('сопровождение опэ'), defaultPhase: 'stab' },
    { key: 'management', check: (t) => t.includes('управленческ') || t.includes('управляющ') || (t.includes('управление') && !t.includes('задачей') && !t.includes('системой') && !t.includes('пользовател')), defaultPhase: 'dev' }
  ];

  // Parse DD.MM.YYYY date from string
  function parseDateFromText(text) {
    if (!text) return null;
    const mDate = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (mDate) {
      const dateObj = new Date(parseInt(mDate[3], 10), parseInt(mDate[2], 10) - 1, parseInt(mDate[1], 10));
      return { dateStr: `${mDate[1]}.${mDate[2]}.${mDate[3]}`, dateObj: dateObj };
    }
    return null;
  }

  // 5-Interval Phase Allocator Rule
  function getPhaseForDate(entryDate, defaultPhase, milestones) {
    if (!entryDate) return defaultPhase || 'dev';
    const m = milestones || {};
    if (m.dateReleaseObj && entryDate > m.dateReleaseObj) return 'stab';
    if (m.dateAcceptanceStartObj && entryDate > m.dateAcceptanceStartObj) return 'accept';
    if (m.dateDevCompleteObj && entryDate > m.dateDevCompleteObj) return 'accept';
    if (m.dateDevStartObj && entryDate > m.dateDevStartObj) return 'dev';
    if (m.effectivePoBoundaryDateObj && entryDate > m.effectivePoBoundaryDateObj) return 'oa';
    return 'po';
  }

  // Process rows with Double-Counting Protection
  function allocateSubtasks(rawRows, milestones) {
    const processedChildItems = [];

    rawRows.forEach(rowText => {
      if (!rowText || rowText.length > 500) return;
      if (rowText.includes('Категория / Задача') || rowText.includes('Потрачено времени')) return;

      const normText = rowText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

      let daysVal = 0;
      const mHrsMin = normText.match(/(\d+)\s*ч\s*(\d+)\s*м/i);
      const mHrsOnly = normText.match(/(\d+[.,]?\d*)\s*ч(?!.д)/i);
      const mDaysVal = normText.match(/\(?\s*([\d.,]+)\s*(?:ч\.д|дн|ч\.д\.)\s*\)?/i);

      if (mHrsMin) {
        daysVal = (parseInt(mHrsMin[1], 10) + parseInt(mHrsMin[2], 10) / 60.0) / 8.0;
      } else if (mHrsOnly) {
        daysVal = parseFloat(mHrsOnly[1].replace(',', '.')) / 8.0;
      } else if (mDaysVal) {
        daysVal = parseFloat(mDaysVal[1].replace(',', '.'));
      }

      if (daysVal > 0) {
        const parsedDate = parseDateFromText(normText);
        const itemDate = parsedDate ? parsedDate.dateObj : null;

        const isChildTaskRow = /#\d{5,8}/.test(normText) || normText.includes('child');
        const isParentRow = /\d+\s*\/\s*\d+/.test(normText);

        for (const rule of targetCategoryRules) {
          if (rule.check(normText)) {
            if (isChildTaskRow) {
              processedChildItems.push({
                key: rule.key,
                days: daysVal,
                dateObj: itemDate,
                type: 'child',
                defaultPhase: rule.defaultPhase
              });
              break;
            } else if (isParentRow) {
              processedChildItems.push({
                key: rule.key,
                days: daysVal,
                dateObj: null,
                type: 'parent',
                defaultPhase: rule.defaultPhase
              });
              break;
            }
          }
        }
      }
    });

    const hasChildren = {};
    processedChildItems.forEach(item => {
      if (item.type === 'child') hasChildren[item.key] = true;
    });

    const finalItems = processedChildItems.filter(item => {
      if (item.type === 'parent' && hasChildren[item.key] === true) return false;
      return true;
    });

    const result = {
      po: { analyst: 0, constructor: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, qa: 0, other: 0 },
      oa: { analyst: 0, constructor: 0, req: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, qa: 0, other: 0 },
      dev: { code: 0, build: 0, deploy: 0, bugfix: 0, qa: 0, doc: 0, acceptance: 0, stabilization: 0, consultation: 0, commInternal: 0, commExternal: 0, management: 0, other: 0 },
      accept: { base: 0, bugfix: 0 },
      stab: { base: 0, bugfix: 0 },
      manageBreakdown: { po: 0, oa: 0, dev: 0 },
      totalDays: 0
    };

    finalItems.forEach(item => {
      const days = item.days;
      const entryDate = item.dateObj;
      const phase = getPhaseForDate(entryDate, item.defaultPhase || 'dev', milestones);

      result.totalDays += days;

      switch (item.key) {
        case 'analyst':
          if (phase === 'po') result.po.analyst += days;
          else result.oa.analyst += days;
          break;
        case 'constructor':
          if (phase === 'po') result.po.constructor += days;
          else result.oa.constructor += days;
          break;
        case 'planning':
        case 'qa':
          if (phase === 'po') result.po.qa += days;
          else if (phase === 'oa') result.oa.qa += days;
          else result.dev.qa += days;
          break;
        case 'consultation':
          if (phase === 'dev') result.dev.consultation += days;
          else if (phase === 'oa') result.oa.consultation += days;
          else result.po.consultation += days;
          break;
        case 'dev':
          result.dev.code += days;
          break;
        case 'bugfix':
          if (milestones && milestones.dateDevCompleteObj && entryDate > milestones.dateDevCompleteObj) {
            result.accept.bugfix += days;
          } else {
            result.dev.bugfix += days;
          }
          break;
        case 'deploy':
          result.dev.deploy += days;
          break;
        case 'doc':
          result.dev.doc += days;
          break;
        case 'accept_task':
        case 'accept':
          if (phase === 'accept' || phase === 'stab') result.accept.base += days;
          else if (phase === 'dev') result.dev.code += days;
          else if (phase === 'oa') result.oa.other += days;
          else result.po.other += days;
          break;
        case 'stab':
          result.stab.base += days;
          break;
        case 'management':
          if (phase === 'po') result.manageBreakdown.po += days;
          else if (phase === 'oa') result.manageBreakdown.oa += days;
          else result.manageBreakdown.dev += days;
          break;
      }
    });

    return result;
  }

  exports.targetCategoryRules = targetCategoryRules;
  exports.parseDateFromText = parseDateFromText;
  exports.getPhaseForDate = getPhaseForDate;
  exports.allocateSubtasks = allocateSubtasks;

})(typeof exports !== 'undefined' ? exports : (window.Allocator = {}));
