# -*- coding: utf-8 -*-
"""Brug tussen de web palette (C++ plug-in) en kabeltool.py.

De plug-in voert uit:  kabeltool_brug.roep('<functie>', '<pad naar argumenten.json>', '<pad voor antwoord.json>')
Het antwoord is altijd: {"ok": true/false, "data": ..., "meldingen": [...], "fout": "..."}

Niet getest in Vectorworks.
"""
import json
import os
import traceback

import kabeltool
import vs


def _laad(a):
    b = kabeltool._basis()
    if not b:
        raise RuntimeError('Sla de tekening eerst op.')
    project = kabeltool._lees('.kt-project.json') or None
    return {'tekening': kabeltool.exporteer(stil=True), 'project': project, 'basis': os.path.basename(b)}


def _bewaar(a):
    b = kabeltool._basis()
    if not b:
        raise RuntimeError('Sla de tekening eerst op.')
    with open(b + '.kt-project.json', 'w', encoding='utf-8') as f:
        json.dump(a, f, indent=1)
    return True


def _selectie(a):
    return [kabeltool._veld(h, 'id') for h in kabeltool._objecten("(SEL=TRUE) & (R IN ['%s'])" % kabeltool.REC)]


def _selecteer(a):
    kabeltool.selecteer_id(a.get('id'))
    return True


def _doe(functie):
    def uitvoeren(a):
        functie()
        return True
    return uitvoeren


def _truss(a):
    kabeltool.trusslijn_van_selectie((a or {}).get('hoogte'))
    return True


# Vanuit de palette nooit iets dat op een klik in de tekening wacht (vs.GetPt): dat crasht Vectorworks.
# Dim city plaatsen en Drop toevoegen gaan via de tools (zie tool() hieronder).
FUNCTIES = {
    'laad': _laad,
    'bewaar': _bewaar,
    'selectie': _selectie,
    'selecteer': _selecteer,
    'vloer': _doe(kabeltool.vloerroute_van_selectie),
    'truss': _truss,
    'lampen': _doe(kabeltool.lampen_koppelen),
    'bijwerken': _doe(kabeltool.tekening_bijwerken),
    'stempelen': _doe(kabeltool.stempelen),
    'demo': _doe(kabeltool.demo_show),
}


def roep(functie, inpad, uitpad):
    kabeltool.BRUG = True
    kabeltool.MELDINGEN = []
    antwoord = {'ok': False}
    try:
        with open(inpad, 'r', encoding='utf-8') as f:
            argumenten = json.load(f)
        antwoord = {'ok': True, 'data': FUNCTIES[functie](argumenten)}
    except Exception as e:                      # alles terugmelden aan de palette
        antwoord = {'ok': False, 'fout': str(e) or e.__class__.__name__, 'spoor': traceback.format_exc()}
    antwoord['meldingen'] = kabeltool.MELDINGEN
    with open(uitpad, 'w', encoding='utf-8') as f:
        json.dump(antwoord, f)
    # Alleen hertekenen na een actie die de tekening verandert, niet bij laden/bewaren/selectie.
    if functie not in ('laad', 'bewaar', 'selectie', 'selecteer'):
        vs.ReDrawAll()


# Ingang voor de C++-tools (gereedschapset Kabeltool). Punten komen in meters binnen.
TOOLS = {
    'dimcity': kabeltool.tool_dimcity,
    'drop': kabeltool.tool_drop,
    'vloer': kabeltool.tool_vloer,
    'truss': kabeltool.tool_truss,
}


def tool(functie, argumenten_json):
    kabeltool.BRUG = False                       # meldingen als gewoon venster: we zitten niet in de palette
    kabeltool.MELDINGEN = []
    try:
        TOOLS[functie](json.loads(argumenten_json))
    except Exception as e:
        vs.AlrtDialog('Kabeltool (%s): %s' % (functie, str(e) or e.__class__.__name__))
    vs.ReDrawAll()
