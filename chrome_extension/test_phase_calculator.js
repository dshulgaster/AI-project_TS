const assert = require('assert');
const phaseCalculator = require('./phase_calculator.js');

console.log('Running phase_calculator.js contract tests...\n');

const normalizedRequest = {
  taskId: 'fixture-task',
  sourceQuality: 'ready',
  grid: { selector: '.ag-root', visibleRows: 1, virtualized: true },
  categories: [],
  milestones: [],
  warnings: []
};

const result = phaseCalculator.calculatePlanFact(normalizedRequest);

assert.deepStrictEqual(result, {
  phases: { po: {}, oa: {}, dev: {}, accept: {}, stab: {} },
  totals: { plan: 0, fact: 0, variance: 0 },
  variances: { po: 0, oa: 0, dev: 0, accept: 0, stab: 0 },
  sourceQuality: 'error',
  poSla: { status: 'ok', durationDays: null, slaDays: 5 },
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
  sourceQuality: 'partial',
  categories: [{ key: 'analyst', name: 'Аналитика', defaultPhase: 'po', factDays: 2 }],
  milestones: [],
  warnings: []
});
assert.strictEqual(fallbackResult.phases.po.fact, 2);
assert.strictEqual(fallbackResult.trace.fallbacks[0].defaultPhase, 'po');
assert.strictEqual(fallbackResult.sourceQuality, 'partial');
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

const readyResult = phaseCalculator.calculatePlanFact(requestWithWorklogs([
  { taskId: 'dated', hours: 8, date: '2026-08-10' }
]));
assert.strictEqual(readyResult.sourceQuality, 'ready');
console.log('PASS: complete dated source with all milestones is ready');

const partialResult = phaseCalculator.calculatePlanFact(requestWithWorklogs([
  { taskId: 'undated', hours: 8 }
], { milestones: [{ operation: 'ПО', date: '2026-08-01' }] }));
assert.strictEqual(partialResult.sourceQuality, 'partial');
console.log('PASS: fallback or missing milestones produce partial quality');

const malformedDateResult = phaseCalculator.calculatePlanFact(requestWithWorklogs([
  { taskId: 'malformed-date', hours: 8, date: '2026-02-30' }
]));
assert.strictEqual(malformedDateResult.sourceQuality, 'warning');
assert(malformedDateResult.warnings.some((warning) => String(warning).includes('malformed')));
assert.strictEqual(malformedDateResult.trace.fallbacks.length, 0);
console.log('PASS: non-empty invalid dates are malformed, not defaultPhase fallbacks');

const impossibleResult = phaseCalculator.calculatePlanFact({ request: {}, categories: [] });
assert.strictEqual(impossibleResult.sourceQuality, 'error');
assert.deepStrictEqual(Object.keys(impossibleResult), ['phases', 'totals', 'variances', 'sourceQuality', 'poSla', 'warnings', 'trace']);
console.log('PASS: impossible empty source keeps the complete result contract');

const normalizedAgGrid = phaseCalculator.normalizeAgGridRequest({
  taskId: '1726097',
  sourceQuality: 'expanded',
  categories: [
    { key: 'management', name: 'Управление запросом', factHours: 4, worklogs: [] },
    { key: 'development', name: 'Разработка', factHours: 16, worklogs: [] }
  ],
  milestones: [],
  warnings: [{ code: 'fixture-warning', message: 'fixture warning' }]
});
assert.strictEqual(normalizedAgGrid.categories[0].hours, 4);
assert.strictEqual(normalizedAgGrid.categories[1].hours, 16);
console.log('PASS: AG Grid categories normalize factHours for the calculator');

const mappedTaskData = phaseCalculator.applyPhaseResultToTaskData({
  factPrelimAnalysisDays: 99,
  factFinalAnalysisDays: 99,
  factDevDays: 99,
  factAcceptanceDays: 99,
  factStabilizationDays: 99,
  factManagementDays: 99,
  factTotalDays: 99,
  sourceQuality: 'legacy',
  expansionWarnings: []
}, {
  phases: {
    po: { fact: 1, details: {} },
    oa: { fact: 2, details: {} },
    dev: { fact: 5, details: { management: 1 } },
    accept: { fact: 3, details: {} },
    stab: { fact: 4, details: {} }
  },
  totals: { fact: 15 },
  sourceQuality: 'ready',
  warnings: [{ code: 'fixture-warning', message: 'fixture warning' }]
});
assert.deepStrictEqual({
  prelim: mappedTaskData.factPrelimAnalysisDays,
  final: mappedTaskData.factFinalAnalysisDays,
  dev: mappedTaskData.factDevDays,
  accept: mappedTaskData.factAcceptanceDays,
  stab: mappedTaskData.factStabilizationDays,
  management: mappedTaskData.factManagementDays,
  total: mappedTaskData.factTotalDays,
  quality: mappedTaskData.sourceQuality,
  warnings: mappedTaskData.expansionWarnings
}, {
  prelim: 1,
  final: 2,
  dev: 4,
  accept: 3,
  stab: 4,
  management: 1,
  total: 15,
  quality: 'ready',
  warnings: [{ code: 'fixture-warning', message: 'fixture warning' }]
});
console.log('PASS: calculator phase results map to taskData without double-counting management');