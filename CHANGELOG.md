<!-- Generated from core/manual.js by scripts/build-manual.mjs — do not edit by hand, run `npm run manual`. -->

# Changelog

All notable changes to DimCity PatchLab. The entry of a version is also the text of its GitHub release.

## 0.3.0 (unreleased)

- Demo show on the welcome screen: a complete festival show with racks, loose devices, network plan and PDF layout to explore.
- Tours to choose from: the full tour, or one about LK blocks, nodes & network, racks, or the PDF layout.
- Progress bar bottom-left with a checklist of what is still missing in the show; every item jumps to the right place.
- Standard device library with Luminex (LumiNode, GigaCore, LumiSplit) and ELC (dmXLAN nodes, switchGBx, DT splitters) types, standard panels and ready-made racks; Settings → Device library checks GitHub for a newer library, separately from app updates.
- Help: a manual inside the app (Help button, ? or F1) that opens on the chapter of the page you are on; also on GitHub as docs/USER_MANUAL.md.
- Request button: send a feature request, bug or question as a GitHub issue, with app version and page added automatically.
- Longer tour that also covers the DimCity page, racks, search, help and requests — in English and Dutch.
- Loose devices per DimCity: nodes and LK / VIM4 spiders without a rack; a spider can be pinned to a loose node.
- Every node shows which LK / Veam port (and location) is on each node port, in the app and on the PDF.
- PDF: racks are drawn as in the app (rails, U numbers, device faces, patched ports) with print-safe lines; node port list and loose devices; preset "Racks only" and a Print racks button.
- Report Builder: sections can be placed at a fixed X / Y position and width, or dragged in the preview on a 5 mm grid; line weight setting (light / normal / bold), default darker than before.
- Delete LK and Delete Veam, also for rows that came from a CSV; undo brings them back.
- Racks can be 1U; racks have an article key; node types have 1 or 2 Ethernet ports.

<details><summary>Nederlands</summary>

- Demo-show op het welkomstscherm: een complete festivalshow met racks, losse apparaten, netwerkplan en PDF-indeling om te verkennen.
- Rondleidingen om uit te kiezen: de volledige, of één over LK-blokken, nodes & netwerk, racks, of de PDF-opmaak.
- Voortgangsbalk linksonder met een checklist van wat er nog ontbreekt in de show; elk punt springt naar de juiste plek.
- Standaard devicebibliotheek met Luminex- (LumiNode, GigaCore, LumiSplit) en ELC-types (dmXLAN-nodes, switchGBx, DT-splitters), standaardpanelen en kant-en-klare racks; Instellingen → Devicebibliotheek controleert GitHub op een nieuwere bibliotheek, los van app-updates.
- Help: een handleiding in de app (Help-knop, ? of F1) die opent op het hoofdstuk van de pagina waar je bent; ook op GitHub als docs/USER_MANUAL.md.
- Request-knop: stuur een wens, fout of vraag als GitHub-issue, met app-versie en pagina automatisch erbij.
- Langere rondleiding die ook de DimCity-pagina, racks, zoeken, help en requests behandelt — in het Engels en Nederlands.
- Losse apparaten per DimCity: nodes en LK- / VIM4-spinnen zonder rek; een spin kan aan een losse node gehangen worden.
- Elke node toont welke LK- / Veam-poort (en locatie) op welke nodepoort zit, in de app en op de PDF.
- PDF: racks worden getekend zoals in de app (rails, U-nummers, device-faces, gepatchte poorten) met printvaste lijnen; nodepoortenlijst en losse apparaten; voorinstelling "Alleen racks" en een knop Racks printen.
- Rapportbouwer: secties kunnen op een vaste X- / Y-positie en breedte gezet worden, of in het voorbeeld gesleept op een raster van 5 mm; instelling lijndikte (licht / normaal / dik), standaard donkerder dan voorheen.
- LK verwijderen en Veam verwijderen, ook voor regels uit een CSV; ongedaan maken zet ze terug.
- Racks kunnen 1U zijn; racks hebben een artikelsleutel; nodetypes hebben 1 of 2 Ethernet-poorten.

</details>

## 0.2.0 — 2026-10-02

- Update check via GitHub Releases, with download and install from the app.
- Light theme and a Dutch interface (Settings → Language).
- Racks per DimCity with automatic LK7-1 / VIM4 patching, node colours, recommendations and "Use as network plan".
- Search everything with Cmd/Ctrl+K.
- Undo / redo with a readable history, fixable validation issues, autosave, backups and crash recovery.
- Report Builder: company brand tab with logo and watermark, movable cover image.
- Device Builder with nodes, splitters, switches, panels and racks; personal device library shared between shows.

<details><summary>Nederlands</summary>

- Updatecontrole via GitHub Releases, met downloaden en installeren vanuit de app.
- Licht thema en een Nederlandse interface (Instellingen → Taal).
- Racks per DimCity met automatische LK7-1- / VIM4-patching, nodekleuren, adviezen en "Gebruik als netwerkplan".
- Overal zoeken met Cmd/Ctrl+K.
- Ongedaan maken / opnieuw met leesbare geschiedenis, oplosbare validatiemeldingen, automatisch opslaan, back-ups en crashherstel.
- Rapportbouwer: tabblad huisstijl met logo en watermerk, verplaatsbare voorbladafbeelding.
- Device Builder met nodes, splitters, switches, panelen en racks; persoonlijke devicebibliotheek gedeeld tussen shows.

</details>

## 0.1.0 — 2026-10-01

- First release: CSV import, LK / Veam / DMX validation per DimCity, Veam links, block types, network planner, PDF report builder with templates.

<details><summary>Nederlands</summary>

- Eerste release: CSV-import, LK- / Veam- / DMX-validatie per DimCity, Veam-koppelingen, bloktypes, netwerkplanner, PDF-rapportbouwer met templates.

</details>
