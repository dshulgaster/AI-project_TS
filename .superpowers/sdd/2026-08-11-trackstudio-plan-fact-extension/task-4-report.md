# Task 4 Report: Explicit AG Grid Expansion

## Changes

- Fixed `expandContractedGroups(document, options)` in `chrome_extension/ag_grid_parser.js` so the only expansion target is `.ag-row-group-contracted` inside a contracted group row's group cell.
- `.ag-group-contracted` and standalone `aria-expanded` controls are ignored, including when nested in an otherwise valid group cell.
- Expansion now records an `expansion-no-change` warning and stops before attempting later groups after the first group with no observable mutation.
- Removed duplicate `toggleWidget` declarations and the automatic comments/history expansion; retained both `toggle_widget` and `toggleWidget` message actions and the explicit recalculate hook.
- Added regression coverage for target selection, stop-on-no-change, failure isolation, and the expansion limit.
- `phase_calculator.js` was not changed.

## Verification

- `node --check .\content.js`: PASS.
- `node .\test_ag_grid_parser.js`: PASS, 10 checks.
- `node .\test_phase_calculator.js`: PASS, 10 checks.
- `node .\test_allocator.js`: PASS, 6 checks.

## Commit

Fix commit message: `fix: wire AG Grid parser into extension`

## Concern

The manifest load order blocker is fixed: `ag_grid_parser.js` now loads before `content.js`.

## Load-order Fix Report

### Change

- Added `ag_grid_parser.js` to `chrome_extension/manifest.json` between `allocator.js` and `content.js`.

### Verification

- PowerShell `Get-Content .\manifest.json -Raw | ConvertFrom-Json`: PASS.
- Verified content script order: `allocator.js -> ag_grid_parser.js -> content.js`: PASS.
- `node --check .\background.js`: PASS.
- `node --check .\content.js`: PASS.
- `node --check .\ag_grid_parser.js`: PASS.
- `node .\test_ag_grid_parser.js`: PASS, 10 checks.
- `node .\test_phase_calculator.js`: PASS, 10 checks.
- `node .\test_allocator.js`: PASS, 6 checks.

## Calculator Application Fix Report

### Change

- Сделан UMD-compatible export `window.TrackStudioPhaseCalculator` с сохранением `module.exports`.
- Добавлены `normalizeAgGridRequest` и `applyPhaseResultToTaskData`; parser `factHours` нормализуется в calculator request.
- `content.js` применяет calculator result после initial parser и explicit expansion, включая факты по пяти фазам, management, total, source quality и warnings.
- При недоступном parser/calculator или пустом normalized request legacy расчёт сохраняется, а в виджете показывается предупреждение.
- Добавлен focused Node test mapping AG Grid result -> `taskData` без DOM.

### Verification

- `node --check .\phase_calculator.js`: PASS.
- `node --check .\allocator.js`: PASS.
- `node --check .\content.js`: PASS.
- `node --check .\background.js`: PASS.
- `Get-Content .\manifest.json -Raw | ConvertFrom-Json`: PASS.
- Проверен порядок content scripts: `allocator.js -> ag_grid_parser.js -> phase_calculator.js -> content.js`.
- `node .\test_ag_grid_parser.js`: PASS, 11 checks.
- `node .\test_phase_calculator.js`: PASS, 12 checks.
- `node .\test_allocator.js`: PASS, 6 checks.