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