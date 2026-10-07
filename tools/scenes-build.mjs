// Series 1 — "Build a show": one project, from the imported patch to the finished P D F and the stickers, in ten parts.
import { PLAN_IMAGE, doAdvice, doNodes, doSwitches, doFibres, upTo } from './scenes-common.mjs';

export const BUILD = [
  { id: 'build-1-import', title: '1 · Import the patch', start: 'blank', steps: [
    { say: 'Welcome to DimCity PatchLab. In this series we build a complete show from scratch: from the patch list to the finished P D F and the stickers.', do: k => k.wait(800) },
    { say: 'This is an empty project. The device library of Luminex and E L C is already loaded, so you can start right away.', do: async k => { await k.hover('.nav-item[data-view="HOME"]'); await k.wait(600); } },
    { say: 'Everything starts with the patch list, a C S V file. Click Import C S V in the toolbar.', do: async k => {
        await k.ev(() => { window.app = { openCsv: async () => ({ path: 'Demo patch list.csv', content: window.Demo.csv() }) }; });
        await k.click('#tbImport'); await k.wait(900); } },
    { say: 'Choose which columns hold the L K or Veam I D, the port, the universe and the location. PatchLab detects them for you, and skips header and footer rows.', do: async k => { await k.hover('#wizRows tr:nth-child(3)'); await k.wait(800); } },
    { say: 'Click Import Selection.', do: async k => { await k.click('#wizImport'); await k.wait(1500); } },
    { say: 'The overview now shows three D B\'s with their L K blocks, Veams and universes, all taken from the file.', do: async k => { await k.hover('.kpi:nth-of-type(1), .stat-card, .card'); await k.wait(900); } },
    { say: 'The patch list shows every row: L K\'s, Veams, loose D M X lines, and network cables, which start with the letter C.', do: k => k.go('TABLE') },
    { say: 'The Validation page tells you what is wrong, such as a universe that is used twice, or a Veam that is not linked to an L K.', do: k => k.go('ISSUES') },
    { say: 'The Tasks page is your map. It shows the whole workflow as one line, and for every D B what is done and what comes next.', do: async k => { await k.go('TASKS'); await k.hover('.tk-pipe'); } },
    { say: 'Below it is a square for every D B and every step. Click a square, and you go straight to the right place.', do: async k => { await k.hover('.tk-matrix'); await k.wait(900); } },
    { say: 'Setup walks through the same steps, with an explanation at every step. We use it in the next parts. Let\'s start with the racks.', do: async k => { await k.click('#tbSetup'); await k.wait(700); await k.click('[data-go=racks]'); await k.wait(900); await k.click('#suStop'); } }
  ] },

  { id: 'build-2-racks', title: '2 · Racks and the advice', steps: [
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

  { id: 'build-3-couple', title: '3 · Couple LKs and Veams', prep: doAdvice, steps: [
    { say: 'Step three: couple the L K\'s and Veams to the sockets in the rack. Open D B 1 again.', do: async k => { await k.openDim('DB01'); await k.scrollTo('.rp-assign'); } },
    { say: 'By default everything is automatic. The L K\'s take the L K sockets in order, and the Veams fill the free Veam four sockets.', do: k => k.hover('.rp-assign table') },
    { say: 'The table shows every L K and Veam, how many lines it has, the universes, and where it sits now.', do: k => k.hover('.rp-assign tbody tr:nth-child(2)') },
    { say: 'Want it differently? Choose a socket yourself. For example, put L K one oh one on the second L K socket.', do: k => k.select('.rp-assign-sel[data-owner=LK101]', 'LK2') },
    { say: 'Or choose loose spider, when it should hang on a spider cable instead of a rack socket.', do: k => k.select('.rp-assign-sel[data-owner=LK102]', 'spider') },
    { say: 'Or choose do not patch, to leave it out for now.', do: k => k.select('.rp-assign-sel[data-owner=LK103]', 'none') },
    { say: 'Your own choices are kept first, and everything else stays automatic. One button brings everything back to automatic.', do: async k => { await k.click('[data-assign-reset]'); await k.wait(500); } },
    { say: 'A Veam that sits on a rack socket counts as patched. It no longer shows a warning that it is not linked to an L K.', do: async k => { await k.ev(() => window.LKApp.openEntity('VEAM', 'V103')); await k.wait(1500); } }
  ] },

  { id: 'build-4-nodes', title: '4 · Nodes', prep: upTo(doAdvice), steps: [
    { say: 'Step four: the nodes. The rack patch becomes the nodes and splitters of the network plan.', do: async k => { await k.click('#tbSetup'); await k.click('[data-go=nodes]'); } },
    { say: 'Click make the nodes in every D B. Every node gets its universes on the right ports, and later its port on the network switch.', do: async k => { await k.click('[data-su-applyall]'); await k.wait(600); } },
    { say: 'Some D M X lines in the C S V say node two oh one dot one. That means D B 2, node 1, port 1.', do: async k => { await k.ev(() => { document.querySelector('#suMain')?.scrollTo({ top: 9999, behavior: 'smooth' }); }); await k.wait(1200); } },
    { say: 'Link automatically, and the universes of those lines are put on that node port.', do: async k => { await k.click('[data-su-nlauto]'); await k.wait(600); } },
    { say: 'You can also pick the name on the node itself, on the Nodes and Splitters page.', do: async k => { await k.click('#suStop'); await k.go('NETWORK'); await k.wait(1200); } }
  ] },

  { id: 'build-5-network', title: '5 · Network', prep: upTo(doAdvice, doNodes), steps: [
    { say: 'Step five: the network. Every D B gets a network switch, and the nodes and the network cables take its ports in order.', do: async k => { await k.click('#tbSetup'); await k.click('[data-go=network]'); } },
    { say: 'First choose the numbering of the VLANs. Luminex style: management is VLAN one, group two is VLAN two hundred, and so on. Or use the F E N T numbers.', do: async k => { await k.hover('[data-su-mode] button:nth-child(1)'); await k.hover('[data-su-mode] button:nth-child(2)'); await k.click('[data-su-mode] button:nth-child(1)'); } },
    { say: 'Now add the switches. The Luminex GigaCore twenty T, three U set, is a special device, drawn exactly like the real one. D B 1 gets three of them.', do: async k => { await k.select('#suSwType', 'SWITCH:LMX-GC20T-3U'); await k.click('[data-su-addsw]'); await k.click('[data-su-addsw]'); await k.click('[data-su-addsw]'); } },
    { say: 'The same switch in every other D B takes one click.', do: async k => { await k.click('[data-su-addall]'); await k.wait(500); } },
    { say: 'Open the Network page for the details. Switches and ports shows which port every node and cable takes, with the colour of its VLAN.', do: async k => { await k.click('#suStop'); await k.go('NET'); await k.click('#netTabs [data-tab=ports]'); await k.wait(900); } },
    { say: 'Before you are on site, plan the ports yourself. Pick a VLAN in the bar at the top, then drag across the ports of a switch. They take that VLAN.', do: async k => {
        await k.click('.pp-chip[data-ppb=vid] >> nth=1'); await k.wait(500);
        const tiles = k.page.locator('.pp-sw').first().locator('.pp-port'); const n = await tiles.count();
        const a = await tiles.nth(n - 3).boundingBox(), b = await tiles.nth(n - 1).boundingBox();
        await k.page.mouse.move(a.x + 12, a.y + 12, { steps: 10 }); await k.page.mouse.down(); await k.page.mouse.move(b.x + 12, b.y + 12, { steps: 20 }); await k.page.mouse.up(); await k.wait(1200); } },
    { say: 'Click a port to give it a name by hand. Without a name, the node or cable name is used. Later, Fill in from the plan puts all of it on the real switch.', do: async k => {
        await k.click('.pp-chip[data-ppb=vid] >> nth=1'); await k.wait(400); await k.page.locator('.pp-sw').first().locator('.pp-port').nth(0).click(); await k.wait(600);
        await k.page.fill('[data-ppdet] [data-ppname]', 'FOH Desk'); await k.page.keyboard.press('Tab'); await k.wait(1500); } },
    { say: 'On the VLAN tab you can rename any VLAN, change its colour, or add your own. The new name is used in the port plan, on the stickers and in the P D F.', do: async k => { await k.click('#netTabs [data-tab=vlan]'); await k.scrollTo('.vlanName[data-vlan="200"]'); await k.fill('.vlanName[data-vlan="200"]', 'Lighting FOH'); await k.wait(800); } }
  ] },

  { id: 'build-6-fibres', title: '6 · Fibres', prep: upTo(doAdvice, doNodes, doSwitches), steps: [
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

  { id: 'build-7-flow', title: '7 · Signal Flow', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'The Signal Flow shows how the data runs from the rack to every object.', do: async k => { await k.go('FLOW'); await k.wait(1200); } },
    { say: 'Hover a universe to follow it through the drawing. Click it to pin the route.', do: async k => { await k.hover('.fl-uni:nth-child(3)'); await k.wait(1200); await k.click('.fl-uni:nth-child(3)'); await k.wait(1500); await k.click('.fl-uni:nth-child(3)'); } },
    { say: 'The Show switch shows everything, only D M X, only the network, or only the fibres.', do: async k => { await k.click('#flLayer [data-v=dmx]'); await k.wait(900); await k.click('#flLayer [data-v=net]'); await k.wait(900); await k.click('#flLayer [data-v=all]'); } },
    { say: 'Blocks never overlap. Drag a rack or a block to arrange it, and the arrangement is saved per D B. Auto layout puts everything back.', do: async k => { await k.click('.fl-item[data-dc=DB01]'); await k.wait(1500); } },
    { say: 'New: a background picture, like a floor plan or a stage plot. Choose a picture, then set the opacity, the size and the position.', do: async k => { await k.page.setInputFiles('#bgFile', PLAN_IMAGE); await k.wait(1200); await k.click('#bgFit'); await k.wait(800); await k.ev(() => { const e = document.querySelector('#bgOp'); e.value = 55; e.dispatchEvent(new Event('input')); }); await k.wait(800); } },
    { say: 'It can be one picture for all the views, or its own picture for each view. Fit to drawing makes it cover everything.', do: async k => { await k.hover('.fl-bgsec .switch'); await k.wait(1200); } }
  ] },

  { id: 'build-8-check', title: '8 · Check the plan', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'Step seven of ten: check the plan. This is the last look at the plan on paper, before we touch the real devices. Look at the Tasks page first. When every square is green, the plan is complete.', do: async k => { await k.go('TASKS'); await k.hover('.tk-matrix'); await k.wait(900); } },
    { say: 'In Setup, the check step lists the open issues, and links to the Signal Flow. Every step explains itself in three lines: what it is, what you do, and what comes next.', do: async k => { await k.click('#tbSetup'); await k.click('[data-go=check]'); await k.wait(2200); await k.click('#suStop'); } }
  ] },

  { id: 'build-9-align', title: '9 · Align the devices and send the configuration', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'Steps eight and nine: the real devices. Open the Align tool from the Tasks page, or from Setup. Your devices must be switched on and connected to this computer.', do: async k => { await k.go('TASKS'); await k.scrollTo('[data-cmd="align"]'); await k.click('[data-cmd="align"]'); await k.wait(1200); } },
    { say: 'Find searches the network for every Lumi Node and every Giga Core. It takes a few seconds.', do: async k => { await k.click('#alFind'); await k.wait(3800); } },
    { say: 'Now align. One device blinks: a Giga Core blinks its screen and port lights, a Lumi Node its L E D\'s. Go to the device that is blinking.', do: async k => { await k.ev(() => { for (const d of window.NetConfig.state.dev.values()) d.link = null; }); await k.click('[data-alphase=align]'); await k.wait(2200); await k.hover('.al-now'); await k.wait(1200); } },
    { say: 'Press its place in the plan, for example D B one, switch one. The link is made, and the next device starts to blink. Orange is the suggestion.', do: async k => { await k.click('.al-item.guess'); await k.wait(1500); await k.click('.al-item.guess'); await k.wait(1500); await k.click('.al-item.guess'); await k.wait(1200); } },
    { say: 'Nodes work the same way. The node blinks its L E D\'s, and you press the node of the plan. Here is the first node.', do: async k => { await k.ev(() => { for (const d of window.NetConfig.state.dev.values()) if (d.kind === 'gigacore' && !d.link) { const it = window.NetConfig.planItems().find(x => x.kind === 'sw' && x.ip === d.ip && ![...window.NetConfig.state.dev.values()].some(y => y.link === x.id)); if (it) d.link = it.id; } window.Align.state.cur = null; }); await k.click('[data-alphase=find]'); await k.click('[data-alphase=align]'); await k.wait(2000); await k.hover('.al-now'); await k.wait(1200); await k.click('.al-item.guess'); await k.wait(1500); } },
    { say: 'You can skip a device, or undo the last link. When every device has its place, go on to send.', do: async k => { await k.ev(() => { document.querySelector('#alMain').scrollIntoView(); }); await k.hover('#alSkip'); await k.wait(1500); } },
    { say: 'Fill in from the plan puts the names, the V L A N\'s, the port names and the universes on the devices. Nothing is sent yet.', do: async k => { await k.ev(() => { for (const d of window.NetConfig.state.dev.values()) if (!d.link) { const it = window.NetConfig.planItems().find(x => x.kind === (d.kind === 'gigacore' ? 'sw' : 'nd') && x.ip === d.ip); if (it) d.link = it.id; } }); await k.click('[data-alphase=send]'); await k.wait(900); await k.click('#alFill'); await k.wait(3000); } },
    { say: 'Send config sends at once, with no extra question. Changing an I P address makes a device move, so do that on a new network.', do: async k => { await k.click('#alSend'); await k.wait(1200); } },
    { say: 'When it is done, a window lists every change that was made, per device. Every device is read back and checked, so you know it really has the new settings.', do: async k => { await k.page.waitForSelector('.modal-backdrop [data-a=ok]', { timeout: 30000 }); await k.wait(3500); await k.click('.modal-backdrop [data-a=ok]'); await k.wait(800); } }
  ] },

  { id: 'build-10-print', title: '10 · The P D F and the stickers', prep: upTo(doAdvice, doNodes, doSwitches, doFibres), steps: [
    { say: 'The last step: print and share. Export P D F opens the report builder. Choose the sections: the patch, the racks, the signal flow, the network, the switch ports and the fibre links.', do: async k => { await k.click('#fileExportPdf'); await k.wait(2200); } },
    { say: 'The Q R codes section gives every D B a Q R code that holds the whole D B as text, and the first page can carry one for the whole system.', do: async k => { await k.ev(() => document.querySelector('[data-on="qr"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); await k.wait(700); await k.click('label:has([data-on="qr"]), .rb-sec:has([data-on="qr"]) .switch'); await k.wait(1500); await k.ev(() => { for (const f of document.querySelectorAll('iframe')) { try { f.contentDocument.querySelector('.qrgrid')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} } }); await k.wait(1500); } },
    { say: 'A live preview shows every page before you export. Then export, and you have the report, ready to print or to send.', do: async k => { await k.wait(2800); } },
    { say: 'Stickers makes labels for Herma laser sheets: cable labels, panel strips, node ports, devices, switch ports, fibres and network cables.', do: async k => { await k.closeDialog(); await k.click('#tbStickers'); await k.wait(1500); } },
    { say: 'Pick the Herma sheet, the D B, and what to print. The preview matches the sheet exactly, so you see what the printer will do.', do: async k => { await k.wait(2200); } },
    { say: 'Switch on D B info Q R, and every D B gets stickers with a Q R code that holds everything about that D B. The system Q R does the same for the whole show.', do: async k => { await k.ev(() => document.querySelector('label.rb-row:has([data-sw="k:qrDb"])')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); await k.wait(600); await k.click('label.rb-row:has([data-sw="k:qrDb"])'); await k.wait(1800); } },
    { say: 'A calibration sheet checks that your printer puts every label where the template says. And that is the whole workflow, from the C S V file to the printed show.', do: async k => { await k.hover('#lbCal'); await k.wait(2200); } }
  ] }
];
