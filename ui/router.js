// ui/router.js — cables that go around things. A small grid router (A*) for straight-angled cables: the devices and the texts are
// obstacles, a cable only runs in the free space between them, with as few bends as possible. Cables that were routed before count
// as busy, so the next cable takes a lane beside them instead of lying on top of them.
//   const r = EdgeRouter.make({ x0, y0, x1, y1 });          the area to route in (world units)
//   r.block(x, y, w, h, margin)                             a device or a text: nothing may cross it
//   r.zone(id, x, y, w, h)                                  an area (a location card) that only cables of its own may enter
//   r.route({ from:{ x, y, dx, dy }, to:{ x, y, dx, dy }, zones:[ids] })   → [[x, y], …] or null
//       from / to: the port, and the direction the cable leaves the device (dx, dy) = (0, 1) down, (1, 0) right …
//   r.mark(points)                                          the cable is drawn: its cells are busy for the next ones
(function(){
  'use strict';
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const dirOf = (dx, dy) => DIRS.findIndex(d => d[0] === Math.sign(dx) && d[1] === Math.sign(dy));

  function make({ x0, y0, x1, y1, cell = 8 }){
    const cols = Math.max(2, Math.ceil((x1 - x0) / cell)), rows = Math.max(2, Math.ceil((y1 - y0) / cell)), N = cols * rows;
    const blocked = new Uint8Array(N), zoneOf = new Uint16Array(N), busy = new Uint8Array(N);
    const G = new Float32Array(N * 4), came = new Int32Array(N * 4);
    const cx = x => Math.floor((x - x0) / cell), cy = y => Math.floor((y - y0) / cell);
    const inside = (ix, iy) => ix >= 0 && iy >= 0 && ix < cols && iy < rows;
    const centre = (ix, iy) => [x0 + ix * cell + cell / 2, y0 + iy * cell + cell / 2];
    function fill(arr, val, x, y, w, h, margin){
      const a = Math.max(0, cx(x - margin)), b = Math.min(cols - 1, cx(x + w + margin)), c = Math.max(0, cy(y - margin)), d = Math.min(rows - 1, cy(y + h + margin));
      for(let iy = c; iy <= d; iy++) for(let ix = a; ix <= b; ix++) arr[iy * cols + ix] = val;
    }
    const api = {
      cell,
      block(x, y, w, h, margin = 6){ fill(blocked, 1, x, y, w, h, margin); },
      zone(id, x, y, w, h){ fill(zoneOf, id, x, y, w, h, 0); },
      mark(pts){ for(let i = 1; i < pts.length; i++){ const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / cell)); for(let k = 0; k <= n; k++){ const ix = cx(ax + (bx - ax) * k / n), iy = cy(ay + (by - ay) * k / n); if(inside(ix, iy)) busy[iy * cols + ix] = Math.min(3, busy[iy * cols + ix] + 1); } } },
      route({ from, to, zones = [], bend = 3, lane = 5 }){
        const allowed = new Set(zones);
        const free = i => !blocked[i] && (!zoneOf[i] || allowed.has(zoneOf[i]));
        // the first free cell outside the device, in the direction the cable leaves it
        const out = p => { let ix = cx(p.x), iy = cy(p.y); const d = dirOf(p.dx, p.dy); if(d < 0) return null; for(let k = 0; k < 12; k++){ if(inside(ix, iy) && free(iy * cols + ix)) return { ix, iy, d, k }; ix += DIRS[d][0]; iy += DIRS[d][1]; } return null; };
        const s = out(from), e = out(to); if(!s || !e) return null;
        const reqEnd = (dirOf(to.dx, to.dy) + 2) % 4;                // the last move runs against the direction the far end leaves its device
        G.fill(Infinity); const start = (s.iy * cols + s.ix) * 4 + s.d; G[start] = 0; came[start] = -1;
        // binary heap of [f, state]
        const heap = [[Math.abs(s.ix - e.ix) + Math.abs(s.iy - e.iy), start]];
        const push = it => { heap.push(it); let i = heap.length - 1; while(i > 0){ const p = (i - 1) >> 1; if(heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if(heap.length){ heap[0] = last; let i = 0; for(;;){ let l = 2 * i + 1, r = l + 1, m = i; if(l < heap.length && heap[l][0] < heap[m][0]) m = l; if(r < heap.length && heap[r][0] < heap[m][0]) m = r; if(m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
        let goal = -1, guard = 0;
        while(heap.length && guard++ < 400000){
          const [, st] = pop(), cell0 = st >> 2, d0 = st & 3, ix = cell0 % cols, iy = (cell0 / cols) | 0, g0 = G[st];
          if(ix === e.ix && iy === e.iy){ goal = st; break; }
          for(let d = 0; d < 4; d++){
            if(d === ((d0 + 2) & 3)) continue;                            // no U-turns
            const nx = ix + DIRS[d][0], ny = iy + DIRS[d][1]; if(!inside(nx, ny)) continue;
            const ni = ny * cols + nx; if(!free(ni)) continue;
            let c = g0 + 1 + (d !== d0 ? bend : 0) + busy[ni] * lane;
            if(nx === e.ix && ny === e.iy && d !== reqEnd) c += bend;
            const ns = ni * 4 + d; if(c < G[ns]){ G[ns] = c; came[ns] = st; push([c + Math.abs(nx - e.ix) + Math.abs(ny - e.iy), ns]); }
          }
        }
        if(goal < 0) return null;
        const cells = []; for(let st = goal; st >= 0; st = came[st]) cells.push(st >> 2); cells.reverse();
        let pts = cells.map(c => centre(c % cols, (c / cols) | 0));
        // line the first and the last straight run up with the ports (the cells are a little off the port): the cable leaves and enters straight
        const snap = (list, p, from0) => {
          const vert = p.dx === 0; const key = vert ? 0 : 1; const base = list[from0 ? 0 : list.length - 1][key];
          const step = from0 ? 1 : -1; for(let i = from0 ? 0 : list.length - 1; i >= 0 && i < list.length && Math.abs(list[i][key] - base) < 0.5; i += step) list[i][key] = vert ? p.x : p.y;
        };
        snap(pts, from, true); snap(pts, to, false);
        pts = [[from.x, from.y], ...pts, [to.x, to.y]];
        // only the corners stay
        const out2 = [pts[0]];
        for(let i = 1; i < pts.length - 1; i++){ const a = out2[out2.length - 1], b = pts[i], c = pts[i + 1]; const same = (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]); if(!same && !(a[0] === b[0] && a[1] === b[1])) out2.push(b); }
        out2.push(pts[pts.length - 1]);
        // the two ends may be a hair off the straight line when the cell centre and the port differ: make the first and last pieces exactly straight
        if(out2.length > 2){ if(from.dx === 0) out2[1][0] = from.x; else out2[1][1] = from.y; const n = out2.length; if(to.dx === 0) out2[n - 2][0] = to.x; else out2[n - 2][1] = to.y; }
        let len = 0; for(let i = 1; i < out2.length; i++) len += Math.abs(out2[i][0] - out2[i - 1][0]) + Math.abs(out2[i][1] - out2[i - 1][1]);
        return { pts:out2, len, bends:Math.max(0, out2.length - 2) };
      }
    };
    return api;
  }
  window.EdgeRouter = { make };
})();
