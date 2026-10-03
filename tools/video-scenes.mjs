// The tutorial videos as scripts: what is said and what is done in the app while it is said.
// Every part starts from the tutorial project (the patch is imported, nothing else) and prepares what the earlier parts built,
// so the parts can be watched alone or one after the other as one workflow. Text is written for a text-to-speech voice
// (letters spaced out: "L K", "D B", "D M X").
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAN_IMAGE = path.join(HERE, 'video-assets', 'stage-plan.png');

export const OVERLAY = `(() => {
  const mk = () => {
    if (document.getElementById('vcap')) return;
    const st = document.createElement('style');
    st.textContent = '#vcap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);max-width:78%;z-index:2147483646;background:rgba(8,10,14,.88);color:#fff;font:600 21px/1.35 system-ui,sans-serif;padding:12px 22px;border-radius:12px;text-align:center;box-shadow:0 6px 28px rgba(0,0,0,.5);transition:opacity .25s;pointer-events:none}#vcap.off{opacity:0}#vttl{position:fixed;top:58px;right:16px;z-index:2147483646;background:#ff8200;color:#1a0f00;font:700 14px system-ui;padding:6px 14px;border-radius:20px;pointer-events:none;letter-spacing:.3px}#vcur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-4px 0 0 -4px;pointer-events:none}#vcur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}.vring{position:fixed;z-index:2147483645;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #ff8200;pointer-events:none;animation:vr .5s ease-out forwards}@keyframes vr{to{transform:scale(3.2);opacity:0}}';
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'vcap'; c.className = 'off'; document.body.appendChild(c);
    const t = document.createElement('div'); t.id = 'vttl'; t.style.display = 'none'; document.body.appendChild(t);
    const cur = document.createElement('div'); cur.id = 'vcur'; cur.style.left = '-50px'; cur.style.top = '-50px';
    cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'vring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  };
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  setInterval(mk, 500);
})();`;

// ---- what earlier parts built (done in one go, off camera) ----
const DBS = "['DB01','DB02','DB03']";
const doAdvice = k => k.ev(() => { for (const dc of ['DB01', 'DB02', 'DB03']) window.RackAdvisor.apply(dc); window.LKApp.addDimCity('FOH'); window.LKApp.renderAll(); });
const doNodes = k => k.ev(() => { for (const dc of ['DB01', 'DB02', 'DB03']) window.RackPlan.applyToNetworkPlan(dc, { quiet: true }); window.NodeLink.autoLink(); window.LKApp.renderAll(); });
const doSwitches = k => k.ev(() => {
  const plan = dc => window.LKApp.net.getDimPlan(dc);
  const sw = (dc, n) => ({ id: `${dc}-SW${n}`, name: `${dc} Luminex GigaCore 20t (3U set)`, typeId: 'SWITCH:LMX-GC20T-3U', ip: '', subnet: '', ifaces: [] });
  for (const dc of ['DB01', 'DB02', 'DB03', 'FOH']) plan(dc).switches = dc === 'DB01' ? [sw(dc, 1), sw(dc, 2), sw(dc, 3)] : [sw(dc, 1)];
  window.LKApp.getMODEL().networkDevices.prefs.fent = { on: true, group: 'production', scan: false, vlanMode: 'luminex' };
  for (const dc of ['DB01', 'DB02', 'DB03', 'FOH']) window.FentUI.applyDim(dc);
  window.LKApp.renderAll();
});
const doFibres = k => k.ev(() => { window.Fibers.autoAssign({ topology: 'ring', intraType: 'CABLE:DEMO-OC75', interType: 'CABLE:DEMO-OC250' }); window.LKApp.renderAll(); });
const upTo = (...fns) => async k => { for (const f of fns) await f(k); };

export const PARTS = [
  { id: 'start', title: '1 · Start with your patch', steps: [
    { say: 'Welcome to DimCity PatchLab. In this series we build a complete show from an imported patch list, all the way to the finished P D F and the stickers.', do: k => k.wait(600) },
    { say: 'This is the overview of an imported project. Three D B\'s with their L K blocks, Veams and universes came straight from the C S V file.', do: async k => { await k.hover('.kpi:nth-of-type(1), .stat-card, .card'); } },
    { say: 'The patch list shows every row: L K\'s, Veams, loose D M X lines, and network cables, which start with the letter C.', do: k => k.go('TABLE') },
    { say: 'If something is wrong, the Validation page tells you. Here there is nothing wrong yet.', do: k => k.go('ISSUES') },
    { say: 'Now open Setup in the toolbar. It walks you through the work in seven steps, in the right order. Nothing is locked: you can skip a step, or stop at any moment.', do: k => k.click('#tbSetup') },
    { say: 'The steps are: import, racks and devices, couple the L K\'s and Veams, the nodes, the network, the fibres, and finally check and output.', do: async k => { for (const id of ['racks', 'lks', 'nodes', 'network', 'fibers', 'check']) { await k.hover(`[data-go=${id}]`); } } },
    { say: 'Let\'s begin with the racks.', do: async k => { await k.click('[data-go=racks]'); await k.wait(800); await k.click('#suStop'); } }
  ] },

  { id: 'racks', title: '2 · Racks and the advice', steps: [
    { say: 'Step two: racks and devices. Open a D B, here D B 1, and look at the card called Advice, best setup.', do: async k => { await k.openDim('DB01'); await k.scrollTo('[data-card$=":advice"]'); } },
    { say: 'PatchLab counts the L K\'s, the Veams, the lines and the universes of this D B, and works out the best setup from the devices in your Device Builder.', do: k => k.hover('.adv-sum') },
    { say: 'It lists the panels and nodes it would use, how much rack space they take, and why. Here three nodes are enough, because a splitter would need more space.', do: k => k.hover('.adv-items') },
    { say: 'It also advises a block mode per L K: twelve X L R for an L K with many ports, three Veams when an L K only carries Veams, and mixed in between. If an L K is set differently, one button fixes it.', do: async k => { await k.ev(() => { const d = document.querySelector('.adv-blocks'); if (d) d.open = true; }); await k.scrollTo('.adv-blocks'); } },
    { say: 'Happy with it? Apply the advice. PatchLab adds a rack made for this D B, and a loose spider when only a few Veams do not deserve a whole panel.', do: async k => { await k.scrollTo('[data-adv-apply]'); await k.click('[data-adv-apply]'); await k.wait(900); await k.scrollTo('.rack'); } },
    { say: 'You can always place racks and loose devices yourself, or change a rack in the Rack Builder. Setup brings you back to the same step afterwards.', do: k => k.wait(800) },
    { say: 'Do the same for the other D B\'s. And F O H, front of house, where the lighting desk stands, is added with the plus next to the DimCities. It does not need a rack.', do: async k => {
        await k.ev(() => { for (const dc of ['DB02', 'DB03']) window.RackAdvisor.apply(dc); window.LKApp.renderAll(); });
        await k.click('#navAddMenu'); await k.wait(700);
        await k.ev(() => { const el = [...document.querySelectorAll('button,div,li')].find(x => /^Add FOH/.test(x.textContent.trim()) && x.children.length < 3); el?.click(); });
        await k.wait(1200); } }
  ] },

  { id: 'couple', title: '3 · Couple LKs and Veams', prep: doAdvice, steps: [
    { say: 'Step three: couple the L K\'s and Veams to the sockets in the rack. Open D B 1 again.', do: async k => { await k.openDim('DB01'); await k.scrollTo('.rp-assign'); } },
    { say: 'By default everything is automatic. The L K\'s take the L K sockets in order, and the Veams fill the free Veam four sockets.', do: k => k.hover('.rp-assign table') },
    { say: 'The table shows every L K and Veam, how many lines it has, the universes, and where it sits now.', do: k => k.hover('.rp-assign tbody tr:nth-child(2)') },
    { say: 'Want it differently? Choose a socket yourself. For example, put L K one oh one on the second L K socket.', do: k => k.select('.rp-assign-sel[data-owner=LK101]', 'LK2') },
    { say: 'Or choose loose spider, when it should hang on a spider cable instead of a rack socket.', do: k => k.select('.rp-assign-sel[data-owner=LK102]', 'spider') },
    { say: 'Or choose do not patch, to leave it out for now.', do: k => k.select('.rp-assign-sel[data-owner=LK103]', 'none') },
    { say: 'Your own choices are kept first, and everything else stays automatic. One button brings everything back to automatic.', do: async k => { await k.click('[data-assign-reset]'); await k.wait(500); } },
    { say: 'A Veam that sits on a rack socket counts as patched. It no longer shows a warning that it is not linked to an L K.', do: async k => { await k.ev(() => window.LKApp.openEntity('VEAM', 'V103')); await k.wait(1500); } }
  ] },

  { id: 'nodes', title: '4 · Nodes', prep: upTo(doAdvice), steps: [
    { say: 'Step four: the nodes. The rack patch becomes the nodes and splitters of the network plan.', do: async k => { await k.click('#tbSetup'); await k.click('[data-go=nodes]'); } },
    { say: 'Click make the nodes in every D B. Every node gets its universes on the right ports, and later its port on the network switch.', do: async k => { await k.click('[data-su-applyall]'); await k.wait(600); } },
    { say: 'Some D M X lines in the C S V say node two oh one dot one. That means D B 2, node 1, port 1.', do: async k => { await k.ev(() => { document.querySelector('#suMain')?.scrollTo({ top: 9999, behavior: 'smooth' }); }); await k.wait(1200); } },
    { say: 'Link automatically, and the universes of those lines are put on that node port.', do: async k => { await k.click('[data-su-nlauto]'); await k.wait(600); } },
    { say: 'You can also pick the name on the node itself, on the Nodes and Splitters page.', do: async k => { await k.click('#suStop'); await k.go('NETWORK'); await k.wait(1200); } }
  ] },

  { id: 'network', title: '5 · Network', prep: upTo(doAdvice, doNodes), steps: [
    { say: 'Step five: the network. Every D B gets a network switch, and the nodes and the network cables take its ports in order.', do: async k => { await k.click('#tbSetup'); await k.click('[data-go=network]'); } },
    { say: 'First choose the numbering of the VLANs. Luminex style: management is VLAN one, group two is VLAN two hundred, and so on. Or use the F E N T numbers.', do: async k => { await k.hover('[data-su-mode] button:nth-child(1)'); await k.hover('[data-su-mode] button:nth-child(2)'); await k.click('[data-su-mode] button:nth-child(1)'); } },
    { say: 'Now add the switches. The Luminex GigaCore twenty T, three U set, is a special device, drawn exactly like the real one. D B 1 gets three of them.', do: async k => { await k.select('#suSwType', 'SWITCH:LMX-GC20T-3U'); await k.click('[data-su-addsw]'); await k.click('[data-su-addsw]'); await k.click('[data-su-addsw]'); } },
    { say: 'The same switch in every other D B takes one click.', do: async k => { await k.click('[data-su-addall]'); await k.wait(500); } },
    { say: 'Open the Network page for the details. Switches and ports shows which port every node and cable takes, with the colour of its VLAN.', do: async k => { await k.click('#suStop'); await k.go('NET'); await k.click('#netTabs [data-tab=ports]'); await k.wait(900); } },
    { say: 'On the VLAN tab you can rename any VLAN, change its colour, or add your own. The new name is used in the port plan, on the stickers and in the P D F.', do: async k => { await k.click('#netTabs [data-tab=vlan]'); await k.scrollTo('.vlanName[data-vlan="200"]'); await k.fill('.vlanName[data-vlan="200"]', 'Lighting FOH'); await k.wait(800); } }
  ] },

  { id: 'fibres', title: '6 · Fibres', prep: upTo(doAdvice, doNodes, doSwitches), steps: [
    { say: 'Step six: the fibres between the switches, inside a D B and between the D B\'s. First make your cable types in the Device Builder, on the Cables tab.', do: async k => { await k.ev(() => window.LKApp.runCommand('deviceBuilder', 'cable')); await k.wait(1800); } },
    { say: 'OpticalCON, FiberFox or S F P patch cables, each with a length. Half metres are fine, like seven point five.', do: async k => { await k.wait(1500); } },
    { say: 'On the Network page, on the Fibres tab, fill in how many of each cable you own.', do: async k => { await k.closeDialog(); await k.go('NET'); await k.click('#netTabs [data-tab=fibers]'); await k.wait(800); } },
    { say: 'Auto-assign chains the switches inside a D B with the short cable, and links the D B\'s with the long cable, as a ring. It only uses ports with the right connector.', do: async k => { await k.click('#fibAuto'); await k.wait(1500); await k.ev(() => [...document.querySelectorAll('.modal-backdrop button')].filter(x => x.offsetParent).find(x => /^Assign$/i.test(x.textContent.trim()))?.click()); await k.wait(900); } },
    { say: 'A cable only fits ports with the same connector: opticalCON cable on opticalCON ports, FiberFox on FiberFox. Other ports are dimmed.', do: async k => { await k.click('#fibView'); await k.wait(800); for (let i = 0; i < 3; i++) { await k.ev(() => document.querySelector('#fvIn')?.click()); await k.wait(250); } await k.wait(600); await k.click('[data-type="CABLE:DEMO-FF250"]'); await k.wait(800); } },
    { say: 'In the Signal Flow, under Show, choose Fibres. Every location is a card with its switches and fibre ports. Drag a switch by its name to place it next to another.', do: async k => {
        const b = await k.page.evaluate(() => { const r = document.querySelector('[data-swd="DB01|DB01-SW3"]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + 8 } : null; });
        if (b) { await k.page.mouse.move(b.x, b.y, { steps: 20 }); await k.page.mouse.down(); await k.page.mouse.move(b.x - 120, b.y + 60, { steps: 20 }); await k.page.mouse.move(b.x - 300, b.y + 80, { steps: 20 }); await k.page.mouse.up(); } await k.wait(800); } },
    { say: 'Cables run in straight lines and hop over each other with a little bridge. To draw one by hand, pick a cable at the bottom, click a free port, and then the port at the other end.', do: async k => { await k.click('[data-type="CABLE:DEMO-OC250"]'); await k.wait(600); } }
  ] },

  { id: 'flow', title: '7 · Signal Flow', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'The Signal Flow shows how the data runs from the rack to every object.', do: async k => { await k.go('FLOW'); await k.wait(1200); } },
    { say: 'Hover a universe to follow it through the drawing. Click it to pin the route.', do: async k => { await k.hover('.fl-uni:nth-child(3)'); await k.wait(1200); await k.click('.fl-uni:nth-child(3)'); await k.wait(1500); await k.click('.fl-uni:nth-child(3)'); } },
    { say: 'The Show switch shows everything, only D M X, only the network, or only the fibres.', do: async k => { await k.click('#flLayer [data-v=dmx]'); await k.wait(900); await k.click('#flLayer [data-v=net]'); await k.wait(900); await k.click('#flLayer [data-v=all]'); } },
    { say: 'Blocks never overlap. Drag a rack or a block to arrange it, and the arrangement is saved per D B. Auto layout puts everything back.', do: async k => { await k.click('.fl-item[data-dc=DB01]'); await k.wait(1500); } },
    { say: 'New: a background picture, like a floor plan or a stage plot. Choose a picture, then set the opacity, the size and the position.', do: async k => { await k.page.setInputFiles('#bgFile', PLAN_IMAGE); await k.wait(1200); await k.click('#bgFit'); await k.wait(800); await k.ev(() => { const e = document.querySelector('#bgOp'); e.value = 55; e.dispatchEvent(new Event('input')); }); await k.wait(800); } },
    { say: 'It can be one picture for all the views, or its own picture for each view. Fit to drawing makes it cover everything.', do: async k => { await k.hover('.fl-bgsec .switch'); await k.wait(1200); } }
  ] },

  { id: 'pdf', title: '8 · Check and the P D F', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'Step seven: check and output. The last step of Setup lists the open issues, and links to the Signal Flow, the P D F and the stickers.', do: async k => { await k.click('#tbSetup'); await k.click('[data-go=check]'); await k.wait(1000); await k.click('#suStop'); } },
    { say: 'Export P D F opens the report builder. Choose the sections: the patch, the racks, the signal flow, the network, the switch ports and the fibre links.', do: async k => { await k.click('#fileExportPdf'); await k.wait(2200); } },
    { say: 'A live preview shows every page before you export.', do: async k => { await k.wait(2500); await k.closeDialog(); } }
  ] },

  { id: 'stickers', title: '9 · Stickers', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'Stickers prints labels on Herma laser sheets: cable labels, strips, node ports, devices, switch ports and fibres.', do: async k => { await k.click('#tbStickers'); await k.wait(1500); } },
    { say: 'Pick the Herma sheet, the D B and what to print. The preview matches the sheet exactly.', do: async k => { await k.wait(2500); } },
    { say: 'A calibration sheet checks that your printer puts every label where the template says. And that is the whole workflow, from the C S V file to the printed show.', do: async k => { await k.wait(2500); await k.closeDialog(); } }
  ] }
];
