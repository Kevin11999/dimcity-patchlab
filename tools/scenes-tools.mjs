// Series 2 — "Tool guides": one short video per tool, each on the finished demo show (or the state the tool needs).
// start: 'demo' (the finished demo show) · 'tutorial' (patch imported, nothing built) · 'blank' (empty project)
import fs from 'fs';
import path from 'path';
import { PLAN_IMAGE, POWER_SAMPLE, doAdvice, doNodes, doSwitches, doFibres, upTo } from './scenes-common.mjs';
const EX_FILE = '/tmp/dcpl-lightwright-edit.txt';

export const TOOLS = [
  { id: 'tool-device-builder', title: 'Device Builder', desc: 'Nodes, splitters, switches, panels and cables, with short names.', start: 'demo', steps: [
    { say: 'The Device Builder holds every device you use: nodes, splitters, switches, panels, cables and racks. You open it from the Nodes and Splitters page.', do: async k => { await k.go('NETWORK'); await k.hover('[data-cmd="deviceBuilder"]'); } },
    { say: 'Click Device Builder. Every kind of device has its own tab. Let\'s make a new node.', do: async k => { await k.click('[data-cmd="deviceBuilder"]:not([data-arg])'); await k.click('[data-tabbtn=node]'); await k.click('[data-new]'); } },
    { say: 'Give it a brand and a name, the number of D M X ports, and one or two Ethernet ports.', do: async k => { await k.fill('[data-f="brand"]', 'Luminex'); await k.fill('[data-f="name"]', 'LumiNode 16 Stage Edition'); await k.fill('[data-f="portCount"]', '16'); await k.select('[data-f="ethernetCount"]', '2'); } },
    { say: 'The short name is used in racks and overviews, so a long name is never cut off. Leave it empty, and PatchLab makes one for you.', do: async k => { await k.fill('[data-f="short"]', 'LN16'); await k.hover('.db-preview'); } },
    { say: 'On top, the preview shows the front of the device as it will look in a rack. Click Save node.', do: async k => { await k.click('[data-save]'); await k.wait(900); } },
    { say: 'The new node is in the list, and in your own library, so it is there in every project. The same goes for splitters, switches and panels.', do: async k => { await k.click('[data-tabbtn=panel]'); await k.wait(1200); } },
    { say: 'The button Fill short names, at the bottom, gives all your existing devices a short name at once, so you can adjust them afterwards.', do: async k => { await k.click('[data-a=shorts]'); await k.wait(1200); } }
  ] },

  { id: 'tool-rack-builder', title: 'Rack Builder and custom racks', desc: 'Build a rack from your devices, with or without an article key.', start: 'tutorial', steps: [
    { say: 'Racks are built from your devices. Open the Device Builder on the Racks tab.', do: async k => { await k.ev(() => window.LKApp.runCommand('deviceBuilder', 'rack')); await k.wait(1800); } },
    { say: 'Click New rack, give it a name, and an article key if you use them. The key is optional.', do: async k => { await k.click('[data-newrack]'); await k.fill('[data-rk="name"]', 'Touring node rack'); await k.fill('[data-rk="articleKey"]', 'RK-0042'); } },
    { say: 'Choose the height in units. A rack can never be lower than what is in it.', do: async k => { await k.select('[data-rk="heightU"]', '6'); } },
    { say: 'On the right are your devices. Click the plus to add one at the first free position, or drag it to the exact place you want.', do: async k => { await k.click('.pal-card[data-type="PANEL:STD-LK3"] [data-add]'); await k.click('.pal-card[data-type="NODE:LMX-LN12"] [data-add]'); await k.click('.pal-card[data-type="NODE:LMX-LN4"] [data-add]'); } },
    { say: 'Half width devices, like the LumiNode four, sit two side by side. Fill gaps adds black blind plates next to them.', do: async k => { await k.click('[data-rkblind]'); await k.wait(900); } },
    { say: 'The summary shows how much space is used. Close the builder, and place the rack in a D B.', do: async k => { await k.closeDialog(); await k.openDim('DB03'); await k.scrollTo('#rpRackType'); } },
    { say: 'Or build a rack right here: Custom rack. Choose how many panels, nodes, splitters and switches it holds, and PatchLab places them. No article key is needed.', do: async k => { await k.click('#rpCustom'); await k.wait(700); await k.ev(() => { const i = document.querySelector('input[data-type="PANEL:STD-LK3"]'); i.value = 1; i.dispatchEvent(new Event('input')); const n = document.querySelector('input[data-type="NODE:LMX-LN12"]'); n.value = 1; n.dispatchEvent(new Event('input')); }); await k.wait(900); } },
    { say: 'Click Build and place, and the rack is in the D B, with its own name, and the L K and the lines of this D B are patched onto it.', do: async k => { await k.click('.modal [data-a=ok]'); await k.wait(1500); await k.scrollTo('.rp-racks'); } }
  ] },

  { id: 'tool-advice', title: 'The advice: best setup', desc: 'PatchLab works out the panels, nodes and block modes for a D B.', start: 'tutorial', steps: [
    { say: 'Not sure which panels and nodes a D B needs? Open the D B, and look at the card Advice, best setup.', do: async k => { await k.openDim('DB01'); await k.scrollTo('[data-card$=":advice"]'); } },
    { say: 'PatchLab counts the L K\'s, Veams, lines and universes, and works out the best setup from the devices in your Device Builder.', do: k => k.hover('.adv-sum') },
    { say: 'It chooses the cheapest combination of panels, and compares nodes with and without a splitter. It only uses devices you made yourself, never something you do not own.', do: k => k.hover('.adv-items') },
    { say: 'When there are too few sockets, it adds loose spiders instead of a whole extra panel, and says so.', do: async k => { await k.hover('.adv-notes, .adv-sum'); await k.wait(700); } },
    { say: 'Open Block mode per L K. It advises twelve X L R for an L K with many ports, three Veams when an L K only carries Veams, and mixed in between.', do: async k => { await k.ev(() => { const d = document.querySelector('[data-card$=":advice"] details'); if (d) d.open = true; }); await k.wait(1200); } },
    { say: 'Apply this advice, and PatchLab adds a rack made for this D B. Your own racks stay untouched, and you can apply again at any time.', do: async k => { await k.scrollTo('[data-adv-apply]'); await k.click('[data-adv-apply]'); await k.wait(1500); } },
    { say: 'The rack appears below, with every L K and Veam on its socket, and the colour of the node that feeds it.', do: async k => { await k.scrollTo('.rp-racks'); await k.wait(900); } }
  ] },

  { id: 'tool-coupling', title: 'Couple LKs to sockets, and stack racks', desc: 'Choose the socket of every LK and Veam, and tell PatchLab which racks stand on top of each other.', start: 'tutorial', prep: async k => { await k.ev(() => {
      const nd = window.LKApp.getMODEL().networkDevices;
      nd.rackTypes.push({ id: 'RACK:VID-PANELS', name: 'Panel rack', articleKey: '', heightU: 4, items: [{ iid: 'v1', kind: 'panel', typeId: 'PANEL:STD-LK3Veam9', u: 1 }] });
      nd.rackTypes.push({ id: 'RACK:VID-NODES', name: 'Node rack', articleKey: '', heightU: 4, items: [{ iid: 'v2', kind: 'node', typeId: 'NODE:LMX-LN12', u: 1 }, { iid: 'v3', kind: 'node', typeId: 'NODE:LMX-LN12', u: 2 }, { iid: 'v4', kind: 'node', typeId: 'NODE:LMX-LN12', u: 3 }] });
      const p = window.LKApp.net.getDimPlan('DB01');
      p.racks = [{ iid: 'rk_v1', rackId: 'RACK:VID-PANELS', name: 'Panel rack' }, { iid: 'rk_v2', rackId: 'RACK:VID-NODES', name: 'Node rack', stack: true }];
      window.LKApp.renderAll(); }); }, steps: [
    { say: 'Every L K and Veam needs a socket. Open a D B, and find the table Couple L K\'s and Veams to sockets.', do: async k => { await k.openDim('DB01'); await k.scrollTo('.rp-assign'); } },
    { say: 'Automatic fills the sockets in order. Or choose a socket yourself, a loose spider, or do not patch.', do: async k => { await k.select('.rp-assign-sel[data-owner=LK101]', 'LK2'); await k.select('.rp-assign-sel[data-owner=LK102]', 'spider'); } },
    { say: 'One button returns everything to automatic.', do: async k => { await k.click('[data-assign-reset]'); await k.wait(600); } },
    { say: 'Now an important rule. L K and Veam cables are short. A socket in one rack can only feed nodes in the same rack. Here the panels are in one rack, and the nodes in another.', do: async k => { await k.scrollTo('.rp-racks'); await k.wait(900); } },
    { say: 'Only network cables can run from rack to rack. Two racks that stand directly on top of each other count as one: that is the tick, stacked on the rack above.', do: async k => { await k.hover('[data-rp-stack]'); await k.wait(900); } },
    { say: 'Without that tick, the L K\'s have no node in their own rack. PatchLab warns, and offers a Fix button.', do: async k => { await k.click('[data-rp-stack]'); await k.wait(1500); await k.scrollTo('.rp-recs'); } },
    { say: 'Press Fix, and the racks are stacked. Everything is patched again.', do: async k => { await k.click('[data-rp-fix]'); await k.wait(1500); } },
    { say: 'A node without a rack always comes with a spider. Add a loose node, and an L K spider is added with it, because a loose node has no panel to be fed from.', do: async k => { await k.scrollTo('#rpLooseType'); await k.click('[data-loose-add="node"]'); await k.wait(1500); } }
  ] },

  { id: 'tool-cables-fibres', title: 'Cable types, fibre stock and auto-assign', desc: 'Make fibre cable types, enter your stock, and let PatchLab link the switches.', start: 'tutorial', prep: upTo(doAdvice, doNodes, doSwitches), steps: [
    { say: 'Fibres start with cable types. Open the Device Builder on the Cables tab.', do: async k => { await k.ev(() => window.LKApp.runCommand('deviceBuilder', 'cable')); await k.wait(1800); } },
    { say: 'A cable type has a medium, a number of cores, a connector at both ends, and a length. Half metres are fine, like seven point five.', do: async k => { await k.click('[data-new]'); await k.fill('[data-f="name"]', 'opticalCON DUO 4-core singlemode'); await k.fill('[data-f="connA"]', 'opticalCON DUO'); await k.fill('[data-f="connB"]', 'opticalCON DUO'); await k.fill('[data-f="lengthM"]', '100'); await k.wait(700); } },
    { say: 'OpticalCON, FiberFox and S F P patch cables each have their own connector. A cable only fits ports with the same connector. Click save.', do: async k => { await k.click('[data-save]'); await k.wait(1200); } },
    { say: 'On the Network page, on the Fibres tab, enter how many of each cable you own. The stock is counted for you.', do: async k => { await k.closeDialog(); await k.go('NET'); await k.click('#netTabs [data-tab=fibers]'); await k.wait(1000); } },
    { say: 'Auto-assign chains the switches inside a D B with the short cable, and links the D B\'s with the long cable, as a ring or a chain.', do: async k => { await k.click('#fibAuto'); await k.wait(1000); await k.select('#auIntra', 'CABLE:DEMO-OC75'); await k.select('#auInter', 'CABLE:DEMO-OC250'); } },
    { say: 'It tells you if the stock is not enough, and which connectors are missing. Press Assign, and the links are made.', do: async k => { await k.ev(() => [...document.querySelectorAll('.modal-backdrop button')].filter(x => x.offsetParent).find(x => /^Assign$/i.test(x.textContent.trim()))?.click()); await k.wait(1500); } },
    { say: 'The list shows every fibre, with its two ends. Remove one, and the cable goes back into the stock.', do: async k => { await k.scrollTo('.fib-links, [data-card$=":fibres"], table'); await k.wait(900); } }
  ] },

  { id: 'tool-fibre-overview', title: 'The fibre overview', desc: 'See and draw the fibres in the Signal Flow.', start: 'demo', steps: [
    { say: 'The fibre overview is in the Signal Flow. Open it, and under Show, choose Fibres.', do: async k => { await k.go('FLOW'); await k.click('#flLayer [data-v=fibre]'); await k.wait(1200); } },
    { say: 'Every location is a card with its switches. Each switch shows its fibre ports with their number and connector.', do: async k => { await k.click('#fvFit'); await k.wait(1200); } },
    { say: 'Zoom with the wheel, or the buttons. Drag the background to move around.', do: async k => { for (let i = 0; i < 2; i++) { await k.ev(() => document.querySelector('#fvIn')?.click()); await k.wait(400); } await k.wait(800); } },
    { say: 'Drag a switch by its name. It moves live, and its cables follow, so you can place it exactly where it belongs.', do: async k => {
        const b = await k.page.evaluate(() => { const r = document.querySelector('[data-swd="DB01|DB01-SW2"]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + 8 } : null; });
        if (b) { await k.page.mouse.move(b.x, b.y, { steps: 20 }); await k.page.mouse.down(); await k.page.mouse.move(b.x + 60, b.y + 90, { steps: 25 }); await k.page.mouse.move(b.x + 200, b.y + 120, { steps: 25 }); await k.page.mouse.up(); } await k.wait(900); } },
    { say: 'Cables run in straight lines, and hop over each other with a little bridge.', do: async k => { await k.click('#fvFit'); await k.wait(1500); } },
    { say: 'To draw a cable by hand, pick a cable type at the bottom, click a free port, and then the port at the other end. Ports with the wrong connector are dimmed.', do: async k => { await k.click('[data-type="CABLE:DEMO-FF250"]'); await k.wait(1200); } },
    { say: 'Click a cable to select it, and remove it with the button. Auto-assign and the stock are right here too.', do: async k => { await k.hover('#fvAuto'); await k.hover('#fvStock'); await k.wait(600); } }
  ] },

  { id: 'tool-vlans', title: 'VLANs and addresses', desc: 'Rename VLANs, change colours, add your own, and see the port plan.', start: 'demo', steps: [
    { say: 'Everything about the network is on the Network page. Switches and ports shows what every port of a switch is used for.', do: async k => { await k.go('NET'); await k.click('#netTabs [data-tab=ports]'); await k.wait(1000); } },
    { say: 'Every port has the colour of its VLAN, so you see at a glance which network a cable belongs to.', do: async k => { await k.scrollTo('.swp-strip'); await k.hover('.swp-strip'); } },
    { say: 'The VLAN tab lists all VLANs. Choose Luminex numbering, or the F E N T scheme.', do: async k => { await k.click('#netTabs [data-tab=vlan]'); await k.wait(1000); } },
    { say: 'Click a name to rename a VLAN, and change its colour. The new name is used in the port plan, on the stickers and in the P D F.', do: async k => { await k.scrollTo('.vlanName[data-vlan="200"]'); await k.fill('.vlanName[data-vlan="200"]', 'Lighting FOH'); await k.wait(900); } },
    { say: 'Add your own VLAN with a number and a name. It can be removed again, and a standard VLAN can be reset to its standard name.', do: async k => { await k.scrollTo('#vlanNewId'); await k.fill('#vlanNewId', '910'); await k.wait(500); } },
    { say: 'The Overview tab shows every device with its addresses, and warns about addresses that are used twice.', do: async k => { await k.click('#netTabs [data-tab=overview]'); await k.wait(1500); } }
  ] },

  { id: 'tool-signal-flow', title: 'The Signal Flow', desc: 'Follow the data from the rack to every object, with layers and a background picture.', start: 'demo', steps: [
    { say: 'The Signal Flow shows how the data runs from the rack to every object, for all D B\'s or one at a time.', do: async k => { await k.go('FLOW'); await k.click('#flLayer [data-v=all]'); await k.wait(1000); await k.click('.fl-item[data-dc=DB01]'); await k.wait(1500); } },
    { say: 'Hover a universe in the list to follow it through the drawing. Click it to pin the route.', do: async k => { await k.hover('.fl-uni:nth-child(3)'); await k.wait(1200); await k.click('.fl-uni:nth-child(3)'); await k.wait(1500); await k.click('.fl-uni:nth-child(3)'); } },
    { say: 'Hover a port or a line, and everything on that route lights up. Escape lets go.', do: async k => { await k.hover('.fb-lk'); await k.wait(1200); } },
    { say: 'The Show switch chooses the layer: everything, only D M X, only the network, or only the fibres.', do: async k => { await k.click('#flLayer [data-v=dmx]'); await k.wait(900); await k.click('#flLayer [data-v=net]'); await k.wait(900); await k.click('#flLayer [data-v=all]'); await k.wait(600); } },
    { say: 'Drag a block to arrange the drawing. Blocks never overlap, and the arrangement is saved per D B. Auto layout puts everything back.', do: async k => { await k.hover('#flAuto, .fl-bar button'); await k.wait(900); } },
    { say: 'A background picture, like a floor plan or a stage plot, goes under the drawing. Choose a picture, then set the opacity, the size and the position.', do: async k => { await k.page.setInputFiles('#bgFile', PLAN_IMAGE); await k.wait(1200); await k.click('#bgFit'); await k.wait(800); await k.ev(() => { const e = document.querySelector('#bgOp'); e.value = 55; e.dispatchEvent(new Event('input')); }); await k.wait(900); } },
    { say: 'Save image exports the drawing as a picture, and Share image copies it, for example to send in a chat.', do: async k => { await k.hover('#flSave, .fl-bar button:nth-last-child(1)'); await k.wait(900); } }
  ] },

  { id: 'tool-pdf', title: 'The PDF report builder', desc: 'Choose the sections, order and style of the report.', start: 'demo', steps: [
    { say: 'Export P D F opens the report builder. On the left you choose what goes in, on the right a live preview shows every page.', do: async k => { await k.click('#fileExportPdf'); await k.wait(2500); } },
    { say: 'Every section can be switched on or off: the D B header, network, splitters, racks, signal flow, patch, universes, the patch list, warnings and notes.', do: async k => { await k.hover('label:has([data-on="racks"]), .rb-sec:has([data-on="racks"])'); await k.wait(800); } },
    { say: 'Drag a section by its handle to change the order. Racks has options: the rack drawing, node ports, loose devices and the patch table.', do: async k => { await k.ev(() => document.querySelector('[data-opt="drawing"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); await k.wait(1200); } },
    { say: 'The new QR codes section puts QR codes on the page that hold the whole D B as text, and optionally the whole system.', do: async k => { await k.ev(() => document.querySelector('[data-on="qr"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); await k.wait(700); await k.click('label:has([data-on="qr"]), .rb-sec:has([data-on="qr"]) .switch'); await k.wait(1500); await k.ev(() => { for (const f of document.querySelectorAll('iframe')) { try { f.contentDocument.querySelector('.qrgrid')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} } }); await k.wait(1500); } },
    { say: 'Style, header and footer, cover page and logo are set in the other tabs. Save the layout as a template, and use it again in the next project.', do: async k => { await k.click('.rb-tabs button:nth-child(2), [data-rbtab="style"], button:has-text("Style")'); await k.wait(1800); } },
    { say: 'Choose one P D F with all D B\'s, or one file per D B. Then export.', do: async k => { await k.click('button:has-text("Content")'); await k.wait(1200); await k.hover('button:has-text("One PDF per DimCity")'); await k.wait(1000); } }
  ] },

  { id: 'tool-stickers', title: 'Stickers for Herma sheets', desc: 'Print cable labels, strips, device labels and more on laser sheets.', start: 'demo', steps: [
    { say: 'Stickers prints labels on Herma laser sheets. Click Stickers in the toolbar.', do: async k => { await k.click('#tbStickers'); await k.wait(1800); } },
    { say: 'Choose the sheet. The preview shows the sheet exactly as the printer will print it.', do: async k => { await k.wait(1800); } },
    { say: 'Choose what to print: cable labels, panel connection labels, node ports, racks and devices, fibres, network cables and switch ports.', do: async k => { await k.hover('label.rb-row:has([data-sw="k:cables"])'); await k.hover('label.rb-row:has([data-sw="k:fibers"])'); await k.wait(700); } },
    { say: 'Every sticker has the colour of its node, so you can see where a cable goes. Cables get two labels, one for each end.', do: async k => { await k.click('label.rb-row:has([data-sw="k:nodePorts"])'); await k.wait(1500); } },
    { say: 'If the sheet is already partly used, set the first label to start with, and use the rest.', do: async k => { await k.hover('#lbStart, [data-lb="start"], input[type=number]'); await k.wait(900); } },
    { say: 'The calibration sheet prints outlines only. Print it on a real sheet and hold it to the light, to check that every label sits where the template says.', do: async k => { await k.hover('#lbCal'); await k.wait(1500); } }
  ] },

  { id: 'tool-qr', title: 'QR codes for a DB and the system', desc: 'Scan one QR code and see everything about a D B.', start: 'demo', steps: [
    { say: 'A QR code can hold much more than a cable name. Open a D B, and look at the card At a glance.', do: async k => { await k.openDim('DB01'); await k.hover('.gl-grid'); await k.wait(1000); } },
    { say: 'At a glance shows the L K blocks with their socket and node, the racks and their devices, the nodes and splitters, and the network switches with their fibres.', do: async k => { await k.hover('.gl-col:nth-child(2)'); await k.wait(900); await k.hover('.gl-col:nth-child(4)'); await k.wait(700); } },
    { say: 'Click the Q R button. These Q R codes hold all of this as plain text. Scan them with any phone camera, and you can read it.', do: async k => { await k.click('[data-qr-open="DB01"]'); await k.wait(1500); } },
    { say: 'A long D B is cut into numbered parts. Scan them in order. You can copy the text, or save the codes as an S V G file.', do: async k => { await k.ev(() => { const d = document.querySelector('.modal details'); if (d) d.open = true; }); await k.wait(2500); } },
    { say: 'The same codes can be printed. In Stickers, switch on D B info Q R and system Q R, and every D B gets its own set.', do: async k => { await k.closeDialog(); await k.click('#tbStickers'); await k.wait(1500); await k.click('label.rb-row:has([data-sw="k:qrDb"])'); await k.wait(1500); } },
    { say: 'And in the P D F report, the Q R codes section puts them on the page of each D B. The system code is on the first page.', do: async k => { await k.click('#lbClose'); await k.wait(500); await k.click('#fileExportPdf'); await k.wait(1800); await k.ev(() => document.querySelector('[data-on="qr"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); await k.wait(900); await k.click('label:has([data-on="qr"]), .rb-sec:has([data-on="qr"]) .switch'); await k.wait(1500); await k.ev(() => { for (const f of document.querySelectorAll('iframe')) { try { f.contentDocument.querySelector('.qrgrid')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} } }); await k.wait(1500); } }
  ] },

  { id: 'tool-exchange', title: 'Exchange with Lightwright and Vectorworks', desc: 'Send the patch to another program and take their changes back.', start: 'demo', steps: [
    { say: 'PatchLab can exchange the patch with Lightwright and Vectorworks, in both directions. Open the Tasks page, and click Open exchange.', do: async k => { await k.go('TASKS'); await k.scrollTo('[data-cmd="exchange"]'); await k.click('[data-cmd="exchange"]'); await k.wait(1000); } },
    { say: 'Choose the program. Export writes a file with one row per L K or Veam port: the circuit name, the position, and the universe.', do: async k => { await k.click('#exProf [data-p="vectorworks"]'); await k.wait(700); await k.click('#exProf [data-p="lightwright"]'); await k.wait(700); } },
    { say: 'Import that file in Lightwright or Vectorworks, and match on the circuit name. The note under the button tells you where.', do: async k => { await k.hover('.ex-box .hint'); await k.wait(800);
        await k.ev(() => window.Exchange.build('lightwright', null)); } },
    { say: 'After you changed things there, export the same list again, and choose it here with Choose file.', do: async k => {
        const text = await k.ev(() => window.Exchange.build('lightwright', null));
        const edited = text.split('\r\n').map(l => { const c = l.split('\t'); if (c[0] === 'LK101.1') c[2] = '9'; if (c[0] === 'LK101.2') c[1] = 'Truss 1 downstage'; return c.join('\t'); }).join('\r\n');
        fs.writeFileSync(EX_FILE, edited);
        const [fc] = await Promise.all([k.page.waitForEvent('filechooser'), k.click('#exOpen')]); await fc.setFiles(EX_FILE); await k.wait(1500); } },
    { say: 'PatchLab matches every row, and shows what differs: universe, or position. Everything else is left alone.', do: async k => { await k.hover('.ex-sum'); await k.wait(800); await k.hover('.data-table tbody tr:nth-child(1)'); await k.wait(900); } },
    { say: 'Tick the changes you want, and press Apply. They are written into the patch, and validation runs again.', do: async k => { await k.click('#exApply'); await k.wait(1500); } },
    { say: 'Rows that exist only in the file can be added as new lines. Rows that exist only in PatchLab are counted, but never removed.', do: async k => { await k.wait(1500); } }
  ] },

  { id: 'tool-network-devices', title: 'Network config', desc: 'Find the devices, paint the V L A N\'s on the ports, change any setting, and send it.', start: 'demo', steps: [
    { say: 'Network Config holds all your Lumi Nodes and Giga Core switches on one page. Open it from the Tasks page. The Align tool next to it is for setting up many devices in one go.', do: async k => { await k.go('TASKS'); await k.scrollTo('[data-cmd="netDevices"]'); await k.click('[data-cmd="netDevices"]'); await k.wait(1200); } },
    { say: 'Discover devices looks at the whole network and lists every Lumi Node and Giga Core. Each one is linked to its place in the plan.', do: async k => { await k.click('#ncDisc'); await k.wait(3500); } },
    { say: 'Open a switch. Its ports are tiles, as on the front panel, each with its number, name and V L A N.', do: async k => { const ip = await k.page.evaluate(() => [...window.NetConfig.state.dev.values()].find(d => d.kind === 'gigacore' && d.link).ip); await k.click('[data-toggle="' + ip + '"]'); await k.wait(1500); } },
    { say: 'To set V L A N\'s, pick a V L A N as the brush, then click ports or drag over them. They get that V L A N, like in Araneo.', do: async k => { await k.click('.nc-card.open [data-brush^="vid:"] >> nth=1'); await k.click('.nc-card.open .nc-port[data-port="5"]'); await k.click('.nc-card.open .nc-port[data-port="6"]'); await k.wait(1200); } },
    { say: 'Click a port without a brush to change its name, its V L A N, the P o E and the speed.', do: async k => { await k.click('.nc-card.open [data-brush=""]'); await k.click('.nc-card.open .nc-port[data-port="8"]'); await k.wait(1500); } },
    { say: 'All settings lists everything the device lets you change, in sections, with a search box. A column header has an all button to set one value on every row.', do: async k => { await k.click('.nc-card.open [data-setopen]'); await k.wait(1800); await k.hover('.nc-set-chips'); await k.wait(1200); } },
    { say: 'Send to other devices copies your changes, or whole sections, to as many devices of the same kind as you tick. Only the differences are prepared.', do: async k => { await k.click('.nc-card.open [data-setcopy]'); await k.wait(2200); await k.page.keyboard.press('Escape'); await k.wait(600); } },
    { say: 'Apply sends at once. Afterwards the device is read back, and a window lists exactly what was changed.', do: async k => { await k.ev(() => document.querySelector('.nc-card.open [data-apply]')?.scrollIntoView({ block: 'center' })); await k.click('.nc-card.open [data-apply]'); await k.page.waitForSelector('.modal-backdrop [data-a=ok]', { timeout: 30000 }); await k.wait(3000); await k.click('.modal-backdrop [data-a=ok]'); await k.wait(500); } }
  ] },

  { id: 'tool-power', title: 'Power: P D\'s and Socapex', desc: 'Build your P D\'s, load the fixture sheet, and see the amps on every phase.', start: 'blank', steps: [
    { say: 'The Power page is a part of its own. It works from the fixture sheet, so you can use it without the rest of the project.', do: async k => { await k.click('[data-view=POWER]'); await k.wait(1500); } },
    { say: 'Import the fixture sheet, the C S V from Vectorworks or Lightwright. Its circuit name is a Socapex cable, the circuit number is one to six, and the wattage gives the amps.', do: async k => { await k.page.setInputFiles('#pwFile', POWER_SAMPLE); await k.wait(2200); } },
    { say: 'Under P D types you build your distros, like node types. Choose the input, and add Socapex, Han sixteen, C E E and Schuko outputs. A multi output has its own circuits, the phase it starts on, and an amp limit. Examples are one click away.', do: async k => { await k.click('[data-tab=types]'); await k.wait(700); await k.click('#tySamples'); await k.wait(900); await k.click('.pw-ty >> nth=0'); await k.wait(1500); } },
    { say: 'Under P D\'s and feeds, add a feed, a Powerlock run with its maximum current, and add the P D\'s of this D B.', do: async k => { await k.click('[data-tab=pds]'); await k.wait(700); await k.click('#pwAddFeed'); await k.wait(600); await k.click('#pwAddPd'); await k.wait(500); await k.click('#pwAddPd'); await k.wait(900); } },
    { say: 'Fill cables automatically gives every P D a block of twelve cable numbers, in order, as Soca A, B, C and so on. You can also choose a cable per Socapex yourself.', do: async k => { await k.click('#pwAuto'); await k.wait(2200); } },
    { say: 'The overview shows every P D and feed with the amps on L one, L two and L three. Yellow and red warn you when a feed gets heavy, or a circuit goes over sixteen amps.', do: async k => { await k.click('[data-tab=overview]'); await k.wait(2500); } },
    { say: 'Open a P D, and you see it like a page of the booklet. Every Socapex has six circuits, with the D M X, the fixture numbers, what hangs there, the location, and the amps on the phase.', do: async k => { await k.click('[data-pd]'); await k.wait(3500); } },
    { say: 'Booklet makes the P D F: a cover, the overview per D B, a page per P D, and the power summary.', do: async k => { await k.hover('#pwBook'); await k.wait(2200); } }
  ] },

  { id: 'tool-tasks-setup', title: 'Tasks and Setup', desc: 'Always know what is done and what comes next.', start: 'tutorial', steps: [
    { say: 'You always know what comes next. The Tasks page shows the whole workflow, from the patch to the printed show.', do: async k => { await k.go('TASKS'); await k.hover('.tk-next'); await k.wait(900); } },
    { say: 'On top is the next thing to do, with a button that takes you there. The line shows the ten steps, done in green.', do: async k => { await k.hover('.tk-pipe'); await k.wait(1200); } },
    { say: 'Below, every D B has a square for every step. Orange is still to do, yellow needs attention, green is done.', do: async k => { await k.hover('.tk-matrix'); await k.wait(1200); } },
    { say: 'Click Do this now. Setup opens on the right step, for the right D B.', do: async k => { await k.click('.tk-next [data-tk-go]'); await k.wait(1500); } },
    { say: 'Setup explains each step in a few lines, shows what is done, and lets you skip a step. Nothing is locked.', do: async k => { await k.click('[data-go=lks]'); await k.wait(1000); await k.click('[data-go=nodes]'); await k.wait(900); } },
    { say: 'The progress bar at the bottom left shows how complete the show is. Click it for the checklist, with a jump to the place where it is solved.', do: async k => { await k.click('#suStop'); await k.click('#statusProgress'); await k.wait(1800); } },
    { say: 'And on the Overview page, a short bar shows the next step too, so you never have to search.', do: async k => { await k.page.keyboard.press('Escape'); await k.go('HOME'); await k.hover('.tk-mini'); await k.wait(1000); } }
  ] },

  { id: 'tool-search-history', title: 'Search, undo and saving', desc: 'Find anything, undo mistakes, and keep your work safe.', start: 'demo', steps: [
    { say: 'Search finds anything in the show: an L K, a Veam, a universe, a location or a node. Click Search, or press command K.', do: async k => { await k.click('#tbSearch'); await k.wait(900); } },
    { say: 'Type a few letters, and the results appear at once. Press enter to open one.', do: async k => { await k.page.keyboard.type('truss', { delay: 140 }); await k.wait(2500); } },
    { say: 'Every change can be undone. The history lists what you did in plain words, so you can go back to a moment before a mistake.', do: async k => { await k.page.keyboard.press('Escape'); await k.wait(500); await k.ev(() => { const p = window.LKApp.net.getDimPlan('DB01'); p.racks[0].name = 'Dimmer rack stage left'; window.LKApp.getMODEL().ui.dirty = true; window.PatchHistory?.label?.('Renamed a rack'); window.LKApp.renderAll(); }); await k.wait(1000); await k.ev(() => window.LKApp.runCommand('history')); await k.wait(1500); } },
    { say: 'Save writes the project to a file. PatchLab also keeps back-ups, and recovers your work after a crash.', do: async k => { await k.closeDialog(); await k.hover('#tbSave'); await k.wait(1200); } },
    { say: 'Help opens the manual for the page you are on, with these videos. And Request sends a wish or a bug to the developer.', do: async k => { await k.click('#tbHelp'); await k.wait(2500); } }
  ] }
];
