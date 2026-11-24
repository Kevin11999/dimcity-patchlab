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

## Eigen objecten (Object Info)

Alles wat de Kabeltool tekent zijn eigen objecten. Klik erop en pas de instellingen aan in de Object Info.

| Object | In de Object Info | 2D / 3D |
|---|---|---|
| Kabeltool Dim city | naam, maat vierkant, kasthoogte, kleur, naam tonen | rood vlak met witte vette naam / kast |
| Kabeltool Drop | objectnaam, valhoogte (0 = tot de vloer), slingers, trusshoogte, symboolmaat, kleur | gevuld groen rondje / drop naar beneden |
| Kabeltool Kabelroute | soort (vloerroute of truss-lijn), naam truss, hoogte, **locatie** (bv. Over Catwalk) | lijn (truss: rondje bij het begin) / lijn op hoogte; vorm wijzigen kan |
| Kabeltool Kabellabel | soort, titel, kabels, symboolmaten, kaderkleur, blok | drop-kader, route-kader, DB-kader, blokken, lengtehulp |
| Kabeltool Kabel | nummer, type, lengte stuk, totaal, diameter, kleur | dunne lijn / buis in 3D |

- Objectnaam, valhoogte en slingers van een drop lopen gelijk met de palette (andersom ook).
- **Labels in de tekening** (zoals de netwerkplannen van Kevin):
  - kabelsymbool: wit blokje, dunne balk bovenop in de **lengtekleur**, rand in de **kleur van het kabeltype**,
    korte naam links (vet bij VEAM: V12, V4), lengte rechts, nummer grijs ernaast;
  - drop: groen rondje, golflijn, groen kader met titel "Drop > objectnaam"; begin kabeltruss: "Drop > Floor";
  - koppelpunt: rood rondje, rood kader met de **locatie** van de route als titel;
  - dim city: kabels naast het rode vlak;
  - blokken: breakout (rondje per circuit, lipjes, letter M) en splitter (rood blok, naam, poorten met wat erop zit).
- Lengtekleuren (magazijn): 0,5 / 2,5 / 25 wit · 1 / 100 bruin · 5 geel · 10 rood · 15 / 150 groen · 35 grijs ·
  50 paars · 75 oranje. Aan te passen in Instellingen.
- Lijnen en 3D-paden hebben geen vulling (dus geen vlakken tussen de punten in 3D).
- **Tekening bijwerken** maakt alle labels en kabels opnieuw. Elke kabel is een eigen buis die zijn echte
  route volgt (vloer, grote drop, truss, drop af), naast de andere kabels, per stuk (25 m, 10 m …) in de
  kleur van die lengte. Dikte per kabeltype (Kabelbibliotheek), afstand en laag in Instellingen.
- Kabeltool-tekeningen van vóór de eigen objecten (rechthoekjes en rondjes) worden niet omgezet.

## De palette

- **Kolom links**: tools (Dim city, Drop, Vloerroute, Truss-lijn), van selectie, Lampen koppelen,
  Tekening bijwerken, Stempelen, Verversen, Demo-show; daaronder dim cities en drops om te kiezen en de
  instellingen van wat geselecteerd is (bij een drop: naam, valhoogte, slingers en wat hij nodig heeft).
- **Rechts**: tabbladen 3D, Kabels, Kabelbibliotheek, Blokken, Instellingen.

## 3D in de palette

- Echte 3D met **Three.js** (r170, MIT; meegeleverd in `palette/vendor/`, werkt offline).
- Kabels als buizen per stuk in hun kleur, naast elkaar; dim cities als kast; truss-lijnen als lichte truss;
  **lampen** (Spotlight); **trussen** uit de tekening (objecten of symbolen met "truss" in de naam, als kader).
- Bovenaan: **Boven / Voor / Zij / 3D**, **Alles**, onderdelen aan/uit (ook namen en raster) en **lagen** aan/uit.
- Linker muisknop = draaien, rechter muisknop = verschuiven, scrollen = zoomen naar de muis,
  muis erop = info, klik op dim city of drop = selecteren (ook in Vectorworks; de kabels van de selectie
  blijven fel, de rest wordt gedimd).
- Lukt WebGL niet in de palette, dan gebruikt hij automatisch de eenvoudige canvas-weergave.

## Palette proberen zonder Vectorworks

1. Open `palette/index.html` in Chrome of Edge.
2. Klik **Demo**. Je ziet twee dim cities, twee trussen, drie drops, lampen en de kabels in 3D.
3. Tabbladen: Kabelbibliotheek (met symboolvoorbeeld), Blokken, Dim cities & drops, 3D, Instellingen.

## Zonder plug-in: losse scripts (oude Python-versie)

Deze scripts horen bij de oude versie met rechthoekjes en rondjes; ze kennen de eigen objecten niet.

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

1. Sla de tekening op. Tool **Dim city** en klik een plek aan (DB1, DB2, …).
2. Tool **Vloerroute**: klik vanaf de dim city naar de voet van de grote drop, dubbelklik = klaar.
   (Of teken een polylijn en gebruik **Vloerroute van selectie**.)
3. Tool **Truss-lijn**: naam en hoogte in de modusbalk, klik over de truss (eerste punt = begin van de
   kabeltruss), dubbelklik = klaar. (Of **Truss-lijn van selectie**; hoogte uit Instellingen.)
4. Tool **Drop** en klik op de truss-lijn. Herhaal per drop.
5. Selecteer een drop plus zijn lampen → **Lampen koppelen**.
6. Palette: **Map van tekening…** (eerste keer) of **Verversen**. Vul per drop in wat hij nodig heeft
   (bijv. 1× Socapex, 1× LK), valhoogte en slingers; vul per lamp circuit en poort in.
7. **Tekening bijwerken** (labels, vlaggetjes, lengtehulp, 3D-kabels) en **Stempelen**.

## Wat anders is dan het plan

- **Koppelpunten** worden uitgerekend (standaardlengtes vanaf de drop terug naar de dim city);
  je kunt ze niet zelf op de route zetten.
- **Lengtehulp**: de streepjes worden getekend bij *Tekening bijwerken*; je snapt er met de gewone
  Vectorworks-snap op. Geen hover-snap tijdens het plaatsen. "Inclusief slack op de truss" zit er niet in.
- **Truss-lijn** snapt niet zelf op de truss en leest de trussnaam niet uit het truss-object: naam en hoogte
  komen uit de modusbalk van de tool of de Object Info.
- **Waarschuwing bij verschoven truss/trimhoogte** (hoofdstuk 14) zit er niet in.
- **Kopie van de bibliotheek** zit in het projectbestand naast de tekening, niet in het .vwx zelf.
- **Koppeling lamp ↔ drop** staat in een record `KT_Link` dat zichtbaar is (niet verborgen).
- **Looms**: bij een lengte staat of het een loom is; kabels worden per stuk geteld, niet tot looms gebundeld.
- **3D-weergave** in de palette is een eigen tekening op een canvas (geen Three.js), zodat hij offline werkt.
- **Nummer overschrijven** en **Opnieuw nummeren** vragen bevestiging met de lampen van die drop;
  er is geen apart overzicht per fixture van oud → nieuw.

## Demo-show in Vectorworks

1. Maak een nieuwe, lege tekening en sla hem op (de Kabeltool zet zijn bestanden ernaast).
2. Open de palette en klik **Demo-show maken**.
3. Er worden getekend: DB1 en DB2, trussen LX01 en LX02 (12 m, 8 m hoog, 6 m uit elkaar), twee vloerroutes,
   drie drops (D1, D2 op LX01; D3 op LX02) en vier Spotlight-lampen per drop. De drops zijn in de palette al ingevuld.
4. Daarna **Tekening bijwerken** (labels en 3D-kabels) en **Stempelen**.

Werkt alleen in een tekening zonder Kabeltool-objecten. Lukt het maken van Spotlight-lampen niet, dan tekent hij de rest
zonder lampen en meldt dat.

## Als Vectorworks crasht

- De palette laadt de tekening pas als je op **Verversen** klikt.
- De plug-in schrijft een logboek: `%TEMP%\kabeltool_log.txt` (Windows+R, dat pad typen, Enter).
  De laatste regel vóór de crash laat zien waar het misging, bijvoorbeeld `Palette: demo` zonder `Palette: demo klaar`.

## Onzeker (eerst nakijken als iets misgaat)

- Ongedaan maken (Ctrl+Z): elke knop/tool is één stap (`SupportUndoAndRemove` / `kUndoSwapObjects`).
- Of de modusbalk van de truss-tool (Naam, Hoogte) na pannen/zoomen blijft staan.
- Of de melding bij selectiewijziging (`kNotifySelChange`) de palette bereikt.
- Eigen objecten: standaardwaarden in `KabeltoolPalette.vwr/Defaults/*.json`, teksten in `Strings/KT*.vwstrings`.
- 3D-kabels: per stuk route een extrude (cilinder) met een bol in elke bocht.
- Lampen en trussen voor de 3D worden gezocht met criterium `(ALL)`; een truss is een object of symbool met
  "truss" in de naam; de vorm is het kader (bounding box), bij schuine trussen dus ruimer.
- Recordformaat `KT_Link` (lamp ↔ drop) wordt gemaakt met `TFormatHandler`.
- Objecten komen eerst op de actieve laag en worden met `AddObjectToContainer` naar de juiste laag verplaatst.
- Zoeken met `ForEachObjectInCriteria` (zelfde criteria als VectorScript).
- Veldnamen van het record `Lighting Device`: `Inst Type`, `Unit Number`, `Circuit Name`, `Circuit Number`,
  `User Field 2`, `User Field 3`.

## Later in te vullen (uit het plan)

Exacte klasseprefix, het bestaande kabellabelsymbool, de magazijnkleurcode per lengte, lijsten en
paklijsten, poortvalidatie en automatische poortindeling.
