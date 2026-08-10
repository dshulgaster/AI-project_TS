# TrackStudio Plan-Fact Extension Design

## Status

Design approved by the user for the MVP direction. Implementation has not started.

## Goal

Create a Chrome Manifest V3 extension that calculates plan versus fact for one TrackStudio request on demand, using the authenticated page session and AG Grid data already rendered in the browser.

The extension must distribute actual worklogs across five lifecycle phases, prevent parent/child double counting, expose data quality, control the preliminary-analysis SLA, and provide a readable widget with Notion and Excel-compatible exports.

## Scope

### In scope for MVP

- Chrome Manifest V3.
- Vanilla JavaScript and CSS without external libraries or a build step.
- On-demand activation from the extension icon.
- TrackStudio DOM parsing through the main AG Grid.
- Initial fast calculation from currently rendered rows.
- Explicit `Раскрыть и пересчитать` action for confirmed contracted groups.
- Five-phase calculation: ПО, ОА, Реализация, Приемка, Стабилизация.
- `defaultPhase` fallback when detailed worklog dates or child rows are unavailable.
- Parent/child double-counting protection.
- SLA status for preliminary analysis, with a five-day threshold.
- Shadow DOM widget with `min`, `mid`, and `max` modes.
- Unit switching between hours and person-days.
- Markdown copy for Notion and Excel-compatible `.xls` export.
- Unit tests for pure calculation and parser fixtures.

### Out of scope for MVP

- Direct TrackStudio API integration.
- Credentials, password storage, or `.env` usage in the extension.
- Automatic expansion on initial widget open.
- Full portfolio or background data synchronization.
- Publishing comments back to TrackStudio.
- A frontend framework, bundler, or third-party UI library.

## Evidence From TrackStudio Diagnostics

The inspected request page uses AG Grid rather than a conventional task table.

- The effective grid is exposed as `.ag-root[role="grid"]`.
- Visible data rows use `.ag-row` and `row-index`.
- Group rows use `ag-row-group` and `ag-row-level-*`.
- Contracted groups use `ag-row-group-contracted`.
- The category label is inside `.ag-group-value`.
- The child count is inside `.ag-group-child-count`.
- The first group cell contains `.ag-cell-wrapper.ag-row-group` and `.ag-group-contracted`.
- AG Grid renders nested wrapper containers, so the parser must select one effective grid and deduplicate rows.
- The grid is virtualized; the DOM contains the currently rendered viewport rather than a guaranteed complete task tree.
- The inspected page showed three nested AG Grid-related containers representing the same visible data, not three independent datasets.

These selectors are implementation anchors for the MVP, not an assertion that TrackStudio will never change its markup. Parser diagnostics and quality warnings must make selector drift visible.

## Architecture

```text
background.js
    -> message: toggleWidget
content.js
    -> ag_grid_parser.js
    -> phase_calculator.js
    -> widget.js
    -> exporters.js
```

The modules are plain JavaScript files loaded by the content script in a deterministic order. They communicate through explicit functions and a normalized data contract. The calculation module does not access the DOM, which allows it to be tested independently.

### Modules

#### `manifest.json`

- Manifest version 3.
- `background.js` as service worker.
- Content scripts limited to the TrackStudio host and path.
- No credentials or broad permissions.
- The action click is the only activation trigger.

#### `background.js`

Registers `chrome.action.onClicked` and sends `{ type: "toggleWidget" }` to the active tab. It does not parse the page and does not render UI.

#### `content.js`

Owns orchestration and lifecycle:

1. Receive `toggleWidget`.
2. Mount or remove the widget.
3. Request a fast parse.
4. Calculate and render the result.
5. Handle explicit expand-and-recalculate.
6. Route copy and export actions.
7. Present errors without disrupting TrackStudio.

#### `ag_grid_parser.js`

Owns all DOM-specific behavior:

- select the effective `.ag-root[role="grid"]` rather than wrapper duplicates;
- collect visible `.ag-row` elements;
- ignore header rows and non-data grids;
- extract cells, group state, level, row index, category label, child count, task identifiers, worklog values, and dates;
- locate `.ag-group-contracted` only inside a group row's first/group cell;
- expand only confirmed contracted groups when explicitly requested;
- wait for AG Grid mutations with a bounded timeout;
- deduplicate rows by stable row identity where available and by structural fingerprint otherwise;
- return warnings for virtualization, missing fields, selector drift, and incomplete expansion.

#### `phase_calculator.js`

Pure calculation module. It accepts normalized records and returns phase totals, variances, SLA, warnings, and trace information. It has no `document`, `window`, or Chrome API dependency.

#### `widget.js`

Mounts a Shadow DOM panel and renders loading, ready, partial, warning, and error states. It owns display state, not business calculations.

#### `exporters.js`

Converts the normalized calculation result into Markdown and an Excel-compatible tabular file. It does not read the page or infer business phases.

## Data Contract

The parser produces a normalized request:

```javascript
{
  taskId: "1726097",
  sourceQuality: "aggregated",
  grid: {
    selector: ".ag-root[role=\"grid\"]",
    visibleRows: 14,
    virtualized: true
  },
  categories: [
    {
      key: "row-10",
      name: "Разработка",
      level: 0,
      expanded: false,
      childCount: 4,
      worklogs: [
        {
          taskId: "180001",
          hours: 3.5,
          date: "2026-08-10",
          phaseHint: null,
          source: "ag-grid"
        }
      ],
      source: "aggregated-group"
    }
  ],
  milestones: [
    {
      operation: "Передать в разработку",
      date: "2026-08-05",
      source: "trackstudio-history"
    }
  ],
  warnings: []
}
```

`sourceQuality` values:

- `expanded`: child rows and required dates were available;
- `aggregated`: one or more categories were read only as aggregate rows;
- `fallback`: phase assignment required `defaultPhase`;
- `partial`: some required data could not be read or expansion failed.

Every worklog or aggregate contribution must carry a source marker: `child-row`, `aggregated-group`, or `default-phase`.

## Phase Calculation

The calculator resolves these boundaries from TrackStudio history:

- `T_po_boundary`: preliminary conditions or equivalent operation;
- `T_dev_start`: transfer to development;
- `T_accept_start`: transfer/readiness for acceptance;
- `T_release`: operational launch, implementation, or equivalent release operation.

Using the project rules, worklog date `t` is assigned as follows:

```text
ПО:             t <= T_po_boundary
ОА:             T_po_boundary < t <= T_dev_start
Реализация:     T_dev_start < t <= T_accept_start
Приемка:        T_accept_start < t <= T_release
Стабилизация:   t > T_release
```

If a worklog date is unavailable, the calculator uses the category mapping from `defaultPhase`. It must record the fallback in trace data and warnings.

Plan and fact are kept separately for each phase. Variance is `fact - plan`; positive values indicate overrun.

### Double-counting rule

For each category:

1. If usable child worklogs exist, use child contributions and exclude the aggregate parent contribution.
2. If child worklogs are unavailable, use the aggregate category contribution.
3. Never sum a parent aggregate and its children in the same phase.
4. Record excluded parent rows in trace data for the `max` widget view.

## Expansion Behavior

The initial widget open performs a fast, non-expanding scan. This keeps page interaction predictable and provides a quick result.

The user may press `Раскрыть и пересчитать`:

1. Find visible rows with `ag-row-group-contracted`.
2. Within the group row's first group cell, target `.ag-group-contracted`.
3. Click only the confirmed group control.
4. Wait for `childList`, `class`, or row changes using `MutationObserver` with a bounded timeout.
5. Stop when no new group is found, the configured expansion limit is reached, or the timeout expires.
6. Re-scan the effective grid and recalculate.

Expansion limits and timeouts are constants in the parser, not scattered through UI code. Each failure is isolated to its group and becomes a warning. A failed expansion never blocks the aggregate or `defaultPhase` fallback.

## Widget Design

The widget is mounted only after the action click and is isolated with Shadow DOM.

### `min`

Shows total plan, total fact, variance, SLA status, source quality, and controls to expand to `mid` or close.

### `mid`

Shows Plan, Fact, and Variance by the five phases, unit switching (`ч.` / `ч.д.`), size controls, explicit recalculation, Notion copy, and Excel export.

### `max`

Adds category details, phase boundaries, warnings, source trace, excluded parent rows, and failed expansion groups.

The UI must use high-contrast text and controls independent of TrackStudio CSS. It must not resize the page or rely on the page's styles.

## Error Handling

Errors are represented in the result rather than thrown through the UI:

- grid not found: `error`, no calculation;
- several candidates: choose the effective grid and add a warning;
- malformed row: skip that row and record a warning;
- missing milestone: `partial` or `warning`, never silently `ready`;
- failed expansion: keep the last valid aggregate result;
- unavailable clipboard: show an actionable status;
- export failure: show an error without removing the calculation.

All row-level parsing is isolated with `try/catch`. Logs must not contain credentials, cookies, or full task descriptions.

## Testing Strategy

### Pure calculation tests

Cover:

- each phase interval;
- inclusive and exclusive boundaries;
- equal and missing dates;
- `defaultPhase` mappings;
- parent/child exclusion;
- plan/fact variance;
- five-day SLA boundary and violation;
- hours/person-days conversion and rounding.

### Parser fixtures

Cover:

- one effective grid among wrapper duplicates;
- contracted group rows;
- expanded group with child rows;
- multiple levels;
- virtualized visible rows;
- malformed cells;
- duplicate parent and child contributions;
- expansion timeout and partial result.

### Acceptance checks

- no widget before the action click;
- action toggles the widget;
- initial scan is fast and non-expanding;
- explicit expansion updates the result;
- parent totals are not counted with child totals;
- five phases and SLA are visible;
- warnings explain fallback quality;
- Markdown and Excel-compatible export work;
- the extension contains no credentials or tokens;
- one malformed row does not break the widget.

## Acceptance Criteria

The MVP is acceptable when it works on the inspected TrackStudio request shape, reports data quality honestly, passes the pure calculation and fixture tests, and satisfies the user-visible workflow without changing TrackStudio state until explicit expansion is requested.

## Future Changes Kept Compatible

The following can change without replacing the calculator:

- automatic versus explicit expansion;
- expansion limits and waits;
- additional AG Grid selector variants;
- API-backed data source;
- widget layout and visual theme;
- additional export formats;
- portfolio aggregation in the separate dashboard.