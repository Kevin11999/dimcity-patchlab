// core/i18n.js
// Dutch interface. The app is written in English; when Dutch is chosen, visible text nodes and
// title/placeholder attributes are translated with this dictionary (exact matches, plus rules
// for counts). User data such as LK names and locations is never in the dictionary, so it stays
// as typed. Switching back restores the original English text without a restart.
// PDF reports are not translated (they render in their own document).

const NL = {
  // navigatie + titelbalk
  'Project':'Project', 'Overview':'Overzicht', 'Validation':'Validatie', 'Patch List':'Patchlijst', 'Network Planner':'Netwerkplanner', 'Nodes & Splitters':'Nodes & splitters', 'Network':'Netwerk', 'Network Config':'Netwerkconfig', 'Power':'Stroom', 'Racks & DBs':'Racks & DB’s', 'Nodes & Splitters':'Nodes & splitters', 'Signal Flow':'Signaalstroom',
  'DimCities':'DimCities', 'Search':'Zoeken', 'Import CSV':'CSV importeren', 'Edit Rows':'Regels bewerken', 'Recalculate':'Herberekenen',
  'Save':'Opslaan', 'Export PDF':'PDF exporteren', 'No project':'Geen project', 'Untitled project':'Naamloos project',
  'Not saved yet':'Nog niet opgeslagen', 'Saved':'Opgeslagen', '● Unsaved changes':'● Niet-opgeslagen wijzigingen', 'Unsaved changes':'Niet-opgeslagen wijzigingen',
  'No issues':'Geen problemen', 'Project overview':'Projectoverzicht', 'Project Overview':'Projectoverzicht', 'Add LK or Veam':'LK of Veam toevoegen',
  'Search everything (⌘K)':'Alles doorzoeken (⌘K)', 'Import CSV (⌘I)':'CSV importeren (⌘I)', 'Edit patch rows (⌘E)':'Patchregels bewerken (⌘E)',
  'Recalculate validation and statistics (⌘R)':'Validatie en statistieken herberekenen (⌘R)', 'Save project (⌘S)':'Project opslaan (⌘S)',
  'Open the report builder (⌘P)':'Rapportbouwer openen (⌘P)', 'Unsaved changes ':'Niet-opgeslagen wijzigingen',

  // algemene knoppen
  'Cancel':'Annuleren', 'Close':'Sluiten', 'Done':'Klaar', 'Continue':'Doorgaan', 'Delete':'Verwijderen', 'Remove':'Verwijderen', 'Replace':'Vervangen',
  'Add':'Toevoegen', 'New':'Nieuw', 'Back':'Terug', 'Open':'Openen', 'Show':'Tonen', 'Manage':'Beheren', 'Reset':'Herstellen', 'Restore':'Herstellen',
  'Discard':'Weggooien', 'Duplicate':'Dupliceren', 'Apply':'Toepassen', 'Default':'Standaard', 'Choose…':'Kiezen…', 'Select…':'Selecteren…',
  'Options':'Opties', 'Move up':'Omhoog', 'Move down':'Omlaag', 'Yes':'Ja', 'No':'Nee', 'OK':'OK', 'Not now':'Niet nu', 'Upload':'Uploaden',
  'Undo':'Ongedaan maken', 'Redo':'Opnieuw', 'Settings':'Instellingen', 'Preferences':'Voorkeuren', 'History':'Geschiedenis', 'Fix…':'Herstellen…',
  'Show in folder':'Toon in map', 'Open folder':'Map openen', 'Don\'t Save':'Niet opslaan', 'Save Project':'Project opslaan', 'Save changes?':'Wijzigingen opslaan?',
  'Do you want to save the changes to':'Wil je de wijzigingen opslaan in', 'Discard changes?':'Wijzigingen weggooien?', 'Keep this one':'Deze bewaren',
  'Keep this link':'Deze koppeling bewaren', 'Apply fix':'Herstel toepassen', 'Delete row':'Regel verwijderen', 'Remove link':'Koppeling verwijderen',

  // overzicht / kpi's
  'Data sources':'Gegevensbronnen', 'All checks passed':'Alle controles in orde', 'No issues — all checks passed.':'Geen problemen — alle controles in orde.',
  'LK blocks':'LK-blokken', 'Veams':'Veams', 'Universes':'Universes', 'Patch points':'Patchpunten', 'Patch rows':'Patchregels', 'Errors':'Fouten', 'Warnings':'Waarschuwingen',
  'Error':'Fout', 'Warning':'Waarschuwing', 'Status':'Status', 'Total':'Totaal', 'Rows':'Regels', 'Points':'Punten', 'Patch pts':'Patchpunten',
  'Veams linked':'Veams gekoppeld', 'Veams not linked to an LK':'Veams niet gekoppeld aan een LK', 'Project Info':'Projectinfo', 'Project details':'Projectgegevens',
  'No DimCities yet.':'Nog geen DimCities.', 'No DimCities yet. Import a CSV or add an LK to get started.':'Nog geen DimCities. Importeer een CSV of voeg een LK toe om te beginnen.',
  'No project details yet — add them via Project Info.':'Nog geen projectgegevens — voeg ze toe via Projectinfo.',
  'No CSV files imported':'Geen CSV-bestanden geïmporteerd', 'No CSV files imported. Rows were added by hand.':'Geen CSV-bestanden geïmporteerd. Regels zijn met de hand toegevoegd.',
  'Everything checks out':'Alles klopt', 'All':'Alle', 'All DimCities':'Alle DimCities', 'Nothing matches this filter':'Niets voldoet aan dit filter',
  'No issues found':'Geen problemen gevonden', 'Try another filter.':'Probeer een ander filter.',
  'No duplicate Veams, conflicts or missing data found.':'Geen dubbele Veams, conflicten of ontbrekende gegevens gevonden.',
  'Validation and statistics recalculated':'Validatie en statistieken herberekend',

  // DimCity / LK / Veam
  'DimCity':'DimCity', 'LK':'LK', 'Veam':'Veam', 'Block type':'Bloktype', 'Configuration':'Configuratie', 'Port layout':'Poortindeling', 'Ports':'Poorten', 'Port':'Poort',
  'Linked LK':'Gekoppelde LK', 'Linked':'Gekoppeld', 'Not linked':'Niet gekoppeld', 'not linked':'niet gekoppeld', 'Free':'Vrij', 'free':'vrij', 'Full':'Vol', 'Missing':'Ontbreekt',
  'Ignored':'Genegeerd', 'Unused':'Ongebruikt', 'Auto':'Auto', 'Manual':'Handmatig', 'Conflict':'Conflict', 'Incomplete':'Onvolledig', 'Empty':'Leeg', 'Spare':'Reserve',
  'Location':'Locatie', 'Universe':'Universe', 'Source':'Bron', 'Slot':'Slot', 'LK ports':'LK-poorten', 'Veam ports':'Veam-poorten', 'LK port':'LK-poort', 'Veam port':'Veam-poort',
  'Loose DMX':'Losse DMX', 'No Veam':'Geen Veam', 'INPUT':'INGANG', 'Click a block to edit its block type and Veam links.':'Klik op een blok om het bloktype en de Veam-koppelingen te wijzigen.',
  'Auto-detect picks 12× XLR when more than 4 LK ports are patched.':'Automatisch kiest 12× XLR als er meer dan 4 LK-poorten gepatcht zijn.',
  'Block type detected automatically':'Bloktype automatisch bepaald', 'This LK no longer exists.':'Deze LK bestaat niet meer.', 'This Veam no longer exists.':'Deze Veam bestaat niet meer.',
  'A Veam can only be connected to one LK slot. Remove the extra links.':'Een Veam kan maar aan één LK-slot hangen. Verwijder de extra koppelingen.',
  'No LK blocks in this DimCity.':'Geen LK-blokken in deze DimCity.', 'No Veams in this DimCity.':'Geen Veams in deze DimCity.', 'No data for this DimCity.':'Geen gegevens voor deze DimCity.',
  'No universes patched in this DimCity.':'Geen universes gepatcht in deze DimCity.', 'No patch points for this universe.':'Geen patchpunten voor deze universe.',
  'Select a universe to see which LK and Veam ports carry it.':'Kies een universe om te zien welke LK- en Veam-poorten hem dragen.',
  'Universe overview':'Universe-overzicht', 'physical patch points':'fysieke patchpunten', 'Expand all':'Alles openklappen', 'Collapse all':'Alles dichtklappen',
  'Add LK':'LK toevoegen', 'Add Veam':'Veam toevoegen', 'LK number':'LK-nummer', 'Veam number':'Veam-nummer',
  'The DimCity is derived from the number: LK101 → DB01, LK215 → DB02.':'De DimCity volgt uit het nummer: LK101 → DB01, LK215 → DB02.',
  'The DimCity is derived from the number: V101 → DB01.':'De DimCity volgt uit het nummer: V101 → DB01.',
  '12× XLR mode: Veam links are not used.':'12× XLR-modus: Veam-koppelingen worden niet gebruikt.',

  // patchlijst / regels bewerken / import
  'Imported Files':'Geïmporteerde bestanden', 'Imported':'Geïmporteerd', 'Updated':'Bijgewerkt', 'File':'Bestand', 'Import Another CSV':'Nog een CSV importeren',
  'Remove File':'Bestand verwijderen', 'Choose New File':'Nieuw bestand kiezen', 'Edit Patch Rows':'Patchregels bewerken', 'Import Selection':'Selectie importeren',
  'Skip rows at top':'Regels bovenaan overslaan', 'Skip rows at bottom':'Regels onderaan overslaan', 'Use column 5':'Kolom 5 gebruiken',
  'Loose DMX Line':'Losse DMX-lijn', 'Filter by ID, location, universe or DimCity…':'Filter op ID, locatie, universe of DimCity…',
  'Reset imported rows?':'Geïmporteerde regels terugzetten?', 'Your edits in this editor have not been applied.':'Je wijzigingen in deze editor zijn nog niet toegepast.',
  'All edits to imported rows in this editor are undone. Rows you added yourself are kept.':'Alle wijzigingen aan geïmporteerde regels worden ongedaan gemaakt. Zelf toegevoegde regels blijven.',
  'No rows':'Geen regels', 'Code':'Code', 'Message':'Melding', 'Patch':'Patch',

  // validatie-fixes
  'Fix patch row':'Patchregel herstellen', 'LK / Veam':'LK / Veam', 'Before':'Voor', 'LK101 or V101':'LK101 of V101',

  // geschiedenis
  'Current state':'Huidige staat', 'Opened / created':'Geopend / aangemaakt', 'start of this session':'begin van deze sessie', 'No changes yet':'Nog geen wijzigingen',
  'Changes you make in this show appear here.':'Wijzigingen in deze show verschijnen hier.', 'Nothing to undo':'Niets om ongedaan te maken', 'Nothing to redo':'Niets om opnieuw te doen',
  'Every change in this session. Click a step to go back to it — you can always redo.':'Elke wijziging in deze sessie. Klik op een stap om ernaar terug te gaan — opnieuw doen kan altijd.',
  'Redo to here':'Opnieuw tot hier', 'Undo to before':'Terug tot vóór',

  // instellingen
  'These settings apply to the app on this computer, not to a single show.':'Deze instellingen gelden voor de app op deze computer, niet voor één show.',
  'General':'Algemeen', 'Autosave & backup':'Autosave & back-up', 'Updates':'Updates', 'Appearance':'Weergave', 'Dark':'Donker', 'Light':'Licht', 'Match system':'Volg systeem',
  'Language':'Taal', 'Changes the app and its menus. PDF reports stay in English.':'Verandert de app en de menu\'s. PDF-rapporten blijven Engels.',
  'Save automatically':'Automatisch opslaan', 'Off':'Uit', 'Every N changes':'Elke N wijzigingen', 'Every N minutes':'Elke N minuten',
  'After this many changes':'Na dit aantal wijzigingen', 'Every … minutes':'Elke … minuten', 'What to save':'Wat opslaan',
  'Save the show file itself':'Het showbestand zelf opslaan', 'Only for shows that already have a file. New shows are never saved without asking.':'Alleen voor shows die al een bestand hebben. Nieuwe shows worden nooit zonder vragen opgeslagen.',
  'Also make a separate backup copy':'Ook een losse back-upkopie maken', 'A dated copy in a backup folder — the original file is not touched by this.':'Een kopie met datum in een back-upmap — het originele bestand blijft onaangeroerd.',
  'Backup folder':'Back-upmap', 'Keep the last … backups per show':'Bewaar de laatste … back-ups per show', 'Crash recovery':'Herstel na crash',
  'Keep a recovery copy of unsaved work':'Herstelkopie van niet-opgeslagen werk bijhouden', 'If the app closes unexpectedly, you can restore your last changes the next time it starts.':'Sluit de app onverwacht af, dan kun je bij de volgende start je laatste wijzigingen terugzetten.',
  'Version':'Versie', 'Updates are downloaded from GitHub Releases.':'Updates komen van GitHub Releases.', 'Check now':'Nu controleren',
  'Check for updates when the app starts':'Bij het opstarten op updates controleren', 'Release source':'Bron van releases', 'GitHub repository':'GitHub-repository',
  'Access token':'Toegangstoken', '(only for a private repository)':'(alleen voor een privé-repository)',
  'Tip: publish releases in a public repository, so colleagues don\'t need a token.':'Tip: publiceer releases in een openbare repository, dan hebben collega\'s geen token nodig.',
  'Choose backup folder':'Back-upmap kiezen', 'Restore unsaved work?':'Niet-opgeslagen werk herstellen?',

  // zoeken
  'Search LK, Veam, universe, location, node… or a command':'Zoek LK, Veam, universe, locatie, node… of een opdracht', 'navigate':'navigeren', 'open':'openen', 'search':'zoeken',
  'LK':'LK', 'Locations':'Locaties', 'Network':'Netwerk', 'Devices':'Devices', 'Commands':'Opdrachten', 'esc':'esc',

  // netwerk / racks
  'Network nodes':'Netwerknodes', 'DMX nodes':'DMX-nodes', 'Splitters':'Splitters', 'Racks':'Racks', 'Rack':'Rek', 'Node type':'Nodetype', 'Splitter type':'Splittertype',
  'Universe pool':'Universe-pool', 'Drag a universe onto a node port, or click a port to pick one.':'Sleep een universe naar een nodepoort, of klik op een poort om er een te kiezen.',
  'No nodes yet. Choose a node type and click Auto-assign.':'Nog geen nodes. Kies een nodetype en klik op Automatisch toewijzen.',
  'No splitters yet. Choose a splitter type and click Auto-calculate.':'Nog geen splitters. Kies een splittertype en klik op Automatisch berekenen.',
  'Auto-assign nodes':'Nodes automatisch toewijzen', 'Auto-calculate splitters':'Splitters automatisch berekenen', 'Add one splitter':'Eén splitter toevoegen',
  'IP address':'IP-adres', 'Subnet':'Subnet', 'Name':'Naam', 'Place rack':'Rek plaatsen', 'Rack Builder':'Rack Builder', 'Use as network plan':'Gebruik als netwerkplan',
  'LK7-1 sockets':'LK7-1-aansluitingen', 'Veam4 sockets':'Veam4-aansluitingen', 'Node ports':'Nodepoorten', 'Lines':'Lijnen', 'Node per LK / Veam:':'Node per LK / Veam:',
  'Patch table':'Patchtabel', 'Node port':'Nodepoort', 'Via':'Via', 'Socket':'Aansluiting', 'LK / Veam port':'LK- / Veam-poort', 'direct':'direct', 'no port':'geen poort',
  'Name in this DimCity':'Naam in deze DimCity', 'Loose devices':'Losse apparaten', 'Add loose node':'Losse node toevoegen', 'Add LK spider':'LK-spin toevoegen', 'Add Veam4 spider':'Veam4-spin toevoegen',
  'LK spider':'LK-spin', 'Veam4 spider':'Veam4-spin', 'On node':'Op node', 'Any node':'Willekeurige node', 'Name / location':'Naam / locatie', 'Print racks':'Racks printen', 'Loose node':'Losse node',
  'Patch this spider on a loose node first':'Patch deze spin eerst op een losse node', 'Export a PDF with only the racks of this DimCity':'Exporteer een PDF met alleen de racks van deze DimCity',
  'There is no DMX node yet — add a loose node or place a rack.':'Er is nog geen DMX-node — voeg een losse node toe of plaats een rek.', 'free':'vrij', 'none':'geen', 'Replace the network plan?':'Netwerkplan vervangen?', 'Place a rack to patch this DimCity automatically.':'Plaats een rek om deze DimCity automatisch te patchen.',
  'This rack has no DMX nodes.':'Dit rek heeft geen DMX-nodes.', 'Create the network nodes and splitters of this DimCity from the rack patch':'Maak de netwerknodes en splitters van deze DimCity uit de rack-patch',
  'Plan DMX nodes and splitters per DimCity. Device types are kept in reusable libraries.':'Plan DMX-nodes en splitters per DimCity. Devicetypes staan in herbruikbare bibliotheken.',
  'Network switches will appear here.':'Netwerkswitches verschijnen hier.', 'No nodes planned for this DimCity.':'Geen nodes gepland voor deze DimCity.', 'No splitters planned for this DimCity.':'Geen splitters gepland voor deze DimCity.',

  // device builder
  'Device Builder':'Device Builder', 'Nodes, splitters, switches and panels — and the racks you build from them.':'Nodes, splitters, switches en panelen — en de racks die je ermee bouwt.',
  'Nodes':'Nodes', 'Switches':'Switches', 'Panels':'Panelen', 'New node':'Nieuwe node', 'New splitter':'Nieuwe splitter', 'New switch':'Nieuwe switch', 'New panel':'Nieuw paneel', 'New rack':'Nieuw rek', 'New Rack':'Nieuw rek',
  'Type key':'Typesleutel', 'Brand':'Merk', 'Type':'Type', 'DMX ports':'DMX-poorten', 'Default IP':'Standaard-IP', 'Height (U)':'Hoogte (U)', 'Color':'Kleur', 'Input':'Ingang',
  'Outputs':'Uitgangen', 'Switching':'Schakeling', 'Single input':'Enkele ingang', 'A/B input':'A/B-ingang', 'Every output independent':'Elke uitgang los', 'Outputs paired per 2':'Uitgangen per 2 gekoppeld',
  'RJ45 ports':'RJ45-poorten', 'SFP ports':'SFP-poorten', 'LK7-1 sockets':'LK7-1-aansluitingen', 'XLR 5-pin':'XLR 5-polig', 'etherCON':'etherCON',
  'Save Node':'Node opslaan', 'Save Splitter':'Splitter opslaan', 'Save Switch':'Switch opslaan', 'Save Panel':'Paneel opslaan', 'Unsaved changes':'Niet-opgeslagen wijzigingen',
  'Not in library':'Niet in bibliotheek', 'Differs':'Wijkt af', 'Only in this project':'Alleen in dit project', 'Your library has another version':'Je bibliotheek heeft een andere versie',
  'Add to Library':'Toevoegen aan bibliotheek', 'Use Library Version':'Bibliotheekversie gebruiken', 'Save This to Library':'Deze in bibliotheek opslaan', 'Save to Library':'Opslaan in bibliotheek',
  'Saved in this show and in your library':'Opgeslagen in deze show en in je bibliotheek', 'Share your devices with a colleague via Export Library.':'Deel je devices met een collega via Bibliotheek exporteren.',
  'Import Library…':'Bibliotheek importeren…', 'Export Library…':'Bibliotheek exporteren…', 'Import Library':'Bibliotheek importeren', 'Export Library':'Bibliotheek exporteren',
  'No locations patched yet':'Nog geen locaties gepatcht', 'Delete LK':'LK verwijderen', 'Delete Veam':'Veam verwijderen', 'You can undo this with Undo.':'Je kunt dit ongedaan maken met Ongedaan maken.',
  'Rack name':'Naam rek', 'Article key':'Artikelsleutel', 'Ethernet ports':'Ethernet-poorten', '1× RJ45':'1× RJ45', '2× RJ45 (link + redundant)':'2× RJ45 (link + redundant)', 'Height':'Hoogte', 'Height used':'Hoogte gebruikt', 'Delete Rack':'Rek verwijderen', 'Remove from rack':'Uit rek halen', 'Missing device':'Ontbrekend device',
  'Drag devices into the rack, or click + to add at the first free position.':'Sleep devices in het rek, of klik op + om ze op de eerste vrije plek te zetten.',
  'Drag into the rack':'In het rek slepen', 'Add at first free position':'Op eerste vrije plek zetten', 'No racks yet':'Nog geen racks', 'No racks yet.':'Nog geen racks.',
  'Build a rack from your nodes, splitters, switches and panels.':'Bouw een rek uit je nodes, splitters, switches en panelen.', 'Not enough free space there':'Daar is niet genoeg ruimte',
  'Rack saved to your library':'Rek opgeslagen in je bibliotheek', 'Saved to your library':'Opgeslagen in je bibliotheek', 'No sockets':'Geen aansluitingen',
  'The rack is removed from this show and from your library. The devices themselves are kept.':'Het rek wordt uit deze show en je bibliotheek verwijderd. De devices zelf blijven.',
  'The type key cannot change once saved — shows refer to it':'De typesleutel kan na opslaan niet meer veranderen — shows verwijzen ernaar',
  'Fill in the form and click Save.':'Vul het formulier in en klik op Opslaan.', 'Add project devices before exporting?':'Projectdevices toevoegen vóór het exporteren?',
  'Your library is empty — create devices in the Device Builder first':'Je bibliotheek is leeg — maak eerst devices in de Device Builder',
  'Library file is damaged — starting with an empty library':'Bibliotheekbestand is beschadigd — er wordt gestart met een lege bibliotheek',
  'Replace my version':'Mijn versie vervangen', 'Add as copy':'Als kopie toevoegen', 'Keep both (new key for this one)':'Allebei houden (nieuwe sleutel voor deze)',
  'New':'Nieuw', 'PDF templates':'PDF-templates',

  // rapportbouwer
  'Report Builder':'Rapportbouwer', 'Template':'Template', 'Save as template':'Opslaan als template', 'Save as Template':'Opslaan als template', 'Content':'Inhoud', 'Style':'Stijl', 'Cover':'Cover',
  'Fit':'Passend', 'Network switches':'Netwerkswitches', 'Fibre links':'Fiberverbindingen', 'Network cables':'Netwerkkabels', 'Stickers':'Stickers', 'Print stickers on Herma label sheets':'Print stickers op Herma-etikettenvellen', 'Fun':'Plezier', 'Confetti when a show has no errors or warnings left':'Confetti als een show geen fouten of waarschuwingen meer heeft', 'A little party when the validation turns clean. Switch it off if you prefer a quiet app.':'Een klein feestje zodra de validatie schoon wordt. Zet het uit als je een rustige app wilt.', 'Sections per DimCity':'Secties per DimCity', '· drag to reorder':'· sleep om te ordenen', 'Output':'Uitvoer', 'One PDF':'Eén PDF', 'One PDF per DimCity':'Eén PDF per DimCity',
  'Page':'Pagina', 'Paper size':'Papierformaat', 'Orientation':'Richting', 'Landscape':'Liggend', 'Portrait':'Staand', 'Margins':'Marges', 'Look':'Uiterlijk', 'Accent color':'Accentkleur',
  'Font':'Lettertype', 'Text size':'Tekstgrootte', 'Density':'Dichtheid', 'Compact':'Compact', 'Comfortable':'Ruim', 'Header & footer':'Kop- en voettekst',
  'Cover page':'Voorblad', 'Title':'Titel', 'Subtitle':'Ondertitel', 'Show on cover':'Op voorblad tonen', 'Logo':'Logo', 'No logo':'Geen logo', 'Note on cover':'Notitie op voorblad',
  'Project name':'Projectnaam', 'Area':'Gebied', 'Date':'Datum', 'Prepared by':'Opgesteld door', 'Templates':'Templates', 'Template name':'Templatenaam', 'Save Template':'Template opslaan',
  'Company logo':'Bedrijfslogo', 'No company logo':'Geen bedrijfslogo', 'On every page':'Op elke pagina', 'Top left':'Linksboven', 'Top right':'Rechtsboven', 'Bottom left':'Linksonder',
  'Bottom right':'Rechtsonder', 'Logo height':'Logohoogte', 'Watermark':'Watermerk', 'None':'Geen', 'Text':'Tekst', 'Strength':'Sterkte', 'Size':'Grootte', 'Angle':'Hoek',
  'Use project logo':'Projectlogo gebruiken', 'Position on the cover':'Positie op het voorblad', 'Report preview':'Rapportvoorbeeld', 'Select at least one DimCity.':'Kies minstens één DimCity.',
  'Collapse sidebar':'Zijbalk inklappen', 'Expand sidebar':'Zijbalk uitklappen', 'Help':'Help', 'Request':'Request', 'User manual for this page (? or F1)':'Handleiding voor deze pagina (? of F1)', 'Send a feature request, bug report or question':'Stuur een wens, foutmelding of vraag',
  'Open Demo Show':'Demo-show openen', 'A complete festival show to explore: racks, nodes, PDF':'Een complete festivalshow om te verkennen: racks, nodes, PDF',
  'Full tour, or one about LKs, nodes, racks or the PDF':'Volledige rondleiding, of één over LK’s, nodes, racks of de PDF', 'Show progress':'Voortgang van de show',
  'Device library':'Devicebibliotheek', 'Standard device library':'Standaard devicebibliotheek', 'Luminex, ELC and standard panels':'Luminex, ELC en standaardpanelen',
  'Check for library updates when the app starts':'Bij het opstarten op bibliotheek-updates controleren',
  'Separate from app updates: new or corrected device types are added to your library. Types you edited yourself are never overwritten.':'Los van app-updates: nieuwe of gecorrigeerde devicetypes worden aan je bibliotheek toegevoegd. Types die je zelf hebt aangepast worden nooit overschreven.',
  'The standard library is read from the same GitHub repository as the app updates (library/standard-library.json).':'De standaardbibliotheek wordt uit dezelfde GitHub-repository gelezen als de app-updates (library/standard-library.json).',
  'Line weight':'Lijndikte', 'Light':'Licht', 'Normal':'Normaal', 'Bold':'Dik', 'Normal and Bold give darker, thicker lines that stay readable on paper.':'Normaal en Dik geven donkerdere, dikkere lijnen die op papier goed leesbaar blijven.',
  'Position on the sheet':'Positie op het blad', 'Auto':'Automatisch', 'Fixed':'Vast', 'Width':'Breedte', 'Fixed position':'Vaste positie', 'Drag to position this section on the sheet':'Sleep om deze sectie op het blad te plaatsen',
  'Auto: sections follow each other from top to bottom. Choose Fixed, or drag the handle in the preview, to place this section yourself.':'Automatisch: secties volgen elkaar van boven naar beneden op. Kies Vast, of sleep de greep in het voorbeeld, om deze sectie zelf te plaatsen.',
  'Racks only':'Alleen racks', 'Rack drawing':'Rack-tekening', 'Node ports (which LK / Veam port is on which node port)':'Nodepoorten (welke LK-/Veam-poort op welke nodepoort zit)',
  'Loose devices (nodes and spiders without a rack)':'Losse apparaten (nodes en spinnen zonder rek)', 'Patch table (node port → LK / Veam)':'Patchtabel (nodepoort → LK / Veam)', 'Recommendations':'Adviezen',
  'Delete a template…':'Template verwijderen…', 'Choose…':'Kiezen…', 'Presets':'Voorinstellingen', 'My templates':'Mijn templates', 'Left':'Links', 'Center':'Midden',
  'No sections enabled. Turn sections on in the Content tab.':'Geen secties aan. Zet secties aan in het tabblad Inhoud.', 'No templates left.':'Geen templates meer.',

  // welkom / rondleiding
  'Welcome to PatchLab':'Welkom bij PatchLab', 'Recent projects':'Recente projecten', 'New Project':'Nieuw project', 'Open Project':'Project openen', 'Open Project…':'Project openen…',
  'Take the Tour':'Rondleiding', 'Take the quick tour':'Korte rondleiding volgen', 'Skip the tour':'Rondleiding overslaan', 'Show at startup':'Bij opstarten tonen',
  'Keyboard Shortcuts':'Sneltoetsen', 'File not found':'Bestand niet gevonden', 'Continue where you left off':'Verder waar je gebleven was',
  'Browse for a .lkproj file':'Zoek een .lkproj-bestand', 'Start fresh — with an optional quick tour':'Opnieuw beginnen — met een optionele korte rondleiding',
  'Import a CSV file right away':'Direct een CSV-bestand importeren', 'Go straight to the project details and start working.':'Ga direct naar de projectgegevens en begin.',
  'Would you like a short tour of PatchLab first?':'Wil je eerst een korte rondleiding door PatchLab?', 'A one-minute walkthrough of the workspace':'Een rondleiding van een minuut door de werkruimte',
  'View all':'Alles bekijken', 'patch rows':'patchregels', 'DimCities ·':'DimCities ·', 'LK ·':'LK ·', 'Veam ·':'Veam ·', 'Info':'Info',
  'needs attention':'aandacht nodig', 'all patched':'alles gepatcht', 'none placed':'niets geplaatst', 'Loose LK spider':'Losse LK-spin', 'Loose Veam4 spider':'Losse Veam4-spin',
  'Direct (XLR)':'Direct (XLR)', 'Project info changed':'Projectinfo gewijzigd', 'Racks changed':'Racks gewijzigd', 'Devices changed':'Devices gewijzigd',
  'PDF layout changed':'PDF-indeling gewijzigd', 'DimCity color changed':'DimCity-kleur gewijzigd', 'Edit':'Bewerking', 'Replaced imported file':'Geïmporteerd bestand vervangen',
  'LK / Veam patching, validation and DimCity reporting.':'LK/Veam-patching, validatie en DimCity-rapportage.', 'Your name':'Je naam', 'About DimCity PatchLab':'Over DimCity PatchLab'
};

// "3 errors" e.d.: getal + zelfstandig naamwoord
const NOUNS = {
  error:'fout', errors:'fouten', warning:'waarschuwing', warnings:'waarschuwingen', row:'regel', rows:'regels', 'patch row':'patchregel', 'patch rows':'patchregels',
  line:'lijn', lines:'lijnen', node:'node', nodes:'nodes', splitter:'splitter', splitters:'splitters', rack:'rek', racks:'racks', universe:'universe', universes:'universes',
  block:'blok', blocks:'blokken', 'LK block':'LK-blok', 'LK blocks':'LK-blokken', 'patch point':'patchpunt', 'patch points':'patchpunten', device:'device', devices:'devices',
  'CSV file':'CSV-bestand', 'CSV files':'CSV-bestanden', 'sheet in preview':'blad in voorbeeld', 'sheets in preview':'bladen in voorbeeld', port:'poort', ports:'poorten',
  'universe ports':'universe-poorten', 'DMX ports':'DMX-poorten', outputs:'uitgangen', 'spare outputs':'reserve-uitgangen', linked:'gekoppeld', placed:'geplaatst', item:'item', items:'items',
  'loose device':'los apparaat', 'loose devices':'losse apparaten'
};
const RULES = [
  [/^(\d+) (.+)$/, (m, n, noun) => NOUNS[noun] ? `${n} ${NOUNS[noun]}` : null],
  [/^(\d+)\/(\d+) linked$/, (m, a, b) => `${a}/${b} gekoppeld`],
  [/^Back to (.+)$/, (m, x) => `Terug naar ${x}`],
  [/^Open (\S+)$/, (m, x) => `Open ${x}`],
  [/^Go to (.+)$/, (m, x) => `Ga naar ${x}`],
  [/^Undone: (.+)$/, (m, x) => `Ongedaan: ${x}`],
  [/^Redone: (.+)$/, (m, x) => `Opnieuw: ${x}`],
  [/^Opened (.+)$/, (m, x) => `${x} geopend`],
  [/^Saved (.+\.lkproj)$/, (m, x) => `${x} opgeslagen`],
  [/^Autosaved (\S+)( \+ backup)?$/, (m, t, b) => `Automatisch opgeslagen ${t}${b ? ' + back-up' : ''}`],
  [/^Main location: (.+)$/, (m, x) => `Hoofdlocatie: ${x}`],
  [/^Place a rack and PatchLab patches the LKs and Veams of (\S+) onto its sockets and node ports automatically\.( Build a rack in the Rack Builder first\.)?$/, (m, dc, b) => `Plaats een rek en PatchLab patcht de LK's en Veams van ${dc} automatisch op de aansluitingen en nodepoorten.${b ? ' Bouw eerst een rek in de Rack Builder.' : ''}`],
  [/^Delete (\S+)\?$/, (m, x) => `${x} verwijderen?`],
  [/^Deleted (\S+)$/, (m, x) => `${x} verwijderd`],
  [/^LK ports (\d+)–(\d+)$/, (m, a, b) => `LK-poorten ${a}–${b}`],
  [/^(\d+) racks? \+ (\d+) loose devices?$/, (m, a, b) => `${a} rack${a === '1' ? '' : 's'} + ${b} los${b === '1' ? ' apparaat' : 'se apparaten'}`],
  [/^(\S+): (\d+) nodes?(?: and (\d+) splitters?)? taken from the rack$/, (m, dc, n, sp) => `${dc}: ${n} node${n === '1' ? '' : 's'}${sp ? ` en ${sp} splitter${sp === '1' ? '' : 's'}` : ''} uit het rek overgenomen`],
  [/^(\d+) standard types in your library$/, (m, n) => `${n} standaardtypes in je bibliotheek`],
  [/^Library version (\S+)$/, (m, v) => `Bibliotheekversie ${v}`],
  [/^Last checked (.+)$/, (m, d) => `Laatst gecontroleerd ${d}`],
  [/^(\d+) standard types in your library · library version (\S+)(?: · last checked (.+))?$/, (m, n, v, d) => `${n} standaardtypes in je bibliotheek · bibliotheekversie ${v}${d ? ` · laatst gecontroleerd ${d}` : ''}`],
  [/^Your device library is up to date \(standard library (\d+)\)$/, (m, v) => `Je devicebibliotheek is up-to-date (standaardbibliotheek ${v})`],
  [/^Device library (\d+): (\d+) new, (\d+) updated(.*)$/, (m, v, a, b, rest) => `Devicebibliotheek ${v}: ${a} nieuw, ${b} bijgewerkt${rest.replace(' of your own kept', ' van jezelf behouden')}`],
  [/^(\S+) deleted$/, (m, x) => `${x} verwijderd`],
  [/^(\S+) is removed from (\S+)( together with its .+?)?\.$/, (m, id, dc, rows) => `${id} wordt uit ${dc} verwijderd${rows ? `, samen met de ${rows.replace(/^ together with its /, '').replace(/patch rows?/, 'patchregels')}` : ''}.`],
  [/^The links? to (.+?) (?:are|is) removed; the Veams? stay in the show\.$/, (m, x) => `De koppeling met ${x} wordt verwijderd; de Veam blijft in de show.`],
  [/^The link from (.+?) is removed\.$/, (m, x) => `De koppeling vanuit ${x} wordt verwijderd.`],
  [/^(.+) saved$/, (m, x) => `${x} opgeslagen`],
  [/^Page n of N$/, () => 'Pagina n van N'],
  [/^Drag the orange handle in the preview to move it \(snaps to (\d+) mm\)\. Sheet is (\d+) × (\d+) mm inside the margins\.$/, (m, g, w, h) => `Sleep de oranje greep in het voorbeeld om te verplaatsen (springt naar ${g} mm). Het blad is ${w} × ${h} mm binnen de marges.`],
  [/^(\d+) total$/, (m, n) => `${n} totaal`],
  // validatiemeldingen
  [/^(\S+) port (.+?) does not exist — a (Veam|LK) has ports 1–(\d+)(.*)$/, (m, id, p, t, n, rest) => `${id} poort ${p} bestaat niet — een ${t} heeft poorten 1–${n}${rest}`],
  [/^(\S+) port (\d+) is patched twice with different universes \((.+)\)$/, (m, id, p, x) => `${id} poort ${p} is twee keer gepatcht met verschillende universes (${x})`],
  [/^Veam (\S+) is linked more than once: (.+)$/, (m, v, x) => `Veam ${v} is meer dan één keer gekoppeld: ${x}`],
  [/^(\S+) \(Veam (\d)\) is linked to (\S+), but \S+ no longer exists$/, (m, a, sl, b) => `${a} (Veam ${sl}) is gekoppeld aan ${b}, maar ${b} bestaat niet meer`],
  [/^(\S+) is set to 3× Veam, but (\d+) of its own LK port\(s\) contain data$/, (m, id, n) => `${id} staat op 3× Veam, maar ${n} van de eigen LK-poorten bevatten gegevens`],
  [/^(\S+) is a 12× XLR block, so its Veam links? \((.+)\) (?:are|is) ignored\. Change the block type or remove the link\.$/, (m, id, x) => `${id} is een 12× XLR-blok, dus de Veam-koppeling (${x}) wordt genegeerd. Wijzig het bloktype of verwijder de koppeling.`],
  [/^Loose DMX line(.*) has no DimCity$/, (m, x) => `Losse DMX-lijn${x} heeft geen DimCity`],
  [/^Unknown ID "(.+)" — expected LK###, VEAM12### or V###$/, (m, x) => `Onbekend ID "${x}" — verwacht LK###, VEAM12### of V###`],
  [/^Too few fields: (.*)$/, (m, x) => `Te weinig velden: ${x}`],
  // rack-adviezen
  [/^(\d+) LKs? (?:have|has) no LK7-1 socket \((.+)\) → add (?:a loose LK spider|(\d+) loose LK spiders), or a panel with more LK sockets\.$/, (m, n, ids, k) => `${n} LK${n === '1' ? ' heeft' : "'s hebben"} geen LK7-1-aansluiting (${ids}) → voeg ${k ? `${k} losse LK-spinnen` : 'een losse LK-spin'} toe, of een paneel met meer LK-aansluitingen.`],
  [/^(\d+) Veams? (?:have|has) no Veam4 socket \((.+)\) → add (?:a loose Veam4 spider|(\d+) loose Veam4 spiders)\.$/, (m, n, ids, k) => `${n} Veam${n === '1' ? ' heeft' : 's hebben'} geen Veam4-aansluiting (${ids}) → voeg ${k ? `${k} losse Veam4-spinnen` : 'een losse Veam4-spin'} toe.`],
  [/^(\d+) lines? (?:have|has) no node port → add (\d+)× (.+?)(, or a splitter for universes that are used more than once)?\.$/, (m, n, k, t, sp) => `${n} lijn${n === '1' ? ' heeft' : 'en hebben'} geen nodepoort → voeg ${k}× ${t} toe${sp ? ', of een splitter voor universes die vaker gebruikt worden' : ''}.`],
  [/^(\d+) LK7-1 sockets? unused\.$/, (m, n) => `${n} LK7-1-aansluiting${n === '1' ? '' : 'en'} ongebruikt.`],
  [/^(\d+) splitters? (?:are|is) not needed — there are enough node ports\.$/, (m, n) => `${n} splitter${n === '1' ? ' is' : 's zijn'} niet nodig — er zijn genoeg nodepoorten.`],
  [/^(\d+) node ports? still free\.$/, (m, n) => `${n} nodepoort${n === '1' ? '' : 'en'} nog vrij.`],
  [/^(\d+) loose nodes? uses? a node type that is no longer in this show\.$/, (m, n) => `${n} losse node${n === '1' ? ' gebruikt' : 's gebruiken'} een nodetype dat niet meer in deze show staat.`],
  [/^Everything fits: (\d+) lines? patched on (\d+) node ports?\.$/, (m, a, b) => `Alles past: ${a} lijn${a === '1' ? '' : 'en'} gepatcht op ${b} nodepoort${b === '1' ? '' : 'en'}.`]
];

let lang = 'en';
const origText = new WeakMap();   // tekstnode -> Engels origineel
const lastSet = new WeakMap();
const origAttr = new WeakMap();   // element -> { title, placeholder }
const ATTRS = ['title', 'placeholder', 'aria-label'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'KBD', 'IFRAME', 'SVG', 'svg']);

function translateCore(s){
  if(Object.prototype.hasOwnProperty.call(NL, s)) return NL[s];
  // meerdere regels of zinnen (bevestigingen): regel voor regel vertalen
  if(s.includes('\n')){
    let changed = false;
    const out = s.split('\n').map(line => { const t = line.trim() ? translateCore(line.trim()) : null; if(t != null){ changed = true; return line.replace(line.trim(), t); } return line; });
    return changed ? out.join('\n') : null;
  }
  for(const [rx, fn] of RULES){ const m = s.match(rx); if(m){ const r = fn(...m); if(r != null) return r; } }
  // samengestelde teksten "2 errors · 0 warnings"
  if(s.includes(' · ')){
    const parts = s.split(' · ');
    let changed = false;
    const out = parts.map(p => { const t = translateCore(p.trim()); if(t != null){ changed = true; return t; } return p; });
    return changed ? out.join(' · ') : null;
  }
  return null;
}
function translate(raw){
  const m = String(raw).match(/^(\s*)([\s\S]*?)(\s*)$/);
  if(!m[2]) return null;
  const t = translateCore(m[2]);
  return t == null ? null : m[1] + t + m[3];
}
const skipEl = el => !el || SKIP.has(el.nodeName) || el.closest?.('[data-no-i18n],[contenteditable="true"]');

function doText(node){
  const el = node.parentElement;
  if(skipEl(el)) return;
  if(lastSet.get(node) !== node.nodeValue){ origText.delete(node); }   // app heeft de tekst zelf veranderd
  const src = origText.has(node) ? origText.get(node) : node.nodeValue;
  if(lang === 'nl'){
    const t = translate(src);
    if(t != null && t !== node.nodeValue){ origText.set(node, src); node.nodeValue = t; lastSet.set(node, t); }
  } else if(origText.has(node)){
    node.nodeValue = origText.get(node); origText.delete(node); lastSet.delete(node);
  }
}
function doAttrs(el){
  if(skipEl(el)) return;
  for(const a of ATTRS){
    if(!el.hasAttribute?.(a)) continue;
    const store = origAttr.get(el) || {};
    const cur = el.getAttribute(a);
    if(store[a] && store[`${a}:set`] !== cur){ delete store[a]; delete store[`${a}:set`]; }
    const src = store[a] ?? cur;
    if(lang === 'nl'){
      const t = translate(src);
      if(t != null && t !== cur){ store[a] = src; store[`${a}:set`] = t; origAttr.set(el, store); el.setAttribute(a, t); }
    } else if(store[a] != null){ el.setAttribute(a, store[a]); delete store[a]; delete store[`${a}:set`]; }
  }
}
function walk(root){
  if(!root) return;
  if(root.nodeType === 3){ doText(root); return; }
  if(root.nodeType !== 1 || skipEl(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 1 && SKIP.has(n.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  let n;
  while((n = tw.nextNode())){ if(n.nodeType === 3) doText(n); else doAttrs(n); }
}
const observer = new MutationObserver(muts => {
  for(const m of muts){
    if(m.type === 'childList') m.addedNodes.forEach(walk);
    else if(m.type === 'characterData') doText(m.target);
    else if(m.type === 'attributes') doAttrs(m.target);
  }
});
function setLanguage(next){
  next = next === 'nl' ? 'nl' : 'en';
  if(next === lang) return;
  lang = next;
  document.documentElement.lang = lang;
  if(lang === 'nl'){
    walk(document.body);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:ATTRS });
  } else {
    observer.disconnect();
    walk(document.body);   // originelen terugzetten
  }
}

window.I18n = { setLanguage, translate:s => translate(s) ?? s, get language(){ return lang; } };
if(window.Settings?.get?.().language === 'nl') setLanguage('nl');
