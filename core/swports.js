// core/swports.js — port naming for switch types with fibre connectors (e.g. Luminex GigaCore 20t:
// ports 1-16 etherCON/RJ45, 17-18 opticalCON DUO, 19-20 FiberFox DUO).
// A switch type can carry `sfpConnectors` ("opticalCON DUO, opticalCON DUO, FiberFox DUO, FiberFox DUO"),
// `frontCount` (how many RJ45 ports sit on the switch itself; the rest are on a panel) and `jack` ('RJ45' | 'etherCON').
(() => {
  const list = ty => String(ty?.sfpConnectors || '').split(',').map(s => s.trim()).filter(Boolean);
  const SwPorts = {
    connectors: list,
    conn: (ty, n) => list(ty)[n - 1] || '',
    // port number printed on the device for fibre port n (17 on a 16-port + 4-fibre switch), or null for plain "SFP n"
    no: (ty, n) => list(ty).length ? (Number(ty.portCount) || 0) + n : null,
    label(ty, n){ const no = this.no(ty, n); return no ? `${no} · ${this.conn(ty, n)}`.replace(/ · $/, '') : `SFP ${n}`; },
    short(ty, n){ const no = this.no(ty, n); return no ? String(no) : `S${n}`; },
    front: ty => { const f = Number(ty?.frontCount); return Number.isFinite(f) && f > 0 && f < (Number(ty?.portCount) || 0) ? f : (Number(ty?.portCount) || 0); },
    // static (non-patchable) sockets of a panel type: [{ cls:'rj'|'sfp'|'dmx', sub, items:[{ no, title }] }]
    panelGroups(ty){
      const n = k => Number(ty?.[k]) || 0, out = [], range = (c, first, name) => Array.from({ length:c }, (_, i) => ({ no:first + i, title:`${name} ${first + i}` }));
      if(n('xlrCount')) out.push({ cls:'dmx', sub:'', items:range(n('xlrCount'), 1, 'XLR 5-pin') });
      if(n('etherconCount')) out.push({ cls:'rj', sub:'ec', items:range(n('etherconCount'), Number(ty.etherconFirst) || 1, 'etherCON') });
      const ff = Number(ty?.fibreFirst) || 17;
      if(n('opticalConCount')) out.push({ cls:'sfp', sub:'oc', items:range(n('opticalConCount'), ff, 'opticalCON DUO') });
      if(n('fiberfoxCount')) out.push({ cls:'sfp', sub:'ff', items:range(n('fiberfoxCount'), ff + n('opticalConCount'), 'FiberFox DUO') });
      return out;
    },
    // does the rack carry the fibre connectors of this switch on a panel (then the switch itself does not draw them)?
    fibreOnPanel: (ty, rackPanelTypes) => list(ty).length > 0 && (rackPanelTypes || []).some(p => (Number(p?.opticalConCount) || 0) + (Number(p?.fiberfoxCount) || 0) > 0),
    kindOf(conn){ return /optical/i.test(conn) ? 'oc' : /fiberfox/i.test(conn) ? 'ff' : 'sfp'; }
  };
  window.SwPorts = SwPorts;
})();
