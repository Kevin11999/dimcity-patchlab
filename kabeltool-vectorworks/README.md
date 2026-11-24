# Kabeltool Vectorworks – versie 1 (proef)

Losse tool, staat los van DimCity PatchLab. Gebouwd naar "Kabeltool Vectorworks – Plan versie 1".

**Eerlijk vooraf: niet getest in Vectorworks.** De plug-in wordt alleen gebouwd door GitHub; de palette is
alleen met een nagebootste Vectorworks gedraaid. Reken op fouten bij de eerste keer proberen.

## Wat zit erin

| Map | Wat |
|---|---|
| `palette/` | De palette (HTML/JS). Draait in de web palette, en los in Chrome/Edge met de knop Demo. |
| `plugin/` | C++ plug-in voor Vectorworks 2026 (Windows): web palette, gereedschapset en al het tekenwerk (`Source/Tekening.cpp`). |
| `vectorworks/` | Oude Python-versie (`kabeltool.py`). Wordt door de plug-in **niet** gebruikt; alleen nog als losse scripts. |

De plug-in is gebaseerd op het officiële `WebPaletteExample` (VectorworksDeveloper/SDKExamples).
GitHub bouwt hem: workflow **Kabeltool plug-in (Vectorworks, Windows)**. De bouw slaagt; of hij in
Vectorworks werkt is niet geprobeerd.

## Web palette installeren (Windows)

1. GitHub > Actions > *Kabeltool plug-in (Vectorworks, Windows)* > laatste geslaagde run >
   download het artifact **KabeltoolPalette-Windows** en pak het uit.
2. Zet `KabeltoolPalette.vlb` en `KabeltoolPalette.vwr` samen in je gebruikersmap van Vectorworks 2026,
   submap `Plug-Ins` (te vinden via *Tools > Options > Vectorworks Preferences > User Folders*).
3. Start Vectorworks opnieuw. Vectorworks 2026 kan melden dat de ontwikkelaar onbekend is en de plug-in
   uitzetten; zet hem dan aan. (Een credentials-bestand vraag je aan via devsupport@vectorworks.net.)
4. *Tools > Workspaces > Edit Current Workspace*:
   - tab **Menus**: sleep het commando **Kabeltool tonen...** (categorie Kabeltool) in een menu;
   - tab **Tools**: maak rechts een nieuwe gereedschapset **Kabeltool** en sleep de vier tools uit categorie
     Kabeltool erin: **Dim city**, **Drop**, **Vloerroute**, **Truss-lijn**.

## De tools (gereedschapset Kabeltool)

| Tool | Hoe |
|---|---|
| Dim city | Eén klik: plaatst DB1, DB2, … |
| Drop | Klik op of bij een truss-lijn: de drop komt op het dichtstbijzijnde punt. |
| Vloerroute | Klik punten vanaf de dim city naar de voet van de grote drop; dubbelklik = klaar. |
| Truss-lijn | Klik punten over de truss (eerste punt = begin kabeltruss); dubbelklik = klaar. Naam en hoogte in de modusbalk. |

De knoppen *Dim city plaatsen*, *Vloerroute tekenen*, *Truss-lijn tekenen* en *Drop toevoegen* in de palette
kiezen deze tools. De palette wacht zelf nooit op een klik in de tekening (dat liet Vectorworks crashen).

De palette praat met Vectorworks via één functie (`vwAPI.kt`); de plug-in voert alles in C++ uit.
Python wordt niet meer gestart: dat liet Vectorworks crashen.
De gegevens staan in twee bestanden naast de tekening:

- `<tekening>.kt-tekening.json` – geometrie uit Vectorworks
- `<tekening>.kt-project.json` – instellingen, kopie van de bibliotheek, nummers, labels, stempels

In de web palette staan de acties als knoppen bovenaan (Dim city plaatsen, Vloerroute van selectie,
Truss-lijn van selectie, Drop toevoegen, Lampen koppelen, Tekening bijwerken, Stempelen). De palette
ververst zelf als de selectie in Vectorworks verandert; klikken op een dim city of drop in de palette
selecteert hem in Vectorworks.

## Palette proberen zonder Vectorworks

1. Open `palette/index.html` in Chrome of Edge.
2. Klik **Demo**. Je ziet twee dim cities, twee trussen en drie drops.
3. Tabbladen: Kabelbibliotheek (met symboolvoorbeeld), Blokken, Dim cities & drops, 3D, Instellingen.

## Zonder plug-in: losse scripts (uitwijk)

1. Zet de map `vectorworks/` ergens neer en voeg hem toe bij
   *Tools > Plug-ins > Script Options… > Environment Paths*.
2. Maak een Script Palette met per commando een Python-script van één regel:

| Naam | Script |
|---|---|
| Dim city plaatsen | `import importlib, kabeltool; importlib.reload(kabeltool); kabeltool.plaats_dimcity()` |
| Vloerroute van selectie | `… kabeltool.vloerroute_van_selectie()` |
| Truss-lijn van selectie | `… kabeltool.trusslijn_van_selectie()` |
| Drop toevoegen | `… kabeltool.drop_toevoegen()` |
| Lampen koppelen | `… kabeltool.lampen_koppelen()` |
| Exporteren | `… kabeltool.exporteer()` |
| Tekening bijwerken | `… kabeltool.tekening_bijwerken()` |
| Stempelen | `… kabeltool.stempelen()` |
| Selecteer uit palette | `… kabeltool.selecteer_uit_palette()` |

(`…` = hetzelfde begin als in de eerste regel.)

## Werkwijze

1. Sla de tekening op. **Dim city plaatsen** en klik een plek aan (DB1, DB2, …).
2. Teken een polylijn over de vloer, beginnend bij de dim city en eindigend onder de grote drop.
   Selecteer hem → **Vloerroute van selectie**.
3. Teken een lijn over de truss (eerste punt = begin van de kabeltruss). Een 3D-polygoon neemt zijn
   hoogte mee; bij een 2D-lijn vraagt het script de hoogte. Selecteer → **Truss-lijn van selectie**.
4. **Drop toevoegen** en klik op de truss-lijn. Herhaal per drop.
5. Selecteer een drop-rondje plus zijn lampen → **Lampen koppelen**.
6. Palette: **Map van tekening…** (eerste keer) of **Verversen**. Vul per drop in wat hij nodig heeft
   (bijv. 1× Socapex, 1× LK), valhoogte en slingers; vul per lamp circuit en poort in.
7. Vectorworks: **Tekening bijwerken** (labels, vlaggetjes, dropsymbool, lengtehulp) en **Stempelen**.

## Wat anders is dan het plan

- **Koppelpunten** worden uitgerekend (standaardlengtes vanaf de drop terug naar de dim city);
  je kunt ze niet zelf op de route zetten.
- **Lengtehulp**: de streepjes worden getekend bij *Tekening bijwerken*; je snapt er met de gewone
  Vectorworks-snap op. Geen hover-snap tijdens het plaatsen. "Inclusief slack op de truss" zit er niet in.
- **Truss-lijn** snapt niet zelf op de truss en leest de trussnaam niet uit het truss-object: de naam
  is standaard de klasse van de lijn, de hoogte komt uit de 3D-polygoon of uit een vraag.
- **Waarschuwing bij verschoven truss/trimhoogte** (hoofdstuk 14) zit er niet in.
- **Kopie van de bibliotheek** zit in het projectbestand naast de tekening, niet in het .vwx zelf.
- **Koppeling lamp ↔ drop** staat in een record `KT_Link` dat zichtbaar is (niet verborgen).
- **Looms**: bij een lengte staat of het een loom is; kabels worden per stuk geteld, niet tot looms gebundeld.
- **3D-weergave** is een eigen eenvoudige tekening op een canvas (geen Three.js), zodat hij offline werkt.
- **Nummer overschrijven** en **Opnieuw nummeren** vragen bevestiging met de lampen van die drop;
  er is geen apart overzicht per fixture van oud → nieuw.

## Demo-show in Vectorworks

1. Maak een nieuwe, lege tekening en sla hem op (de Kabeltool zet zijn bestanden ernaast).
2. Open de palette en klik **Demo-show maken**.
3. Er worden getekend: DB1 en DB2, trussen LX01 en LX02 (12 m, 8 m hoog, 6 m uit elkaar), twee vloerroutes,
   drie drops (D1, D2 op LX01; D3 op LX02) en vier Spotlight-lampen per drop. De drops zijn in de palette al ingevuld.
4. Daarna **Tekening bijwerken** en **Stempelen** om labels en stempels te zien.

Werkt alleen in een tekening zonder Kabeltool-objecten. Lukt het maken van Spotlight-lampen niet, dan tekent hij de rest
zonder lampen en meldt dat. Ook zonder palette: `… kabeltool.demo_show()` in een Script Palette.

## Als Vectorworks crasht

- De palette laadt de tekening pas als je op **Verversen** klikt.
- De plug-in schrijft een logboek: `%TEMP%\kabeltool_log.txt` (Windows+R, dat pad typen, Enter).
  De laatste regel vóór de crash laat zien waar het misging, bijvoorbeeld `Palette: demo` zonder `Palette: demo klaar`.

## Onzeker (eerst nakijken als iets misgaat)

- Ongedaan maken (Ctrl+Z): elke knop/tool is één stap (`SupportUndoAndRemove` / `kUndoSwapObjects`).
- Of de modusbalk van de truss-tool (Naam, Hoogte) na pannen/zoomen blijft staan.
- Of de melding bij selectiewijziging (`kNotifySelChange`) de palette bereikt.
- Recordformaten `KT_Obj`, `KT_Gen`, `KT_Link` worden gemaakt met `TFormatHandler`.
- Objecten komen eerst op de actieve laag en worden met `AddObjectToContainer` naar de juiste laag verplaatst.
- Zoeken met `ForEachObjectInCriteria` (zelfde criteria als VectorScript).
- Veldnamen van het record `Lighting Device`: `Inst Type`, `Unit Number`, `Circuit Name`, `Circuit Number`,
  `User Field 2`, `User Field 3`.

## Later in te vullen (uit het plan)

Exacte klasseprefix, het bestaande kabellabelsymbool, de magazijnkleurcode per lengte, lijsten en
paklijsten, poortvalidatie en automatische poortindeling.
