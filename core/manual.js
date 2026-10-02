// core/manual.js
// The user manual, in one place. It feeds three things:
//   1. the Help panel in the app (ui/help.js) — opened on the chapter that matches where you are
//   2. docs/USER_MANUAL.md and CHANGELOG.md on GitHub (generated with `npm run manual`)
//   3. the "What's new" chapter and the release notes shown by the updater
// Every chapter has an English and a Dutch body in a small markdown dialect:
//   "## Heading", "- bullet", "1. step", blank line = new paragraph, **bold**, [[chapter-id|link text]].
// When a feature changes, change its chapter here in the same commit.

export const CHAPTERS = [
  {
    id:'getting-started', icon:'compass', context:['HOME:empty', 'welcome'],
    title:{ en:'Getting started', nl:'Aan de slag' },
    en:`PatchLab prepares, validates and documents the LK, Veam and DMX patching of a show, grouped per DimCity. The usual flow:

1. **New Project** on the welcome screen. Give it a name, area, location and date — these appear on the cover of your PDF.
2. **Import CSV** with your patch list (see [[import|Importing a CSV]]), or add LKs and Veams by hand.
3. Check the **Validation** page and fix what is red.
4. Link Veams to LK slots, plan **racks** and **nodes** per DimCity.
5. Build the PDF in the **Report Builder** and export it.

## Saving
A project is one **.lkproj** file with everything inside: the imported CSVs, your edits, Veam links, device types, racks, network plans and report layouts. Save with **Cmd/Ctrl+S**. Recent projects are listed on the welcome screen.

Autosave, backups and crash recovery are set in [[settings|Settings]].

## Demo show and tours
**Open Demo Show** on the welcome screen (or Help → Open Demo Show) loads a complete festival show: three DimCities, LKs with Veam links, racks and loose devices from the standard library, a network plan and a finished PDF layout. Nothing is saved until you choose Save, so change whatever you like. **Take the Tour** lets you choose the full tour or one about LK blocks, nodes, racks or the PDF layout.

## Progress bar
Bottom-left, a small bar shows how complete the show is: project info, patch imported, no errors, rows complete, Veams linked, racks patched, network plan, PDF layout, saved. Click it for the checklist; every open item jumps to the place where you fix it.

## Where things are
- **Sidebar**: project overview, validation, patch list, network planner, and every DimCity with its LKs and Veams.
- **Toolbar**: Import CSV, Edit Rows, Recalculate, Save, Export PDF, Help and Request.
- **Cmd/Ctrl+K** searches everything: LKs, Veams, universes, locations, devices and commands.
- **?** or the Help button opens this manual on the chapter that matches the page you are on.`,
    nl:`PatchLab bereidt de LK-, Veam- en DMX-patch van een show voor, controleert hem en documenteert hem, gegroepeerd per DimCity. De gebruikelijke volgorde:

1. **Nieuw project** op het welkomstscherm. Geef het een naam, gebied, locatie en datum — die komen op het voorblad van je PDF.
2. **CSV importeren** met je patchlijst (zie [[import|CSV importeren]]), of voeg LK's en Veams met de hand toe.
3. Kijk op de pagina **Validatie** en los op wat rood is.
4. Koppel Veams aan LK-slots, plan **racks** en **nodes** per DimCity.
5. Bouw de PDF in de **Rapportbouwer** en exporteer hem.

## Opslaan
Een project is één **.lkproj**-bestand met alles erin: de geïmporteerde CSV's, je bewerkingen, Veam-koppelingen, devicetypes, racks, netwerkplannen en rapportindelingen. Opslaan doe je met **Cmd/Ctrl+S**. Recente projecten staan op het welkomstscherm.

Automatisch opslaan, back-ups en crashherstel stel je in bij [[settings|Instellingen]].

## Demo-show en rondleidingen
**Demo-show openen** op het welkomstscherm (of Help → Demo-show openen) laadt een complete festivalshow: drie DimCities, LK's met Veam-koppelingen, racks en losse apparaten uit de standaardbibliotheek, een netwerkplan en een afgemaakte PDF-indeling. Er wordt niets opgeslagen tot je op Opslaan klikt, dus verander wat je wilt. **Rondleiding** laat je kiezen tussen de volledige rondleiding of één over LK-blokken, nodes, racks of de PDF-opmaak.

## Voortgangsbalk
Linksonder toont een kleine balk hoe compleet de show is: projectinfo, patch geïmporteerd, geen fouten, regels compleet, Veams gekoppeld, racks gepatcht, netwerkplan, PDF-indeling, opgeslagen. Klik erop voor de checklist; elk open punt springt naar de plek waar je het oplost.

## Waar vind je wat
- **Zijbalk**: projectoverzicht, validatie, patchlijst, netwerkplanner en elke DimCity met zijn LK's en Veams.
- **Werkbalk**: CSV importeren, Rijen bewerken, Herberekenen, Opslaan, PDF exporteren, Help en Request.
- **Cmd/Ctrl+K** zoekt in alles: LK's, Veams, universes, locaties, devices en opdrachten.
- **?** of de Help-knop opent deze handleiding op het hoofdstuk dat bij je huidige pagina hoort.`
  },
  {
    id:'import', icon:'upload', context:['wizard', 'csvSources'],
    title:{ en:'Importing a CSV', nl:'CSV importeren' },
    en:`**Import CSV** (toolbar or Cmd/Ctrl+I) reads a comma-separated file with one patch point per row.

## Columns
Four columns are needed, in any order — you map them in the import window:
- **LK / Veam ID** — LK101, VEAM12101 (same as LK101) or V105
- **Port** — 1–12 on an LK, 1–4 on a Veam
- **Universe** — a number, or empty when not patched yet
- **Position / location** — free text, e.g. "Truss 2 SL"

A row **without an ID** is a loose DMX line; it needs a DimCity in the sixth column (DB01).

## DimCity from the ID
The DimCity follows from the number: **LK101 and V105 belong to DB01, LK215 to DB02** (hundreds = DimCity).

## Header and footer rows
PatchLab detects which rows are real patch rows and skips the rest. Adjust with the **Skip first / last** counters; the preview shows what is included.

## After the import
- Imported files are listed under **File → Imported Files**. There you can **Replace** a file with a newer export or **Remove** it. Manual rows, Veam links and block types are kept.
- Rows that are not valid (for example a Veam on port 6, or the same port patched twice with different universes) are not thrown away: they appear on the [[validation|Validation]] page with a Fix button and in **Edit Rows**.`,
    nl:`**CSV importeren** (werkbalk of Cmd/Ctrl+I) leest een kommagescheiden bestand met één patchpunt per regel.

## Kolommen
Je hebt vier kolommen nodig, in willekeurige volgorde — je koppelt ze in het importvenster:
- **LK- / Veam-ID** — LK101, VEAM12101 (hetzelfde als LK101) of V105
- **Poort** — 1–12 op een LK, 1–4 op een Veam
- **Universe** — een getal, of leeg als er nog niets gepatcht is
- **Positie / locatie** — vrije tekst, bijv. "Truss 2 SL"

Een regel **zonder ID** is een losse DMX-lijn; die heeft een DimCity nodig in de zesde kolom (DB01).

## DimCity uit het ID
De DimCity volgt uit het nummer: **LK101 en V105 horen bij DB01, LK215 bij DB02** (honderdtallen = DimCity).

## Kop- en voetregels
PatchLab herkent welke regels echte patchregels zijn en slaat de rest over. Pas het aan met de tellers **Eerste / laatste overslaan**; het voorbeeld laat zien wat meegaat.

## Na de import
- Geïmporteerde bestanden staan onder **Bestand → Geïmporteerde bestanden**. Daar kun je een bestand **vervangen** door een nieuwere export of het **verwijderen**. Handmatige regels, Veam-koppelingen en bloktypes blijven staan.
- Regels die niet kloppen (bijvoorbeeld een Veam op poort 6, of dezelfde poort twee keer met een andere universe) worden niet weggegooid: ze staan op de pagina [[validation|Validatie]] met een knop Oplossen en in **Rijen bewerken**.`
  },
  {
    id:'overview', icon:'home', context:['HOME'],
    title:{ en:'Project overview', nl:'Projectoverzicht' },
    en:`The overview is the home page of a project.

- The **key figures** count DimCities, LK blocks, Veams, universes and patch points of the whole show.
- The **DimCity table** shows per DimCity how many LKs and Veams it has, how many Veams are linked, and the number of errors and warnings. Click a row to open the DimCity.
- **Project info** (name, area, location, date, prepared by) is edited with the pencil button; it is printed on the PDF cover.

Add LKs or Veams by hand with the **+** next to "DimCities" in the sidebar. A DimCity that does not exist yet is created automatically.`,
    nl:`Het overzicht is de startpagina van een project.

- De **kerncijfers** tellen DimCities, LK-blokken, Veams, universes en patchpunten van de hele show.
- De **DimCity-tabel** laat per DimCity zien hoeveel LK's en Veams er zijn, hoeveel Veams gekoppeld zijn en het aantal fouten en waarschuwingen. Klik op een regel om de DimCity te openen.
- **Projectinfo** (naam, gebied, locatie, datum, opgesteld door) bewerk je met het potloodknopje; het staat op het voorblad van de PDF.

Voeg LK's of Veams met de hand toe met de **+** naast "DimCities" in de zijbalk. Een DimCity die nog niet bestaat wordt automatisch aangemaakt.`
  },
  {
    id:'dimcity', icon:'layers', context:['DIM'],
    title:{ en:'DimCity page', nl:'DimCity-pagina' },
    en:`Everything of one DimCity on one page. Cards can be collapsed with the chevron; PatchLab remembers that per card.

- **Universes** — one tile per universe with its patch points. Click a tile to see exactly which LK and Veam ports carry it.
- **LK blocks** — the port layout of every LK. Click a block to change its block type and Veam links inline; see [[lk|LK block]].
- **Veams** — the four ports of every Veam and whether it is linked to an LK; click to open it.
- **Loose DMX** — DMX lines without an LK or Veam.
- **Racks** — place racks and loose devices and let PatchLab patch everything onto sockets and node ports; see [[racks|Racks per DimCity]].
- **Network nodes / Splitters** — the network plan of this DimCity; see [[network|Network planner]].
- **Patch rows** — every row of this DimCity as a table.

**Color** changes the DimCity colour used in the sidebar and on the PDF. **Export** opens the Report Builder with only this DimCity selected.`,
    nl:`Alles van één DimCity op één pagina. Kaarten klap je in met het pijltje; PatchLab onthoudt dat per kaart.

- **Universes** — één tegel per universe met zijn patchpunten. Klik op een tegel om precies te zien welke LK- en Veam-poorten hem dragen.
- **LK-blokken** — de poortindeling van elke LK. Klik op een blok om het bloktype en de Veam-koppelingen ter plekke te wijzigen; zie [[lk|LK-blok]].
- **Veams** — de vier poorten van elke Veam en of hij aan een LK gekoppeld is; klik om hem te openen.
- **Losse DMX** — DMX-lijnen zonder LK of Veam.
- **Racks** — plaats racks en losse apparaten en laat PatchLab alles op aansluitingen en nodepoorten patchen; zie [[racks|Racks per DimCity]].
- **Netwerknodes / Splitters** — het netwerkplan van deze DimCity; zie [[network|Netwerkplanner]].
- **Patchregels** — elke regel van deze DimCity als tabel.

**Kleur** wijzigt de DimCity-kleur in de zijbalk en op de PDF. **Exporteren** opent de Rapportbouwer met alleen deze DimCity geselecteerd.`
  },
  {
    id:'lk', icon:'box', context:['LK'],
    title:{ en:'LK block', nl:'LK-blok' },
    en:`An LK block has 12 ports in three groups of four. Each group can be fed by a Veam (slots A, B and C) or be used as XLR outputs.

## Block type
- **4× XLR + 3× Veam** (default): ports 1–4 are XLR, the three slots can take a Veam.
- **3× Veam**: all three groups are Veams; the LK's own ports should be empty.
- **12× XLR**: no Veams; all 12 ports are XLR. Veam links are ignored in this mode.

**Auto-detect** picks 12× XLR when more than 4 LK ports are patched; otherwise 4× XLR + 3× Veam. Choose a type yourself to override it.

## Veam slots
Pick a Veam from the same DimCity in slot A, B or C. A slot is greyed out when all four LK ports of that range are already patched on the LK itself. A Veam can be linked to one slot only; a second link is reported as an error.

## Ports table
The table merges the LK's own rows with the linked Veam's rows: universe, location, source (LK, Veam or both) and the Veam port. A **conflict** means the LK port and the Veam port carry different universes.

## Delete
**Delete LK** removes the block together with its patch rows, also when they came from a CSV. Links to Veams are removed; the Veams themselves stay. Undo brings everything back.`,
    nl:`Een LK-blok heeft 12 poorten in drie groepen van vier. Elke groep kan door een Veam gevoed worden (slots A, B en C) of als XLR-uitgangen gebruikt worden.

## Bloktype
- **4× XLR + 3× Veam** (standaard): poorten 1–4 zijn XLR, de drie slots kunnen een Veam krijgen.
- **3× Veam**: alle drie de groepen zijn Veams; de eigen poorten van de LK horen leeg te zijn.
- **12× XLR**: geen Veams; alle 12 poorten zijn XLR. Veam-koppelingen worden in deze stand genegeerd.

**Automatisch** kiest 12× XLR als meer dan 4 LK-poorten gepatcht zijn; anders 4× XLR + 3× Veam. Kies zelf een type om dat te overrulen.

## Veam-slots
Kies in slot A, B of C een Veam uit dezelfde DimCity. Een slot is grijs als alle vier de LK-poorten van dat bereik al op de LK zelf gepatcht zijn. Een Veam kan maar aan één slot gekoppeld zijn; een tweede koppeling wordt als fout gemeld.

## Poortentabel
De tabel voegt de eigen regels van de LK samen met die van de gekoppelde Veam: universe, locatie, bron (LK, Veam of beide) en de Veam-poort. Een **conflict** betekent dat de LK-poort en de Veam-poort een andere universe hebben.

## Verwijderen
**LK verwijderen** haalt het blok weg samen met zijn patchregels, ook als die uit een CSV komen. Koppelingen naar Veams verdwijnen; de Veams zelf blijven. Ongedaan maken zet alles terug.`
  },
  {
    id:'veam', icon:'plug', context:['VEAM'],
    title:{ en:'Veam', nl:'Veam' },
    en:`A Veam has four ports. It is fed by an LK: open the LK and choose the Veam in slot A, B or C. The Veam page shows which LK and slot it is linked to and its four ports with universe, location and status.

- **Not linked** (orange) — the Veam is in the show but no LK feeds it yet. In the rack patch it then gets its own VIM4 socket.
- **Linked** (green) — fed through the LK; it needs no socket of its own.
- **Linked twice** (red) — remove one of the links.

**Delete Veam** removes the Veam and its rows (also from a CSV) and clears the link in the LK. Undo brings it back.`,
    nl:`Een Veam heeft vier poorten. Hij wordt gevoed door een LK: open de LK en kies de Veam in slot A, B of C. De Veam-pagina laat zien aan welke LK en welk slot hij gekoppeld is, en zijn vier poorten met universe, locatie en status.

- **Niet gekoppeld** (oranje) — de Veam zit in de show, maar nog geen LK voedt hem. In de rack-patch krijgt hij dan een eigen VIM4-aansluiting.
- **Gekoppeld** (groen) — gevoed via de LK; hij heeft geen eigen aansluiting nodig.
- **Twee keer gekoppeld** (rood) — haal één van de koppelingen weg.

**Veam verwijderen** haalt de Veam en zijn regels weg (ook uit een CSV) en wist de koppeling in de LK. Ongedaan maken zet hem terug.`
  },
  {
    id:'rows', icon:'edit', context:['csvEditor'],
    title:{ en:'Editing patch rows', nl:'Patchregels bewerken' },
    en:`**Edit Rows** (toolbar or Cmd/Ctrl+E) opens every row of the project in a table: imported rows, your edits and manual rows.

- Change ID, port, universe or location directly in the cell. The DimCity follows from the ID.
- **LK row / Veam row / Loose DMX Line** add a new row at the top. A loose DMX line needs a DimCity.
- Invalid rows are marked red with the reason; fix them here.
- **Reset to imported** throws away your edits to imported rows; manual rows stay.
- Nothing changes until you click **Apply Changes**.

The original CSV file is never modified. Your edits live in the project file.`,
    nl:`**Rijen bewerken** (werkbalk of Cmd/Ctrl+E) opent elke regel van het project in een tabel: geïmporteerde regels, je bewerkingen en handmatige regels.

- Wijzig ID, poort, universe of locatie direct in de cel. De DimCity volgt uit het ID.
- **LK-regel / Veam-regel / Losse DMX-lijn** zetten een nieuwe regel bovenaan. Een losse DMX-lijn heeft een DimCity nodig.
- Ongeldige regels zijn rood gemarkeerd met de reden; los ze hier op.
- **Terug naar geïmporteerd** gooit je bewerkingen van geïmporteerde regels weg; handmatige regels blijven.
- Er verandert niets tot je op **Wijzigingen toepassen** klikt.

Het originele CSV-bestand wordt nooit aangepast. Je bewerkingen zitten in het projectbestand.`
  },
  {
    id:'validation', icon:'alert', context:['ISSUES'],
    title:{ en:'Validation', nl:'Validatie' },
    en:`PatchLab checks the patch continuously. The badge in the sidebar counts open errors (red) and warnings (yellow). Click an issue to jump to it; many have a **Fix…** button.

## Errors
- **Unknown ID** — not LK###, VEAM12### or V###.
- **Port does not exist** — an LK has ports 1–12, a Veam 1–4.
- **Patched twice with different universes** — the same port appears twice; choose which row is right.
- **Loose DMX line has no DimCity** — fill in the DimCity column.
- **Veam linked more than once** — a Veam can feed only one LK slot.
- **Too few fields** — the CSV row is incomplete.

## Warnings
- **Linked to a Veam that no longer exists** — the Veam was removed; unlink or re-add it.
- **12× XLR block with Veam links** — the links are ignored; change the block type or remove them.
- **3× Veam block but LK ports contain data** — the LK's own ports should be empty in this mode.
- **Incomplete** rows — universe or location is missing.

**Recalculate** (Cmd/Ctrl+R) runs every check again.`,
    nl:`PatchLab controleert de patch voortdurend. Het badge in de zijbalk telt open fouten (rood) en waarschuwingen (geel). Klik op een melding om ernaartoe te springen; veel meldingen hebben een knop **Oplossen…**.

## Fouten
- **Onbekend ID** — geen LK###, VEAM12### of V###.
- **Poort bestaat niet** — een LK heeft poorten 1–12, een Veam 1–4.
- **Twee keer gepatcht met verschillende universes** — dezelfde poort komt twee keer voor; kies welke regel klopt.
- **Losse DMX-lijn heeft geen DimCity** — vul de DimCity-kolom in.
- **Veam meer dan één keer gekoppeld** — een Veam kan maar één LK-slot voeden.
- **Te weinig velden** — de CSV-regel is onvolledig.

## Waarschuwingen
- **Gekoppeld aan een Veam die niet meer bestaat** — de Veam is verwijderd; ontkoppel hem of voeg hem opnieuw toe.
- **12× XLR-blok met Veam-koppelingen** — de koppelingen worden genegeerd; wijzig het bloktype of haal ze weg.
- **3× Veam-blok maar LK-poorten bevatten gegevens** — de eigen poorten van de LK horen in deze stand leeg te zijn.
- **Onvolledige** regels — universe of locatie ontbreekt.

**Herberekenen** (Cmd/Ctrl+R) voert alle controles opnieuw uit.`
  },
  {
    id:'patchlist', icon:'table', context:['TABLE'],
    title:{ en:'Patch list', nl:'Patchlijst' },
    en:`The patch list shows every row of the project — LK, Veam and loose DMX — with type, ID, port, universe, location and status. Filter by DimCity or type a search term (ID, location, universe). Use **Edit Rows** to change rows.`,
    nl:`De patchlijst toont elke regel van het project — LK, Veam en losse DMX — met type, ID, poort, universe, locatie en status. Filter op DimCity of typ een zoekterm (ID, locatie, universe). Gebruik **Rijen bewerken** om regels te wijzigen.`
  },
  {
    id:'devices', icon:'network', context:['deviceBuilder:node', 'deviceBuilder:splitter', 'deviceBuilder:switch', 'deviceBuilder:panel'],
    title:{ en:'Device Builder', nl:'Device Builder' },
    en:`**Network → Device Builder** (Cmd/Ctrl+Shift+D) is where you define the device types you work with. Types are saved in the show and in your personal [[library|library]], so they are available in every project.

## Node
A DMX node: brand, type, number of **DMX ports**, **Ethernet ports** (1× or 2× RJ45 for link + redundant / daisy chain), default IP and subnet, height in U and a colour.

## Splitter
Single or **A/B input**, number of outputs, and whether outputs switch **independently or in pairs**.

## Switch
RJ45 and SFP port counts.

## Panel
A patch panel with **LK7-1**, **VIM4**, **XLR** and **etherCON** sockets. In a rack, every LK7-1 socket shares its lines with up to three VIM4 sockets next to it; the remaining VIM4 sockets are separate.

## Type key
Every type has a fixed key (NODE:01, PANEL:02…). Shows refer to it, so it cannot change after saving. Use **Duplicate** to make a variant.

The preview at the top shows the front face of the device with its ports as it will appear in a rack.`,
    nl:`**Netwerk → Device Builder** (Cmd/Ctrl+Shift+D) is de plek waar je de devicetypes definieert waarmee je werkt. Types worden in de show en in je persoonlijke [[library|bibliotheek]] opgeslagen, dus ze zijn in elk project beschikbaar.

## Node
Een DMX-node: merk, type, aantal **DMX-poorten**, **Ethernet-poorten** (1× of 2× RJ45 voor link + redundant / daisy chain), standaard-IP en subnet, hoogte in U en een kleur.

## Splitter
Enkele of **A/B-ingang**, aantal uitgangen, en of uitgangen **los of per twee** schakelen.

## Switch
Aantal RJ45- en SFP-poorten.

## Paneel
Een patchpaneel met **LK7-1**-, **VIM4**-, **XLR**- en **etherCON**-aansluitingen. In een rek deelt elke LK7-1-aansluiting zijn lijnen met maximaal drie VIM4-aansluitingen ernaast; de overige VIM4's staan los.

## Typesleutel
Elk type heeft een vaste sleutel (NODE:01, PANEL:02…). Shows verwijzen ernaar, dus hij kan na opslaan niet meer veranderen. Gebruik **Dupliceren** voor een variant.

Het voorbeeld bovenin toont de voorkant van het device met zijn poorten, zoals het in een rek verschijnt.`
  },
  {
    id:'rack-builder', icon:'rack', context:['deviceBuilder:rack'],
    title:{ en:'Rack Builder', nl:'Rack Builder' },
    en:`The **Racks** tab of the Device Builder builds 19" racks from your device types.

- **New rack**, give it a name, an **article key** (your inventory number) and a height — from **1U** up to 48U.
- Drag devices from the palette on the right into the rack, or click **+** to add one at the first free position. Green rows mean it fits, red means it does not.
- Move devices with the arrows or by dragging; remove them with the ×.
- The summary below counts DMX ports, splitter outputs, RJ45 and the LK7-1 / VIM4 / XLR sockets of the rack.

A rack is a template: you place it in a DimCity on the [[racks|Racks card]], as often as you need. The article key is printed in the Racks card and on the PDF.`,
    nl:`Het tabblad **Racks** van de Device Builder bouwt 19"-racks uit je devicetypes.

- **Nieuw rek**, geef het een naam, een **artikelsleutel** (je voorraadnummer) en een hoogte — van **1U** tot 48U.
- Sleep devices uit het palet rechts in het rek, of klik op **+** om er een op de eerste vrije plek te zetten. Groene rijen betekenen dat het past, rood dat het niet past.
- Verplaats devices met de pijltjes of door te slepen; haal ze weg met het ×.
- De samenvatting eronder telt DMX-poorten, splitteruitgangen, RJ45 en de LK7-1- / VIM4- / XLR-aansluitingen van het rek.

Een rek is een sjabloon: je plaatst het in een DimCity op de [[racks|Racks-kaart]], zo vaak als je wilt. De artikelsleutel staat in de Racks-kaart en op de PDF.`
  },
  {
    id:'racks', icon:'rack', context:['DIM:racks'],
    title:{ en:'Racks per DimCity', nl:'Racks per DimCity' },
    en:`The **Racks** card on a DimCity page patches the LKs and Veams of that DimCity automatically onto the racks and loose devices you place there. The result is recalculated from the current show every time, so it never goes stale.

## Placing
- **Place rack** adds a rack from the Rack Builder; give it a name for this DimCity (e.g. "Rack SL"). Remove it with the bin.
- **Loose devices**: a **loose node** without a rack, a **loose LK spider** (one LK7-1 socket on a breakout) or a **loose VIM4 spider** (one VIM4 socket). A spider can be pinned to a loose node with **On node**; its lines are then patched on that node first.

## How the patch is made
1. Every LK with data gets an **LK7-1 socket**: first a loose LK spider that is pinned to a node, then the rack panels, then other loose spiders.
2. Veams that are not fed by an LK get a **VIM4 socket**: first a VIM4 spider pinned to a node, then a free VIM4 next to an LK that does not use those lines, then separate VIM4s, then other spiders.
3. Every used line gets a **node port**. Lines of one LK or Veam stay on one node where possible — the legend shows the node per LK / Veam, and every node has its own colour.
4. When node ports run short, universes that are used more than once go through a **splitter** in the rack.

## Reading the result
- The counters show used / available LK7-1 sockets, VIM4 sockets, node ports and lines.
- **Recommendations** tell you what is missing: loose spiders to add, extra nodes, unused splitters.
- The rack drawing shows the universe on every node port and the LK / Veam number on every socket; hover for details.
- **Node ports** lists per node which LK or Veam port (and location) sits on which node port.
- The **patch table** at the bottom has every line: node port, universe, via splitter, socket, LK / Veam port, location.

## Using it
- **Use as network plan** copies the nodes and splitters, with their universes, into the network plan of this DimCity (IP addresses are generated).
- **Print racks** opens the Report Builder with the "Racks only" preset.`,
    nl:`De kaart **Racks** op een DimCity-pagina patcht de LK's en Veams van die DimCity automatisch op de racks en losse apparaten die je daar plaatst. Het resultaat wordt elke keer opnieuw uit de huidige show berekend, dus het loopt nooit achter.

## Plaatsen
- **Rek plaatsen** voegt een rek uit de Rack Builder toe; geef het een naam voor deze DimCity (bijv. "Rack SL"). Verwijderen doe je met het prullenbakje.
- **Losse apparaten**: een **losse node** zonder rek, een **losse LK-spin** (één LK7-1-aansluiting op een breakout) of een **losse VIM4-spin** (één VIM4-aansluiting). Een spin kun je met **Op node** aan een losse node hangen; zijn lijnen worden dan eerst op die node gepatcht.

## Hoe de patch tot stand komt
1. Elke LK met gegevens krijgt een **LK7-1-aansluiting**: eerst een losse LK-spin die aan een node hangt, dan de rekpanelen, dan andere losse spinnen.
2. Veams die niet door een LK gevoed worden krijgen een **VIM4-aansluiting**: eerst een VIM4-spin die aan een node hangt, dan een vrije VIM4 naast een LK die die lijnen niet gebruikt, dan losse VIM4's, dan andere spinnen.
3. Elke gebruikte lijn krijgt een **nodepoort**. Lijnen van één LK of Veam blijven waar mogelijk op één node — de legenda toont de node per LK / Veam, en elke node heeft een eigen kleur.
4. Als er nodepoorten tekortkomen, gaan universes die vaker gebruikt worden via een **splitter** in het rek.

## Het resultaat lezen
- De tellers tonen gebruikt / beschikbaar voor LK7-1-aansluitingen, VIM4-aansluitingen, nodepoorten en lijnen.
- **Adviezen** vertellen wat er ontbreekt: losse spinnen om toe te voegen, extra nodes, overbodige splitters.
- De rektekening toont de universe op elke nodepoort en het LK- / Veam-nummer op elke aansluiting; beweeg eroverheen voor details.
- **Nodepoorten** laat per node zien welke LK- of Veam-poort (en locatie) op welke nodepoort zit.
- De **patchtabel** onderaan heeft elke lijn: nodepoort, universe, via splitter, aansluiting, LK- / Veam-poort, locatie.

## Gebruiken
- **Gebruik als netwerkplan** kopieert de nodes en splitters, met hun universes, naar het netwerkplan van deze DimCity (IP-adressen worden gegenereerd).
- **Racks printen** opent de Rapportbouwer met de voorinstelling "Alleen racks".`
  },
  {
    id:'network', icon:'network', context:['NETWORK', 'DIM:nodes', 'DIM:splitters'],
    title:{ en:'Network planner', nl:'Netwerkplanner' },
    en:`The network plan lists the DMX nodes and splitters of every DimCity with their IP addresses and universes. You find it on the **Network Planner** page (all DimCities) and in the **Network nodes** and **Splitters** cards of a DimCity.

## Nodes
- Choose a node type and click **Auto-assign nodes**: PatchLab fills the universes of the DimCity low to high over as many nodes as needed, keeping the **spare ports** from Settings free.
- Drag a universe from the **universe pool** onto a port, or click a port to pick one. Ports can be emptied.
- ID, name, IP and subnet are editable per node. IDs and IPs follow the DimCity: node 1 of DB02 becomes ID:21 with last IP octet 21.
- Both RJ45 ports are shown on nodes that have two.

## Splitters
- **Auto-calculate splitters** gives every patch point of a universe a splitter output; A/B splitters carry two universes. **Add one splitter** adds an empty one.
- The output map shows universe, LK / Veam port and location per output.

The quickest way to a complete plan is to build it from the rack patch: **Use as network plan** on the [[racks|Racks card]].`,
    nl:`Het netwerkplan somt de DMX-nodes en splitters van elke DimCity op met hun IP-adressen en universes. Je vindt het op de pagina **Netwerkplanner** (alle DimCities) en in de kaarten **Netwerknodes** en **Splitters** van een DimCity.

## Nodes
- Kies een nodetype en klik op **Nodes automatisch toewijzen**: PatchLab vult de universes van de DimCity van laag naar hoog over zoveel nodes als nodig, en houdt de **reservepoorten** uit Instellingen vrij.
- Sleep een universe uit de **universe-pool** naar een poort, of klik op een poort om er een te kiezen. Poorten kun je leegmaken.
- ID, naam, IP en subnet zijn per node te bewerken. ID's en IP's volgen de DimCity: node 1 van DB02 wordt ID:21 met laatste IP-octet 21.
- Op nodes met twee RJ45-poorten worden beide getoond.

## Splitters
- **Splitters automatisch berekenen** geeft elk patchpunt van een universe een splitteruitgang; A/B-splitters dragen twee universes. **Eén splitter toevoegen** voegt een lege toe.
- De uitgangenkaart toont per uitgang universe, LK- / Veam-poort en locatie.

De snelste weg naar een compleet plan is het uit de rack-patch opbouwen: **Gebruik als netwerkplan** op de [[racks|Racks-kaart]].`
  },
  {
    id:'report', icon:'file', context:['reportBuilder'],
    title:{ en:'Report Builder (PDF)', nl:'Rapportbouwer (PDF)' },
    en:`**Export PDF** (Cmd/Ctrl+P) opens the Report Builder: a live preview on the right, settings on the left. Click a part of the preview to jump to its settings. The layout is saved in the project.

## Content
- **DimCities**: all, or a selection. **Output**: one PDF, or one PDF per DimCity (each with its own cover).
- **Sections per DimCity**: switch them on or off, drag to reorder, open the chevron for options. Sections: header & key figures, network nodes, splitters, racks, LK / Veam patch, universe overview, patch list, warnings, notes.
- **Position on the sheet**: every section is **Auto** (flows top to bottom) or **Fixed** at an X / Y position with a width in mm. Drag the orange handle of a section in the preview to place it; it snaps to a 5 mm grid. Fixed sections can overlap others — that is up to you.

## Style
Paper size and orientation, margins, accent colour, font, text size, density, **line weight** (light / normal / bold — bold for sheets that are read on the floor), colour-coded universes, DimCity colour in headers, grayscale. Header and footer texts take placeholders: {project} {area} {location} {date} {prepared} {dimcity}.

## Cover and Brand
Cover title, subtitle, fields, note and a draggable project logo. Under **Brand**: a company logo on every page and a text or logo watermark.

## Racks on the PDF
The Racks section draws every rack as in the app, lists the node ports with the LK / Veam port on each, the loose devices and the patch table. The preset **Racks only** prints just that.

## Templates and presets
**Save as template** stores the whole layout in the project and your library; pick it from the Template menu in any show. Presets: DB detailed paperwork, Network crew, Patch crew, Compact patch sheets, Racks only.`,
    nl:`**PDF exporteren** (Cmd/Ctrl+P) opent de Rapportbouwer: rechts een live voorbeeld, links de instellingen. Klik op een deel van het voorbeeld om naar de bijbehorende instellingen te springen. De indeling wordt in het project opgeslagen.

## Inhoud
- **DimCities**: alle, of een selectie. **Uitvoer**: één PDF, of één PDF per DimCity (elk met een eigen voorblad).
- **Secties per DimCity**: zet ze aan of uit, sleep om te ordenen, open het pijltje voor opties. Secties: kop & kerncijfers, netwerknodes, splitters, racks, LK- / Veam-patch, universe-overzicht, patchlijst, waarschuwingen, notities.
- **Positie op het blad**: elke sectie is **Automatisch** (van boven naar beneden) of **Vast** op een X- / Y-positie met een breedte in mm. Sleep de oranje greep van een sectie in het voorbeeld om hem te plaatsen; hij springt naar een raster van 5 mm. Vaste secties kunnen over andere heen vallen — dat is aan jou.

## Stijl
Papierformaat en richting, marges, accentkleur, lettertype, tekstgrootte, dichtheid, **lijndikte** (licht / normaal / dik — dik voor bladen die op de vloer gelezen worden), universes in kleur, DimCity-kleur in koppen, grijstinten. Kop- en voetteksten kennen plaatshouders: {project} {area} {location} {date} {prepared} {dimcity}.

## Voorblad en huisstijl
Titel, ondertitel, velden, notitie en een versleepbaar projectlogo. Onder **Huisstijl**: een bedrijfslogo op elke pagina en een tekst- of logowatermerk.

## Racks op de PDF
De sectie Racks tekent elk rek zoals in de app, somt de nodepoorten op met de LK- / Veam-poort die erop zit, de losse apparaten en de patchtabel. De voorinstelling **Alleen racks** print alleen dat.

## Templates en voorinstellingen
**Opslaan als template** bewaart de hele indeling in het project en je bibliotheek; kies hem in elke show uit het menu Template. Voorinstellingen: DB detailed paperwork, Network crew, Patch crew, Compact patch sheets, Racks only.`
  },
  {
    id:'library', icon:'download', context:['library'],
    title:{ en:'Personal library', nl:'Persoonlijke bibliotheek' },
    en:`Device types, racks and report templates live in two places: in the show, and in your personal library on this computer (**Network → Show Library File**).

- Saving in the Device Builder or Report Builder writes to both.
- Opening a show adds the library items it lacks, and asks what to do with items the show has but the library does not, or that differ: **Replace my version**, **Add as copy** or **Keep both** (the show's item gets a new key).
- **Export Library…** writes an .lklib file you can send to a colleague; **Import Library…** reads one (or the devices from another .lkproj).

## Standard library (Luminex, ELC)
PatchLab ships with a standard library: Luminex LumiNode nodes, GigaCore switches and LumiSplit splitters, ELC dmXLAN nodes, switchGBx switches and DT splitters, plus standard LK / VIM4 / XLR panels and three ready-made racks. They are added to your library on first start.

**Settings → Device library → Check now** fetches the newest standard library from GitHub, separately from app updates: new types are added and unchanged standard types are corrected. A type you edited in the Device Builder is yours and is never overwritten. Port counts come from the manufacturers' product pages — check them against the unit in your rack.`,
    nl:`Devicetypes, racks en rapporttemplates staan op twee plekken: in de show, en in je persoonlijke bibliotheek op deze computer (**Netwerk → Bibliotheekbestand tonen**).

- Opslaan in de Device Builder of Rapportbouwer schrijft naar allebei.
- Bij het openen van een show worden ontbrekende bibliotheekitems toegevoegd, en wordt gevraagd wat er moet gebeuren met items die de show wél heeft maar de bibliotheek niet, of die afwijken: **Mijn versie vervangen**, **Als kopie toevoegen** of **Allebei houden** (het item van de show krijgt een nieuwe sleutel).
- **Bibliotheek exporteren…** schrijft een .lklib-bestand dat je naar een collega kunt sturen; **Bibliotheek importeren…** leest er een (of de devices uit een andere .lkproj).

## Standaardbibliotheek (Luminex, ELC)
PatchLab komt met een standaardbibliotheek: Luminex LumiNode-nodes, GigaCore-switches en LumiSplit-splitters, ELC dmXLAN-nodes, switchGBx-switches en DT-splitters, plus standaard LK- / VIM4- / XLR-panelen en drie kant-en-klare racks. Ze worden bij de eerste start aan je bibliotheek toegevoegd.

**Instellingen → Devicebibliotheek → Nu controleren** haalt de nieuwste standaardbibliotheek van GitHub, los van app-updates: nieuwe types worden toegevoegd en ongewijzigde standaardtypes gecorrigeerd. Een type dat je in de Device Builder hebt bewerkt is van jou en wordt nooit overschreven. Poortaantallen komen van de productpagina's van de fabrikanten — controleer ze tegen het apparaat in je rek.`
  },
  {
    id:'search', icon:'search', context:['search'],
    title:{ en:'Search (Cmd/Ctrl+K)', nl:'Zoeken (Cmd/Ctrl+K)' },
    en:`Press **Cmd/Ctrl+K** anywhere. Type part of an LK or Veam number, a universe (u12), a location, a node name or IP, a device type or a command. Use the arrow keys and Enter; Esc closes. Locations open the LK or Veam and highlight the port.`,
    nl:`Druk overal op **Cmd/Ctrl+K**. Typ een deel van een LK- of Veam-nummer, een universe (u12), een locatie, een nodenaam of IP, een devicetype of een opdracht. Gebruik de pijltjestoetsen en Enter; Esc sluit. Locaties openen de LK of Veam en lichten de poort op.`
  },
  {
    id:'history', icon:'refresh', context:['history'],
    title:{ en:'Undo and history', nl:'Ongedaan maken en geschiedenis' },
    en:`Every change to the project can be undone with **Cmd/Ctrl+Z** and redone with **Shift+Cmd+Z / Ctrl+Y**. In a text field these keys edit the text instead. **Edit → History…** (Cmd/Ctrl+Shift+H) shows the list of changes with a readable description; click one to go back to that point.`,
    nl:`Elke wijziging in het project kun je ongedaan maken met **Cmd/Ctrl+Z** en opnieuw doen met **Shift+Cmd+Z / Ctrl+Y**. In een tekstveld bewerken deze toetsen de tekst. **Bewerken → Geschiedenis…** (Cmd/Ctrl+Shift+H) toont de lijst met wijzigingen met een leesbare omschrijving; klik op een regel om naar dat punt terug te gaan.`
  },
  {
    id:'settings', icon:'sliders', context:['settings'],
    title:{ en:'Settings', nl:'Instellingen' },
    en:`**Settings** (Cmd/Ctrl+,) apply to the app on this computer, not to one show.

- **Appearance**: dark, light, or match the system.
- **Language**: English or Dutch, for the app and its menus. PDF reports stay in English.
- **Autosave**: off, after every N changes, or every N minutes. Optionally keep **backup copies** in a folder of your choice, with a maximum per project.
- **Recovery**: keep a recovery file so an unsaved show can be restored after a crash.
- **Updates**: the GitHub repository that releases are read from, an optional token for a private repository, and whether to check at startup. See [[updates|Updates]].
- **Device library**: check GitHub for a newer standard library (Luminex / ELC types), now or at startup. See [[library|Personal library]].`,
    nl:`**Instellingen** (Cmd/Ctrl+,) gelden voor de app op deze computer, niet voor één show.

- **Weergave**: donker, licht, of het systeem volgen.
- **Taal**: Engels of Nederlands, voor de app en de menu's. PDF-rapporten blijven Engels.
- **Automatisch opslaan**: uit, na elke N wijzigingen, of elke N minuten. Optioneel **back-upkopieën** bewaren in een map naar keuze, met een maximum per project.
- **Herstel**: een herstelbestand bijhouden zodat een niet-opgeslagen show na een crash teruggehaald kan worden.
- **Updates**: de GitHub-repository waaruit releases gelezen worden, een optioneel token voor een privérepository, en of er bij het opstarten gecontroleerd wordt. Zie [[updates|Updates]].
- **Devicebibliotheek**: GitHub controleren op een nieuwere standaardbibliotheek (Luminex- / ELC-types), nu of bij het opstarten. Zie [[library|Persoonlijke bibliotheek]].`
  },
  {
    id:'updates', icon:'download', context:['updates'],
    title:{ en:'Updates', nl:'Updates' },
    en:`PatchLab checks GitHub Releases for a newer version at startup (and via **Help → Check for Updates…**). When there is one, you see the release notes and can **Download & install**: the installer is saved in Downloads and opened; quit PatchLab and follow it. **Skip this version** hides that version until the next one.

What changed in each version is listed under [[whats-new|What's new]].`,
    nl:`PatchLab controleert bij het opstarten (en via **Help → Controleren op updates…**) GitHub Releases op een nieuwere versie. Is die er, dan zie je de release-opmerkingen en kun je **Downloaden & installeren**: de installer wordt in Downloads opgeslagen en geopend; sluit PatchLab af en volg de installer. **Deze versie overslaan** verbergt die versie tot de volgende.

Wat er per versie veranderd is, staat onder [[whats-new|Wat is er nieuw]].`
  },
  {
    id:'request', icon:'message', context:['request'],
    title:{ en:'Sending a request or bug report', nl:'Een wens of fout melden' },
    en:`The **Request** button in the toolbar (or **Help → Send a Request…**) opens a short form: what kind of request it is (feature, bug or question), a title and a description. PatchLab adds the app version, your platform and the page you were on.

**Open on GitHub** opens a pre-filled issue in your browser; click **Submit new issue** there to send it. You need a GitHub account with access to the PatchLab repository. If you do not have that, use **Copy** and send the text to the maintainer.

Every request becomes a GitHub issue, so you can follow what happens with it.`,
    nl:`De knop **Request** in de werkbalk (of **Help → Een verzoek sturen…**) opent een kort formulier: wat voor verzoek het is (wens, fout of vraag), een titel en een beschrijving. PatchLab voegt de app-versie, je platform en de pagina waar je was toe.

**Openen op GitHub** opent een vooringevuld issue in je browser; klik daar op **Submit new issue** om het te versturen. Je hebt een GitHub-account met toegang tot de PatchLab-repository nodig. Heb je dat niet, gebruik dan **Kopiëren** en stuur de tekst naar de beheerder.

Elk verzoek wordt een GitHub-issue, zodat je kunt volgen wat ermee gebeurt.`
  },
  {
    id:'shortcuts', icon:'keyboard', context:['shortcuts'],
    title:{ en:'Keyboard shortcuts', nl:'Sneltoetsen' },
    en:`- **Cmd/Ctrl+N** new project · **Cmd/Ctrl+O** open · **Cmd/Ctrl+S** save · **Cmd/Ctrl+Shift+S** save as
- **Cmd/Ctrl+I** import CSV · **Cmd/Ctrl+E** edit rows · **Cmd/Ctrl+P** report builder
- **Cmd/Ctrl+1 / 2 / 3** overview / validation / patch list · **Cmd/Ctrl+R** recalculate
- **Cmd/Ctrl+K** search · **Cmd/Ctrl+Z** undo · **Cmd/Ctrl+Shift+H** history
- **Cmd/Ctrl+Shift+D** device builder · **Cmd/Ctrl+,** settings
- **?** or **F1** this manual · **Esc** closes dialogs`,
    nl:`- **Cmd/Ctrl+N** nieuw project · **Cmd/Ctrl+O** openen · **Cmd/Ctrl+S** opslaan · **Cmd/Ctrl+Shift+S** opslaan als
- **Cmd/Ctrl+I** CSV importeren · **Cmd/Ctrl+E** rijen bewerken · **Cmd/Ctrl+P** rapportbouwer
- **Cmd/Ctrl+1 / 2 / 3** overzicht / validatie / patchlijst · **Cmd/Ctrl+R** herberekenen
- **Cmd/Ctrl+K** zoeken · **Cmd/Ctrl+Z** ongedaan maken · **Cmd/Ctrl+Shift+H** geschiedenis
- **Cmd/Ctrl+Shift+D** device builder · **Cmd/Ctrl+,** instellingen
- **?** of **F1** deze handleiding · **Esc** sluit vensters`
  },
  {
    id:'whats-new', icon:'star', context:['whats-new'],
    title:{ en:"What's new", nl:'Wat is er nieuw' },
    en:'', nl:''   // filled from CHANGES below
  }
];

// Release notes per version, newest first. `npm run manual` turns this into CHANGELOG.md and the
// same text is used as the GitHub release body. Keep entries short: one line per change.
export const CHANGES = [
  {
    version:'0.3.0', date:'unreleased',
    en:[
      'Demo show on the welcome screen: a complete festival show with racks, loose devices, network plan and PDF layout to explore.',
      'Tours to choose from: the full tour, or one about LK blocks, nodes & network, racks, or the PDF layout.',
      'Progress bar bottom-left with a checklist of what is still missing in the show; every item jumps to the right place.',
      'Standard device library with Luminex (LumiNode, GigaCore, LumiSplit) and ELC (dmXLAN nodes, switchGBx, DT splitters) types, standard panels and ready-made racks; Settings → Device library checks GitHub for a newer library, separately from app updates.',
      'Help: a manual inside the app (Help button, ? or F1) that opens on the chapter of the page you are on; also on GitHub as docs/USER_MANUAL.md.',
      'Request button: send a feature request, bug or question as a GitHub issue, with app version and page added automatically.',
      'Longer tour that also covers the DimCity page, racks, search, help and requests — in English and Dutch.',
      'Loose devices per DimCity: nodes and LK / VIM4 spiders without a rack; a spider can be pinned to a loose node.',
      'Every node shows which LK / Veam port (and location) is on each node port, in the app and on the PDF.',
      'PDF: racks are drawn as in the app (rails, U numbers, device faces, patched ports) with print-safe lines; node port list and loose devices; preset "Racks only" and a Print racks button.',
      'Report Builder: sections can be placed at a fixed X / Y position and width, or dragged in the preview on a 5 mm grid; line weight setting (light / normal / bold), default darker than before.',
      'Delete LK and Delete Veam, also for rows that came from a CSV; undo brings them back.',
      'Racks can be 1U; racks have an article key; node types have 1 or 2 Ethernet ports.'
    ],
    nl:[
      'Demo-show op het welkomstscherm: een complete festivalshow met racks, losse apparaten, netwerkplan en PDF-indeling om te verkennen.',
      'Rondleidingen om uit te kiezen: de volledige, of één over LK-blokken, nodes & netwerk, racks, of de PDF-opmaak.',
      'Voortgangsbalk linksonder met een checklist van wat er nog ontbreekt in de show; elk punt springt naar de juiste plek.',
      'Standaard devicebibliotheek met Luminex- (LumiNode, GigaCore, LumiSplit) en ELC-types (dmXLAN-nodes, switchGBx, DT-splitters), standaardpanelen en kant-en-klare racks; Instellingen → Devicebibliotheek controleert GitHub op een nieuwere bibliotheek, los van app-updates.',
      'Help: een handleiding in de app (Help-knop, ? of F1) die opent op het hoofdstuk van de pagina waar je bent; ook op GitHub als docs/USER_MANUAL.md.',
      'Request-knop: stuur een wens, fout of vraag als GitHub-issue, met app-versie en pagina automatisch erbij.',
      'Langere rondleiding die ook de DimCity-pagina, racks, zoeken, help en requests behandelt — in het Engels en Nederlands.',
      'Losse apparaten per DimCity: nodes en LK- / VIM4-spinnen zonder rek; een spin kan aan een losse node gehangen worden.',
      'Elke node toont welke LK- / Veam-poort (en locatie) op welke nodepoort zit, in de app en op de PDF.',
      'PDF: racks worden getekend zoals in de app (rails, U-nummers, device-faces, gepatchte poorten) met printvaste lijnen; nodepoortenlijst en losse apparaten; voorinstelling "Alleen racks" en een knop Racks printen.',
      'Rapportbouwer: secties kunnen op een vaste X- / Y-positie en breedte gezet worden, of in het voorbeeld gesleept op een raster van 5 mm; instelling lijndikte (licht / normaal / dik), standaard donkerder dan voorheen.',
      'LK verwijderen en Veam verwijderen, ook voor regels uit een CSV; ongedaan maken zet ze terug.',
      'Racks kunnen 1U zijn; racks hebben een artikelsleutel; nodetypes hebben 1 of 2 Ethernet-poorten.'
    ]
  },
  {
    version:'0.2.0', date:'2026-10-02',
    en:[
      'Update check via GitHub Releases, with download and install from the app.',
      'Light theme and a Dutch interface (Settings → Language).',
      'Racks per DimCity with automatic LK7-1 / VIM4 patching, node colours, recommendations and "Use as network plan".',
      'Search everything with Cmd/Ctrl+K.',
      'Undo / redo with a readable history, fixable validation issues, autosave, backups and crash recovery.',
      'Report Builder: company brand tab with logo and watermark, movable cover image.',
      'Device Builder with nodes, splitters, switches, panels and racks; personal device library shared between shows.'
    ],
    nl:[
      'Updatecontrole via GitHub Releases, met downloaden en installeren vanuit de app.',
      'Licht thema en een Nederlandse interface (Instellingen → Taal).',
      'Racks per DimCity met automatische LK7-1- / VIM4-patching, nodekleuren, adviezen en "Gebruik als netwerkplan".',
      'Overal zoeken met Cmd/Ctrl+K.',
      'Ongedaan maken / opnieuw met leesbare geschiedenis, oplosbare validatiemeldingen, automatisch opslaan, back-ups en crashherstel.',
      'Rapportbouwer: tabblad huisstijl met logo en watermerk, verplaatsbare voorbladafbeelding.',
      'Device Builder met nodes, splitters, switches, panelen en racks; persoonlijke devicebibliotheek gedeeld tussen shows.'
    ]
  },
  {
    version:'0.1.0', date:'2026-10-01',
    en:['First release: CSV import, LK / Veam / DMX validation per DimCity, Veam links, block types, network planner, PDF report builder with templates.'],
    nl:['Eerste release: CSV-import, LK- / Veam- / DMX-validatie per DimCity, Veam-koppelingen, bloktypes, netwerkplanner, PDF-rapportbouwer met templates.']
  }
];

// "What's new" chapter text from CHANGES
function changesBody(lang){
  return CHANGES.map(c => `## ${lang === 'nl' ? 'Versie' : 'Version'} ${c.version}${c.date === 'unreleased' ? (lang === 'nl' ? ' (nog niet uitgebracht)' : ' (unreleased)') : ` — ${c.date}`}\n${c[lang].map(l => `- ${l}`).join('\n')}`).join('\n\n');
}
const wn = CHAPTERS.find(c => c.id === 'whats-new');
wn.en = changesBody('en'); wn.nl = changesBody('nl');

// ---- Mini-markdown → HTML (used by the Help panel) ----
export function inline(s, esc, link){
  let out = esc(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/\[\[([a-z0-9-]+)\|(.+?)\]\]/g, (m, id, label) => link ? link(id, label) : label);
  return out;
}
export function toHtml(body, { esc, link } = {}){
  esc = esc || (s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])));
  const lines = String(body || '').split('\n');
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if(para.length){ out.push(`<p>${inline(para.join(' '), esc, link)}</p>`); para = []; } };
  const flushList = () => { if(list){ out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i, esc, link)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for(const raw of lines){
    const line = raw.trim();
    if(!line){ flushPara(); flushList(); continue; }
    const h = line.match(/^##\s+(.+)$/);
    if(h){ flushPara(); flushList(); out.push(`<h4>${inline(h[1], esc, link)}</h4>`); continue; }
    const ul = line.match(/^-\s+(.+)$/), ol = line.match(/^\d+\.\s+(.+)$/);
    if(ul || ol){
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if(!list || list.tag !== tag){ flushList(); list = { tag, items:[] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

// Find the chapter for a context key such as "DIM:racks" (falls back to "DIM", then the first chapter)
export function chapterFor(context){
  const keys = [];
  if(context){ keys.push(context); const i = context.indexOf(':'); if(i > 0) keys.push(context.slice(0, i)); }
  for(const k of keys){ const c = CHAPTERS.find(ch => ch.context.includes(k)); if(c) return c; }
  return CHAPTERS[0];
}

if(typeof window !== 'undefined') window.Manual = { CHAPTERS, CHANGES, toHtml, chapterFor };
