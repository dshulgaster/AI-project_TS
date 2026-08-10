const assert = require('assert');
const phaseCalculator = require('./phase_calculator.js');

console.log('Running phase_calculator.js contract tests...\n');

const normalizedRequest = {
  taskId: 'fixture-task',
  sourceQuality: 'expanded',
  grid: { selector: '.ag-root', visibleRows: 1, virtualized: true },
  categories: [],
  milestones: [],
  warnings: []
};

const result = phaseCalculator.calculatePlanFact(normalizedRequest);

assert.deepStrictEqual(result, {
  phases: { po: {}, oa: {}, dev: {}, accept: {}, stab: {} },
  sourceQuality: 'expanded',
  warnings: [],
  trace: { excludedParents: [], fallbacks: [] }
});

console.log('PASS: normalized request returns the frozen phase result contract');

function date(value) {
  return value;
}

function requestWithWorklogs(worklogs, overrides) {
  return Object.assign({
    taskId: 'boundary-task',
    sourceQuality: 'expanded',
    categories: [{ key: 'dev', name: 'Разработка', defaultPhase: 'dev', worklogs }],
    milestones: [
      { operation: 'ПО', date: date('2026-08-01') },
      { operation: 'Передать в разработку', date: date('2026-08-05') },
      { operation: 'Передать на приемку', date: date('2026-08-10') },
      { operation: 'Сдать в ОПЭ', date: date('2026-08-15') }
    ],
    warnings: []
  }, overrides || {});
}

function factByPhase(result) {
  return Object.fromEntries(Object.keys(result.phases).map((phase) => [phase, result.phases[phase].fact]));
}

assert.deepStrictEqual(factByPhase(phaseCalculator.calculatePlanFact(requestWithWorklogs([
  { taskId: 'po', hours: 8, date: '2026-08-01' },
  { taskId: 'oa', hours: 8, date: '2026-08-05' },
  { taskId: 'dev', hours: 8, date: '2026-08-10' },
  { taskId: 'accept', hours: 8, date: '2026-08-15' },
  { taskId: 'stab', hours: 8, date: '2026-08-16' }
]))), { po: 1, oa: 1, dev: 1, accept: 1, stab: 1 });
console.log('PASS: interval boundaries are inclusive on the right');

const fallbackResult = phaseCalculator.calculatePlanFact({
  sourceQuality: 'aggregated',
  categories: [{ key: 'analyst', name: 'Аналитика', defaultPhase: 'po', factDays: 2 }],
  milestones: [],
  warnings: []
});
assert.strictEqual(fallbackResult.phases.po.fact, 2);
assert.strictEqual(fallbackResult.trace.fallbacks[0].defaultPhase, 'po');
assert.strictEqual(fallbackResult.sourceQuality, 'fallback');
console.log('PASS: undated aggregates use defaultPhase and trace the fallback');

const doubleCountingResult = phaseCalculator.calculatePlanFact({
  sourceQuality: 'expanded',
  categories: [{
    key: 'dev',
    name: 'Разработка',
    factDays: 10,
    worklogs: [
      { taskId: 'child-1', hours: 8, date: '2026-08-10', source: 'child-row' },
      { taskId: 'child-2', hours: 4, date: '2026-08-11', source: 'child-row' }
    ]
  }],
  milestones: [{ operation: 'Передать на приемку', date: '2026-08-20' }],
  warnings: []
});
assert.strictEqual(doubleCountingResult.totals.fact, 1.5);
assert.strictEqual(doubleCountingResult.trace.excludedParents.length, 1);
console.log('PASS: parent aggregate is excluded when child worklogs exist');

const slaResult = phaseCalculator.calculatePlanFact({
  sourceQuality: 'expanded',
  taskCreatedAt: '2026-08-01',
  categories: [{ key: 'dev', name: 'Разработка', factDays: 0 }],
  milestones: [{ operation: 'ПО', date: '2026-08-07' }],
  warnings: []
});
assert.strictEqual(slaResult.poSla.status, 'danger');
assert.strictEqual(slaResult.poSla.durationDays, 6);
assert.notStrictEqual(phaseCalculator.calculatePlanFact({
  sourceQuality: 'expanded', taskCreatedAt: '2026-08-01', categories: [{ key: 'dev', name: 'Разработка', factDays: 0 }],
  milestones: [{ operation: 'ПО', date: '2026-08-06' }], warnings: []
}).poSla.status, 'danger');
console.log('PASS: SLA is danger only above five days');

const qualityResult = phaseCalculator.calculatePlanFact({
  sourceQuality: 'expanded',
  categories: [{ key: 'dev', name: 'Разработка', worklogs: [{ hours: 'bad', date: 'not-a-date' }] }],
  milestones: [],
  warnings: [{ code: 'expansion-failed', message: 'group failed' }]
});
assert.strictEqual(qualityResult.sourceQuality, 'warning');
assert(qualityResult.warnings.length >= 2);
console.log('PASS: malformed rows and expansion failures lower quality');