import { openDemo, discover } from '../lib.mjs';
// Network config device list: offline devices can be removed; a device that comes back with a new IP (same MAC / serial) is one entry again and keeps its link; two live addresses are not merged.
export default { name:'device list: remove offline devices, same device at a new IP, two live addresses', timeout:200000, async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  const r = await page.evaluate(() => {
    const NC = window.NetConfig, C = NC.state, out = {}, d = [...C.dev.values()].find(x => x.kind === 'lumi' && x.link), oldIp = d.ip, link = d.link;
    d.mac = 'aa:bb:cc:00:11:22'; d.serial = 'LUM0001'; d.E.set(0, { name:'keep me' }); const n0 = C.dev.size;
    NC.markGone(oldIp); out.stays = C.dev.has(oldIp) && C.dev.get(oldIp).gone;
    NC.addSeen({ ip:'10.77.77.7', kind:'lumi', name:'ID:99', mac:'AA:BB:CC:00:11:22', serial:'LUM0001', via:['mdns'], reach:true }); const nd = C.dev.get('10.77.77.7');
    out.merged = !C.dev.has(oldIp) && !!nd && C.dev.size === n0 && nd.link === link && nd.E.get(0)?.name === 'keep me' && !nd.gone;
    const other = [...C.dev.values()].find(x => x.kind === 'gigacore'); NC.markGone(other.ip); const n1 = C.dev.size; NC.removeGone(); out.removed = C.dev.size === n1 - 1 && !C.dev.has(other.ip) && C.dev.has('10.77.77.7');
    NC.addSeen({ ip:'10.77.77.8', kind:'lumi', name:'ID:99b', mac:'AA:BB:CC:00:11:22', serial:'LUM0001', via:['sweep'], reach:true }); out.bothLive = C.dev.has('10.77.77.7') && C.dev.has('10.77.77.8');
    NC.markGone('10.77.77.8'); NC.state.open.add('10.77.77.8'); window.LKApp.navigate('NETCONFIG'); return out;
  });
  t.ok(r.stays, 'an offline device alone stays in the list'); t.ok(r.merged, 'same device at a new IP: one entry, link and edits kept, old IP gone');
  t.ok(r.removed, 'the remove button takes only the offline devices out'); t.ok(r.bothLive, 'two addresses that both answer are not merged');
  await page.waitForTimeout(700); t.ok(await page.locator('[data-rmdev]').count() >= 1 && await page.locator('#ncRmGone').count() === 1, 'the remove buttons are on the page for an offline device');
} };
