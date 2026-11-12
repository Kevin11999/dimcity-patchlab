import { openDemo, discover, finishSend } from '../lib.mjs';
// "Apply" with nothing changed sends the plan again to a switch and to a node; the device stays as it was and nothing is left to send.
export default { name:'Apply without changes sends again (switch and node)', timeout:300000, async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  for(const kind of ['gigacore', 'lumi']){
    const r = await page.evaluate(async kind => { const NC = window.NetConfig, d = [...NC.state.dev.values()].find(x => x.kind === kind && x.link); NC.state.withIp = false; await NC.readDev(d); NC.fillFromPlan(d); window.__ip = d.ip; window.__send = NC.applyDevs([d], { noIp:true }); return true; }, kind);
    await finishSend(t);
    const a = await page.evaluate(async kind => { const NC = window.NetConfig, d = NC.state.dev.get(window.__ip); await NC.readDev(d); const snap = () => JSON.stringify(kind === 'gigacore' ? d.cur.ports.map(p => [p.port_number, p.member_of, p.legend]) : d.cur.netcfg || d.cur.info); return { n0:NC.opsOf(d).ops.length, nf:NC.opsOf(d, true).ops.length, before:snap() }; }, kind);
    t.ok(a.n0 === 0, `${kind}: nothing pending after the send`); t.ok(a.nf > 0, `${kind}: "send again" has calls (${a.nf})`);
    await page.evaluate(() => { const d = window.NetConfig.state.dev.get(window.__ip); window.__send = window.NetConfig.applyDevs([d], { resend:true }); }); await finishSend(t);
    const b = await page.evaluate(async kind => { const NC = window.NetConfig, d = NC.state.dev.get(window.__ip); await NC.readDev(d); return { err:d.err, warn:d.warn, left:NC.opsOf(d).ops.length, after:JSON.stringify(kind === 'gigacore' ? d.cur.ports.map(p => [p.port_number, p.member_of, p.legend]) : d.cur.netcfg || d.cur.info) }; }, kind);
    t.ok(!b.err && !b.warn, `${kind}: sending again gives no error`); t.ok(b.after === a.before && b.left === 0, `${kind}: the device is unchanged after sending again`);
  }
} };
