// Shared by the tutorial scripts: the cursor overlay and the "what an earlier part built" helpers.
// Text for the voice is written for text-to-speech (letters spaced out: "L K", "D B", "D M X"); the subtitles are made from it.
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLAN_IMAGE = path.join(HERE, 'video-assets', 'stage-plan.png');
export const POWER_SAMPLE = path.join(HERE, 'video-assets', 'power-sample.csv');

// only the mouse pointer and a ring where it clicks: no captions, no titles in the picture
export const OVERLAY = `(() => {
  const mk = () => {
    if (document.getElementById('vcur')) return;
    const st = document.createElement('style');
    st.textContent = '#vcur{position:fixed;z-index:2147483647;width:26px;height:26px;margin:-4px 0 0 -4px;pointer-events:none}#vcur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}.vring{position:fixed;z-index:2147483645;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #ff8200;pointer-events:none;animation:vr .5s ease-out forwards}@keyframes vr{to{transform:scale(3.2);opacity:0}}';
    document.head.appendChild(st);
    const cur = document.createElement('div'); cur.id = 'vcur'; cur.style.left = '-50px'; cur.style.top = '-50px';
    cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'vring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  };
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  setInterval(mk, 500);
})();`;

// ---- what earlier parts built (done in one go, off camera) ----
export const doAdvice = k => k.ev(() => { for (const dc of ['DB01', 'DB02', 'DB03']) window.RackAdvisor.apply(dc); window.LKApp.addDimCity('FOH'); window.LKApp.renderAll(); });
export const doNodes = k => k.ev(() => { for (const dc of ['DB01', 'DB02', 'DB03']) window.RackPlan.applyToNetworkPlan(dc, { quiet: true }); window.NodeLink.autoLink(); window.LKApp.renderAll(); });
export const doSwitches = k => k.ev(() => {
  const plan = dc => window.LKApp.net.getDimPlan(dc);
  const sw = (dc, n) => ({ id: `${dc}-SW${n}`, name: `${dc} Luminex GigaCore 20t (3U set)`, typeId: 'SWITCH:LMX-GC20T-3U', ip: '', subnet: '', ifaces: [] });
  for (const dc of ['DB01', 'DB02', 'DB03', 'FOH']) plan(dc).switches = dc === 'DB01' ? [sw(dc, 1), sw(dc, 2), sw(dc, 3)] : [sw(dc, 1)];
  window.LKApp.getMODEL().networkDevices.prefs.fent = { on: true, group: 'production', scan: false, vlanMode: 'luminex' };
  for (const dc of ['DB01', 'DB02', 'DB03', 'FOH']) window.FentUI.applyDim(dc);
  window.LKApp.renderAll();
});
export const doFibres = k => k.ev(() => { window.Fibers.autoAssign({ topology: 'ring', intraType: 'CABLE:DEMO-OC75', interType: 'CABLE:DEMO-OC250' }); window.LKApp.renderAll(); });
export const upTo = (...fns) => async k => { for (const f of fns) await f(k); };
