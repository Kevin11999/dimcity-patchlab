<!-- Generated from core/manual.js by scripts/build-manual.mjs — do not edit by hand, run `npm run manual`. -->

# Changelog

All notable changes to DimCity PatchLab. The entry of a version is also the text of its GitHub release.

## 0.3.2 (unreleased)

- Stickers on Herma A4 label sheets (laser printer): 4680 / 4690 / 4102 / 4112 and 4097 / 4232 / 4221, taken from the HERMA templates, plus custom sheets. Cable labels (both ends), panel connection labels, node ports, racks / nodes / switches / splitters and QR stickers, with company and show images, per DimCity, with a start position for part-used sheets and a calibration sheet.
- Network: several addresses per device (management, lighting, scan) and the FENT scheme (v1.1) with one-click addressing of all nodes, checks, a VLAN table and a switch port plan with access/trunk and VLAN colours, also in the PDF and as switch port stickers.
- Confetti and "Patch perfect!" when a show goes from having issues to none (Settings > General > Fun switches it off).
- Festival wrapped (Help menu): a shareable card with the numbers of your show; save or copy it as an image.
- Signal Flow: "Share image" copies the drawing as a picture for a chat or e-mail.

<details><summary>Nederlands</summary>

- Stickers op Herma A4-etikettenvellen (laserprinter): 4680 / 4690 / 4102 / 4112 en 4097 / 4232 / 4221, overgenomen uit de HERMA-sjablonen, plus eigen vellen. Kabellabels (beide uiteinden), aansluitlabels paneel, nodepoorten, racks / nodes / switches / splitters en QR-stickers, met bedrijfs- en showafbeelding, per DimCity, met een startpositie voor deels gebruikte vellen en een kalibratieblad.
- Netwerk: meerdere adressen per apparaat (beheer, licht, scan) en het FENT-schema (v1.1) met één-klik adressering van alle nodes, controles, een VLAN-tabel en een switchpoortplan met access/trunk en VLAN-kleuren, ook in de PDF en als switchpoort-stickers.
- Confetti en "Patch perfect!" zodra een show van problemen naar geen problemen gaat (Instellingen > Algemeen > Plezier zet het uit).
- Festival wrapped (Help-menu): een deelbare kaart met de cijfers van je show; opslaan of kopiëren als afbeelding.
- Signaalstroom: "Afbeelding delen" kopieert de tekening als plaatje voor een chat of e-mail.

</details>

## 0.3.1 — 2026-10-02

- Signal Flow page (sidebar, Cmd/Ctrl+4): a drawing of how the data runs from the rack to every object. Hover a universe, a port, a line or a block to follow it with the data moving along; click to pin; give LK blocks your own name (issue #3).
- Racks in the Signal Flow are drawn like in the Rack Builder (rails, U numbers, the faces of nodes, splitters and panels with their sockets); the patch inside a rack lights up when you hover it. LK, Veam and DMX cables differ in thickness, DMX lines have the colour of their universe and every line leaves a block straight from its side.
- Signal Flow toolbar: arrow (select, move, rubber-band selection), hand (pan), zoom bar, Fit and Auto layout. Blocks never overlap and a rack moves as one. The arrangement and zoom are saved per DimCity with the project.
- Export PDF: new section "Signal flow drawing" that prints the drawing of every DimCity as arranged on the page.
- The app sidebar collapses to icons with the arrow at its top.

<details><summary>Nederlands</summary>

- Pagina Signaalstroom (zijbalk, Cmd/Ctrl+4): een tekening van hoe de data van het rek naar elk object loopt. Beweeg over een universe, een poort, een lijn of een blok om hem te volgen met bewegende data; klik om vast te zetten; geef LK-blokken een eigen naam (issue #3).
- Rekken in de Signaalstroom zijn getekend zoals in de Rack Builder (rails, U-nummers, de fronten van nodes, splitters en panelen met hun aansluitingen); de patch in het rek licht op als je eroverheen beweegt. LK-, Veam- en DMX-kabels verschillen in dikte, DMX-lijnen hebben de kleur van hun universe en elke lijn vertrekt recht uit de zijkant van een blok.
- Werkbalk Signaalstroom: pijl (selecteren, verplaatsen, selectie met kader), handje (verschuiven), zoombalk, Passend en Auto-indeling. Blokken komen nooit op elkaar en een rek verplaatst als geheel. De indeling en zoom worden per DimCity met het project opgeslagen.
- Export PDF: nieuwe sectie "Signaalstroom-tekening" die de tekening van elke DimCity print zoals hij op de pagina staat.
- De zijbalk van de app klapt in tot iconen met het pijltje bovenaan.

</details>

## 0.3.0 — 2026-10-02

- Demo show on the welcome screen: a complete festival show with racks, loose devices, network plan and PDF layout to explore.
- Tours to choose from: the full tour, or one about LK blocks, nodes & network, racks, or the PDF layout.
- Progress bar bottom-left with a checklist of what is still missing in the show; every item jumps to the right place.
- Standard device library with Luminex (LumiNode, GigaCore, LumiSplit) and ELC (dmXLAN nodes, switchGBx, DT splitters) types, standard panels and ready-made racks; Settings → Device library checks GitHub for a newer library, separately from app updates.
- Help: a manual inside the app (Help button, ? or F1) that opens on the chapter of the page you are on; also on GitHub as docs/USER_MANUAL.md.
- Request button: send a feature request, bug or question as a GitHub issue, with app version and page added automatically.
- Longer tour that also covers the DimCity page, racks, search, help and requests — in English and Dutch.
- Loose devices per DimCity: nodes and LK / Veam4 spiders without a rack; a spider can be pinned to a loose node.
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
- Losse apparaten per DimCity: nodes en LK- / Veam4-spinnen zonder rek; een spin kan aan een losse node gehangen worden.
- Elke node toont welke LK- / Veam-poort (en locatie) op welke nodepoort zit, in de app en op de PDF.
- PDF: racks worden getekend zoals in de app (rails, U-nummers, device-faces, gepatchte poorten) met printvaste lijnen; nodepoortenlijst en losse apparaten; voorinstelling "Alleen racks" en een knop Racks printen.
- Rapportbouwer: secties kunnen op een vaste X- / Y-positie en breedte gezet worden, of in het voorbeeld gesleept op een raster van 5 mm; instelling lijndikte (licht / normaal / dik), standaard donkerder dan voorheen.
- LK verwijderen en Veam verwijderen, ook voor regels uit een CSV; ongedaan maken zet ze terug.
- Racks kunnen 1U zijn; racks hebben een artikelsleutel; nodetypes hebben 1 of 2 Ethernet-poorten.

</details>

## 0.2.0 — 2026-10-02

- Update check via GitHub Releases, with download and install from the app.
- Light theme and a Dutch interface (Settings → Language).
- Racks per DimCity with automatic LK7-1 / Veam4 patching, node colours, recommendations and "Use as network plan".
- Search everything with Cmd/Ctrl+K.
- Undo / redo with a readable history, fixable validation issues, autosave, backups and crash recovery.
- Report Builder: company brand tab with logo and watermark, movable cover image.
- Device Builder with nodes, splitters, switches, panels and racks; personal device library shared between shows.

<details><summary>Nederlands</summary>

- Updatecontrole via GitHub Releases, met downloaden en installeren vanuit de app.
- Licht thema en een Nederlandse interface (Instellingen → Taal).
- Racks per DimCity met automatische LK7-1- / Veam4-patching, nodekleuren, adviezen en "Gebruik als netwerkplan".
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
