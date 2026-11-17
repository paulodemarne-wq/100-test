// L'ÎLE — ÉPISODE 2 « La grotte ». Chaque image est une fonction pure de t, calée sur score.js.
(function () {
  const U = globalThis.U, G = globalThis.G, Ch = globalThis.Ch, S = globalThis.SCORE, Studio = globalThis.Studio;
  const { ev, BEAT } = S;
  const { clamp, ease } = U;
  const W = G.W, H = G.H, SAFE = G.SAFE;
  const INK = '#1E1A22';

  // ---------- le casting (le même qu'à l'épisode 1) ----------
  const STY = {
    lea: { skin: '#C98E66', hair: '#3A2418', hairStyle: 'ponytail', outfit: 'shirt', shirt: '#3D7A74', pants: '#C9B48A', bottoms: 'pants', build: 'slim' },
    tom: { skin: '#F1C9A8', hair: '#C2562A', hairStyle: 'curly', glasses: 'round', outfit: 'hoodie', shirt: '#E0703E', bottoms: 'shorts', shorts: '#27305C', freckles: true },
    max: { skin: '#7A4E33', hair: '#141014', hairStyle: 'buzz', facialHair: 'stubble', outfit: 'tee', shirt: '#F2B84B', bottoms: 'shorts', shorts: '#2E3A2E', build: 'broad' },
    zoe: { skin: '#E8B48E', hair: '#E2B85A', hairStyle: 'bun', outfit: 'dress', shirt: '#E8718D' },
    inc: { skin: '#D8B79A', hair: '#2A2420', hairStyle: 'bald', facialHair: 'beard', glasses: 'sun', outfit: 'suit', robe: '#2B2A36', trim: '#7A1F2B', build: 'regular' },
  };
  globalThis.CAST = STY;
  const SCALE = { tom: 0.9, lea: 0.93, zoe: 0.64, max: 0.95, inc: 0.95 };
  const SEED = { tom: 310, lea: 330, zoe: 350, max: 390, inc: 410 };
  const HEAD = 500;
  const headY = (y, s) => y - HEAD * s;

  function actor(ctx, who, x, y, s, t, extra = {}) {
    const talking = S.lines.find((l) => l.who === who && t >= l.t && t <= l.t + ((globalThis.VOIX_DUR || {})[l.id] || l.end - l.t));
    const blink = U.hash(SEED[who], Math.floor(t * 1.3)) < 0.18 && (t * 1.3) % 1 < 0.12 ? 1 : 0;
    Ch.person(ctx, { x, y, s, pose: 'stand', style: STY[who], seed: SEED[who], blink, mouth: talking ? ((t * 9) % 1 < 0.5 ? 'open' : 'o') : 'flat', ...extra });
  }

  function bubbles(ctx, t, pos) {
    for (const l of S.lines) {
      if (t < l.t || t > l.end + 0.25) continue;
      const p = pos[l.who]; if (!p) continue;
      const size = 64;
      const w = G.measure(ctx, l.text, size) + 70;
      const bx = clamp(p.x, SAFE.x + w / 2 + 10, SAFE.x + SAFE.w - w / 2 - 10);
      G.bubble(ctx, l.text, bx, p.by, p.x, p.hy, t, l.t, l.end, { size });
    }
  }

  // ---------- la torche de Léa : seule lumière de la grotte ----------
  function torchFlame(ctx, x, y, t, k = 1) {
    G.limb(ctx, [[x, y + 90], [x, y]], { color: '#5A3A22', lw: 16 });
    const f = 1 + 0.15 * U.noise1(t * 14, 3);
    G.ellipse(ctx, x, y - 22 * f * k, 26 * k, 44 * f * k, { fill: '#F2A13B', lw: 3, seed: 900 + Math.floor(t * 12) });
    G.ellipse(ctx, x, y - 14 * f * k, 12 * k, 24 * f * k, { fill: '#FFE7A0', lw: 0, seed: 901 });
  }
  // obscurité avec un trou de lumière autour de (lx, ly)
  function darkness(ctx, lx, ly, r, t, a = 0.93) {
    const fl = 1 + 0.05 * U.noise1(t * 9, 7);
    const g = ctx.createRadialGradient(lx, ly, r * 0.15 * fl, lx, ly, r * fl);
    g.addColorStop(0, 'rgba(6,4,10,0)'); g.addColorStop(0.55, `rgba(6,4,10,${a * 0.55})`); g.addColorStop(1, `rgba(6,4,10,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // lueur chaude de la flamme
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const w = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.6);
    w.addColorStop(0, 'rgba(255,160,60,0.22)'); w.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = w; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  function rockWall(ctx, seed, col = '#4A3F3A') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2B2426'); g.addColorStop(1, '#3A302C'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x = U.hash(seed, i) * W, y = 150 + U.hash(seed, i, 2) * 1300, r = 90 + U.hash(seed, i, 3) * 160;
      G.ellipse(ctx, x, y, r, r * 0.6, { fill: i % 2 ? col : '#3E3532', lw: 3, seed: seed + i, hatch: { color: 'rgba(0,0,0,0.2)', gap: 10 } });
    }
    G.poly(ctx, [[-40, 1300], [W + 40, 1280], [W + 40, H + 40], [-40, H + 40]], { fill: '#2A2220', lw: 4, seed: seed + 50, hatch: { color: 'rgba(0,0,0,0.25)', gap: 9 } });
  }

  // ---------- scène 1 : devant la grotte ----------
  function sceneEntrance(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#152238'); g.addColorStop(1, '#2E3B33'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // falaise + bouche de la grotte
    G.poly(ctx, [[-40, 260], [300, 200], [700, 230], [W + 40, 190], [W + 40, 1320], [-40, 1320]], { fill: '#4C4744', lw: 6, seed: 11, hatch: { color: 'rgba(0,0,0,0.22)', gap: 11, angle: 1.2 } });
    G.poly(ctx, [[250, 1320], [270, 900], [380, 640], [540, 580], [700, 640], [810, 900], [830, 1320]], { fill: '#07050A', lw: 6, seed: 12 });
    // lianes
    for (let i = 0; i < 6; i++) { const x = 270 + i * 110, sw = Math.sin(t * 1.2 + i) * 8; G.line(ctx, [[x, 600 + (i % 2) * 40], [x + sw, 760 + i * 20], [x + sw * 1.5, 860 + i * 25]], { color: '#2F5A3A', lw: 6, seed: 30 + i }); }
    G.poly(ctx, [[-40, 1300], [W + 40, 1300], [W + 40, H + 40], [-40, H + 40]], { fill: '#3C3424', lw: 4, seed: 13, hatch: { color: 'rgba(0,0,0,0.2)', gap: 9 } });

    const pos = {};
    const row = { tom: [130, 1470], max: [300, 1480], lea: [540, 1450], zoe: [730, 1490], inc: [880, 1460] };
    for (const who of ['lea', 'inc', 'tom', 'max', 'zoe']) {
      const [x, y] = row[who], s = SCALE[who];
      let extra = { eyes: 'normal' };
      if (who === 'tom') extra = { eyes: 'wide', brows: 'worried', sweat: 1, gesture: t > 2.2 ? 'shrug' : null };
      if (who === 'max') extra = { brows: 'up', gesture: t > 1 && t < 2.2 ? 'facepalm' : null };
      if (who === 'lea') extra = { brows: 'determined', handR: undefined };
      if (who === 'zoe') extra = { eyes: 'wide', look: -0.6 };
      if (who === 'inc') extra = { mouth: 'smirk' };
      actor(ctx, who, x, y, s, t, extra);
      pos[who] = { x, hy: headY(y, s) + 20, by: headY(y, s) - 110 };
    }
    // torche dans la main de Léa (s'allume à 0.4 s)
    const tx = row.lea[0] + 120, ty = row.lea[1] - 330;
    if (t >= ev.torch) torchFlame(ctx, tx, ty, t, ease.outBack(clamp((t - ev.torch) / 0.25), 3));
    else G.limb(ctx, [[tx, ty + 90], [tx, ty]], { color: '#5A3A22', lw: 16 });
    // la nuit autour (plus de lumière quand la torche s'allume)
    const lit = clamp((t - ev.torch) / 0.3);
    darkness(ctx, tx, ty, 800 + 500 * lit, t, 0.7 - 0.3 * lit);
    bubbles(ctx, t, pos);
    hookText(ctx, t);
  }

  function hookText(ctx, t) {
    if (t > 3.6) return;
    const out = clamp((t - 3.2) / 0.4);
    const cx = W / 2 - 50;
    ctx.save(); ctx.globalAlpha = 1 - out;
    G.text(ctx, 'LE CHOIX EST FAIT', cx, SAFE.y + 60, { size: 46, fam: 'Bungee', weight: 400, color: '#F6F0E2', align: 'center', stroke: INK, strokeW: 10 });
    const u = clamp(t / 0.12);
    ctx.translate(cx, SAFE.y + 200); ctx.scale(1.15 - 0.15 * u, 1.15 - 0.15 * u); ctx.rotate(-0.03);
    G.text(ctx, 'A : LA GROTTE', 0, 0, { size: 104, fam: 'Bungee', weight: 400, color: '#FFD23F', align: 'center', stroke: INK, strokeW: 16 });
    ctx.restore();
  }

  // ---------- scène 2 : on avance dans le noir ----------
  function sceneWalk(ctx, t) {
    rockWall(ctx, 100);
    // stalactites qui défilent
    const k = (t - ev.inside) * 0.35;
    for (let i = 0; i < 8; i++) {
      const z = (i / 8 + k) % 1, side = i % 2 ? 1 : -1, sc = 0.4 + z * z * 2;
      const x = W / 2 + side * (120 + z * z * 600);
      G.poly(ctx, [[x - 40 * sc, -20], [x + 40 * sc, -20], [x, 140 * sc + 60]], { fill: '#5A4E48', lw: 4, seed: 120 + i });
    }
    const pos = {};
    const xs = { tom: 170, zoe: 350, lea: 540, max: 730, inc: 880 };
    const ys = { tom: 1470, zoe: 1500, lea: 1390, max: 1480, inc: 1400 };
    for (const who of ['lea', 'inc', 'tom', 'max', 'zoe']) {
      const s = SCALE[who] * (0.95 + (ys[who] - 1390) / 600);
      const stop = who === 'zoe' && t > ev.wall - 1.7;
      const extra = stop ? { eyes: 'wide', gesture: 'point', look: 1 } : { pose: 'walk', walk: (t - ev.inside) * 0.9 + SEED[who] * 0.01 };
      if (who === 'tom') Object.assign(extra, { brows: 'worried', sweat: 1, eyes: 'wide' });
      if (who === 'lea') Object.assign(extra, { brows: 'determined' });
      if (who === 'inc') Object.assign(extra, { mouth: 'smirk' });
      actor(ctx, who, xs[who], ys[who], s, t, extra);
      pos[who] = { x: xs[who], hy: headY(ys[who], s) + 20, by: Math.min(headY(ys[who], s) - 100, 900) };
    }
    const tx = xs.lea - 115, ty = ys.lea - 320;
    torchFlame(ctx, tx, ty, t);
    darkness(ctx, tx, ty, 900, t);
    bubbles(ctx, t, pos);
  }

  // ---------- scène 3 : les peintures sur le mur ----------
  function figure(ctx, x, y, s, seed, { hair = false, crossed = 0, small = false } = {}) {
    const c = '#C9682F', lw = 9 * s;
    G.ellipse(ctx, x, y - 150 * s, 26 * s, 26 * s, { fill: 'rgba(0,0,0,0)', stroke: c, lw, seed });
    G.line(ctx, [[x, y - 124 * s], [x, y - 40 * s]], { color: c, lw, seed: seed + 1 });
    G.line(ctx, [[x - 46 * s, y - 100 * s], [x, y - 90 * s], [x + 46 * s, y - 100 * s]], { color: c, lw, seed: seed + 2 });
    G.line(ctx, [[x - 30 * s, y + (small ? -5 : 10) * s], [x, y - 40 * s], [x + 30 * s, y + (small ? -5 : 10) * s]], { color: c, lw, seed: seed + 3 });
    if (hair) for (const d of [-1, 1]) G.line(ctx, [[x + d * 20 * s, y - 170 * s], [x + d * 34 * s, y - 110 * s]], { color: c, lw: lw * 0.8, seed: seed + 4 + d });
    if (crossed > 0) {
      const p = crossed;
      G.line(ctx, [[x - 70 * s, y - 200 * s], [x - 70 * s + 140 * s * Math.min(1, p * 2), y - 200 * s + 230 * s * Math.min(1, p * 2)]], { color: '#B3242C', lw: 14 * s, seed: seed + 8 });
      if (p > 0.5) G.line(ctx, [[x + 70 * s, y - 200 * s], [x + 70 * s - 140 * s * (p - 0.5) * 2, y - 200 * s + 230 * s * (p - 0.5) * 2]], { color: '#B3242C', lw: 14 * s, seed: seed + 9 });
    }
  }
  function sceneWall(ctx, t) {
    const a = t - ev.wall;
    const z = 1 + 0.08 * ease.inOutQuad(clamp(a / 5));
    ctx.save(); ctx.translate(W / 2, 760); ctx.scale(z, z); ctx.translate(-W / 2, -760);
    rockWall(ctx, 300, '#5A4A42');
    // une grande paroi lisse
    G.poly(ctx, [[60, 340], [960, 300], [990, 1180], [40, 1220]], { fill: '#8A6E58', lw: 5, seed: 301, hatch: { color: 'rgba(60,40,20,0.18)', gap: 12, angle: 0.4 } });
    // 6 silhouettes peintes : TOM LÉA ZOÉ ÈVE MAX ???
    const figs = [
      { x: 160, s: 1.1 }, { x: 300, s: 1.1, hair: true }, { x: 430, s: 0.75, small: true }, { x: 560, s: 1.1, hair: true, eve: true }, { x: 700, s: 1.15 }, { x: 850, s: 1.15 },
    ];
    figs.forEach((f, i) => {
      const appear = clamp((a - 0.1 * i) / 0.2);
      if (appear <= 0) return;
      ctx.save(); ctx.globalAlpha = appear;
      figure(ctx, f.x, 900, f.s * 1.25, 320 + i * 10, { hair: f.hair, small: f.small, crossed: f.eve ? clamp((t - (S.lines[5].t - 0.4)) / 0.6) : 0 });
      ctx.restore();
    });
    // la main peinte au-dessus (comme les vraies grottes)
    G.text(ctx, '6', 520, 560, { size: 200, fam: 'Permanent Marker', weight: 400, color: 'rgba(201,104,47,0.85)', align: 'center' });
    ctx.restore();
    // le groupe, en bas, éclairé par la torche
    const pos = {};
    const row = { tom: [150, 1560], zoe: [330, 1590], lea: [540, 1540], max: [740, 1570], inc: [900, 1540] };
    for (const who of ['lea', 'inc', 'tom', 'max', 'zoe']) {
      const [x, y] = row[who], s = SCALE[who] * 0.8;
      const extra = { lookY: -1, eyes: 'wide', brows: 'worried' };
      if (who === 'lea') Object.assign(extra, { eyes: 'normal', brows: 'determined' });
      if (who === 'inc') Object.assign(extra, { mouth: 'smirk', brows: 'neutral' });
      actor(ctx, who, x, y, s, t, extra);
      pos[who] = { x, hy: headY(y, s) + 20, by: Math.min(headY(y, s) - 90, 1180) };
    }
    const tx = row.lea[0] + 100, ty = row.lea[1] - 280;
    torchFlame(ctx, tx, ty, t);
    darkness(ctx, W / 2, 900, 1100, t, 0.8);
    bubbles(ctx, t, pos);
  }

  // ---------- scène 4 : la boîte à musique ----------
  function musicBox(ctx, x, y, t, open) {
    G.rrect(ctx, x - 110, y - 90, 220, 110, 14, { fill: '#7A2E3A', lw: 5, seed: 600, hatch: { color: 'rgba(0,0,0,0.2)', gap: 8 } });
    G.rrect(ctx, x - 110, y - 40, 220, 14, 4, { fill: '#E2B85A', lw: 3, seed: 601 });
    // couvercle ouvert
    ctx.save(); ctx.translate(x, y - 90); ctx.rotate(-1.1 * open);
    G.rrect(ctx, -110, -100, 220, 100, 14, { fill: '#8E3644', lw: 5, seed: 602 });
    ctx.restore();
    // petite danseuse qui tourne
    if (open > 0.5) {
      const sw = Math.cos(t * 4) ;
      G.line(ctx, [[x, y - 90], [x, y - 150]], { color: '#F6F0E2', lw: 5, seed: 603 });
      G.ellipse(ctx, x, y - 165, 12, 12, { fill: '#F6F0E2', lw: 3, seed: 604 });
      G.poly(ctx, [[x - 30 * sw, y - 120], [x + 30 * sw, y - 120], [x, y - 150]], { fill: '#E8718D', lw: 3, seed: 605 });
    }
    // gravure
    G.text(ctx, 'Pour Zoé', x, y - 2, { size: 34, fam: 'Caveat', color: '#F6E2B4', align: 'center' });
    // lueur dorée
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(x, y - 80, 0, x, y - 80, 360);
    g.addColorStop(0, `rgba(255,214,120,${0.35 + 0.1 * Math.sin(t * 5)})`); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 360, y - 440, 720, 720); ctx.restore();
  }
  function sceneBox(ctx, t) {
    rockWall(ctx, 500);
    // le rocher-autel
    G.poly(ctx, [[300, 1120], [330, 980], [750, 970], [780, 1120]], { fill: '#5E534E', lw: 5, seed: 510, hatch: { color: 'rgba(0,0,0,0.25)', gap: 9 } });
    const shake = t >= ev.rumble ? 6 * U.noise1(t * 30, 4) : 0;
    musicBox(ctx, 540 + shake, 985, t, t >= ev.rumble ? Math.max(0, 1 - (t - ev.rumble) * 4) : 1);
    // notes qui s'envolent
    for (const n of S.lullaby) {
      const a = t - n.t; if (a < 0 || a > 2 || n.t >= ev.rumble) continue;
      G.text(ctx, '♪', 540 + Math.sin(n.midi + a * 2) * 120, 860 - a * 220, { size: 60, fam: 'Patrick Hand', weight: 400, color: `rgba(255,236,170,${1 - a / 2})` });
    }
    const pos = {};
    const row = { tom: [130, 1560], max: [300, 1570], zoe: [520, 1420], lea: [720, 1540], inc: [900, 1530] };
    for (const who of ['zoe', 'lea', 'inc', 'tom', 'max']) {
      const [x, y] = row[who], s = SCALE[who] * (who === 'zoe' ? 1.05 : 0.82);
      const extra = { eyes: 'wide', brows: 'worried' };
      if (who === 'zoe') Object.assign(extra, { eyes: t > 18.3 && t < 21 ? 'closed' : 'wide', brows: 'worried', lookY: -0.4 });
      if (who === 'lea') Object.assign(extra, { eyes: t > 24 ? 'wide' : 'normal', brows: t > 24 ? 'worried' : 'determined', look: -0.8 });
      if (who === 'inc') Object.assign(extra, { mouth: 'smirk', brows: 'neutral', eyes: 'normal' });
      if (who === 'max') Object.assign(extra, { look: 0.7, brows: 'up', gesture: t > 21.3 && t < 23.6 ? 'point' : null });
      if (t >= ev.rumble) Object.assign(extra, { eyes: 'wide', brows: 'worried', lookY: -1, sweat: 1 });
      actor(ctx, who, x, y, s, t, extra);
      pos[who] = { x, hy: headY(y, s) + 20, by: Math.min(headY(y, s) - 90, 1150) };
    }
    pos.zoe.by = 760;
    const tx = row.lea[0] + 100, ty = row.lea[1] - 290;
    torchFlame(ctx, tx, ty, t);
    darkness(ctx, 560, 1000, 1000, t, 0.82);
    bubbles(ctx, t, pos);
    // ça gronde : poussière qui tombe
    if (t >= ev.rumble) for (let i = 0; i < 30; i++) {
      const a = (t - ev.rumble) * (0.7 + U.hash(i, 1)), x = U.hash(i, 2) * W, y = -20 + ((a * 700 + U.hash(i, 3) * 400) % 1500);
      ctx.fillStyle = 'rgba(180,160,140,0.6)'; ctx.fillRect(x, y, 5, 5);
    }
  }

  // ---------- scène 5 : l'éboulement ----------
  function sceneCollapse(ctx, t) {
    sceneBox(ctx, t);
    const a = t - ev.collapse;
    if (a < 0) return;
    // rochers qui tombent devant
    for (let i = 0; i < 12; i++) {
      const t0 = U.hash(i, 5) * 0.8, aa = a - t0; if (aa < 0) continue;
      const x = 60 + U.hash(i, 6) * (W - 120), r = 60 + U.hash(i, 7) * 90;
      const y = Math.min(1420 - r * 0.4 + U.hash(i, 8) * 160, -150 + aa * aa * 3500);
      G.poly(ctx, [[x - r, y], [x - r * 0.5, y - r * 0.8], [x + r * 0.6, y - r * 0.7], [x + r, y + r * 0.2], [x + r * 0.3, y + r * 0.6], [x - r * 0.7, y + r * 0.5]], { fill: i % 2 ? '#4E4440' : '#5C514C', lw: 5, seed: 700 + i, hatch: { color: 'rgba(0,0,0,0.25)', gap: 8 } });
    }
    // nuage de poussière
    const d = clamp(a / 0.6) * (1 - clamp((a - 2.2) / 1.2) * 0.5);
    ctx.fillStyle = `rgba(150,130,115,${0.28 * d})`; ctx.fillRect(0, 0, W, H);
    // la torche faiblit
    darkness(ctx, 700, 1200, 1000 - 250 * clamp(a / 2), t, 0.85);
    const s = SCALE.tom * 0.82, hy = headY(1560, s);
    bubbles(ctx, t, { tom: { x: 130, hy: hy + 20, by: Math.min(hy - 90, 1150) } });
  }

  // ---------- scène 6 : l'inconnu parle ----------
  function sceneInc(ctx, t) {
    ctx.fillStyle = '#06040A'; ctx.fillRect(0, 0, W, H);
    const a = t - ev.inc;
    const z = 1 + 0.06 * ease.inOutQuad(clamp(a / 2.5));
    ctx.save(); ctx.translate(W / 2 - 50, 1100); ctx.scale(z, z); ctx.translate(-(W / 2 - 50), -1100);
    const s = 2.0, x = W / 2 - 50, y = 1900;
    actor(ctx, 'inc', x, y, s, t, { mouth: a > 0.6 && a < 1.25 ? undefined : 'smirk', brows: 'neutral', eyes: 'normal' });
    ctx.restore();
    // éclairé par en dessous (la torche au sol)
    const g = ctx.createRadialGradient(x, 1500, 50, x, 1100, 900);
    g.addColorStop(0, 'rgba(6,4,10,0)'); g.addColorStop(0.6, 'rgba(6,4,10,0.45)'); g.addColorStop(1, 'rgba(6,4,10,0.97)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const w = ctx.createRadialGradient(x, 1600, 0, x, 1600, 700);
    w.addColorStop(0, 'rgba(255,130,50,0.35)'); w.addColorStop(1, 'rgba(255,130,50,0)');
    ctx.fillStyle = w; ctx.fillRect(0, 0, W, H); ctx.restore();
    const hy = y - HEAD * s;
    bubbles(ctx, t, { inc: { x, hy: hy + 60, by: hy - 120 } });
  }

  // ---------- le vote ----------
  function card(ctx, t, t0, letter, text, y, col) {
    const u = ease.outBack(clamp((t - t0) / 0.3), 2.2);
    if (u <= 0) return;
    const bob = Math.sin((t - t0) * 3) * 4;
    const x0 = SAFE.x + 20, w = SAFE.w - 40, h = 220;
    ctx.save(); ctx.translate(W / 2 - 70, y + h / 2 + bob); ctx.scale(u, u); ctx.translate(-(W / 2 - 70), -(y + h / 2));
    G.rrect(ctx, x0, y, w, h, 34, { fill: col, lw: 6, seed: letter.charCodeAt(0) });
    G.ellipse(ctx, x0 + 100, y + h / 2, 70, 70, { fill: '#F6F0E2', lw: 5, seed: 7 + letter.charCodeAt(0) });
    G.text(ctx, letter, x0 + 100, y + h / 2 + 32, { size: 96, fam: 'Bungee', weight: 400, color: INK, align: 'center' });
    G.text(ctx, text[0], x0 + 200, y + 98, { size: 58, color: '#FFFFFF' });
    G.text(ctx, text[1], x0 + 200, y + 168, { size: 58, color: '#FFFFFF' });
    ctx.restore();
  }
  function sceneVote(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171230'); g.addColorStop(1, '#3A1F3E'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const ph = ((t - ev.vote) / BEAT) % 1;
    ctx.fillStyle = `rgba(255,210,63,${0.06 * Math.exp(-ph * 5)})`; ctx.fillRect(0, 0, W, H);
    const cx = W / 2 - 70;
    G.text(ctx, "L'ÎLE · ÉPISODE 3", cx, SAFE.y + 60, { size: 40, fam: 'Bungee', weight: 400, color: '#F6F0E2', align: 'center', alpha: 0.8 });
    const tu = ease.outBack(clamp((t - ev.vote) / 0.15), 3);
    ctx.save(); ctx.translate(cx, SAFE.y + 200); ctx.scale(tu, tu);
    G.text(ctx, 'TU DÉCIDES', 0, 0, { size: 104, fam: 'Bungee', weight: 400, color: '#FFD23F', align: 'center', stroke: INK, strokeW: 14 });
    ctx.restore();
    card(ctx, t, ev.cardA, 'A', ['Creuser pour', 'sortir'], SAFE.y + 320, '#C8553D');
    card(ctx, t, ev.cardB, 'B', ['Aller au fond', 'de la grotte'], SAFE.y + 590, '#2F7A74');
    if (t >= ev.comment) {
      ctx.save(); ctx.translate(cx, SAFE.y + 950); ctx.rotate(-0.03);
      G.caption(ctx, { t: ev.comment, end: 99, text: 'Commente A ou B', x: -260, y: -60, rot: 0, size: 70 }, t);
      ctx.restore();
    }
    const nu = clamp((t - ev.next) / 0.3);
    if (nu > 0) G.text(ctx, 'Suite au prochain épisode.', cx, SAFE.y + 1100, { size: 44, fam: 'Patrick Hand', weight: 400, color: '#E9DCC3', align: 'center', alpha: nu });
  }

  function badge(ctx, t) {
    if (t < 3.8 || t >= ev.inc) return;
    G.text(ctx, "L'ÎLE · ÉP. 2", SAFE.x + 20, SAFE.y + 40, { size: 32, fam: 'Bungee', weight: 400, color: 'rgba(246,240,226,0.75)' });
  }

  Studio.film({
    draw(ctx, t) {
      const hits = [[0, 20], [ev.torch, 6], [ev.wall, 6], [ev.box, 6], [ev.collapse, 34], [ev.inc, 8], [ev.vote, 10]];
      let sh = 0; for (const [h, a] of hits) if (t >= h) sh = Math.max(sh, a * Math.exp(-(t - h) * (h === ev.collapse ? 2.5 : 9)));
      if (t >= ev.rumble && t < ev.collapse) sh = Math.max(sh, 5);
      ctx.save(); ctx.translate(U.noise1(t * 40, 1) * sh, U.noise1(t * 40, 2) * sh);
      if (t < ev.inside) sceneEntrance(ctx, t);
      else if (t < ev.wall) sceneWalk(ctx, t);
      else if (t < ev.box) sceneWall(ctx, t);
      else if (t < ev.collapse) sceneBox(ctx, t);
      else if (t < ev.inc) sceneCollapse(ctx, t);
      else if (t < ev.vote) sceneInc(ctx, t);
      else sceneVote(ctx, t);
      ctx.restore();
      badge(ctx, t);
      const flashes = [[ev.torch, 0.3, 12], [ev.inside, 0.4, 14], [ev.wall, 0.3, 12], [ev.box, 0.35, 12], [ev.collapse, 0.7, 8], [ev.inc, 0.3, 14], [ev.vote, 0.5, 12]];
      let f = 0; for (const [h, a, d] of flashes) if (t >= h) f = Math.max(f, a * Math.exp(-(t - h) * d));
      if (f > 0.01) { ctx.fillStyle = `rgba(255,248,230,${f})`; ctx.fillRect(0, 0, W, H); }
    },
    post: { paper: 0.35, vignette: 0.45, grain: 0.07 },
    fadeOut: 0.3,
  });
})();
