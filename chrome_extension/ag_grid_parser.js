(function (exports) {
  'use strict';

  function asArray(value) {
    return value ? Array.prototype.slice.call(value) : [];
  }

  function textOf(node) {
    if (!node) return '';
    return String(node.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function firstText(node, selector) {
    return textOf(node.querySelector(selector));
  }

  function rowIndexOf(row) {
    const value = row.getAttribute('row-index');
    return value === null ? null : Number(value);
  }

  function levelOf(row) {
    const match = String(row.className || '').match(/ag-row-level-(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function hasClass(row, className) {
    return String(row.className || '').split(/\s+/).includes(className);
  }

  function isVisible(node) {
    if (!node) return false;
    if (node.getAttribute('hidden') !== null || node.getAttribute('aria-hidden') === 'true') return false;
    const style = String(node.getAttribute('style') || '').toLowerCase();
    return !style.includes('display:none') && !style.includes('display: none') && !style.includes('visibility:hidden') && !style.includes('visibility: hidden');
  }

  function dateValue(text) {
    const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) return null;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (date.getFullYear() !== Number(match[3]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[1])) return null;
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  function hoursValue(text) {
    const hoursMinutes = text.match(/(\d+[.,]?\d*)\s*ч\s*(\d+)\s*м/i);
    if (hoursMinutes) return Number(hoursMinutes[1].replace(',', '.')) + Number(hoursMinutes[2]) / 60;
    const hours = text.match(/(\d+[.,]?\d*)\s*ч(?!\s*\.\s*д)/i);
    return hours ? Number(hours[1].replace(',', '.')) : null;
  }

  function taskIdValue(text) {
    const match = text.match(/#(\d{4,})/);
    return match ? match[1] : null;
  }

  function childRow(row) {
    const taskCells = asArray(row.querySelectorAll('.ag-column-task, .ag-cell')).map(textOf);
    const combined = taskCells.join(' ');
    const taskId = taskIdValue(combined);
    const dateText = asArray(row.querySelectorAll('.ag-column-date, .ag-cell')).map(textOf).find((value) => dateValue(value));
    const hoursText = asArray(row.querySelectorAll('.ag-column-hours, .ag-cell')).map(textOf).find((value) => hoursValue(value) !== null);
    const hours = hoursValue(hoursText || combined);
    if (!taskId || hours === null || !dateText || !dateValue(dateText)) return null;
    return {
      taskId,
      hours,
      date: dateValue(dateText),
      phaseHint: null,
      source: 'child-row'
    };
  }

  function parseGroup(row) {
    const name = firstText(row, '.ag-group-value') || firstText(row, '.ag-row-group') || '';
    const countText = firstText(row, '.ag-group-child-count');
    const countMatch = countText.match(/\d+/);
    const childCount = countMatch ? Number(countMatch[0]) : 0;
    const factHours = asArray(row.querySelectorAll('.ag-column-hours')).map(textOf).map(hoursValue).find((value) => value !== null);
    return {
      key: `row-${rowIndexOf(row)}`,
      name,
      level: levelOf(row),
      expanded: !hasClass(row, 'ag-row-group-contracted'),
      childCount,
      factHours: factHours === undefined ? 0 : factHours,
      worklogs: [],
      source: 'aggregated-group'
    };
  }

  function parseAgGrid(documentLike, options) {
    const config = options || {};
    const warnings = [];
    const roleGrids = asArray(documentLike.querySelectorAll('.ag-root[role="grid"]')).filter(isVisible);
    let gridNode = roleGrids[0];
    let selector = '.ag-root[role="grid"]';

    if (!gridNode) {
      const roots = asArray(documentLike.querySelectorAll('.ag-root')).filter(isVisible);
      gridNode = roots[roots.length - 1];
      selector = '.ag-root';
      if (gridNode) warnings.push({ code: 'effective-grid-fallback', message: 'Effective AG Grid role was not found; used the most-specific root.' });
    }

    if (!gridNode) {
      return {
        taskId: config.taskId || null,
        grid: { selector: null, visibleRows: 0, virtualized: true },
        categories: [],
        milestones: [],
        sourceQuality: 'error',
        warnings: [{ code: 'grid-not-found', message: 'AG Grid was not found.' }]
      };
    }

    const rows = asArray(gridNode.querySelectorAll('.ag-row'));
    const seen = new Set();
    const categories = [];
    const groupsByLevel = [];
    let validRows = 0;

    rows.forEach((row) => {
      try {
        const index = rowIndexOf(row);
        const fingerprint = `${index}|${String(row.className || '').split(/\s+/).sort().join('.')}`;
        if (seen.has(fingerprint)) return;

        const level = levelOf(row);
        if (hasClass(row, 'ag-row-group')) {
          const category = parseGroup(row);
          seen.add(fingerprint);
          validRows++;
          categories.push(category);
          groupsByLevel[level] = category;
          groupsByLevel.length = level + 1;
          return;
        }

        const worklog = childRow(row);
        if (!worklog) return;
        seen.add(fingerprint);
        validRows++;
        const category = groupsByLevel[level - 1] || groupsByLevel[0];
        if (!category) {
          warnings.push({ code: 'orphan-child-row', message: 'A child row had no preceding group.' });
          return;
        }
        category.worklogs.push(worklog);
        category.factHours += worklog.hours;
        category.expanded = true;
      } catch (error) {
        warnings.push({ code: 'row-parse-failed', message: 'A visible AG Grid row could not be parsed.' });
      }
    });

    const hasWorklogs = categories.some((category) => category.worklogs.length > 0);
    const hasAggregate = categories.some((category) => category.worklogs.length === 0);
    let sourceQuality = hasWorklogs && !hasAggregate ? 'expanded' : hasAggregate ? 'aggregated' : 'partial';
    if (warnings.some((warning) => warning.code === 'row-parse-failed')) sourceQuality = 'partial';

    return {
      taskId: config.taskId || null,
      grid: { selector, visibleRows: validRows, virtualized: true },
      categories,
      milestones: [],
      sourceQuality,
      warnings
    };
  }

  exports.parseAgGrid = parseAgGrid;
})(typeof exports !== 'undefined' ? exports : (window.TrackStudioParser = {}));
