# DimCity PatchLab — project structure

This document describes how the app is intended to grow from V8 onward.

## Files

```text
main.js            Electron main process: window, native menu + shortcuts, recent projects,
                   file dialogs, PDF rendering (printToPDF with footer/page numbers), .lkproj file association
preload.cjs        Safe bridge (window.app.*) between UI and main process
index.html         App shell: title bar, sidebar, view area, status bar, static dialogs
styles/app.css     The one design system (tokens → shell → components → views → dialogs → report builder)
ui/icons.js        Inline SVG icon set (window.Icons)
renderer.js        Model, CSV processing, validation, all views (Overview, Validation, Patch List,
                   Network Planner, DimCity, LK, Veam), dialogs/toasts, command dispatcher
csv-editor.js      "Edit Patch Rows" dialog
project-io.js      New / Open / Save / Save As, recent files, unsaved-changes prompt (.lkproj v4)
export-pdf.js      Report Builder: live preview, sections, style, cover, templates, PDF export
ui/welcome.js      Welcome screen, new-project flow, guided tour, project info, shortcuts, about
core/library.js    Personal library (userData/library.lklib): device types, racks, PDF templates;
                   sync with the open show, review dialog for unknown items, export/import .lklib
ui/device-builder.js  Device Builder: node/splitter/switch/panel types + 19" rack builder
core/settings.js   App preferences (userData/settings.json): theme, language, autosave/backup, updates
core/i18n.js       Dutch UI: dictionary + rules, applied to text nodes by a MutationObserver
core/history.js    Undo/redo + readable change history (hooks MODEL.ui.dirty, snapshots the project)
core/autosave.js   Autosave every N changes / N minutes, backup copies, crash recovery
core/updater.js    Update check against GitHub Releases, guided installer download
core/rack-engine.js  Rack auto-patch: LK/VIM4 sockets, node ports, splitters, recommendations
ui/rack-plan.js    Racks card on the DimCity page (+ "Use as network plan")
ui/issue-fix.js    Validation: jump to the problem, Fix… dialogs
ui/search.js       Cmd+K search
```

Commands from the native menu, toolbar buttons and `data-cmd` attributes all go through
`runCommand()` in renderer.js. All UI text is English.

## Current runtime flow

```text
CSV sources / manual rows
        ↓
processRows()
        ↓
MODEL
        ↓
UI renderers + PDF export
```

## Main data groups

### Project metadata
Stored in `MODEL.projectMeta`.

```text
project
area
location
date
prepared
logo
```

### Patch data
Generated from CSV/import/manual rows.

```text
MODEL.lines       LK rows
MODEL.veamLines   Veam rows
MODEL.dmxLoose    loose DMX rows
MODEL.byDim       DimCity summary
MODEL.byLK        LK blocks
MODEL.byVeam      Veam blocks
MODEL.uniStats    universe patch-point counts
MODEL.issues      validation warnings/errors
```

Important: `uniStats` is only physical patch-point usage. It is not DMX address usage and must not be presented as universe fill percentage.

### Network devices
Stored in `MODEL.networkDevices`.

```text
prefs
nodeTypes
splitterTypes
switchTypes
nodes
splitters
switches
dimCityPlans
```

`switchTypes` (RJ45 + SFP ports), `panelTypes` (LK7-1 / VIM4 / XLR / etherCON sockets) and
`rackTypes` (`{ id, name, heightU, items:[{ iid, kind, typeId, u }] }`, `u` = top row counted from
the top) are edited in the Device Builder. Every type has `heightU`. Type keys are fixed once saved.

### Library vs. show
The personal library (`core/library.js`) and each show both hold device types, racks and PDF templates.
Saving in the Device Builder / Report Builder writes to both. Opening a show adds library items the
show lacks, and offers show items the library lacks (or that differ). "Keep both" gives the show's
item a new key and rewrites references (racks, DimCity plans). Skipped items are remembered per show
in `libraryDismissed`.

### PDF settings
Stored in `MODEL.pdfSettings`. The Report Builder layout lives in `MODEL.pdfSettings.layout`
(version 2: scope, output, page, style, header, footer, cover, ordered sections with options).
Saved report templates live in `MODEL.pdfTemplates` (`[{ id, name, layout }]`).
`layout.brand` holds the company style: `logo`, `logoPos` (none / header-left|right / footer-left|right),
`logoHeight` (mm) and `wm` (watermark: type none|logo|text, text, opacity %, size %, angle). The logo on
every page is drawn by printToPDF's header/footer templates (main.js); the watermark is a fixed element
that Chromium repeats on each printed page. The cover image position is `cover.logoX/logoY` (0–1) and
`cover.logoW` (mm).
Older settings below are still read and converted.

```text
preset
page
incProject
incNetwork
incSwitches
incSplitters
incPatch
incWarnings
```

Later, custom user-made PDF templates should be stored in `MODEL.pdfTemplates`.

### Manual state survives re-processing
`processRows()` rebuilds `byLK` / `byVeam` / `byDim` from rows, but carries over from the previous
MODEL (`carryOverManualState()`): Veam links, manual block types, LK names, manually added LKs/Veams
(`manual: true`) and manual DimCities. Loading a project therefore starts from a fresh model first.

## Project file (`.lkproj`, fileVersion 4)

```text
rows          effective rows (CSV + CSV-editor edits + custom), leading on load
csvSources    original imported CSV files (used by "Replace" / rebuild)
customRows    rows added in the CSV editor
manualLKs     LK ids added by hand (no CSV rows)
manualVeams   Veam ids added by hand
lkAssign      LK -> Veam per slot
lkBlockType   LK block type (Auto/Manual)
projectMeta   project info + logo (also filled from the PDF export popup)
pdfSettings   last used PDF export options, incl. output SINGLE | PER_DIM
```

Files with fileVersion < 4 are still read via `csvSources` / `rows` as before.

## Intended PDF order

Every DB export should follow this order:

```text
1. Project information
2. Network / Nodes / future Switches
3. Splitters
4. LK / Veam patch information
5. Warnings / Errors
```

## Future cleanup plan

The V9/V10/V11 runtime patch layers have been removed; their fixes (AB splitter calculation,
Veam link badges, inline panels, collapsible sections) are part of renderer.js now.

The current app still has a large `renderer.js`. It works, but it should eventually be split into smaller files:

```text
core/model.js
core/validation.js
core/lk-veam.js
ui/render-summary.js
ui/render-dimcity.js
ui/network-planner.js
pdf/export-pdf.js
pdf/layout-designer.js
```

Do not do this split in one huge risky step. First keep the app stable, then move one module at a time.

## Invalid and conflicting rows
Rows that fail validation (`MODEL.invalidRows`, e.g. a Veam on port 6) and the losing side of a
universe conflict (`MODEL.conflictRows`) are kept, saved with the project and shown in Edit Rows,
so they can be fixed instead of disappearing.

## Releases and updates
`npm run release` (with `GH_TOKEN` set) builds and publishes a GitHub release for the version in
package.json. The app checks the repository set in Settings → Updates; for a private repository a
token is needed, so publishing releases in a public repository is easiest for colleagues.
