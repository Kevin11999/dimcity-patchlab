<!-- Generated from core/manual.js by scripts/build-manual.mjs — do not edit by hand, run `npm run manual`. -->

# Changelog

All notable changes to DimCity PatchLab. The entry of a version is also the text of its GitHub release.

## 0.9.1 — 2026-10-04

- Videos brought up to date with the new workflow: the series Build a show now has ten parts (new: "9 · Align the devices and send the configuration" and "10 · The PDF and the stickers"), the Network config video shows the current page (V L A N brush, All settings, send to other devices), and the Tasks and Setup video talks about the ten steps.

<details><summary>Nederlands</summary>

- Video’s bijgewerkt voor de nieuwe werkwijze: de serie Een show bouwen heeft nu tien delen (nieuw: "9 · De apparaten uitlijnen en de configuratie sturen" en "10 · De PDF en de stickers"), de video Netwerkconfig toont de huidige pagina (VLAN-kwast, Alle instellingen, naar andere apparaten sturen) en de video Taken en Setup gaat over de tien stappen.

</details>

## 0.9.0 — 2026-10-04

- New: the Align tool. It finds every GigaCore and LumiNode, makes them blink one by one (the identify call of the devices), you press which place in the plan it is ("DB3-SW1") and the next one blinks. Then "Fill in from the plan" and "Send config" put names, IP addresses, VLANs and universes on all devices at once, with every change listed first. Network Config stays as it is.
- The Setup steps are clearer and in a better order: first the plan on paper (import, racks, sockets, nodes, switches, fibres, check), then the real devices (find and align, send the configuration), then print and share. Every step now says in three lines what it is, what you do and what comes next.
- Sending the configuration to the devices is one of the last steps, as it should be; the PDF, stickers and exchange moved to their own last step.

<details><summary>Nederlands</summary>

- Nieuw: de Uitlijntool. Hij vindt elke GigaCore en LumiNode, laat ze één voor één knipperen (de identify-aanroep van de apparaten), jij drukt welke plek in het plan het is ("DB3-SW1") en de volgende knippert. Daarna zetten "Invullen uit het plan" en "Config sturen" namen, IP-adressen, VLAN’s en universes in één keer op alle apparaten, met eerst een lijst van elke wijziging. Netwerkconfig blijft zoals het was.
- De Setup-stappen zijn duidelijker en in een betere volgorde: eerst het plan op papier (import, racks, aansluitingen, nodes, switches, fibers, controle), dan de echte apparaten (zoeken en uitlijnen, configuratie sturen), dan printen en delen. Elke stap zegt nu in drie regels wat het is, wat je doet en wat daarna komt.
- De configuratie naar de apparaten sturen is een van de laatste stappen, zoals het hoort; de PDF, stickers en uitwisseling staan in hun eigen laatste stap.

</details>

## 0.8.0 — 2026-10-04

- New: "All settings" on every GigaCore and LumiNode card in Network Config. It lists every setting the newest Luminex API files (GigaCore WebApi 1.5, LumiNode WebApi 2.9) allow to change, grouped in sections (Ports, PoE, VLAN groups, IGMP, SNMP, PTP, DHCP server, display, DMX, protocols, LEDs …) with a search box, the right control per setting (switch, list, number with limits) and a table per port / group / output.
- Per column an "all" button sets the same value on every row. Changes stay pending (marked) until you press Apply; risky or device-specific settings are marked.
- Send to other devices: copy your pending changes, or whole sections of one device, to any number of devices of the same kind at once (only where they differ; names, addresses and risky settings only when you tick them). It prepares the changes; Apply all sends them and every device is read back.
- Not in this editor: LumiNode network address, process-block wiring beyond the existing port editor, software upload, profiles and reboot / reset actions. Tested against simulated devices; check on a real device first.

<details><summary>Nederlands</summary>

- Nieuw: "Alle instellingen" op elke GigaCore- en LumiNode-kaart in Netwerkconfig. Het toont elke instelling die de nieuwste Luminex API-bestanden (GigaCore WebApi 1.5, LumiNode WebApi 2.9) laten veranderen, in onderdelen (Poorten, PoE, VLAN-groepen, IGMP, SNMP, PTP, DHCP-server, display, DMX, protocollen, LED's …) met zoekbalk, de juiste bediening per instelling (schakelaar, lijst, getal met grenzen) en een tabel per poort / groep / uitgang.
- Per kolom zet een "alle"-knop dezelfde waarde op elke rij. Wijzigingen blijven klaar staan (gemarkeerd) tot je op Toepassen drukt; risicovolle of apparaatspecifieke instellingen zijn gemarkeerd.
- Naar andere apparaten sturen: kopieer je klaargezette wijzigingen, of hele onderdelen van één apparaat, in één keer naar zoveel apparaten van hetzelfde soort als je wilt (alleen waar ze verschillen; namen, adressen en risicovolle instellingen alleen als je die aanvinkt). Dit zet de wijzigingen klaar; Alles toepassen stuurt ze en elk apparaat wordt teruggelezen.
- Niet in deze editor: netwerkadres van de LumiNode, process-block-koppelingen buiten de bestaande poort-editor, software-upload, profielen en herstart-/reset-acties. Getest met gesimuleerde apparaten; controleer eerst op een echt apparaat.

</details>

## 0.7.4 — 2026-10-04

- Trunk fixed after looking at a real GigaCore 20t: its built-in trunk (ISL) only carries the built-in VLAN groups, so a VLAN group made from the plan (like 1090) was missing on the fibre. PatchLab now adds the groups of the plan to that trunk, leaves its untagged VLAN alone, checks afterwards that the trunk really carries every VLAN, and otherwise uses a trunk of its own.
- The lights: the port lights follow the group colours only in the "groups" front-panel state, so the rainbow switches to it and back, and there are buttons Ports show group colours and Lights off.
- The link of a port is shown green unless it is down.

<details><summary>Nederlands</summary>

- Trunk gerepareerd na het bekijken van een echte GigaCore 20t: zijn ingebouwde trunk (ISL) bevat alleen de ingebouwde VLAN-groepen, dus een VLAN-groep uit het plan (zoals 1090) ontbrak op de fibre. PatchLab voegt de groepen uit het plan nu aan die trunk toe, laat de untagged VLAN ervan met rust, controleert achteraf dat de trunk echt elke VLAN draagt en gebruikt anders een eigen trunk.
- De lampjes: de poortlampjes volgen de groepskleuren alleen in de voorpaneelstand "groups", dus de regenboog zet het daarop en weer terug, en er zijn knoppen Poorten tonen groepskleuren en Lampjes uit.
- De link van een poort is groen tenzij hij down is.

</details>

## 0.7.3 — 2026-10-04

- Trunk checked after every change: when the switch answers ok to "assign ports to a trunk" but a port is not in the trunk, PatchLab tries the other documented way (port by port), logs what the switch reports for each port and tells you if it still did not work.
- Rainbow flow for the switch lights: the rainbow runs along the groups like a wave for a few seconds (stop any time), then the old colours come back. Ports follow the colour of their group, so a single port cannot get its own colour without moving to another group.

<details><summary>Nederlands</summary>

- Trunk na elke wijziging gecontroleerd: zegt de switch ok op "poorten aan een trunk toewijzen" maar zit een poort niet in de trunk, dan probeert PatchLab de andere gedocumenteerde manier (poort voor poort), logt wat de switch per poort meldt en zegt het als het nog steeds niet lukte.
- Regenboogstroom voor de lampjes van de switch: de regenboog loopt een paar seconden als een golf langs de groepen (stoppen kan altijd) en daarna komen de oude kleuren terug. Poorten volgen de kleur van hun groep, dus een losse poort kan geen eigen kleur krijgen zonder naar een andere groep te verhuizen.

</details>

## 0.7.2 — 2026-10-04

- Trunk reworked: fibre ports now go into the switch's own built-in trunk (which carries every VLAN) instead of a trunk of ours, so it behaves like a trunk made on the switch itself. The trunk is shown in words under the ports (ports, VLANs, untagged VLAN, changeable), the page recognises whether a switch lists group numbers or VLAN ids, warns about advanced mode (with a button to go to Luminex mode), and shows what the switch itself says per port.
- Every call to a switch is logged: under Last calls to this device you see (and can copy) each call and the answer, so a refusal by the switch can be seen at once.
- Rainbow for the switch lights: a Rainbow show runs the front-panel colours red → magenta and goes back, and Rainbow colours on the groups gives every group in use its own colour from left to right (with Colours back). The port lights follow the colour of their group; a single port cannot get a colour of its own.

<details><summary>Nederlands</summary>

- Trunk herzien: fibre-poorten gaan nu in de ingebouwde trunk van de switch zelf (die elke VLAN voert) in plaats van een trunk van ons, zodat het zich gedraagt als een trunk die op de switch zelf is gemaakt. De trunk wordt onder de poorten in woorden getoond (poorten, VLAN's, untagged VLAN, aanpasbaar), de pagina herkent of een switch groepsnummers of VLAN-id's opsomt, waarschuwt voor advanced-modus (met een knop naar Luminex-modus) en toont per poort wat de switch zelf zegt.
- Elke aanroep naar een switch wordt bijgehouden: onder Laatste aanroepen naar dit apparaat zie je (en kopieer je) elke aanroep en het antwoord, zodat een weigering door de switch meteen zichtbaar is.
- Regenboog voor de lampjes van de switch: een Regenboogshow laat de kleuren van het voorpaneel van rood → magenta lopen en gaat terug, en Regenboogkleuren op de groepen geeft elke gebruikte groep een eigen kleur van links naar rechts (met Kleuren terug). De poortlampjes volgen de kleur van hun groep; een losse poort kan geen eigen kleur krijgen.

</details>

## 0.7.1 — 2026-10-04

- Trunk fixed: fibre ports are now put in the trunk with the switch's own "assign ports to a trunk" call (instead of a plain group membership), the trunk carries all VLANs of the plan with the management VLAN untagged, and the switch is read back to check.
- Nothing is cut off any more: port tiles are bigger, names wrap over two lines, and show direction, protocol and VLAN / universe clearly.
- LumiNode, everything per port: name, direction (output / input / off), protocol (sACN or Art-Net) and universe, by brush or per port. Art-Net universe 10 is now sent as 10 and the node shows 10 (the shift by one is only used if you choose it). Changing the direction or protocol builds the new input / output and connects it through the process block, with every step in the preview.
- E-ink display of the GigaCore 20t: show your own text or a picture (JPG, PNG …, scaled to the display, black and white, dithered), send it first as a preview, then show it; back to the standard layout, hide the IP address, show the QR code.

<details><summary>Nederlands</summary>

- Trunk gerepareerd: fibre-poorten gaan nu in de trunk met de eigen aanroep van de switch "poorten aan een trunk toewijzen" (in plaats van een gewoon groepslidmaatschap), de trunk voert alle VLAN's van het plan met het beheer-VLAN untagged, en de switch wordt teruggelezen ter controle.
- Niets wordt meer afgekapt: poorttegels zijn groter, namen lopen over twee regels en tonen richting, protocol en VLAN / universe duidelijk.
- LumiNode, alles per poort: naam, richting (uitgang / ingang / uit), protocol (sACN of Art-Net) en universe, met de kwast of per poort. Art-Net-universe 10 wordt nu als 10 gestuurd en de node toont 10 (de verschuiving met één wordt alleen gebruikt als je die kiest). Een richting of protocol veranderen bouwt de nieuwe ingang / uitgang en koppelt die via het process block, met elke stap in het voorbeeld.
- E-ink-display van de GigaCore 20t: toon je eigen tekst of een afbeelding (JPG, PNG …, geschaald naar de display, zwart-wit, gedithered), stuur het eerst als voorbeeld en toon het dan; terug naar de standaardweergave, IP-adres verbergen, QR-code tonen.

</details>

## 0.7.0 — 2026-10-04

- New page Network Config: all your LumiNodes and GigaCore switches on one page. Discover finds them at once over the web API (the whole network of this computer, or a range you type), links each to a switch or node of the plan and reads it.
- Switches fold open into their ports. Pick a VLAN and click or drag over ports to give them that VLAN, like in Araneo; click a port for its name, PoE and speed; fibre ports go into the Fibre trunk. A VLAN of the plan the switch does not have yet is made for you.
- LumiNodes fold open into their DMX ports: pick a universe and click ports (the next click can give the next universe), and name the ports. New inputs are sACN. Everything is sent after a preview of every call, per device or all at once, and read back to check.
- The devices are called LumiNode and GigaCore, no longer Art-Net node; recognition and writing follow how the nodes really answer (software version call, IO 100000 = port 1, the whole IO sent back with rdm_universe, the output connected to its process block). The old dialog Devices on the network is replaced by this page.

<details><summary>Nederlands</summary>

- Nieuwe pagina Netwerkconfig: al je LumiNodes en GigaCore-switches op één pagina. Ontdekken vindt ze in één keer via de web-API (het hele netwerk van deze computer, of een bereik dat je typt), koppelt elk aan een switch of node uit het plan en leest hem uit.
- Switches klappen open tot hun poorten. Kies een VLAN en klik of sleep over poorten om ze dat VLAN te geven, zoals in Araneo; klik op een poort voor naam, PoE en snelheid; fibre-poorten gaan in de trunk Fibre. Een VLAN uit het plan dat de switch nog niet heeft wordt voor je aangemaakt.
- LumiNodes klappen open tot hun DMX-poorten: kies een universe en klik op poorten (de volgende klik kan het volgende universe geven) en geef de poorten een naam. Nieuwe ingangen zijn sACN. Alles wordt gestuurd na een voorbeeld van elke aanroep, per apparaat of allemaal tegelijk, en teruggelezen ter controle.
- De apparaten heten LumiNode en GigaCore, niet meer Art-Net-node; herkennen en schrijven volgen hoe de nodes echt antwoorden (aanroep van de softwareversie, IO 100000 = poort 1, de hele IO teruggestuurd met rdm_universe, de uitgang aan zijn process block gekoppeld). Het oude venster Apparaten op het netwerk is vervangen door deze pagina.

</details>

## 0.6.2 — 2026-10-04

- Discover: one overview of all Luminex switches and nodes on the network (scan of the networks of this computer or a range you type, plus Art-Net nodes), each linked to a switch or node of the plan automatically on IP address and then on name, with a button to open it.
- GigaCore switches, port by port: the button Ports… on a switch opens a table where you set for every port its name, its VLAN / group (a VLAN of the plan the switch does not have yet is made for you), PoE on or off and the speed. Changed rows are shaded, only the changed ports are sent, and the switch is read back to check.

<details><summary>Nederlands</summary>

- Ontdekken: één overzicht van alle Luminex-switches en -nodes op het netwerk (scan van de netwerken van deze computer of een bereik dat je typt, plus Art-Net-nodes), elk automatisch gekoppeld aan een switch of node uit het plan op IP-adres en daarna op naam, met een knop om hem te openen.
- GigaCore-switches, poort voor poort: de knop Poorten… bij een switch opent een tabel waarin je per poort de naam, het VLAN / de groep (een VLAN uit het plan dat de switch nog niet heeft wordt voor je aangemaakt), PoE aan of uit en de snelheid instelt. Gewijzigde rijen zijn gearceerd, alleen de gewijzigde poorten worden gestuurd en de switch wordt teruggelezen ter controle.

</details>

## 0.6.1 — 2026-10-04

- Luminex GigaCore (generation 2) switches over their web API: read the switch, compare it with the plan and send it — a group per VLAN with name and colour, every port in the group of its device and named after it, the fibre ports in a "Fibre" trunk with the management VLAN untagged, the device name and (if ticked) the IP address. You see every call before it is made, and the switch is read again afterwards to check.
- LumiNode / LumiCore over their web API: name, IP address and the universe of every DMX output (followed through its process block), also for nodes that do not answer Art-Net polls. Outputs with a shared or unknown set-up are left alone and explained.
- The network dialog gets the tabs LumiNode (HTTP) and Switches with user name, password and https, an address field for devices that still have another address, and an optional profile slot to save a switch configuration.

<details><summary>Nederlands</summary>

- Luminex GigaCore-switches (generatie 2) via hun web-API: lees de switch uit, vergelijk met het plan en stuur — een groep per VLAN met naam en kleur, elke poort in de groep van zijn apparaat en ernaar genoemd, de fibre-poorten in een trunk "Fibre" met het beheer-VLAN untagged, de apparaatnaam en (als aangevinkt) het IP-adres. Je ziet elke aanroep voordat hij gedaan wordt en de switch wordt daarna opnieuw uitgelezen ter controle.
- LumiNode / LumiCore via hun web-API: naam, IP-adres en het universe van elke DMX-uitgang (gevolgd via zijn process block), ook voor nodes die niet op Art-Net-polls antwoorden. Uitgangen met een gedeelde of onbekende opzet blijven ongemoeid en worden uitgelegd.
- Het netwerkvenster krijgt de tabbladen LumiNode (HTTP) en Switches met gebruikersnaam, wachtwoord en https, een adresveld voor apparaten die nog een ander adres hebben en een optioneel profielslot om een switchconfiguratie te bewaren.

</details>

## 0.6.0 — 2026-10-04

- New Tasks page: the next thing to do with a button that takes you there, the whole workflow as one line, a square for every DB and every step (click to go there), and the show checks. A short next-step bar sits on the Overview too.
- New card At a glance on every DimCity page: LK blocks and Veams with their socket and node, racks with their devices, nodes and splitters, and the network switches with addresses and fibres. Switches you add on the Network page show up there at once.
- QR codes with everything: a QR per DB and for the whole system holds sockets, nodes with IP, racks, switches and fibres as plain text, in numbered parts. Large view with copy / save as SVG, new sticker kinds (DB info QR, System QR) and a QR codes section in the PDF.
- Exchange with Lightwright and Vectorworks, both ways: export the patch (Circuit Name, Position, Universe) as a tab / CSV file, and import the file back — PatchLab matches on the circuit name, shows what differs and applies only what you tick.
- Devices on the network: scan for Art-Net nodes, match each with a node of the plan (IP, name, MAC), see what differs and send names and port universes (and, if you tick it, the IP address) after a preview; PatchLab scans again to check the result. Switches: reachability check and a configuration sheet. A simulated network is used outside the desktop app.
- Short names: every device type has a short name (automatic when empty, Fill short names for the existing ones) used in racks, the Signal Flow, the PDF and overviews, so long names are no longer cut off.
- Racks are zones: LK and Veam cables are short, so an LK or Veam only feeds nodes in the same rack; racks that stand on each other can be marked stacked. PatchLab warns when a rack has no node port of its own and offers a Fix button. A loose node now comes with an LK spider. Custom rack builds a rack of your own from the DimCity card or Setup.
- Signal Flow: the fibre overview moves a dragged switch live with its cables, and the Show switch no longer cuts off Fibres. Fixed the window overflowing sideways between 1380 and 1500 px. DBs without a number (FOH) get their own address number instead of sharing DB01's.
- New video library in full HD without text in the picture (subtitles via the CC button): the series Build a show, step by step (9 parts, starting from an empty project and the real CSV import) and 15 Tool guides.

<details><summary>Nederlands</summary>

- Nieuwe pagina Taken: het volgende dat je moet doen met een knop die je erheen brengt, de hele werkwijze als één lijn, een vakje voor elke DB en elke stap (klik om erheen te gaan) en de controles van de show. Op het Overzicht staat ook een korte balk met de volgende stap.
- Nieuwe kaart In één oogopslag op elke DimCity-pagina: LK-blokken en Veams met aansluiting en node, racks met hun apparaten, nodes en splitters, en de netwerkswitches met adressen en fibers. Switches die je op de Netwerk-pagina toevoegt staan er meteen.
- QR-codes met alles: een QR per DB en voor het hele systeem bevat aansluitingen, nodes met IP, racks, switches en fibers als platte tekst, in genummerde delen. Groot beeld met kopiëren / opslaan als SVG, nieuwe stickersoorten (DB-info QR, Systeem-QR) en een sectie QR-codes in de PDF.
- Uitwisselen met Lightwright en Vectorworks, beide kanten op: exporteer de patch (Circuit Name, Position, Universe) als tab- / CSV-bestand en importeer het bestand terug — PatchLab matcht op de circuit name, toont wat verschilt en past alleen toe wat je aanvinkt.
- Apparaten op het netwerk: scan op Art-Net-nodes, koppel elke aan een node uit het plan (IP, naam, MAC), zie wat verschilt en stuur namen en poortuniverses (en, als je het aanvinkt, het IP-adres) na een voorbeeld; PatchLab scant opnieuw om het resultaat te controleren. Switches: bereikbaarheidscontrole en een configuratieblad. Buiten de desktop-app wordt een gesimuleerd netwerk gebruikt.
- Korte namen: elk devicetype heeft een korte naam (automatisch als hij leeg is, Korte namen invullen voor de bestaande) die in racks, de Signaalstroom, de PDF en overzichten wordt gebruikt, zodat lange namen niet meer worden afgekapt.
- Rekken zijn zones: LK- en Veam-kabels zijn kort, dus een LK of Veam voedt alleen nodes in hetzelfde rek; rekken die op elkaar staan kun je als gestapeld markeren. PatchLab waarschuwt als een rek geen eigen nodepoort heeft en biedt een Oplossen-knop. Een losse node krijgt nu een LK-spin erbij. Eigen rek bouwt een eigen rek vanuit de DimCity-kaart of Setup.
- Signaalstroom: het fiberoverzicht verplaatst een gesleepte switch live met zijn kabels, en de Tonen-schakelaar kapt Fibers niet meer af. Het venster liep tussen 1380 en 1500 px opzij over de rand; dat is opgelost. DB's zonder nummer (FOH) krijgen een eigen adresnummer in plaats van dat van DB01 te delen.
- Nieuwe videobibliotheek in full HD zonder tekst in beeld (ondertitels via de CC-knop): de reeks Bouw een show, stap voor stap (9 delen, vanaf een leeg project en de echte CSV-import) en 15 Tool-uitleggen.

</details>

## 0.5.2 — 2026-10-08

- Fibre overview: a switch you drag now moves live and its cables follow while you drag, not only after you let go.
- Racks are zones: LK and Veam cables are short, so an LK or Veam on a rack socket only feeds nodes in the same rack. Racks that stand directly on top of each other can be marked "stacked on the rack above" (DimCity card and Setup) and then count as one. Between racks only network cables run. The patch warns when a rack has no free node port of its own.
- A node without a rack now comes with an LK spider automatically, and the check warns when a loose node has no LK or Veam spider.
- Custom rack: build a rack of your own straight from the DimCity card or from Setup — pick how many panels, nodes, splitters and switches, PatchLab places them. No article key needed (you can still add one in the Rack Builder).
- Short names: every device type in the Device Builder has a Short name (made automatically when empty; the button Fill short names writes them into all your current devices so you can adjust them). Racks, the Signal Flow, the PDF and the new overview use the short name, so long names are no longer cut off.
- New "At a glance" card at the top of every DimCity: the LK blocks and Veams with their socket and node, the racks with their devices, the nodes and splitters, and the network switches with their fibres — in one view. Switches you add on the Network page show up here.
- Signal Flow: the Show switch no longer cuts off "Fibres".

<details><summary>Nederlands</summary>

- Fiberoverzicht: een switch die je sleept beweegt nu live mee en de kabels volgen tijdens het slepen, niet pas na loslaten.
- Rekken zijn zones: LK- en Veam-kabels zijn kort, dus een LK of Veam op een rekaansluiting voedt alleen nodes in hetzelfde rek. Rekken die direct op elkaar staan kun je aanvinken als "gestapeld op het rek erboven" (DimCity-kaart en Setup); ze tellen dan als één. Tussen rekken lopen alleen netwerkkabels. De patch waarschuwt als een rek geen eigen vrije nodepoort heeft.
- Een node zonder rek krijgt nu automatisch een LK-spin erbij, en de controle waarschuwt als een losse node geen LK- of Veam-spin heeft.
- Eigen rek: bouw een eigen rek direct vanuit de DimCity-kaart of Setup — kies hoeveel panelen, nodes, splitters en switches, PatchLab plaatst ze. Geen artikelkey nodig (in de Rack Builder kun je die nog wel invullen).
- Korte namen: elk devicetype in de Device Builder heeft een Korte naam (automatisch gemaakt als hij leeg is; de knop Korte namen invullen zet ze in al je huidige devices zodat je ze kunt aanpassen). Racks, de Signaalstroom, de PDF en het nieuwe overzicht gebruiken de korte naam, dus lange namen worden niet meer afgekapt.
- Nieuwe kaart "In één oogopslag" bovenaan elke DimCity: de LK-blokken en Veams met hun aansluiting en node, de racks met hun devices, de nodes en splitters, en de netwerkswitches met hun fibers — in één overzicht. Switches die je op de Netwerk-pagina toevoegt staan er direct in.
- Signaalstroom: de Tonen-schakelaar kapt "Fibers" niet meer af.

</details>

## 0.5.1 — 2026-10-07

- New video tutorials with a spoken explanation (female English voice) and subtitles, in 720p: the whole workflow from the imported patch to the printed show in nine parts — Start, Racks and the advice, Couple LKs and Veams, Nodes, Network, Fibres, Signal Flow, the PDF and Stickers. Help > Video Tutorials plays them one after the other or one by one.
- The advice (best setup) now also shows on a DimCity that has no rack yet; before, it was hidden exactly then.

<details><summary>Nederlands</summary>

- Nieuwe video-uitleg met gesproken uitleg (Engelse vrouwenstem) en ondertiteling, in 720p: de hele workflow van de geïmporteerde patch tot de geprinte show in negen delen — Start, Racks en het advies, LK's en Veams koppelen, Nodes, Netwerk, Fibers, Signaalstroom, de PDF en Stickers. Help > Video-uitleg speelt ze achter elkaar of een voor een af.
- Het advies (beste setup) staat nu ook op een DimCity zonder rek; eerder was het juist dan verborgen.

</details>

## 0.5.0 — 2026-10-06

- VLANs: the VLAN list is now its own card on the Network page (tab VLAN & addresses) and is always there, also when the FENT scheme is off. Rename any VLAN, change its colour, reset it to the standard, or add your own VLAN (ID + name). Names and colours show in the port plan, on stickers and in the PDF.
- Background picture: much bigger sizes (up to 2000% on the slider, or type any percentage), a larger move range and a Fit to drawing button; large pictures are kept sharper.
- Advice: best setup per DimCity (Racks card and Setup). From the LKs, Veams, lines and universes it works out the block mode per LK, the LK / Veam4 panels (or loose spiders when a few Veams do not justify a panel), the nodes, whether a splitter saves space, and the rack size — using only the types in your Device Builder, with the reason for each choice. One button applies it as a rack made for the DimCity.
- Couple LKs and Veams: a table per DimCity shows where every LK and Veam sits and lets you choose a socket yourself, a loose spider, or Do not patch; the rest stays automatic. Everything automatic again with one button. Also in Setup.
- Setup follows the work now: Import → Racks and devices (with the advice) → Couple LKs and Veams → Nodes (nodes from the racks + CSV names) → Network → Fibres → Check.
- A Veam that sits on a Veam4 socket of a rack (or a loose Veam4 spider) is no longer shown as "Not linked": the Veam page, the sidebar, the overview counts and the DimCity page now count it as patched and say on which socket it sits.

<details><summary>Nederlands</summary>

- VLAN's: de VLAN-lijst is nu een eigen kaart op de pagina Netwerk (tab VLAN & adressen) en is er altijd, ook als het FENT-schema uit staat. Hernoem elk VLAN, wijzig de kleur, zet terug naar de standaard, of voeg je eigen VLAN toe (ID + naam). Namen en kleuren staan in het poortplan, op stickers en in de PDF.
- Achtergrondafbeelding: veel grotere formaten (tot 2000% op de schuif, of typ elk percentage), een groter verschuifbereik en een knop Aan tekening aanpassen; grote afbeeldingen blijven scherper.
- Advies: beste setup per DimCity (kaart Racks en Setup). Uit de LK's, Veams, lijnen en universes rekent het uit: de blokmodus per LK, de LK-/Veam4-panelen (of losse spinnen als een paar Veams geen paneel rechtvaardigen), de nodes, of een splitter ruimte bespaart, en de rekgrootte — met alleen de types uit je Device Builder en de reden bij elke keuze. Eén knop past het toe als een rek dat voor de DimCity is gemaakt.
- LK's en Veams koppelen: een tabel per DimCity laat zien waar elke LK en Veam zit en laat je zelf een aansluiting kiezen, een losse spin, of Niet patchen; de rest blijft automatisch. Met één knop weer alles automatisch. Ook in Setup.
- Setup volgt nu het werk: Importeren → Racks en apparaten (met het advies) → LK's en Veams koppelen → Nodes (nodes uit de racks + CSV-namen) → Netwerk → Fibers → Controle.
- Een Veam die op een Veam4-aansluiting van een rek (of een losse Veam4-spin) zit wordt niet meer als "Niet gekoppeld" getoond: de Veam-pagina, de zijbalk, de tellingen in het overzicht en de DimCity-pagina tellen hem nu als gepatcht mee en zeggen op welke aansluiting hij zit.

</details>

## 0.4.3 — 2026-10-05

- Background picture in the Signal Flow (floor plan, stage plot …): choose a picture, set opacity, size and position. It can be one picture for every view or its own picture for Everything, DMX, Network and Fibres (switch: Same picture on every view). It zooms and pans with the drawing, is saved with the project and is also in the saved image and the PDF.
- VLAN names can be changed: on the Network page, tab VLAN & addresses, type a new name in the VLAN table (empty = standard name). The new name is used everywhere (port plan, stickers, PDF).

<details><summary>Nederlands</summary>

- Achtergrondafbeelding in de Signaalstroom (plattegrond, stageplot …): kies een afbeelding en stel doorzichtigheid, grootte en positie in. Het kan één afbeelding voor elke weergave zijn of een eigen afbeelding voor Alles, DMX, Netwerk en Fibers (schakelaar: Zelfde afbeelding op elke weergave). Hij zoomt en schuift mee met de tekening, wordt met het project opgeslagen en staat ook in de opgeslagen afbeelding en de PDF.
- VLAN-namen kun je aanpassen: op de pagina Netwerk, tab VLAN & adressen, typ een nieuwe naam in de VLAN-tabel (leeg = standaardnaam). De nieuwe naam wordt overal gebruikt (poortplan, stickers, PDF).

</details>

## 0.4.2 — 2026-10-05

- Add a location anywhere: the + next to DimCities in the sidebar now has Add DB (next number), Add FOH (front of house) and Add location with a name; the Network page has + DB and + FOH next to the DimCity chips (as Setup already had).
- A switch that sits in a rack can now be removed on the Network page (button Remove from rack); before, only switches added to the DimCity itself had a Remove button.
- Nodes and splitters whose type no longer exists (old files) now show as a red card with a Remove button instead of staying invisible.

<details><summary>Nederlands</summary>

- Een locatie toevoegen kan overal: de + naast DimCities in de zijbalk heeft nu DB toevoegen (volgend nummer), FOH toevoegen (front of house) en Locatie met een naam toevoegen; de pagina Netwerk heeft + DB en + FOH naast de DimCity-chips (zoals Setup al had).
- Een switch die in een rek zit kan nu op de pagina Netwerk worden verwijderd (knop Uit rek halen); eerder hadden alleen switches die aan de DimCity zelf waren toegevoegd een knop Verwijderen.
- Nodes en splitters waarvan het type niet meer bestaat (oude bestanden) verschijnen nu als rode kaart met een knop Verwijderen, in plaats van onzichtbaar te blijven.

</details>

## 0.4.1 — 2026-10-05

- Luminex GigaCore 20t as a built-in 3U set, drawn like the real device (1U with display, knob and rear-port LEDs, etherCON 1-4, and the black panel with etherCON 5-16, opticalCON DUO 17-18 and FiberFox DUO 19-20). It can be placed in racks and chosen as a network switch in Setup; it cannot be changed in the Device Builder.
- Setup > Network per DB: besides a switch you can place a rack that has a switch in it.
- Fibres only fit ports with the same connector: opticalCON on opticalCON, FiberFox on FiberFox, SFP patch on SFP. Drawing, the form and Auto-assign all check it, and ports that do not fit are dimmed.
- Fibre overview: the switches of a location can be dragged to another place (for example side by side), and so can the location cards; the arrangement is saved with the project.
- Fibre overview: cables run in straight lines with right angles, end exactly on their port, and hop over each other with a small bridge where they cross.

<details><summary>Nederlands</summary>

- Luminex GigaCore 20t als ingebouwde 3U-set, getekend zoals het echte apparaat (1U met display, knop en rear-port-LED's, etherCON 1-4, en het zwarte paneel met etherCON 5-16, opticalCON DUO 17-18 en FiberFox DUO 19-20). Hij kan in racks worden geplaatst en in Setup als netwerkswitch worden gekozen; in de Device Builder is hij niet te wijzigen.
- Setup > Netwerk per DB: naast een switch kun je een rek plaatsen waar een switch in zit.
- Fibers passen alleen op poorten met dezelfde connector: opticalCON op opticalCON, FiberFox op FiberFox, SFP-patch op SFP. Tekenen, het formulier en Automatisch koppelen controleren dit, en poorten die niet passen worden gedimd.
- Fiber-overzicht: de switches van een locatie zijn te verslepen naar een andere plek (bijvoorbeeld naast elkaar), en de locatiekaarten ook; de indeling wordt met het project opgeslagen.
- Fiber-overzicht: kabels lopen in rechte lijnen met haakse hoeken, eindigen precies op hun poort en springen met een bruggetje over elkaar waar ze kruisen.

</details>

## 0.4.0 — 2026-10-04

- Fibre overview in the Signal Flow (Show > Fibres): every location on a circle with its switches and fibre ports; draw fibres from port to port with a cable picked from your stock.
- Fibre stock (how many of each cable you own) and **Auto-assign**: switches in one location are chained with the short cable, the locations are linked with the long one (ring or chain), using free ports with the right connector. Cable codes like OC250, FF250 and OC7,5 are used on drawings and labels.
- Luminex GigaCore 20t: 4 etherCON on the front, ports 5-16 on a panel, 17-18 opticalCON DUO and 19-20 FiberFox DUO; switch types now describe their front ports and the connector of every fibre port, and panel types can have etherCON / opticalCON / FiberFox sockets. Standard library: GigaCore 20t panel and a 3U set.
- Half-width devices (LumiNode 4) side by side in one U, with blind plates to fill the rest, in the Rack Builder, the Signal Flow, the DimCity page and the PDF.
- FOH (front of house) and extra DBs can be added in Setup.
- Setup returns to the same step after you close the Rack Builder or Device Builder, and the dropdowns keep your choice.
- DMX lines with a destination like "Node 401.1" are linked to the ports of the node (new Setup step and a dropdown on the node).
- Cable lengths may have half metres (7,5 m).
- The demo show has a FOH, three switches with fibre ports in DB01, a ring of fibres and node names from the CSV.

<details><summary>Nederlands</summary>

- Fiber-overzicht in de Signaalstroom (Tonen > Fibers): elke locatie op een cirkel met zijn switches en fiberpoorten; teken fibers van poort naar poort met een kabel uit je voorraad.
- Fibervoorraad (hoeveel je van elke kabel hebt) en **Automatisch koppelen**: switches in één locatie worden achter elkaar gezet met de korte kabel, de locaties worden verbonden met de lange (ring of ketting), met vrije poorten met de juiste connector. Kabelcodes als OC250, FF250 en OC7,5 staan op tekeningen en labels.
- Luminex GigaCore 20t: 4 etherCON op de voorkant, poort 5-16 op een paneel, 17-18 opticalCON DUO en 19-20 FiberFox DUO; switchtypes beschrijven nu hun voorpoorten en de connector van elke fiberpoort, en paneeltypes kunnen etherCON / opticalCON / FiberFox-aansluitingen hebben. Standaardbibliotheek: GigaCore 20t-paneel en een 3U-set.
- Halve devices (LumiNode 4) naast elkaar in één U, met blindplaten voor de rest, in de Rack Builder, de Signaalstroom, de DimCity-pagina en de PDF.
- FOH (front of house) en extra DB's toevoegen kan in Setup.
- Setup komt terug op dezelfde stap als je de Rack Builder of Device Builder sluit, en de keuzelijsten houden je keuze.
- DMX-regels met een bestemming als "Node 401.1" worden gekoppeld aan de poorten van de node (nieuwe Setup-stap en een keuzelijst op de node).
- Kabellengtes mogen halve meters hebben (7,5 m).
- De demo-show heeft een FOH, drie switches met fiberpoorten in DB01, een ring van fibers en nodenamen uit de CSV.

</details>

## 0.3.3 — 2026-10-04

- New **Network** page (own item in the sidebar): switches and ports, VLAN and addresses, fibres and an overview, per DimCity. The DimCity page only keeps a short summary with a link.
- New **Setup** wizard (toolbar button, also offered after an import): six steps in order — import, network per DB, racks, couple the LKs, fibres, check and output. Each step shows whether it is done, can be skipped, and the whole wizard can be stopped or started over at any time.
- Fibres are coupled on the Network page only; the Signal Flow displays them.
- The demo show now has a network switch per DB with the nodes coupled in order, followed by the Cat cables (C rows) and two fibre links between the DBs.
- Applying a rack as network plan keeps the IP addresses and VLANs you already filled in.
- Video tutorials with subtitles (no sound) in Help: a complete tour and one short video each for Import, Network, Racks, Couple the LKs, Fibres, PDF and Stickers, in Dutch and English (Help > Video Tutorials).
- Compact toolbar on narrower windows (icons only).

<details><summary>Nederlands</summary>

- Nieuwe pagina **Netwerk** (eigen item in de zijbalk): switches en poorten, VLAN en adressen, fibers en een overzicht, per DimCity. De DimCity-pagina houdt alleen een korte samenvatting met een link.
- Nieuwe **Setup**-wizard (knop in de werkbalk, ook aangeboden na een import): zes stappen op volgorde — importeren, netwerk per DB, racks, LK's koppelen, fibers, controle en uitvoer. Elke stap laat zien of hij klaar is, kan worden overgeslagen, en de hele wizard kun je op elk moment stoppen of opnieuw starten.
- Fibers koppel je alleen op de Netwerk-pagina; de Signaalstroom toont ze.
- De demo-show heeft nu per DB een netwerkswitch met de nodes op volgorde gekoppeld, daarna de Cat-kabels (C-regels) en twee fiberverbindingen tussen de DB's.
- Een rack toepassen als netwerkplan behoudt de IP-adressen en VLAN's die je al had ingevuld.
- Video-uitleg met ondertiteling (zonder geluid) in Help: een complete rondleiding en per onderdeel een korte video — Importeren, Netwerk, Racks, LK's koppelen, Fibers, PDF en Stickers — in het Nederlands en Engels (Help > Video-uitleg).
- Compacte werkbalk op smallere vensters (alleen pictogrammen).

</details>

## 0.3.2 — 2026-10-03

- Stickers on Herma A4 label sheets (laser printer): 4680 / 4690 / 4102 / 4112 and 4097 / 4232 / 4221, taken from the HERMA templates, plus custom sheets. Cable labels (both ends), panel connection labels, node ports, racks / nodes / switches / splitters and QR stickers, with company and show images, per DimCity, with a start position for part-used sheets and a calibration sheet.
- Network cables: CSV rows C101 / C101.1 (a Cat loom of 4 lines, VLAN in the third column) for each DB, shown on the DimCity page, in the patch list, the PDF and as stickers.
- Network switches per DimCity (and from the racks): nodes get switch ports in node number order, then the network cables. VLAN numbering like the Luminex GigaCore groups (Management 1, group N = N × 100, with their colours), switchable to the FENT numbers.
- Cables in the Device Builder (opticalCON, FiberFox, 4-core, singlemode, SFP patch) and fibre links between switch SFP ports, also between DBs, with a label on both ends.
- Signal Flow: network layer (switches, Cat cables, fibres) and a Show switch: All / DMX / Network. The PDF can print a network-only drawing too.
- Network: several addresses per device (management, lighting, scan) and the FENT scheme (v1.1) with one-click addressing of all nodes, checks, a VLAN table and a switch port plan with access/trunk and VLAN colours, also in the PDF and as switch port stickers.
- Confetti and "Patch perfect!" when a show goes from having issues to none (Settings > General > Fun switches it off).
- Festival wrapped (Help menu): a shareable card with the numbers of your show; save or copy it as an image.
- Signal Flow: "Share image" copies the drawing as a picture for a chat or e-mail.

<details><summary>Nederlands</summary>

- Stickers op Herma A4-etikettenvellen (laserprinter): 4680 / 4690 / 4102 / 4112 en 4097 / 4232 / 4221, overgenomen uit de HERMA-sjablonen, plus eigen vellen. Kabellabels (beide uiteinden), aansluitlabels paneel, nodepoorten, racks / nodes / switches / splitters en QR-stickers, met bedrijfs- en showafbeelding, per DimCity, met een startpositie voor deels gebruikte vellen en een kalibratieblad.
- Netwerkkabels: CSV-regels C101 / C101.1 (een Cat-loom van 4 lijnen, VLAN in de derde kolom) per DB, te zien op de DimCity-pagina, in de patchlijst, de PDF en als stickers.
- Netwerkswitches per DimCity (en uit de racks): nodes krijgen switchpoorten op volgorde van nodenummer, daarna de netwerkkabels. VLAN-nummering zoals de Luminex GigaCore-groepen (Management 1, groep N = N × 100, met hun kleuren), omschakelbaar naar de FENT-nummers.
- Kabels in de Device Builder (opticalCON, FiberFox, 4-core, singlemode, SFP-patch) en fiberverbindingen tussen SFP-poorten van switches, ook tussen DB's, met een label op beide uiteinden.
- Signaalstroom: netwerklaag (switches, Cat-kabels, fibers) en een schakelaar Tonen: Alles / DMX / Netwerk. De PDF kan ook een tekening met alleen het netwerk printen.
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
