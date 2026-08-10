// Unit Test Suite for allocator.js (Superpowers TDD Framework)
const assert = require('assert');
const allocator = require('./allocator.js');

console.log('🧪 Running allocator.js unit tests...\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Test 1: Date Parsing
test('parseDateFromText parses DD.MM.YYYY correctly', () => {
  const res = allocator.parseDateFromText('Списание от 15.08.2026');
  assert.strictEqual(res.dateStr, '15.08.2026');
  assert.strictEqual(res.dateObj.getFullYear(), 2026);
  assert.strictEqual(res.dateObj.getMonth(), 7); // August (0-indexed)
  assert.strictEqual(res.dateObj.getDate(), 15);
});

// Test 2: defaultPhase Allocation for Collapsed Rows
test('allocateSubtasks assigns correct defaultPhase for collapsed parent rows', () => {
  const sampleRows = [
    'Задача на анализ доработки аналитиком 0 / 1 (2.1 ч.д.)',
    'Задача на анализ доработки конструктором 0 / 1 (1.2 ч.д.)',
    'Поддержка внедрения 0 / 1 (4.3 ч.д.)',
    'Задача на приёмку работы 0 / 1 (1.1 ч.д.)',
    'Задача на разработку 0 / 1 (3.9 ч.д.)'
  ];

  const res = allocator.allocateSubtasks(sampleRows, null);

  assert.strictEqual(res.po.analyst, 2.1, 'Analyst should go to PO phase by default');
  assert.strictEqual(res.po.constructor, 1.2, 'Constructor should go to PO phase by default');
  assert.strictEqual(res.stab.base, 4.3, 'Vnedrenie should go to Stab phase by default');
  assert.strictEqual(res.accept.base, 1.1, 'Acceptance should go to Accept phase by default');
  assert.strictEqual(res.dev.code, 3.9, 'Dev code should go to Dev phase by default');
  assert.strictEqual(res.totalDays, 12.6, 'Total sum should be exactly 12.6');
});

// Test 3: Double Counting Prevention (Parent vs Child)
test('allocateSubtasks excludes parent category when child tasks are expanded', () => {
  const sampleRows = [
    'Задача на разработку 0 / 1 (3.9 ч.д.)', // Parent row
    '#1829101 Задача на разработку кода (2.5 ч.д.)', // Child row 1
    '#1829102 Задача на сборку тиража (1.4 ч.д.)' // Child row 2
  ];

  const res = allocator.allocateSubtasks(sampleRows, null);

  // Parent (3.9) should be filtered out because children exist for key 'dev'
  assert.strictEqual(res.dev.code, 2.5, 'Only child code task should be counted');
  assert.strictEqual(res.dev.deploy, 1.4, 'Child deploy task should be counted');
  assert.strictEqual(res.totalDays, 3.9, 'Total days must equal 3.9 without double counting parent');
});

// Test 4: Milestone Boundaries
test('getPhaseForDate assigns correct phase based on milestone dates', () => {
  const milestones = {
    effectivePoBoundaryDateObj: new Date(2026, 7, 1),
    dateDevStartObj: new Date(2026, 7, 5),
    dateAcceptanceStartObj: new Date(2026, 7, 15),
    dateReleaseObj: new Date(2026, 7, 20)
  };

  assert.strictEqual(allocator.getPhaseForDate(new Date(2026, 6, 30), 'po', milestones), 'po');
  assert.strictEqual(allocator.getPhaseForDate(new Date(2026, 7, 3), 'po', milestones), 'oa');
  assert.strictEqual(allocator.getPhaseForDate(new Date(2026, 7, 10), 'dev', milestones), 'dev');
  assert.strictEqual(allocator.getPhaseForDate(new Date(2026, 7, 18), 'accept', milestones), 'accept');
  assert.strictEqual(allocator.getPhaseForDate(new Date(2026, 7, 25), 'stab', milestones), 'stab');
});

// Test 5: Full 13 Categories parsing matching exact TrackStudio user screenshot
test('allocateSubtasks correctly parses all 13 categories without NaN', () => {
  const screenshotRows = [
    'Задача на анализ доработки аналитиком 0 / 1 (2.1 ч.д)',
    'Задача на анализ доработки конструктором 0 / 2 (1.2 ч.д)',
    'Задача на доработку документации 0 / 2 (0.2 ч.д)',
    'Задача на исправление ошибки 0 / 5 (5 ч.д)',
    'Задача на приёмку работы 0 / 2 (1.1 ч.д)',
    'Задача на разработку 0 / 4 (3.9 ч.д)',
    'Задача на тестирование 0 / 1 (4.3 ч.д)',
    'Задача на тиражирование 0 / 2 (0.5 ч.д)',
    'Запрос на консультацию 0 / 5 (1.2 ч.д)',
    'Организация и планирование работ 0 / 2 (0.6 ч.д)',
    'Поддержка внедрения 0 / 1 (4.3 ч.д)',
    'Приёмка работы 0 / 3 (0.3 ч.д)',
    'Управленческая работа 1 / 1 (1.6 ч.д)'
  ];

  const res = allocator.allocateSubtasks(screenshotRows, null);

  // Verify no undefined properties
  for (const phase of ['po', 'oa', 'dev', 'accept', 'stab']) {
    for (const key of Object.keys(res[phase])) {
      assert(!isNaN(res[phase][key]), `Property ${phase}.${key} must not be NaN`);
    }
  }

  assert.strictEqual(res.po.analyst, 2.1, 'Analyst -> 2.1');
  assert.strictEqual(res.po.constructor, 1.2, 'Constructor -> 1.2');
  assert.strictEqual(res.dev.doc, 0.2, 'Doc -> 0.2');
  assert.strictEqual(res.dev.bugfix, 5.0, 'Bugfix -> 5.0');
  assert.strictEqual(Math.round(res.accept.base * 10) / 10, 1.4, 'Acceptance (1.1 + 0.3) -> 1.4');
  assert.strictEqual(res.dev.code, 3.9, 'Dev code -> 3.9');
  assert.strictEqual(res.dev.qa, 4.3, 'QA -> 4.3');
  assert.strictEqual(res.dev.deploy, 0.5, 'Deploy -> 0.5');
  assert.strictEqual(res.dev.consultation, 1.2, 'Consultation -> 1.2');
  assert.strictEqual(res.oa.qa, 0.6, 'Planning -> 0.6 in OA');
  assert.strictEqual(res.stab.base, 4.3, 'Stab -> 4.3');
  assert.strictEqual(res.manageBreakdown.dev, 1.6, 'Management -> 1.6');

  const expectedTotal = 2.1 + 1.2 + 0.2 + 5.0 + 1.1 + 3.9 + 4.3 + 0.5 + 1.2 + 0.6 + 4.3 + 0.3 + 1.6;
  assert.strictEqual(Math.round(res.totalDays * 10) / 10, Math.round(expectedTotal * 10) / 10, `Total sum should match ${expectedTotal}`);
});

console.log(`\n🎉 ALL ${passedTests} UNIT TESTS PASSED SUCCESSFULLY!`);
