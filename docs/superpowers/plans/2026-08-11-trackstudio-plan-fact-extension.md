# TrackStudio Plan-Fact Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing TrackStudio Chrome Extension into a modular Vanilla JS Manifest V3 extension with an AG Grid parser, explicit expansion, five-phase plan-fact calculation, quality warnings, and tested exports.

**Architecture:** Keep `background.js` as a message-only service worker. Split the current monolithic `content.js` into orchestration, AG Grid parsing, pure calculation, widget rendering, and exporters while preserving the existing `allocator.js` behavior through a compatibility adapter during migration.

**Tech Stack:** Chrome Manifest V3, Vanilla JavaScript ES6+, CSS3, Node.js built-in `assert` for unit tests, no external runtime libraries and no build step.

## Global Constraints

- Use the authenticated TrackStudio browser session; never store credentials, cookies, passwords, or API tokens.
- Use AG Grid anchors: `.ag-root[role="grid"]`, `.ag-row`, `.ag-cell`, `.ag-row-group-contracted`, `.ag-group-value`, and `.ag-group-child-count`.
- Do not expand groups on initial widget open; expansion occurs only from explicit `Раскрыть и пересчитать`.
- Apply the five-phase model and the parent/child double-counting rule from `shared_context/OVERALL_CONTEXT.md`.
- Keep row-level parsing failures isolated and expose partial/fallback quality instead of silently claiming an exact result.
- Preserve the existing Chrome extension entry points and current test command while migrating.
- Do not include ignored JSON diagnostics or `.env` files in commits.

---

## File Map

### Existing files to modify

- `chrome_extension/manifest.json`: add the new content modules in deterministic load order and retain MV3 permissions.
- `chrome_extension/background.js`: preserve the icon-click message contract while standardizing the message name.
- `chrome_extension/content.js`: reduce to lifecycle orchestration and UI event wiring; remove duplicated parsing/calculation code incrementally.
- `chrome_extension/allocator.js`: either extract the pure functions into `phase_calculator.js` or turn it into a compatibility facade with identical exports during migration.
- `chrome_extension/test_allocator.js`: retain existing regression tests and add phase-boundary, fallback, and malformed-input cases.
- `chrome_extension/styles.css`: add high-contrast expansion/status controls and styles for quality/warning states.

### New files

- `chrome_extension/ag_grid_parser.js`: DOM-specific AG Grid selection, row normalization, deduplication, expansion, and warnings.
- `chrome_extension/phase_calculator.js`: pure normalized-data calculator and five-phase result contract.
- `chrome_extension/widget.js`: Shadow DOM widget renderer and view-state transitions.
- `chrome_extension/exporters.js`: Notion Markdown and Excel-compatible export functions.
- `chrome_extension/test_phase_calculator.js`: pure calculator tests independent of `document` and Chrome APIs.
- `chrome_extension/test_ag_grid_parser.js`: fixture-based parser tests using a minimal DOM-like fixture adapter.
- `chrome_extension/test_exporters.js`: Markdown and Excel-compatible output tests.
- `chrome_extension/fixtures/ag-grid-contracted.json`: sanitized contracted-row fixture.
- `chrome_extension/fixtures/ag-grid-expanded.json`: sanitized expanded parent/child fixture.
- `chrome_extension/fixtures/ag-grid-duplicate-wrappers.json`: sanitized nested-wrapper fixture.

---

## Task 1: Freeze Existing Behavior and Contracts

**Files:**
- Modify: `chrome_extension/test_allocator.js`
- Create: `chrome_extension/test_phase_calculator.js`
- Create: `chrome_extension/fixtures/ag-grid-contracted.json`
- Create: `chrome_extension/fixtures/ag-grid-expanded.json`
- Create: `chrome_extension/fixtures/ag-grid-duplicate-wrappers.json`

**Interfaces:**
- Consumes: current exports from `allocator.js` and sanitized AG Grid report evidence.
- Produces: executable regression tests and fixture shapes used by later parser/calculator tasks.

- [ ] **Step 1: Run the existing allocator regression test.**

Run from `chrome_extension`:

```powershell
node .\test_allocator.js
```

Expected: all existing allocator tests pass before refactoring.

- [ ] **Step 2: Add tests for the normalized phase result contract.**

The new test file must assert that a normalized request returns:

```javascript
{
  phases: { po: {}, oa: {}, dev: {}, accept: {}, stab: {} },
  sourceQuality: 'expanded',
  warnings: [],
  trace: { excludedParents: [], fallbacks: [] }
}
```

- [ ] **Step 3: Add sanitized fixtures.**

Fixtures must contain only row classes, row indexes, cell classes, numeric fingerprints, phase hints, and dates. Do not copy task names, comments, employee names, URLs with identifiers, or attachment tokens.

- [ ] **Step 4: Run both test files and commit the baseline.**

```powershell
node .\test_allocator.js
node .\test_phase_calculator.js
git add chrome_extension/test_allocator.js chrome_extension/test_phase_calculator.js chrome_extension/fixtures
git commit -m "test: freeze plan-fact contracts"
```

## Task 2: Implement the Pure Phase Calculator

**Files:**
- Create: `chrome_extension/phase_calculator.js`
- Modify: `chrome_extension/allocator.js`
- Modify: `chrome_extension/test_phase_calculator.js`

**Interfaces:**
- Consumes: `calculatePlanFact(normalizedRequest, options)` with normalized milestones, plan values, categories, and worklogs.
- Produces: `{ phases, totals, variances, sourceQuality, poSla, warnings, trace }`.

- [ ] **Step 1: Write failing tests for interval boundaries.**

Test dates at, before, and after each boundary. Required rule:

```text
t <= T_po_boundary                       -> po
T_po_boundary < t <= T_dev_start         -> oa
T_dev_start < t <= T_accept_start        -> dev
T_accept_start < t <= T_release          -> accept
t > T_release                            -> stab
```

- [ ] **Step 2: Write failing tests for fallback and double counting.**

Assert that a parent aggregate is excluded when child worklogs exist, and that a category without dated children records `defaultPhase` in `trace.fallbacks`.

- [ ] **Step 3: Implement the calculator without DOM access.**

Move the stable category mapping and date logic from `allocator.js` behind explicit functions:

```javascript
calculatePlanFact(request, { hoursPerDay = 8, slaDays = 5 })
resolvePhase(worklog, category, milestones)
```

Keep compatibility exports from `allocator.js` until `content.js` no longer calls them.

- [ ] **Step 4: Add SLA and quality states.**

Return `ready`, `partial`, `warning`, or `error` based on missing milestones, fallback usage, malformed rows, and expansion failures. SLA must be `danger` only when preliminary-analysis duration is greater than five days.

- [ ] **Step 5: Run focused tests and commit.**

```powershell
node .\test_phase_calculator.js
node .\test_allocator.js
git add chrome_extension/phase_calculator.js chrome_extension/allocator.js chrome_extension/test_phase_calculator.js
git commit -m "feat: add pure five-phase calculator"
```

## Task 3: Implement AG Grid Normalization

**Files:**
- Create: `chrome_extension/ag_grid_parser.js`
- Create/modify: `chrome_extension/test_ag_grid_parser.js`
- Modify: `chrome_extension/fixtures/ag-grid-contracted.json`
- Modify: `chrome_extension/fixtures/ag-grid-expanded.json`
- Modify: `chrome_extension/fixtures/ag-grid-duplicate-wrappers.json`

**Interfaces:**
- Consumes: a document-like object containing AG Grid markup.
- Produces:

```javascript
parseAgGrid(document, options) -> {
  taskId, grid, categories, milestones, sourceQuality, warnings
}
```

- [ ] **Step 1: Add parser tests for effective-grid selection.**

Assert that nested `.ag-root-wrapper`, `.ag-root-wrapper-body`, and `.ag-root[role="grid"]` produce one logical grid and one row set, not three copies.

- [ ] **Step 2: Add parser tests for contracted and expanded groups.**

Assert extraction of `row-index`, `ag-row-level-0`, `ag-row-group-contracted`, `.ag-group-value`, `.ag-group-child-count`, child task identifiers, dates, and worklog values.

- [ ] **Step 3: Implement selectors and deduplication.**

Prefer the visible `.ag-root[role="grid"]`; fall back to the most specific visible `.ag-root` only with a warning. Deduplicate by `row-index` plus row class fingerprint and retain the first valid logical row.

- [ ] **Step 4: Implement per-row parsing isolation.**

Wrap each row in `try/catch`; malformed cells produce a warning and do not stop other rows. Never put full cell text in logs or diagnostics.

- [ ] **Step 5: Run parser tests and commit.**

```powershell
node .\test_ag_grid_parser.js
git add chrome_extension/ag_grid_parser.js chrome_extension/test_ag_grid_parser.js chrome_extension/fixtures
git commit -m "feat: parse TrackStudio AG Grid rows"
```

## Task 4: Add Explicit Expansion and Recalculation

**Files:**
- Modify: `chrome_extension/ag_grid_parser.js`
- Modify: `chrome_extension/test_ag_grid_parser.js`
- Modify: `chrome_extension/content.js`

**Interfaces:**
- Consumes: `expandContractedGroups(document, options)` and the parser result.
- Produces: `{ expandedCount, failedGroups, warnings }` followed by a fresh `parseAgGrid` result.

- [ ] **Step 1: Test the expansion target selection.**

The only target selector is `.ag-row-group-contracted` inside the first/group cell of a row containing `ag-row-group-contracted`. Test that unrelated page buttons, dropdowns, attachment links, and `aria-expanded` controls are ignored.

- [ ] **Step 2: Test mutation waiting and limits.**

Use a fake `MutationObserver` and assert bounded timeout, maximum group count, stop-on-no-change, and per-group failure isolation.

- [ ] **Step 3: Implement explicit expansion.**

Do not call expansion from initial parsing. On the explicit UI action, click each confirmed control, wait for row/class/child mutations, then reparse. Preserve the last valid aggregate result when a group fails.

- [ ] **Step 4: Connect the action in `content.js`.**

The handler must set `loading`, call expansion, recalculate, and render warnings/source quality. It must not reload the page or expand comments/history.

- [ ] **Step 5: Run focused tests and commit.**

```powershell
node .\test_ag_grid_parser.js
git add chrome_extension/ag_grid_parser.js chrome_extension/test_ag_grid_parser.js chrome_extension/content.js
git commit -m "feat: add explicit AG Grid expansion"
```

## Task 5: Split Widget Rendering From the Content Orchestrator

**Files:**
- Create: `chrome_extension/widget.js`
- Modify: `chrome_extension/content.js`
- Modify: `chrome_extension/styles.css`
- Modify: `chrome_extension/manifest.json`

**Interfaces:**
- Consumes: calculation result and callbacks `{ onExpand, onUnitChange, onExport, onCopy, onClose }`.
- Produces: a Shadow DOM widget with `mountWidget`, `renderWidget`, and `unmountWidget`.

- [ ] **Step 1: Preserve the existing visible behavior with UI smoke checks.**

Verify that no widget exists before `toggleWidget`, the icon click mounts it, and a second icon click hides it.

- [ ] **Step 2: Implement the Shadow DOM widget states.**

Render `loading`, `ready`, `partial`, `warning`, and `error`, plus `min`, `mid`, and `max`. The `mid` view must show five phases, Plan, Fact, Variance, unit switch, expansion, copy, and export controls.

- [ ] **Step 3: Migrate existing UI controls.**

Move current size/unit/tab/detail controls out of `content.js` without changing their public behavior. Remove inline style dependence where practical and keep all text high contrast.

- [ ] **Step 4: Update manifest load order.**

Load `phase_calculator.js`, `ag_grid_parser.js`, `exporters.js`, `widget.js`, then `content.js` after `allocator.js` during migration. Remove a file from the manifest only after no runtime reference remains.

- [ ] **Step 5: Run syntax and existing regression checks, then commit.**

```powershell
node --check .\background.js
node --check .\allocator.js
node --check .\widget.js
node --check .\content.js
node .\test_allocator.js
git add chrome_extension/manifest.json chrome_extension/content.js chrome_extension/widget.js chrome_extension/styles.css
git commit -m "refactor: split extension widget orchestration"
```

## Task 6: Implement Exporters and Quality Trace UI

**Files:**
- Create: `chrome_extension/exporters.js`
- Modify: `chrome_extension/widget.js`
- Modify: `chrome_extension/content.js`
- Modify: `chrome_extension/styles.css`

**Interfaces:**
- Consumes: the normalized calculation result.
- Produces: `toNotionMarkdown(result)` and `toExcelHtml(result)` strings plus download/copy helpers.

- [ ] **Step 1: Test Markdown output.**

Assert that phase rows, plan, fact, variance, SLA, source quality, and warnings are present, while raw task descriptions are absent.

- [ ] **Step 2: Test Excel-compatible output.**

Assert that the generated file contains a table header and one row per phase/category with escaped cell values.

- [ ] **Step 3: Implement exporters.**

Use `navigator.clipboard.writeText` with a visible failure status and create a Blob download for `.xls`. Do not add a runtime dependency.

- [ ] **Step 4: Render trace and warning details in `max`.**

Show fallback sources, missing milestones, failed groups, and excluded parent rows. Keep sensitive raw text out of diagnostics.

- [ ] **Step 5: Run focused tests and commit.**

```powershell
node .\test_exporters.js
git add chrome_extension/exporters.js chrome_extension/widget.js chrome_extension/content.js chrome_extension/styles.css
git commit -m "feat: add plan-fact exports and quality trace"
```

## Task 7: End-to-End Acceptance and Cleanup

**Files:**
- Modify: `chrome_extension/PRD.md`
- Modify: `docs/superpowers/specs/2026-08-11-trackstudio-plan-fact-extension-design.md`
- Modify: `chrome_extension/manifest.json`
- Modify: `chrome_extension/content.js`
- Modify: `chrome_extension/allocator.js`
- Modify: `chrome_extension/test_allocator.js`

**Interfaces:**
- Consumes: all modules and fixtures from Tasks 1-6.
- Produces: a tested unpacked extension and updated documentation describing actual commands and limitations.

- [ ] **Step 1: Run the complete local validation.**

```powershell
Set-Location .\chrome_extension
Get-ChildItem -Filter '*.js' | ForEach-Object { node --check $_.FullName }
node .\test_allocator.js
node .\test_phase_calculator.js
node .\test_ag_grid_parser.js
node .\test_exporters.js
```

- [ ] **Step 2: Perform the authorized TrackStudio smoke test.**

Load `chrome_extension` as unpacked, open request `1726097`, verify initial non-expanding calculation, press `Раскрыть и пересчитать`, confirm warning/source quality, check parent exclusion, copy Markdown, and download `.xls`.

- [ ] **Step 3: Verify security and ignored artifacts.**

```powershell
Set-Location ..
git status --short
git check-ignore -v .env .\chrome_extension\dom_inspector\*.json
```

Confirm that no credential, cookie, or diagnostic JSON is staged.

- [ ] **Step 4: Update documentation with observed behavior.**

Document actual AG Grid selectors, expansion limits, test commands, and known virtualization limitations. Remove obsolete claims only after the replacement behavior is tested.

- [ ] **Step 5: Commit the completed MVP slice.**

```powershell
git add chrome_extension docs/superpowers/specs
git commit -m "feat: complete TrackStudio plan-fact extension MVP"
git push
```
