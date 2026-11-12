import { openDemo, discover } from '../lib.mjs';
// The Fill step of the Align tool also clears the ETH brush choices of the node cards, so only what the plan wants is sent.
export default { name:'Align tool: Fill clears the ETH brush choices of a node card', async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  const ip = await page.evaluate(async () => { const NC = window.NetConfig, d = [...NC.state.dev.values()].find(x => x.kind === 'lumi' && x.link); await NC.readDev(d); d.NE.set(2, { vid:700, name:'x', color:'#123456' }); window.__ip = d.ip; return d.ip; });
  await page.evaluate(() => window.Align.open({ phase:'send' })); await page.waitForTimeout(800);
  await page.locator('#alFill').click({ timeout:10000 }); await page.waitForTimeout(3000);
  const r = await page.evaluate(() => ({ ne:window.NetConfig.state.dev.get(window.__ip).NE.size, filled:window.Align.state.filled }));
  t.ok(r.filled, 'the Fill step ran'); t.ok(r.ne === 0, 'the ETH brush choice of the node was cleared');
} };
