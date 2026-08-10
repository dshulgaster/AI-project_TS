# Task 4 Report: Explicit AG Grid Expansion

## Changes

- Added `expandContractedGroups(document, options)` to `chrome_extension/ag_grid_parser.js`.
- Expansion targets only confirmed contracted controls inside a group row's group cell; unrelated page controls and `aria-expanded` elements are ignored.
- Added bounded `MutationObserver`/timeout handling, maximum group limit, stop-on-no-change behavior, and per-group failure warnings.
- Added the `Раскрыть и пересчитать` hook to legacy `content.js` with loading state, fresh parser scan, legacy recalculation/render, source quality, and warning status.
- Preserved the existing `toggle_widget` behavior and did not change `phase_calculator.js` or the widget implementation.

## Verification

- `node --check .\content.js`: PASS.
- `node .\test_ag_grid_parser.js`: PASS, 10 checks.
- `node .\test_phase_calculator.js`: PASS, 10 checks.
- `node .\test_allocator.js`: PASS, 6 checks.

## Commit

Commit message from brief: `feat: add explicit AG Grid expansion`

## Concern

The current manifest still loads the legacy content script without `ag_grid_parser.js`; the hook reports parser-unavailable until the planned browser-side module loading migration includes the parser.