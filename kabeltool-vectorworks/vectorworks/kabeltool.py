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


# ---------------------------------------------------------------- hulpjes

def _basis():
    pad = vs.GetFPathName()
    if not pad or not os.path.isabs(pad):
        vs.AlrtDialog('Sla de tekening eerst op; de kabeltool zet zijn bestanden ernaast.')
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
    """Aantal tekeneenheden per meter."""
    return vs.GetPrefReal(152) / 0.0254   # 152 = eenheden per inch


def _zorg_records():
    for veld in ('soort', 'id', 'naam', 'ouder', 'z'):
        vs.NewField(REC, veld, '', 4, 0)
    vs.NewField(GEN, 'soort', '', 4, 0)
    vs.NewField(LINK, 'drop', '', 4, 0)


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
        exporteer(stil=True)

    vs.GetPt(klaar)


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
        vs.AlrtDialog('Selecteer eerst een lijn of polylijn.')
    exporteer(stil=True)


def trusslijn_van_selectie():
    """Geselecteerde lijn/polylijn/3D-polygoon wordt truss-lijn. Eerste punt = begin van de kabeltruss."""
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
        naam = vs.StrDialog('Naam van de truss (wordt ook de klasse):', klasse)
        if not naam:
            continue
        z = ''
        if t != 25:
            tekst = vs.StrDialog('Hoogte van de truss in meters:', '8')
            try:
                z = float(str(tekst).replace(',', '.'))
            except ValueError:
                z = 0.0
        doel = inst['prefix'] + naam
        _zorg_klasse(doel)
        vs.SetClass(h, doel)
        _merk(h, 'truss', 'T%d' % _volgende('truss', 'T'), naam, '', z)
        n += 1
    if not n:
        vs.AlrtDialog('Selecteer eerst een lijn, polylijn of 3D-polygoon.')
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
            vs.AlrtDialog('Er is nog geen truss-lijn. Maak die eerst.')
            return
        d, q, t = best
        klasse = inst['prefix'] + t['naam']
        _zorg_klasse(klasse)
        oud = _naar_laag(inst['laagCabling'])
        r = 0.15 * pm
        x, y = q[0] * pm, q[1] * pm
        vs.Oval(x - r, y + r, x + r, y - r)
        h = vs.LNewObj()
        vs.SetClass(h, klasse)
        _merk(h, 'drop', 'D%d' % _volgende('drop', 'D'), '', t['id'], q[2])
        vs.Layer(oud)
        exporteer(stil=True)

    vs.GetPt(klaar)


def lampen_koppelen():
    """Selecteer één drop (het rondje) en de lampen die erbij horen."""
    _zorg_records()
    drop = None
    for h in _geselecteerd():
        if vs.GetRField(h, REC, 'soort') == 'drop':
            drop = vs.GetRField(h, REC, 'id')
    if not drop:
        vs.AlrtDialog('Selecteer ook het rondje van de drop.')
        return
    lampen = _objecten("(SEL=TRUE) & (PON='%s')" % LD)
    for h in lampen:
        vs.SetRecord(h, LINK)
        vs.SetRField(h, LINK, 'drop', drop)
    vs.AlrtDialog('%d lampen gekoppeld aan %s.' % (len(lampen), drop))
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
        vs.AlrtDialog('Geëxporteerd: %d dim cities, %d vloerroutes, %d truss-lijnen, %d drops, %d lampen.' % (
            len(data['dimcities']), len(data['vloerroutes']), len(data['trusslijnen']), len(data['drops']), len(data['lampen'])))


def selecteer_uit_palette():
    """Selecteert in Vectorworks wat in de palette het laatst is aangeklikt."""
    p = _lees('.kt-project.json')
    doel = (p or {}).get('selecteer')
    if not doel:
        return
    vs.DSelectAll()
    for h in _objecten("(R IN ['%s'])" % REC):
        if _veld(h, 'id') == doel:
            vs.SetSelect(h)
    for h in _objecten("(R IN ['%s'])" % LINK):
        if vs.GetRField(h, LINK, 'drop') == doel:
            vs.SetSelect(h)


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
        vs.AlrtDialog('Geen projectbestand gevonden. Open de tekening eerst in de palette.')
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
        vs.AlrtDialog('Geen projectbestand gevonden.')
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
    vs.AlrtDialog('%d lampen gestempeld%s.' % (n, (', %d niet gevonden' % mis) if mis else ''))
