# DimCity PatchLab

Desktop app (macOS, Windows, Linux) that prepares, validates and documents the **LK / Veam / DMX patching** of a show, grouped per DimCity — from a CSV patch list to print-ready PDF paperwork with racks, nodes and patch sheets.

- **Import** a CSV with LK / Veam IDs, ports, universes and locations. The DimCity follows from the ID (LK101 → DB01).
- **Validate** continuously: duplicate Veam links, universe conflicts, impossible ports, missing data — with Fix buttons.
- **Patch** LKs and Veams onto racks and loose devices automatically (LK7-1 / Veam4 sockets, node ports, splitters).
- **Plan the network**: nodes, IP addresses, universes per port, splitters.
- **See the signal flow**: a drawing of the cabling from the rack (drawn like in the Rack Builder) through LK multicores and Veam cables to every object; hover a universe or a line and the data moves along it; arrange it per DimCity and print it in the report.
- **Document** everything in the Report Builder: live preview, rack drawings, sections you can place on the sheet, templates, company branding.
- Standard device library with Luminex and ELC nodes, switches and splitters, updatable from GitHub separately from the app.
- Demo show, guided tours per subject, progress checklist, English and Dutch interface, light and dark theme, undo / redo, autosave and backups, in-app manual, self-update from GitHub Releases.

## Manual

The user manual is built into the app: press **?** or **F1**, or click **Help** in the toolbar, and it opens on the chapter for the page you are on. The same text is on GitHub: **[docs/USER_MANUAL.md](docs/USER_MANUAL.md)** (English and Dutch).

What changed per version: **[CHANGELOG.md](CHANGELOG.md)**.

## Installing

Download the installer for your computer from the [latest release](https://github.com/Kevin11999/dimcity-patchlab/releases/latest):

- macOS: the `.dmg` (Apple Silicon or Intel)
- Windows: the `.exe`
- Linux: the `.AppImage`

The app checks for a newer version at startup (Settings → Updates) and can download and install it itself: it shows the release notes, downloads the right installer for your computer and opens it — quit PatchLab and follow the installer.

The installers are not code-signed (no Apple / Microsoft certificate yet), so the first start needs one extra click:

- **Windows**: SmartScreen shows "Windows protected your PC" → *More info* → *Run anyway*.
- **macOS**: right-click (or Ctrl-click) the app → *Open* → *Open*. Or System Settings → Privacy & Security → *Open Anyway*.

PatchLab is a desktop app (macOS, Windows, Linux); there is no iPhone / iPad version.

## Requests and bug reports

Click **Request** in the toolbar (or Help → Send a Request…). Choose feature / bug / question, write a title and description, and **Open on GitHub**: a pre-filled issue opens in your browser, click *Submit new issue* there. The app version, platform and the page you were on are added automatically. You need a GitHub account with access to this repository; otherwise use **Copy** and send the text to the maintainer.

All requests are tracked as [GitHub issues](https://github.com/Kevin11999/dimcity-patchlab/issues).

## Developing

```bash
git clone https://github.com/Kevin11999/dimcity-patchlab.git
cd dimcity-patchlab
npm install
npm start          # run the app
npm run check      # syntax check of all source files
npm run manual     # regenerate docs/USER_MANUAL.md and CHANGELOG.md from core/manual.js
```

Project layout, data model and conventions: [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md).

### Keeping the manual up to date

The manual lives in **`core/manual.js`** — one file, English and Dutch, used by the Help panel, `docs/USER_MANUAL.md`, the "What's new" chapter and the release notes. When a feature changes:

1. Change its chapter in `core/manual.js` (and add a line to `CHANGES` for the next version).
2. Run `npm run manual` and commit the generated files together with the code.

### Updating the standard device library

Edit `library/standard-library.json`, raise its `version`, commit and push to `main`. Every app checks that file on GitHub (Settings → Device library) and merges new or corrected types into the user's library without touching types they edited themselves.

### Releasing a new version

Releases are built by GitHub Actions (`.github/workflows/release.yml`) for macOS, Windows and Linux — nothing has to be built on a laptop.

1. Set the new version in `package.json` and give the `unreleased` entry in `core/manual.js` → `CHANGES` that version and today's date; run `npm run manual`.
2. Commit and push to `main`. That is all: the workflow sees the new version, builds the installers, publishes release `v<version>` and puts the CHANGELOG entry in it as release notes (about 10–15 minutes). It can also be started by hand under Actions → Release → Run workflow.
3. Every app shows the release notes in its update dialog and offers the download.

Building locally is still possible: `npm run dist:mac` / `dist:win` / `dist:linux`, or `GH_TOKEN=… npm run release` to publish by hand.

For a private repository the app needs a token (Settings → Updates) to see releases; publishing releases in a public repository avoids that for colleagues.

## License

Private project of Kevin van Setten. All rights reserved.
