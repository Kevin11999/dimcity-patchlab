# -*- coding: utf-8 -*-
"""Kabeltool - Vectorworks-kant (Python).

LET OP: dit bestand is geschreven zonder Vectorworks en is NIET getest.
Het doet bewust weinig: geometrie uit de tekening naar een JSON-bestand schrijven,
en wat de palette heeft uitgerekend (labels, stempels) terug in de tekening zetten.
Al het rekenwerk (lengtes, nummers) zit in de palette.

Bestanden naast de tekening (zelfde naam als de .vwx):
  <naam>.kt-tekening.json   geschreven door dit script (geometrie)
  <naam>.kt-project.json    geschreven door de palette (instellingen, nummers, labels, stempels)

Gebruik in een script (Script Palette of menucommando):
  import importlib, kabeltool; importlib.reload(kabeltool); kabeltool.plaats_dimcity()
"""
import json
import math
import os

import vs

REC = 'KT_Obj'      # op dim city, vloerroute, truss-lijn en drop
GEN = 'KT_Gen'      # op alles wat de tool zelf tekent (wordt bij bijwerken vervangen)
LINK = 'KT_Link'    # op lampen: bij welke drop ze horen
LD = 'Lighting Device'

STANDAARD = {
    'prefix': 'PP/', 'symboolBreedte': 20, 'symboolHoogte': 4, 'dimcityMaat': 1,
    'laagCabling': 'Cabling', 'laagInfra': 'Infraplot',
}


BRUG = False        # True als de web palette ons aanroept: meldingen gaan dan naar de palette
MELDINGEN = []


# ---------------------------------------------------------------- hulpjes

def _meld(tekst):
    if BRUG:
        MELDINGEN.append(str(tekst))
    else:
        vs.AlrtDialog(tekst)


def _klik_of_locus(klaar):
    """Is er een 2D-locus geselecteerd, dan wordt die plek gebruikt; anders vraagt Vectorworks om een klik."""
    for h in _objecten('(SEL=TRUE)'):
        if vs.GetTypeN(h) == 17:
            klaar(vs.GetLocPt(h))
            return
    vs.GetPt(klaar)


def _basis():
    pad = vs.GetFPathName()
    if not pad or not os.path.isabs(pad):
        _meld('Sla de tekening eerst op; de kabeltool zet zijn bestanden ernaast.')
        return None
    return os.path.splitext(pad)[0]


def _lees(achtervoegsel):
    b = _basis()
    if not b:
        return None
    try:
        with open(b + achtervoegsel, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, OSError, ValueError):
        return {}


def _inst():
    p = _lees('.kt-project.json')
    if p is None:
        return None
    inst = dict(STANDAARD)
    inst.update(p.get('instellingen') or {})
    return inst


def _pm():
    """Aantal tekeneenheden per meter (uit de documenteenheden: upi = eenheden per inch)."""
    upi = vs.GetUnits()[3]
    if not upi or upi <= 0:
        upi = 25.4                        # terugval: millimeters
    return upi / 0.0254


def _zorg_record(naam, velden):
    """Maakt het recordformaat aan en voegt alleen ontbrekende tekstvelden toe."""
    h = vs.GetObject(naam)
    bestaand = set()
    if h:
        for i in range(1, vs.NumFields(h) + 1):
            bestaand.add(vs.GetFldName(h, i))
    for veld in velden:
        if veld not in bestaand:
            vs.NewField(naam, veld, '', 4, 0)


def _zorg_records():
    _zorg_record(REC, ('soort', 'id', 'naam', 'ouder', 'z'))
    _zorg_record(GEN, ('soort',))
    _zorg_record(LINK, ('drop',))


def _zorg_klasse(naam):
    oud = vs.ActiveClass()
    vs.NameClass(naam)
    vs.NameClass(oud)


def _naar_laag(naam):
    """Maakt de laag actief (en maakt hem aan als hij niet bestaat). Geeft de oude laagnaam terug."""
    oud = vs.GetLName(vs.ActLayer())
    vs.Layer(naam)
    return oud


def _objecten(criteria):
    lijst = []
    vs.ForEachObject(lambda h: lijst.append(h), criteria)
    return lijst


def _veld(h, veld):
    return vs.GetRField(h, REC, veld)


def _volgende(soort, letter):
    hoogste = 0
    for h in _objecten("(R IN ['%s'])" % REC):
        if _veld(h, 'soort') == soort:
            try:
                hoogste = max(hoogste, int(_veld(h, 'id')[len(letter):]))
            except ValueError:
                pass
    return hoogste + 1


def _merk(h, soort, ident, naam='', ouder='', z=''):
    vs.SetRecord(h, REC)
    for veld, waarde in (('soort', soort), ('id', ident), ('naam', naam), ('ouder', ouder), ('z', z)):
        vs.SetRField(h, REC, veld, str(waarde))


def _punten(h, pm):
    """Punten van lijn / polygoon / polylijn / 3D-polygoon, in meters."""
    t = vs.GetTypeN(h)
    pts = []
    if t == 2:                                   # lijn
        for p in (vs.GetSegPt1(h), vs.GetSegPt2(h)):
            pts.append([p[0] / pm, p[1] / pm, 0.0])
    elif t in (5, 21):                           # polygoon / polylijn
        for i in range(1, vs.GetVertNum(h) + 1):
            p = vs.GetPolyPt(h, i)
            pts.append([p[0] / pm, p[1] / pm, 0.0])
    elif t == 25:                                # 3D-polygoon (index begint bij 0)
        for i in range(vs.GetVertNum(h)):
            p = vs.GetPolyPt3D(h, i)
            pts.append([p[0] / pm, p[1] / pm, p[2] / pm])
    return pts


def _geselecteerd():
    return _objecten('(SEL=TRUE)')


def _zonder_prefix(klasse, inst):
    pre = inst['prefix']
    return klasse[len(pre):] if klasse.startswith(pre) else klasse


# ---------------------------------------------------------------- stap 2: dim city

def plaats_dimcity():
    """Klik een plek aan; maakt klasse PP/DBn, tekent het vierkant met de naam."""
    inst = _inst()
    if inst is None:
        return
    _zorg_records()

    def klaar(pt):
        _maak_dimcity(pt, inst)
        exporteer(stil=True)

    _klik_of_locus(klaar)


def _maak_dimcity(pt, inst):
    """Tekent dim city DBn op punt pt (tekeneenheden). Geeft de naam terug."""
    nr = _volgende('dimcity', 'DB')
    naam = 'DB%d' % nr
    klasse = inst['prefix'] + naam
    _zorg_klasse(klasse)
    oud = _naar_laag(inst['laagCabling'])
    s = float(inst['dimcityMaat']) * _pm() / 2.0
    x, y = pt[0], pt[1]
    vs.Rect(x - s, y + s, x + s, y - s)
    h = vs.LNewObj()
    vs.SetClass(h, klasse)
    _merk(h, 'dimcity', naam, naam)
    vs.TextSize(14)
    vs.TextJust(2)
    vs.TextVerticalAlign(3)
    vs.TextOrigin(x, y)
    vs.CreateText(naam)
    vs.SetClass(vs.LNewObj(), klasse)
    vs.Layer(oud)
    return naam


# ---------------------------------------------------------------- stap 3: routes en drops

def vloerroute_van_selectie():
    """Geselecteerde lijn/polylijn wordt vloerroute. Teken hem vanaf de dim city naar de voet van de grote drop."""
    inst = _inst()
    if inst is None:
        return
    _zorg_records()
    n = 0
    for h in _geselecteerd():
        if vs.GetTypeN(h) in (2, 5, 21, 25) and not vs.GetRField(h, REC, 'id'):
            _merk(h, 'vloer', 'V%d' % _volgende('vloer', 'V'))
            n += 1
    if not n:
        _meld('Selecteer eerst een lijn of polylijn.')
    exporteer(stil=True)


def _getal(tekst, standaard):
    try:
        return float(str(tekst).replace(',', '.'))
    except (TypeError, ValueError):
        return standaard


def trusslijn_van_selectie(hoogte=None):
    """Geselecteerde lijn/polylijn/3D-polygoon wordt truss-lijn. Eerste punt = begin van de kabeltruss.
    Vanuit de palette (BRUG) komen er geen invulvensters: naam = klasse van de lijn, hoogte = 'hoogte'."""
    inst = _inst()
    if inst is None:
        return
    _zorg_records()
    n = 0
    for h in _geselecteerd():
        t = vs.GetTypeN(h)
        if t not in (2, 5, 21, 25) or vs.GetRField(h, REC, 'id'):
            continue
        klasse = _zonder_prefix(vs.GetClass(h), inst)
        if not klasse or klasse == 'None':
            klasse = 'LX%02d' % _volgende('truss', 'T')
        naam = klasse if BRUG else vs.StrDialog('Naam van de truss (wordt ook de klasse):', klasse)
        if not naam:
            continue
        z = ''
        if t != 25:
            if BRUG:
                z = _getal(hoogte, 8.0)
            else:
                z = _getal(vs.StrDialog('Hoogte van de truss in meters:', '8'), 0.0)
        doel = inst['prefix'] + naam
        _zorg_klasse(doel)
        vs.SetClass(h, doel)
        _merk(h, 'truss', 'T%d' % _volgende('truss', 'T'), naam, '', z)
        n += 1
    if not n:
        _meld('Selecteer eerst een lijn, polylijn of 3D-polygoon.')
    exporteer(stil=True)


def _op_lijn(pts, p):
    """Dichtstbijzijnde punt op een lijn in bovenaanzicht. Geeft (afstand_tot_lijn, punt)."""
    best = None
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        vx, vy = b[0] - a[0], b[1] - a[1]
        l2 = vx * vx + vy * vy
        t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 if l2 else 0.0
        t = max(0.0, min(1.0, t))
        q = [a[0] + vx * t, a[1] + vy * t, a[2] + (b[2] - a[2]) * t]
        d = math.hypot(q[0] - p[0], q[1] - p[1])
        if best is None or d < best[0]:
            best = (d, q)
    return best


def _trussen(pm):
    lijst = []
    for h in _objecten("(R IN ['%s'])" % REC):
        if _veld(h, 'soort') != 'truss':
            continue
        pts = _punten(h, pm)
        if vs.GetTypeN(h) != 25:
            try:
                z = float(_veld(h, 'z') or 0)
            except ValueError:
                z = 0.0
            pts = [[p[0], p[1], z] for p in pts]
        lijst.append({'h': h, 'id': _veld(h, 'id'), 'naam': _veld(h, 'naam'), 'punten': pts})
    return lijst


def drop_toevoegen():
    """Klik op of bij een truss-lijn; de drop komt op het dichtstbijzijnde punt van die lijn."""
    inst = _inst()
    if inst is None:
        return
    _zorg_records()

    def klaar(pt):
        if _maak_drop(pt, inst):
            exporteer(stil=True)

    _klik_of_locus(klaar)


def _maak_drop(pt, inst):
    """Drop op het dichtstbijzijnde punt van een truss-lijn. Geeft (id, x, y, z in meters, trussnaam) of None."""
    pm = _pm()
    p = [pt[0] / pm, pt[1] / pm]
    best = None
    for t in _trussen(pm):
        if len(t['punten']) < 2:
            continue
        d, q = _op_lijn(t['punten'], p)
        if best is None or d < best[0]:
            best = (d, q, t)
    if best is None:
        _meld('Er is nog geen truss-lijn. Maak die eerst.')
        return None
    d, q, t = best
    klasse = inst['prefix'] + t['naam']
    _zorg_klasse(klasse)
    oud = _naar_laag(inst['laagCabling'])
    r = 0.15 * pm
    x, y = q[0] * pm, q[1] * pm
    vs.Oval(x - r, y + r, x + r, y - r)
    h = vs.LNewObj()
    vs.SetClass(h, klasse)
    ident = 'D%d' % _volgende('drop', 'D')
    _merk(h, 'drop', ident, '', t['id'], q[2])
    vs.Layer(oud)
    return (ident, q[0], q[1], q[2], t['naam'])


def lampen_koppelen():
    """Selecteer één drop (het rondje) en de lampen die erbij horen."""
    _zorg_records()
    drop = None
    for h in _geselecteerd():
        if vs.GetRField(h, REC, 'soort') == 'drop':
            drop = vs.GetRField(h, REC, 'id')
    if not drop:
        _meld('Selecteer ook het rondje van de drop.')
        return
    lampen = _objecten("(SEL=TRUE) & (PON='%s')" % LD)
    for h in lampen:
        vs.SetRecord(h, LINK)
        vs.SetRField(h, LINK, 'drop', drop)
    _meld('%d lampen gekoppeld aan %s.' % (len(lampen), drop))
    exporteer(stil=True)


# ---------------------------------------------------------------- demo-show

DEMO_LAAG_LAMPEN = 'Lightplot'


def _maak_truss(naam, punten, inst, pm):
    """Tekent een truss-lijn als 3D-polygoon (punten in meters: x, y, z) en markeert hem als truss.
    Lukt de 3D-polygoon niet, dan een polylijn met de hoogte in het record."""
    klasse = inst['prefix'] + naam
    _zorg_klasse(klasse)
    oud = _naar_laag(inst['laagInfra'])
    z = ''
    h = None
    try:
        vs.BeginPoly3D()
        for p in punten:
            vs.Add3DPt((p[0] * pm, p[1] * pm, p[2] * pm))
        vs.EndPoly3D()
        h = vs.LNewObj()
        if not h or vs.GetTypeN(h) != 25:
            if h:
                vs.DelObject(h)
            h = None
    except Exception:
        h = None
    if h is None:
        vs.OpenPoly()
        vs.BeginPoly()
        for p in punten:
            vs.AddPoint((p[0] * pm, p[1] * pm))
        vs.EndPoly()
        h = vs.LNewObj()
        z = punten[0][2]
    vs.SetClass(h, klasse)
    _merk(h, 'truss', 'T%d' % _volgende('truss', 'T'), naam, '', z)
    vs.Layer(oud)


def _maak_vloer(punten, klasse, inst, pm):
    """Tekent een vloerroute als polylijn (punten in meters) en markeert hem."""
    _zorg_klasse(klasse)
    oud = _naar_laag(inst['laagCabling'])
    vs.OpenPoly()
    vs.BeginPoly()
    for p in punten:
        vs.AddPoint((p[0] * pm, p[1] * pm))
    vs.EndPoly()
    h = vs.LNewObj()
    vs.SetClass(h, klasse)
    _merk(h, 'vloer', 'V%d' % _volgende('vloer', 'V'))
    vs.Layer(oud)


def _demo_lampen(drop, aantal, inst, pm):
    """Zet een rij Spotlight-lampen onder de drop en koppelt ze. Geeft het aantal gelukte lampen."""
    ident, x, y, z, truss = drop
    klasse = inst['prefix'] + truss
    oud = _naar_laag(DEMO_LAAG_LAMPEN)
    gelukt = 0
    for i in range(aantal):
        lx = (x + (i - (aantal - 1) / 2.0)) * pm
        ly = (y - 1.5) * pm
        try:
            h = vs.CreateCustomObjectN(LD, (lx, ly), 0, False)
        except Exception:
            h = None
        if not h:
            continue
        vs.SetClass(h, klasse)
        vs.SetRField(h, LD, 'Inst Type', 'Demo spot')
        vs.SetRField(h, LD, 'Unit Number', '%s-%d' % (ident, i + 1))
        vs.ResetObject(h)
        vs.SetRecord(h, LINK)
        vs.SetRField(h, LINK, 'drop', ident)
        gelukt += 1
    vs.Layer(oud)
    return gelukt


def demo_show():
    """Tekent een kleine voorbeeldshow in een lege, opgeslagen tekening:
    DB1 en DB2, trussen LX01 en LX02 (12 m, 8 m hoog, 6 m uit elkaar), twee vloerroutes,
    drie drops en vier lampen per drop. Niet getest in Vectorworks."""
    inst = _inst()
    if inst is None:
        return
    _zorg_records()
    if _objecten("(R IN ['%s'])" % REC):
        _meld('Deze tekening heeft al Kabeltool-objecten. Maak de demo-show in een nieuwe, lege tekening.')
        return
    pm = _pm()

    # dim cities op de vloer
    _maak_dimcity((0 * pm, 0 * pm), inst)
    _maak_dimcity((20 * pm, 0 * pm), inst)

    # trussen; eerste punt = begin van de kabeltruss (aan de kant van de dim city)
    _maak_truss('LX01', [(4, 10, 8), (16, 10, 8)], inst, pm)
    _maak_truss('LX02', [(16, 16, 8), (4, 16, 8)], inst, pm)

    # vloerroutes van dim city naar de voet van de grote drop (begin van de truss)
    _maak_vloer([(0, 0), (0, 10), (4, 10)], inst['prefix'] + 'DB1', inst, pm)
    _maak_vloer([(20, 0), (20, 16), (16, 16)], inst['prefix'] + 'DB2', inst, pm)

    # drops: twee op LX01, een op LX02
    drops = []
    for x, y in ((7, 10), (13, 10), (10, 16)):
        d = _maak_drop((x * pm, y * pm), inst)
        if d:
            drops.append(d)

    # lampen (Spotlight); lukt dat niet, dan zonder lampen verder
    lampen = 0
    for d in drops:
        lampen += _demo_lampen(d, 4, inst, pm)

    exporteer(stil=True)
    if lampen:
        _meld('Demo-show getekend: 2 dim cities, 2 trussen, 2 vloerroutes, %d drops, %d lampen.' % (len(drops), lampen))
    else:
        _meld('Demo-show getekend: 2 dim cities, 2 trussen, 2 vloerroutes, %d drops. '
              'Lampen konden niet gemaakt worden (Spotlight); koppel zelf lampen met Lampen koppelen.' % len(drops))


# ---------------------------------------------------------------- de tools (gereedschapset Kabeltool)
# De C++-tools vangen de klikken op en roepen deze functies aan met punten in meters.
# Hier wordt nooit op een klik gewacht (geen vs.GetPt), dat liet Vectorworks crashen.

def tool_dimcity(a):
    inst = _inst()
    if inst is None:
        return
    _zorg_records()
    pm = _pm()
    _maak_dimcity((float(a['x']) * pm, float(a['y']) * pm), inst)
    exporteer(stil=True)


def tool_drop(a):
    inst = _inst()
    if inst is None:
        return
    _zorg_records()
    pm = _pm()
    if _maak_drop((float(a['x']) * pm, float(a['y']) * pm), inst):
        exporteer(stil=True)


def tool_vloer(a):
    inst = _inst()
    if inst is None:
        return
    punten = [(float(p[0]), float(p[1])) for p in a.get('punten') or []]
    if len(punten) < 2:
        _meld('Klik minstens twee punten voor een vloerroute.')
        return
    _zorg_records()
    _maak_vloer(punten, vs.ActiveClass(), inst, _pm())
    exporteer(stil=True)


def tool_truss(a):
    inst = _inst()
    if inst is None:
        return
    punten = [(float(p[0]), float(p[1])) for p in a.get('punten') or []]
    if len(punten) < 2:
        _meld('Klik minstens twee punten voor een truss-lijn (eerste punt = begin van de kabeltruss).')
        return
    _zorg_records()
    naam = str(a.get('naam') or '').strip() or ('LX%02d' % _volgende('truss', 'T'))
    z = _getal(a.get('hoogte'), 8.0)
    _maak_truss(naam, [(p[0], p[1], z) for p in punten], inst, _pm())
    exporteer(stil=True)


# ---------------------------------------------------------------- uitwisselen met de palette

def exporteer(stil=False):
    """Schrijft de geometrie naar <tekening>.kt-tekening.json. Daarna in de palette: Verversen."""
    b = _basis()
    inst = _inst()
    if not b or inst is None:
        return
    _zorg_records()
    pm = _pm()
    data = {'versie': 1, 'dimcities': [], 'vloerroutes': [], 'trusslijnen': [], 'drops': [], 'lampen': [], 'selectie': []}
    for h in _objecten("(R IN ['%s'])" % REC):
        soort, ident = _veld(h, 'soort'), _veld(h, 'id')
        if soort == 'dimcity':
            c = vs.HCenter(h)
            try:
                nr = int(ident[2:])
            except ValueError:
                nr = 1
            data['dimcities'].append({'id': ident, 'nr': nr, 'uuid': vs.GetObjectUuid(h), 'x': c[0] / pm, 'y': c[1] / pm, 'z': 0})
        elif soort == 'vloer':
            data['vloerroutes'].append({'id': ident, 'uuid': vs.GetObjectUuid(h), 'punten': _punten(h, pm)})
        elif soort == 'drop':
            c = vs.HCenter(h)
            try:
                z = float(_veld(h, 'z') or 0)
            except ValueError:
                z = 0.0
            data['drops'].append({'id': ident, 'uuid': vs.GetObjectUuid(h), 'truss': _veld(h, 'ouder'), 'x': c[0] / pm, 'y': c[1] / pm, 'z': z})
    for t in _trussen(pm):
        data['trusslijnen'].append({'id': t['id'], 'uuid': vs.GetObjectUuid(t['h']), 'naam': t['naam'], 'klasse': t['naam'], 'punten': t['punten']})
    for h in _objecten("(R IN ['%s'])" % LINK):
        naam = ('%s %s' % (vs.GetRField(h, LD, 'Inst Type'), vs.GetRField(h, LD, 'Unit Number'))).strip()
        data['lampen'].append({'uuid': vs.GetObjectUuid(h), 'naam': naam, 'drop': vs.GetRField(h, LINK, 'drop')})
    for h in _objecten("(SEL=TRUE) & (R IN ['%s'])" % REC):
        data['selectie'].append(_veld(h, 'id'))
    for lijst in ('dimcities', 'vloerroutes', 'trusslijnen', 'drops'):
        data[lijst].sort(key=lambda o: (len(o['id']), o['id']))
    with open(b + '.kt-tekening.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1)
    if not stil:
        _meld('Geëxporteerd: %d dim cities, %d vloerroutes, %d truss-lijnen, %d drops, %d lampen.' % (
            len(data['dimcities']), len(data['vloerroutes']), len(data['trusslijnen']), len(data['drops']), len(data['lampen'])))
    return data


def selecteer_id(doel):
    """Selecteert de dim city / drop (en de lampen van die drop) met dit id."""
    if not doel:
        return
    vs.DSelectAll()
    for h in _objecten("(R IN ['%s'])" % REC):
        if _veld(h, 'id') == doel:
            vs.SetSelect(h)
    for h in _objecten("(R IN ['%s'])" % LINK):
        if vs.GetRField(h, LINK, 'drop') == doel:
            vs.SetSelect(h)


def selecteer_uit_palette():
    """Selecteert in Vectorworks wat in de palette het laatst is aangeklikt (alleen nodig zonder web palette)."""
    p = _lees('.kt-project.json')
    selecteer_id((p or {}).get('selecteer'))


# ---------------------------------------------------------------- tekenen van labels

def _kleur(hexkleur):
    k = (hexkleur or '#999999').lstrip('#')
    try:
        return tuple(int(k[i:i + 2], 16) * 257 for i in (0, 2, 4))
    except ValueError:
        return (40000, 40000, 40000)


def _gen(klasse, soort='label'):
    h = vs.LNewObj()
    vs.SetClass(h, klasse)
    vs.SetRecord(h, GEN)
    vs.SetRField(h, GEN, 'soort', soort)
    return h


def _tekst(tekst, x, y, punten, uitlijning, klasse):
    vs.TextSize(max(2.0, punten))
    vs.TextJust(uitlijning)          # 1 links, 2 midden, 3 rechts
    vs.TextVerticalAlign(3)          # midden
    vs.TextOrigin(x, y)
    vs.CreateText(str(tekst))
    return _gen(klasse)


def _kabelsymbool(x, top, B, H, rij, klasse, inst):
    """Blokje: links korte naam, rechts lengte, gekleurde balk over de volle breedte, nummer ernaast."""
    vak = H * 0.78
    vs.Rect(x, top, x + B, top - H)
    h = _gen(klasse)
    vs.SetFPat(h, 1)
    vs.SetFillBack(h, (65535, 65535, 65535))
    vs.Rect(x, top - vak, x + B, top - H)
    h = _gen(klasse)
    vs.SetFPat(h, 1)
    vs.SetFillBack(h, _kleur(rij.get('kleur')))
    vs.MoveTo(x + B / 2.0, top)
    vs.LineTo(x + B / 2.0, top - vak)
    _gen(klasse)
    mm_h = float(inst['symboolHoogte']) * 0.78 * 0.7

    def pt(t):
        mm_b = (float(inst['symboolBreedte']) / 2.0 * 0.85) / (max(len(str(t)), 1) * 0.6)
        return min(mm_h, mm_b) / 0.3528

    _tekst(rij.get('kort', ''), x + B / 4.0, top - vak / 2.0, pt(rij.get('kort', '')), 2, klasse)
    _tekst(rij.get('lengte', ''), x + B * 0.75, top - vak / 2.0, pt(rij.get('lengte', '')), 2, klasse)
    if rij.get('nummer'):
        _tekst(rij['nummer'], x + B + H * 0.3, top - H / 2.0, float(inst['symboolHoogte']) * 0.7 / 0.3528, 1, klasse)


def _teken_label(lb, pm, mm, inst):
    B, H = float(inst['symboolBreedte']) * mm, float(inst['symboolHoogte']) * mm
    klasse = inst['prefix'] + (lb.get('klasse') or 'Kabels')
    _zorg_klasse(klasse)
    x, y = lb['x'] * pm, lb['y'] * pm
    soort = lb.get('soort')
    titelpt = float(inst['symboolHoogte']) * 0.7 / 0.3528

    if soort == 'streepje':                       # lengtehulp
        nx, ny = lb.get('nx', 0) * H, lb.get('ny', 1) * H
        vs.MoveTo(x - nx, y - ny)
        vs.LineTo(x + nx, y + ny)
        _gen(klasse, 'streepje')
        _tekst(lb.get('titel', ''), x + nx * 1.8, y + ny * 1.8, titelpt * 0.7, 2, klasse)
        return
    if soort == 'blok':                           # blok op de infra-laag
        top = y - H * 1.5 - lb.get('rijNr', 0) * H * 1.3
        vs.Rect(x - B / 2.0, top, x + B / 2.0, top - H)
        _gen(klasse, 'blok')
        _tekst(lb.get('titel', ''), x, top - H / 2.0, titelpt * 0.8, 2, klasse)
        return

    if soort in ('koppel', 'bol'):                # stip / bolletje op het punt zelf
        r = H * (0.6 if soort == 'bol' else 0.3)
        vs.Oval(x - r, y + r, x + r, y - r)
        h = _gen(klasse)
        vs.SetFPat(h, 1)
        vs.SetFillBack(h, (0, 0, 0))
    ox, oy = x + H * 2.5, y + H * 2.5             # leader naar het blok met kabels
    if soort == 'dimcity':
        ox, oy = x + float(inst['dimcityMaat']) * pm * 0.7, y
    else:
        vs.MoveTo(x, y)
        vs.LineTo(ox, oy)
        _gen(klasse)
    if lb.get('titel'):
        _tekst(lb['titel'], ox, oy + H * 0.6, titelpt, 1, klasse)
    for i, rij in enumerate(lb.get('rijen') or []):
        _kabelsymbool(ox, oy - i * H * 1.2, B, H, rij, klasse, inst)


def tekening_bijwerken():
    """Verwijdert de oude labels en tekent alles opnieuw uit het projectbestand van de palette."""
    p = _lees('.kt-project.json')
    inst = _inst()
    if not p or inst is None:
        _meld('Geen projectbestand gevonden. Open de tekening eerst in de palette.')
        return
    _zorg_records()
    for h in _objecten("(R IN ['%s'])" % GEN):
        vs.DelObject(h)
    pm = _pm()
    start = vs.GetLName(vs.ActLayer())
    for laagsleutel, laagnaam in (('cabling', inst['laagCabling']), ('infra', inst['laagInfra'])):
        labels = [l for l in (p.get('tekenlijst') or []) if l.get('laag', 'cabling') == laagsleutel]
        if not labels:
            continue
        vs.Layer(laagnaam)
        mm = vs.GetLScale(vs.ActLayer()) / 1000.0 * pm     # 1 mm op papier, in tekeneenheden
        for lb in labels:
            _teken_label(lb, pm, mm, inst)
    vs.Layer(start)
    vs.ReDrawAll()


# ---------------------------------------------------------------- stap 4: stempelen naar Spotlight

def stempelen():
    """Zet multinummer, circuit, LK/VEAM-naam en poort in de Spotlight-velden van de gekoppelde lampen."""
    p = _lees('.kt-project.json')
    if not p:
        _meld('Geen projectbestand gevonden.')
        return
    n = mis = 0
    for s in p.get('stempels') or []:
        h = vs.GetObjectByUuid(s.get('uuid', ''))
        if not h:
            mis += 1
            continue
        vs.SetRField(h, LD, 'Circuit Name', s.get('circuitName', ''))
        vs.SetRField(h, LD, 'Circuit Number', s.get('circuitNumber', ''))
        vs.SetRField(h, LD, 'User Field 2', s.get('uf2', ''))
        vs.SetRField(h, LD, 'User Field 3', s.get('uf3', ''))
        vs.ResetObject(h)
        n += 1
    _meld('%d lampen gestempeld%s.' % (n, (', %d niet gevonden' % mis) if mis else ''))
