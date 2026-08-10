const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('./ag_grid_parser.js');

class FakeNode {
  constructor({ tagName = 'div', className = '', attrs = {}, text = '', children = [] } = {}) {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.attributes = Object.assign({}, attrs);
    this.textContent = text;
    this.children = children;
    this.clicked = 0;
    this.clickHandler = null;
    this.children.forEach((child) => { child.parentNode = this; });
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  matches(selector) {
    const attributeMatch = selector.match(/^([^[]+)?\[([^=]+)="([^"]+)"\]$/);
    const baseSelector = attributeMatch ? (attributeMatch[1] || '*') : selector;
    if (attributeMatch && this.getAttribute(attributeMatch[2]) !== attributeMatch[3]) return false;
    if (baseSelector === '*') return true;
    if (baseSelector.startsWith('.')) {
      return baseSelector.slice(1).split('.').every((name) => this.className.split(/\s+/).includes(name));
    }
    return this.tagName.toLowerCase() === baseSelector.toLowerCase();
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map((item) => item.trim());
    const result = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (selectors.some((item) => child.matches(item))) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  click() {
    this.clicked += 1;
    if (this.clickHandler) this.clickHandler();
  }
}

class FakeDocument extends FakeNode {
  constructor(children) {
    super({ tagName: 'document', children });
  }
}

function cell(className, text, attrs) {
  return new FakeNode({ className, text, attrs });
}

function row(rowIndex, className, cells) {
  return new FakeNode({ className: `ag-row ${className}`, attrs: { 'row-index': String(rowIndex) }, children: cells });
}

function grid(rows, attrs) {
  return new FakeNode({ className: 'ag-root', attrs: Object.assign({ role: 'grid' }, attrs), children: rows });
}

function fixtureRows(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')).rows;
}

function fixtureCellText(itemCell, rowIndex) {
  if (itemCell.cellClass.includes('ag-group-value')) return `Группа ${itemCell.numericFingerprint}`;
  if (itemCell.cellClass.includes('ag-column-task')) {
    return `${itemCell.phaseHint ? `[${itemCell.phaseHint}] ` : ''}#${180000 + rowIndex}`;
  }
  if (itemCell.cellClass.includes('ag-column-hours')) return `${itemCell.numericFingerprint} ч`;
  if (itemCell.cellClass.includes('ag-group-child-count')) return '(2)';
  if (itemCell.date) {
    const [year, month, day] = itemCell.date.split('-');
    return `${day}.${month}.${year}`;
  }
  return `Группа ${itemCell.numericFingerprint}`;
}

function sanitizedGrid(name, role) {
  const rows = fixtureRows(name).map((item) => row(item.rowIndex, item.rowClass, item.cells.map((itemCell) => cell(itemCell.cellClass, fixtureCellText(itemCell, item.rowIndex), {
    'data-phase-hint': itemCell.phaseHint || ''
  }))));
  return grid(rows, role === undefined ? {} : { role });
}

let testChain = Promise.resolve();
function run(name, fn) {
  testChain = testChain.then(() => fn()).then(() => {
    console.log(`PASS: ${name}`);
  }).catch((error) => {
    console.error(`FAIL: ${name}`);
    console.error(error);
    throw error;
  });
}

run('selects one effective role grid instead of wrapper duplicates', () => {
  const effective = sanitizedGrid('ag-grid-contracted.json');
  const wrapper = new FakeNode({ className: 'ag-root-wrapper', children: [new FakeNode({ className: 'ag-root-wrapper-body', children: [effective] })] });
  const result = parser.parseAgGrid(new FakeDocument([wrapper]));

  assert.strictEqual(result.grid.selector, '.ag-root[role="grid"]');
  assert.strictEqual(result.grid.visibleRows, 1);
  assert.strictEqual(result.warnings.filter((warning) => warning.code === 'duplicate-wrapper').length, 0);
});

run('falls back to most-specific root with a warning', () => {
  const shallowRoot = sanitizedGrid('ag-grid-contracted.json', null);
  const deepRoot = sanitizedGrid('ag-grid-expanded.json', null);
  const nested = new FakeNode({ className: 'ag-root-wrapper-body', children: [new FakeNode({ className: 'ag-center-cols-container', children: [deepRoot] })] });
  const result = parser.parseAgGrid(new FakeDocument([shallowRoot, nested]));

  assert.strictEqual(result.grid.selector, '.ag-root');
  assert.strictEqual(result.grid.visibleRows, 3);
  assert(result.warnings.some((warning) => warning.code === 'effective-grid-fallback'));
});

run('parses contracted group labels and counts', () => {
  const group = row(10, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [
    cell('ag-cell ag-row-group-cell', 'Разработка'),
    cell('ag-cell ag-group-value', 'Разработка'),
    cell('ag-cell ag-group-child-count', '(4)')
  ]);
  const result = parser.parseAgGrid(new FakeDocument([grid([group])]), { taskId: '1726097' });

  assert.strictEqual(result.taskId, '1726097');
  assert.strictEqual(result.categories.length, 1);
  assert.deepStrictEqual(result.categories[0], {
    key: 'row-10',
    name: 'Разработка',
    level: 0,
    expanded: false,
    childCount: 4,
    factHours: 0,
    worklogs: [],
    source: 'aggregated-group'
  });
});

run('parses expanded child task identifiers, levels, dates, and hours', () => {
  const result = parser.parseAgGrid(new FakeDocument([sanitizedGrid('ag-grid-expanded.json')]), { taskId: '1726097' });
  const category = result.categories[0];

  assert.strictEqual(category.expanded, true);
  assert.strictEqual(category.level, 0);
  assert.strictEqual(category.factHours, 6.5);
  assert.deepStrictEqual(category.worklogs.map(({ taskId, hours, date, phaseHint }) => ({ taskId, hours, date, phaseHint })), [
    { taskId: '180001', hours: 2.5, date: '2026-08-10', phaseHint: 'dev' },
    { taskId: '180002', hours: 4, date: '2026-08-15', phaseHint: 'accept' }
  ]);
  assert.strictEqual(result.sourceQuality, 'expanded');
});

run('warns for malformed data rows, ignores headers, and does not log full cell text', () => {
  const valid = row(1, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [cell('ag-group-value', 'Тестирование'), cell('ag-group-child-count', '(1)')]);
  const malformedCell = new FakeNode({ className: 'ag-cell' });
  Object.defineProperty(malformedCell, 'textContent', { get() { throw new Error('secret full description'); } });
  const malformed = row(2, 'ag-row-level-0', [malformedCell]);
  const header = row(3, 'ag-header-row ag-row-level-0', [cell('ag-header-cell', 'Описание')]);
  const result = parser.parseAgGrid(new FakeDocument([grid([header, malformed, valid])]));

  assert.strictEqual(result.categories.length, 1, JSON.stringify(result));
  assert(result.warnings.some((warning) => warning.code === 'malformed-row'));
  assert(!result.warnings.some((warning) => warning.code === 'malformed-row' && warning.rowIndex === 3));
  assert(!JSON.stringify(result.warnings).includes('secret full description'));
});

run('warns and skips malformed group rows while still filtering headers', () => {
  const malformedGroup = row(4, 'ag-row-level-0 ag-row-group', [cell('ag-cell ag-row-group-cell', 'Без структуры')]);
  const header = row(5, 'ag-header-row ag-row-level-0 ag-row-group', [cell('ag-header-cell', 'Заголовок')]);
  const validGroup = row(6, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [
    cell('ag-group-value', 'Валидная группа'),
    cell('ag-group-child-count', '(2)')
  ]);
  const result = parser.parseAgGrid(new FakeDocument([grid([malformedGroup, header, validGroup])]));

  assert.strictEqual(result.categories.length, 1);
  assert.strictEqual(result.categories[0].name, 'Валидная группа');
  assert(result.warnings.some((warning) => warning.code === 'malformed-group-row' && warning.rowIndex === 4));
  assert(!result.warnings.some((warning) => warning.code === 'malformed-group-row' && warning.rowIndex === 5));
});

run('deduplicates conflicting duplicates by row index and class fingerprint in one logical grid', () => {
  const fixture = fixtureRows('ag-grid-duplicate-wrappers.json');
  const firstRows = fixture.map((item) => row(item.rowIndex, item.rowClass, item.cells.map((itemCell) => cell(itemCell.cellClass, fixtureCellText(itemCell, item.rowIndex)))));
  const conflictingRows = fixture.map((item) => row(item.rowIndex, item.rowClass, item.cells.map((itemCell) => cell(itemCell.cellClass, itemCell.cellClass.includes('ag-column-hours') ? '9 ч' : 'конфликт'))));
  const sameIndexDifferentFingerprint = row(0, `${fixture[0].rowClass} ag-row-selected`, [
    cell('ag-group-value', 'Отдельная строка'),
    cell('ag-group-child-count', '(3)')
  ]);
  const documentLike = new FakeDocument([new FakeNode({
    className: 'ag-root-wrapper',
    children: [new FakeNode({
      className: 'ag-root-wrapper-body',
      children: [grid(firstRows.concat(conflictingRows).concat([sameIndexDifferentFingerprint]))]
    })]
  })]);
  const result = parser.parseAgGrid(documentLike);

  assert.strictEqual(result.grid.visibleRows, 3);
  assert.strictEqual(result.categories.length, 2);
  assert.strictEqual(result.categories[0].factHours, 0.75);
  assert.strictEqual(result.categories[0].name, 'Группа 1.25');
  assert.strictEqual(result.categories[1].name, 'Отдельная строка');
});

run('expands only confirmed contracted group controls', async () => {
  const unrelated = new FakeNode({ className: 'ag-row-group-contracted', text: 'Не группа' });
  const groupControl = new FakeNode({ className: 'ag-group-contracted' });
  const group = row(20, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [
    new FakeNode({ className: 'ag-cell ag-row-group-cell', children: [groupControl] }),
    cell('ag-group-value', 'Разработка'),
    cell('ag-group-child-count', '(1)')
  ]);
  const documentLike = new FakeDocument([grid([group]), unrelated]);

  const result = await parser.expandContractedGroups(documentLike, {
    timeoutMs: 10,
    maxGroups: 1,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    }
  });

  assert.strictEqual(groupControl.clicked, 1);
  assert.strictEqual(unrelated.clicked, 0);
  assert.strictEqual(result.expandedCount, 0);
  assert.strictEqual(result.failedGroups.length, 1);
});

run('waits for mutations, stops on no change, and isolates group failures', async () => {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }

  const changedControl = new FakeNode({ className: 'ag-group-contracted' });
  const unchangedControl = new FakeNode({ className: 'ag-group-contracted' });
  const throwingControl = new FakeNode({ className: 'ag-group-contracted' });
  throwingControl.click = () => { throw new Error('click failed'); };
  const groups = [changedControl, unchangedControl, throwingControl].map((control, index) => row(index + 1, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [
    new FakeNode({ className: 'ag-cell ag-row-group-cell', children: [control] }),
    cell('ag-group-value', `Группа ${index + 1}`),
    cell('ag-group-child-count', '(1)')
  ]));
  const documentLike = new FakeDocument([grid(groups)]);
  const timers = [];

  const expansion = parser.expandContractedGroups(documentLike, {
    timeoutMs: 25,
    maxGroups: 2,
    MutationObserver: FakeMutationObserver,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {}
  });

  assert.strictEqual(observers.length, 1);
  observers[0].callback([{ type: 'childList' }]);
  timers.shift()();
  await Promise.resolve();
  timers.shift()();
  const expansionResult = await expansion;
  assert.strictEqual(expansionResult.expandedCount, 1);
  assert.strictEqual(changedControl.clicked, 1);
  assert.strictEqual(unchangedControl.clicked, 1);
  assert.strictEqual(throwingControl.clicked, 0);
});

run('respects the expansion limit', async () => {
  const controls = [1, 2, 3].map((index) => new FakeNode({ className: 'ag-group-contracted', attrs: { 'data-index': String(index) } }));
  const groups = controls.map((control, index) => row(index + 1, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [
    new FakeNode({ className: 'ag-cell ag-row-group-cell', children: [control] }),
    cell('ag-group-value', `Группа ${index + 1}`),
    cell('ag-group-child-count', '(1)')
  ]));
  const result = await parser.expandContractedGroups(new FakeDocument([grid(groups)]), {
    timeoutMs: 1,
    maxGroups: 2,
    MutationObserver: class { observe() {} disconnect() {} }
  });

  assert.strictEqual(controls[0].clicked, 1);
  assert.strictEqual(controls[1].clicked, 1);
  assert.strictEqual(controls[2].clicked, 0);
  assert.strictEqual(result.warnings.some((warning) => warning.code === 'expansion-limit'), true);
});

testChain.then(() => {
  console.log('ALL AG GRID PARSER TESTS PASSED');
}).catch(() => {
  process.exitCode = 1;
});
