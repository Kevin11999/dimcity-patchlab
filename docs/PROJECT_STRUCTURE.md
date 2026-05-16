# DimCity PatchLab — project structure

This document describes how the app is intended to grow from V8 onward.

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

`switchTypes` and `switches` are reserved for future network switches.

### PDF settings
Stored in `MODEL.pdfSettings`.

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
