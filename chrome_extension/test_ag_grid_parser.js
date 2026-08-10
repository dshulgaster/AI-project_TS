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

function sanitizedGrid(name, role) {
  const rows = fixtureRows(name).map((item) => row(item.rowIndex, item.rowClass, item.cells.map((itemCell) => cell(itemCell.cellClass, String(itemCell.numericFingerprint)))));
  return grid(rows, role === undefined ? {} : { role });
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
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
  const root = sanitizedGrid('ag-grid-contracted.json', null);
  const result = parser.parseAgGrid(new FakeDocument([root]));

  assert.strictEqual(result.grid.selector, '.ag-root');
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
  const group = row(10, 'ag-row-level-0 ag-row-group', [cell('ag-group-value', 'Разработка'), cell('ag-group-child-count', '(2)')]);
  const child = row(11, 'ag-row-level-1', [
    cell('ag-cell ag-column-task', '#180001 Разработка'),
    cell('ag-cell ag-column-date', '10.08.2026'),
    cell('ag-cell ag-column-hours', '2 ч 30 м')
  ]);
  const result = parser.parseAgGrid(new FakeDocument([grid([group, child])]), { taskId: '1726097' });
  const category = result.categories[0];

  assert.strictEqual(category.expanded, true);
  assert.strictEqual(category.level, 0);
  assert.deepStrictEqual(category.worklogs, [{
    taskId: '180001', hours: 2.5, date: '2026-08-10', phaseHint: null, source: 'child-row'
  }]);
  assert.strictEqual(result.sourceQuality, 'expanded');
});

run('isolates malformed rows and does not log full cell text', () => {
  const valid = row(1, 'ag-row-level-0 ag-row-group ag-row-group-contracted', [cell('ag-group-value', 'Тестирование'), cell('ag-group-child-count', '(1)')]);
  const malformedCell = new FakeNode({ className: 'ag-cell' });
  Object.defineProperty(malformedCell, 'textContent', { get() { throw new Error('secret full description'); } });
  const malformed = row(2, 'ag-row-level-0', [malformedCell]);
  const result = parser.parseAgGrid(new FakeDocument([grid([malformed, valid])]));

  assert.strictEqual(result.categories.length, 1);
  assert(result.warnings.some((warning) => warning.code === 'row-parse-failed'));
  assert(!JSON.stringify(result.warnings).includes('secret full description'));
});

run('deduplicates rows by row-index and class fingerprint', () => {
  const duplicateRows = [
    row(0, 'ag-row-level-0 ag-row-group', [cell('ag-group-value', 'Разработка'), cell('ag-group-child-count', '(1)')]),
    row(1, 'ag-row-level-1', [cell('ag-column-task', '#180002 Разработка'), cell('ag-column-date', '06.08.2026'), cell('ag-column-hours', '0.75 ч')])
  ];
  const result = parser.parseAgGrid(new FakeDocument([grid(duplicateRows), new FakeNode({ className: 'ag-root-wrapper', children: [grid(duplicateRows)] })]));

  assert.strictEqual(result.grid.visibleRows, 2);
});

console.log('ALL AG GRID PARSER TESTS PASSED');
