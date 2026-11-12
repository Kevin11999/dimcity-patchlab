# Kabeltool Vectorworks – versie 1 (proef)

Losse tool, staat los van DimCity PatchLab. Gebouwd naar "Kabeltool Vectorworks – Plan versie 1".

**Eerlijk vooraf: niets hiervan is getest.** De palette is niet in een browser gedraaid en het
Python-deel is geschreven zonder Vectorworks. Reken op fouten bij de eerste keer proberen.

## Wat zit erin

| Map | Wat |
|---|---|
| `palette/` | De palette (HTML/JS). Open `palette/index.html` in Chrome of Edge. |
| `vectorworks/kabeltool.py` | Python-module voor Vectorworks 2026. |

Het is (nog) geen echte web palette ín Vectorworks: dat kan alleen met een C++ SDK-plug-in.
De palette draait in de browser naast Vectorworks en wisselt uit via twee bestanden naast de tekening:

- `<tekening>.kt-tekening.json` – geschreven door Vectorworks (dim cities, routes, truss-lijnen, drops, lampen)
- `<tekening>.kt-project.json` – geschreven door de palette (instellingen, kopie van de bibliotheek, nummers, labels, stempels)

De bibliotheek zelf staat als `kabelbibliotheek.json` in een map die je kiest (bijv. OneDrive).

## Palette proberen zonder Vectorworks

1. Open `palette/index.html` in Chrome of Edge.
2. Klik **Demo**. Je ziet twee dim cities, twee trussen en drie drops.
3. Tabbladen: Kabelbibliotheek (met symboolvoorbeeld), Blokken, Dim cities & drops, 3D, Instellingen.

## Installeren in Vectorworks

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

- **Geen web palette in Vectorworks**, maar een browserpagina + scripts. Daardoor: geen live
  selectie. Selectie gaat via *Exporteren/Verversen* en *Selecteer uit palette*.
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

## Onzeker in het Python-deel (eerst nakijken als iets misgaat)

- `vs.GetPrefReal(152)` als "eenheden per inch" voor het omrekenen naar meters.
- `vs.GetFPathName()` voor het pad van de tekening.
- `vs.GetPolyPt3D` telt vanaf 0, `vs.GetPolyPt` vanaf 1.
- `vs.GetObjectUuid` / `vs.GetObjectByUuid`.
- `vs.GetPt(callback)` voor het aanklikken van een punt.
- Veldnamen van het record `Lighting Device`: `Circuit Name`, `Circuit Number`, `User Field 2`, `User Field 3`.
- Kleuren als (r, g, b) van 0–65535 in `vs.SetFillBack`.

## Later in te vullen (uit het plan)

Exacte klasseprefix, het bestaande kabellabelsymbool, de magazijnkleurcode per lengte, lijsten en
paklijsten, poortvalidatie en automatische poortindeling.
