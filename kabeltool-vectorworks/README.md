# Kabeltool Vectorworks

Losse tool, staat los van DimCity PatchLab. Web palette + gereedschapset voor Vectorworks 2026 (Windows).

**Eerlijk vooraf: niet getest in Vectorworks.** De plug-in wordt alleen gebouwd door GitHub; het rekenwerk van de
palette is alleen los (zonder Vectorworks) nagelopen. Reken op fouten bij de eerste keer proberen.

## Installeren (Windows)

1. GitHub > Actions > *Kabeltool plug-in (Vectorworks, Windows)* > laatste geslaagde run op deze branch >
   download het artifact **KabeltoolPalette-Windows** en pak het uit.
2. Zet `KabeltoolPalette.vlb` en `KabeltoolPalette.vwr` samen in `%APPDATA%\Nemetschek\Vectorworks\2026\Plug-ins`
   (of via *Tools > Options > Vectorworks Preferences > User Folders*).
3. Start Vectorworks opnieuw. Meldt Vectorworks een onbekende ontwikkelaar, zet de plug-in dan aan.
4. *Tools > Workspaces > Edit Current Workspace*:
   - tab **Menus**: sleep **Kabeltool tonen...** (categorie Kabeltool) in een menu;
   - tab **Tools**: maak een gereedschapset **Kabeltool** met **Dim city**, **Drop**, **Vloerroute**, **Truss-lijn**.

## Tekeningstructuur

| Laag | Wat | Class |
|---|---|---|
| PP Lichtplot | lampen | objectnaam, bijv. LX1 |
| PP Infra | dim cities, truss-lijnen, drops, eindpunten, **jouw blokken**, labels | objectnaam (LX1, CB01, DB1) |
| PP Cables | vloerroutes en 3D-kabels | |

Classes krijgen geen prefix (in te stellen). De lagen zijn in te stellen bij Instellingen › Tekening.

## Blokken en nummering

- Jij plaatst je eigen multi-, SOCA-, LK- en VEAM-blokken in **PP Infra**, in de class van het object (LX1), en typt het
  nummer erin: **M101**, **LK101** of **V101** (ook L101 en VEAM101 worden herkend; D101 = dimmer).
- De tool leest het nummer uit een record aan het blok, de naam (Object Info), een tekst in het symbool of de groep, of
  een losse tekst bij het blok (zelfde class). Een losse tekst zonder blok in de buurt telt zelf als blok.
- **M** = multi (Socapex; Harting als de symboolnaam "harting" bevat), **LK** = VEAM 12 (V12), **V** = VEAM 4 (V4).
- Het eerste cijfer is de dim city: M101 → DB1, M201 → DB2. Met één dim city: M1 → DB1.
- De tool tekent zelf **geen** blokken meer. Welke blokken hij gevonden heeft, zie je in de palette onder Waarschuwingen.
- Drops krijgen D101, D102 … per dim city (D201 … voor DB2); met één dim city D1, D2 … Een nummer blijft vast.

## Werkwijze

1. Sla de tekening op. Tool **Dim city**: klik een plek aan (DB1, DB2 …).
2. Tool **Vloerroute**: klik vanaf de dim city naar de voet van de grote drop, dubbelklik = klaar. Routes die elkaar raken
   (ook halverwege) worden één netwerk; de tool kiest de kortste weg naar de dim city van elk bloknummer.
3. Tool **Truss-lijn**: naam (bijv. CB01) en hoogte in de modusbalk. Hoogte **auto** = bovenkant van de echte truss eronder.
   Eerste punt = begin van de kabeltruss.
4. Tool **Drop** (twee klikken):
   - kies in de modusbalk bij **Object** de class (LX1; zoekbaar, met de gevonden bloknummers) en de **Dropvorm**;
   - **klik 1** snapt op de truss-lijn; de kant waar de muis staat is de kant waar de kabels zakken (groen kruisje en pijl);
   - **klik 2** is het eindpunt bij het object. De tool zoekt de blokken in die class, leidt de dim city af en rekent de
     kabels uit.
5. Palette: **Verversen**. Kies links een drop: dropkant, dropvorm, droplengte en meters over de truss zijn aan te passen.
6. **Tekening bijwerken** (labels, 3D-kabels, eventueel markeringen) en **Stempelen**.

## Kabels en dropvormen

- Kabels liggen **óp** de truss, plat naast elkaar in de volgorde van de drops: wie het eerst afgaat ligt buiten aan zijn
  dropkant. Bij de drop gaan ze over de rand naast elkaar langs de zijkant naar beneden.
- De bovenkant, breedte en diepte komen van de echte truss onder de truss-lijn; wordt die niet gevonden, dan de hoogte van
  de truss-lijn en de trussbreedte uit Instellingen.
- De hoogte van het doel is het gemiddelde van de lampen in de class (of de hoogte bij het eindpunt in de Object Info).
- Dropvorm per drop: **Recht** (strakke lijn, de droplengte blijft bewaard), **Nette boog** (nooit lager dan het laagste
  punt; hangt het doel hoger, dan over de bovenkant) of **Realistisch** (hangt door op de droplengte, als lus als het recht
  onder elkaar ligt). Nooit door de vloer.
- Droplengte: automatisch de kortste passende loom (25, anders 35 m) of zelf gekozen. De slack staat bij de drop.

## Waarschuwingen

In de palette (bovenaan en in het tabblad Waarschuwingen), rood = fout, oranje = let op:
te kort, **koppelen in de lucht** (bouwcheck: object op bouwhoogte 1,5 m, instelbaar, met de hoogte waarop het wel kan),
overschot op de vloer, dubbel nummer, blok zonder drop, geen route, onbekende dim city.
Met Instellingen › Waarschuwingen › *Ook in de tekening* komen ze bij Tekening bijwerken als rode markering in PP Infra
(class KT Waarschuwingen).

## 3D in de palette

- Echte vorm van trussen **en lampen** uit Vectorworks (zelfde opdeling in driehoekjes). Bij zware tekeningen:
  Instellingen › 3D › **Basisweergave**.
- Trussen worden herkend als de symboolnaam, de **map** in het hulpbronnenbeheer, de class of de laag een woord bevat uit
  Instellingen › *Trussen herkennen* (standaard o.a. truss, H30, H40, X30, F34, Prolyte …).
- **Truss-diagnose** (menu ⋯): selecteer een truss in de tekening; de palette toont type, symboolnaam, map, class, laag,
  records en waarom hij wel of niet herkend wordt. Ook in `%TEMP%\kabeltool_log.txt`.
- Legenda van de kabelsoorten, waarschuwingen als bordje, drops als groene bol met pijl, eindpunt als groene ring.

## Kabelsymbool

1-op-1 naar het voorbeeld: verhouding 3,2 : 1 (standaard 12,7 × 4 mm op papier), dunne balk bovenop (9 % van de hoogte)
in de lengtekleur, rand in de typekleur (SOC lichtblauw, V12/V4 oranje), korte naam gecentreerd links (vet bij VEAM),
lengte gecentreerd rechts, geen scheidingslijn, nummer grijs ernaast.
Lengtekleuren: 0,5 wit · 1 bruin · 2,5 wit · 5 geel · 10 rood · 15 groen · 25 wit · 35 grijs · 50 violet · 75 oranje ·
100 bruin · 150 groen.

## Palette zonder Vectorworks

Open `palette/index.html` in Chrome of Edge en klik **Demo**.

## Onzeker (eerst nakijken als iets misgaat)

- Het voorbeeld tijdens het bewegen van de drop-tool (`IToolInteractiveDraw`) en de zoekbare keuzelijsten in de modusbalk.
- Of de blokken gevonden worden: kijk in de palette onder Waarschuwingen › Gevonden blokken.
- Ongedaan maken (Ctrl+Z): elke knop/tool is één stap.
- Of de melding bij selectiewijziging de palette bereikt (anders: Verversen).
- Nog niet getest uit de vorige versie: lagen opruimen, sleeppunt van het label, Object Info-velden, labels alleen in
  bovenaanzicht, de echte trussvorm.

## Niet in deze versie

Lijsten en paklijsten, poortvalidatie en automatische poortindeling, splitters met eigen V-nummers (V4 vanaf een VEAM12)
als tussenstation, rijen als "SOC 25 + SOC 15" en een voetregel in het koppelkader, meeverhuizen bij een verschoven truss.
