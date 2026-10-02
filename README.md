# DimCity PatchLab

Desktop app (macOS, Windows, Linux) that prepares, validates and documents the **LK / Veam / DMX patching** of a show, grouped per DimCity — from a CSV patch list to print-ready PDF paperwork with racks, nodes and patch sheets.

- **Import** a CSV with LK / Veam IDs, ports, universes and locations. The DimCity follows from the ID (LK101 → DB01).
- **Validate** continuously: duplicate Veam links, universe conflicts, impossible ports, missing data — with Fix buttons.
- **Patch** LKs and Veams onto racks and loose devices automatically (LK7-1 / Veam4 sockets, node ports, splitters).
- **Plan the network**: nodes, IP addresses, universes per port, splitters.
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

The app checks for a newer version at startup (Settings → Updates) and can download and install it itself.

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

1. Set the version in `package.json` and move the `unreleased` entry in `core/manual.js` → `CHANGES` to that version with today's date; run `npm run manual`.
2. Commit and tag: `git tag v0.3.0 && git push --tags`.
3. Build and publish: `GH_TOKEN=… npm run release` (electron-builder uploads the installers to a GitHub release). Use the CHANGELOG entry as the release text — `npm run release-notes 0.3.0` writes it to `dist/release-notes-0.3.0.md`.
4. The app shows the release notes in its update dialog.

For a private repository the app needs a token (Settings → Updates) to see releases; publishing releases in a public repository avoids that for colleagues.

## License

Private project of Kevin van Setten. All rights reserved.
