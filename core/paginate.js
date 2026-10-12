// core/paginate.js — real pagination.
// A report is not left to the print engine to cut into pages: its content is spread over fixed sheets here,
// so the preview and the PDF show exactly the same pages (and page numbers, contents and logos are known).
//
//   Paginate.run(doc, { bodyW, bodyH, frame, blocks, isStale }) → Promise<pages[] | null>
//     doc     the document (an off-screen iframe) the sheets are built in; it holds the CSS of the report
//     bodyW   width of the content area in px, bodyH its height in px (the room that is really there)
//     frame   (ctx, n) → { sheet, body }   makes sheet n, appends it to the document, returns the content area
//     blocks  [{ html, ctx, breakBefore, fixed, chapter }] in reading order:
//               html          the content (a section) as a string
//               ctx           what the frame needs to know (which DimCity, the title of the document …)
//               breakBefore   start a new sheet first
//               fixed         a section that sits at a fixed x / y: put on the current sheet, outside the flow
//               chapter       { page } object that gets the number of the sheet the block starts on
//   A block is cut where it has to be: whole cards, whole table rows, whole drawings stay together; a table that does
//   not fit goes on over the page with its head row again; a heading never stays alone at the bottom of a sheet.
(function(){
  'use strict';
  const HEAD_SEL = 'thead, .card-h, [data-hdr]';
  const ATOM_TAGS = new Set(['SVG', 'IMG', 'CANVAS', 'FIGURE', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'VIDEO', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'HR', 'PRE', 'CAPTION']);
  const isHead = el => /^H[1-6]$/.test(el.tagName) || el.hasAttribute('data-keepnext');
  const hasText = el => { for(const n of el.childNodes) if(n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };

  // is this element one piece that is never cut?
  function isAtom(el, cs, limit){
    if(ATOM_TAGS.has(el.tagName.toUpperCase())) return true;
    if(!el.children.length || hasText(el)) return true;
    if(el.tagName === 'TR') return true;
    if(el.hasAttribute('data-keep') || /avoid/.test(cs.breakInside || '')){
      const r = el.getBoundingClientRect(), h = r.height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      return h <= limit;                       // taller than a sheet: it has to be cut after all
    }
    return false;
  }
  // the pieces of a block in reading order: { el, path } where path is the chain of containers around the piece
  function collect(parent, path, out, win, limit){
    const kids = Array.from(parent.children);
    kids.forEach((el, i) => {
      const tag = el.tagName.toUpperCase();
      if(tag === 'SCRIPT' || tag === 'STYLE') return;
      if(path.length && kids.length > 1 && el.matches(HEAD_SEL)) return;      // the head of a container comes back by itself
      const cs = win.getComputedStyle(el);
      if(cs.display === 'none') return;
      if(cs.position === 'absolute' || cs.position === 'fixed'){ out.push({ el, path, abs:true }); return; }
      if(isAtom(el, cs, limit)){
        // the first row of a table is never alone at the end of a sheet, and the last one never alone on the next
        const row = tag === 'TR' ? (kids.length <= 3 ? i < kids.length - 1 : (i === 0 || i === kids.length - 2)) : false;
        out.push({ el, path, keepNext:isHead(el) || row });
      } else {
        // remember the title of a container: its heading moves to the first sheet, a following sheet says "… continued"
        const h = Array.from(el.children).find(c => c.tagName === 'H3');
        if(h){
          const t = h.querySelector(':scope > span');
          const c = (t || h).cloneNode(true); c.querySelectorAll('.n').forEach(x => x.remove());
          el.__cont = c.textContent.replace(/\s+/g, ' ').trim();
        }
        collect(el, path.concat(el), out, win, limit);
      }
    });
  }

  class Flow {
    constructor(doc, o){ this.doc = doc; this.o = o; this.pages = []; this.cur = null; this.shells = new Map(); this.tail = []; this.pending = null; this.over = []; }
    newPage(ctx){
      const f = this.o.frame(ctx, this.pages.length + 1);
      const fill = this.doc.createElement('div'); fill.className = 'fill'; f.body.appendChild(fill);
      const page = { sheet:f.sheet, body:f.body, fill, stack:[], ctx };
      this.pages.push(page); this.cur = page; this.tail = [];
      return page;
    }
    // a new sheet, but not after an empty one
    freshPage(ctx){
      const c = this.cur;
      if(c && !c.fill.childElementCount && c.body.childElementCount === 1){ c.sheet.remove(); this.pages.pop(); this.cur = null; }
      return this.newPage(ctx);
    }
    // the container of src on a page: an empty copy that gets the pieces; the head (table head row, card title) comes along
    shell(src){
      const again = (this.shells.get(src)?.size || 0) > 0;
      const el = src.cloneNode(false); el.removeAttribute('id');
      for(const ch of Array.from(src.children)){
        if(ch.matches(HEAD_SEL) || (src.tagName === 'TABLE' && ch.tagName === 'COLGROUP')){ const c = ch.cloneNode(true); c.setAttribute('data-shell-head', '1'); el.appendChild(c); }
      }
      if(again && src.__cont){
        const d = this.doc.createElement('div'); d.className = 'cont'; d.setAttribute('data-shell-head', '1');
        d.textContent = `${src.__cont} — ${this.o.contLabel || 'continued'}`; el.appendChild(d);
      }
      if(!this.shells.has(src)) this.shells.set(src, new Set());
      this.shells.get(src).add(el);
      return el;
    }
    open(page, path){
      let i = 0;
      while(i < page.stack.length && i < path.length && page.stack[i].src === path[i]) i++;
      page.stack.length = i;
      for(; i < path.length; i++){
        const src = path[i], el = this.shell(src);
        (page.stack.length ? page.stack[page.stack.length - 1].el : page.fill).appendChild(el);
        page.stack.push({ src, el });
      }
    }
    fits(page){ return page.fill.getBoundingClientRect().height <= this.o.bodyH; }
    // remove empty shells at the top of the page (after a piece was taken away)
    prune(page){
      while(page.stack.length){
        const top = page.stack[page.stack.length - 1];
        if(Array.from(top.el.children).some(c => !c.hasAttribute('data-shell-head'))) break;
        top.el.remove(); this.shells.get(top.src)?.delete(top.el); page.stack.pop();
      }
    }
    host(page){ return page.stack.length ? page.stack[page.stack.length - 1].el : page.fill; }
    try(page, atom){
      this.open(page, atom.path);
      this.host(page).appendChild(atom.el);
      if(this.fits(page)) return true;
      atom.el.remove(); this.prune(page);
      return false;
    }
    // taller than a whole sheet: it stays where it is, and is reported
    force(page, atom){
      this.open(page, atom.path); this.host(page).appendChild(atom.el);
      this.over.push({ page:this.pages.indexOf(page) + 1, el:atom.el });
    }
    put(atom){
      if(atom.abs){ const p = this.cur || this.newPage(atom.ctx); this.host(p).appendChild(atom.el); return; }
      let page = this.cur || this.newPage(atom.ctx);
      if(!this.try(page, atom)){
        // it does not fit: a heading (or the first row of a table) that stands at the end goes along to the next sheet
        const carry = this.tail.slice(); this.tail = [];
        carry.slice().reverse().forEach(c => c.el.remove());
        this.prune(page);
        page = this.newPage(atom.ctx);
        for(const c of carry) if(!this.try(page, c)) this.force(page, c);
        if(!this.try(page, atom)) this.force(page, atom);
        this.tail = atom.keepNext ? carry.concat(atom) : [];
      } else this.tail = atom.keepNext ? this.tail.concat(atom) : [];
      if(this.pending){ this.pending.page = this.pages.indexOf(page) + 1; this.pending = null; }
    }
  }

  async function run(doc, o){
    const win = doc.defaultView, flow = new Flow(doc, o);
    const probe = doc.createElement('div'); probe.className = 'pg-probe';
    probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:${o.bodyW}px`;
    doc.body.appendChild(probe);
    const limit = o.bodyH - 6;
    let n = 0;
    const first = new Map();            // group → its first sheet: a fixed section sits there
    for(const b of o.blocks){
      if(o.isStale && o.isStale()){ probe.remove(); return null; }
      if(b.breakBefore){ flow.freshPage(b.ctx); if(b.group && !first.has(b.group)) first.set(b.group, flow.cur); }
      if(b.chapter) flow.pending = b.chapter;
      if(b.fixed){
        const page = (b.group && first.get(b.group)) || flow.cur || flow.newPage(b.ctx), t = doc.createElement('div'); t.innerHTML = b.html;
        while(t.firstChild) page.body.appendChild(t.firstChild);
        if(flow.pending){ flow.pending.page = flow.pages.indexOf(page) + 1; flow.pending = null; }
        continue;
      }
      const holder = doc.createElement('div'); holder.innerHTML = b.html; probe.appendChild(holder);
      const imgs = Array.from(holder.querySelectorAll('img'));
      if(imgs.length) await Promise.all(imgs.map(i => (i.decode ? i.decode().catch(() => {}) : null)));
      const atoms = []; collect(holder, [], atoms, win, limit);
      for(const a of atoms){ a.ctx = b.ctx; flow.put(a); }
      if(flow.pending){ flow.pending.page = flow.pages.length || 1; flow.pending = null; }
      holder.remove();
      if(++n % 6 === 0) await new Promise(r => setTimeout(r, 0));
    }
    probe.remove();
    flow.pages.over = flow.over;
    return flow.pages;
  }
  window.Paginate = { run };
})();
