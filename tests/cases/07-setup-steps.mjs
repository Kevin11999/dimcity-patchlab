import { openDemo, openEmpty } from '../lib.mjs';
// The Setup walks through 11 steps in the demo and in an empty project without errors; every step has its explanation and a status.
export default { name:'Setup: 11 steps open without errors (demo and empty project)', async run(t){
  for(const mode of ['demo', 'empty']){
    const { page } = t; if(mode === 'demo') await openDemo(t); else await openEmpty(t);
    await page.evaluate(() => window.Setup.open()); await page.waitForTimeout(700);
    const n = await page.evaluate(() => document.querySelectorAll('.su-step').length); t.ok(n === 11, `${mode}: ${n} steps`);
    const bad = [];
    for(let i = 0; i < n; i++){ await page.evaluate(i => document.querySelectorAll('.su-step')[i]?.click(), i); await page.waitForTimeout(400);
      const h = await page.evaluate(() => ({ title:document.querySelector('.su-head h2')?.textContent || '', text:(document.querySelector('#suMain')?.innerText || '').length })); if(!h.title || h.text < 100) bad.push(`step ${i + 1} "${h.title}" (${h.text} characters)`); }
    t.ok(!bad.length, `${mode}: every step shows a title and text ${bad.join('; ')}`);
    await page.evaluate(() => window.Setup.close?.());
  }
} };
