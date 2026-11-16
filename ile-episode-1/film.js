// L'ÎLE — ÉPISODE 1. Chaque image est une fonction pure de t, calée sur score.js.
(function () {
  const U = globalThis.U, G = globalThis.G, Ch = globalThis.Ch, S = globalThis.SCORE, Studio = globalThis.Studio;
  const { ev, BEAT, T } = S;
  const { clamp, lerp, ease } = U;
  const W = G.W, H = G.H, SAFE = G.SAFE;
  const INK = '#1E1A22';

  // ---------- le casting ----------
  const STY = {
    lea: { skin: '#C98E66', hair: '#3A2418', hairStyle: 'ponytail', outfit: 'shirt', shirt: '#3D7A74', pants: '#C9B48A', bottoms: 'pants', build: 'slim' },
    tom: { skin: '#F1C9A8', hair: '#C2562A', hairStyle: 'curly', glasses: 'round', outfit: 'hoodie', shirt: '#E0703E', bottoms: 'shorts', shorts: '#27305C', freckles: true },
    max: { skin: '#7A4E33', hair: '#141014', hairStyle: 'buzz', facialHair: 'stubble', outfit: 'tee', shirt: '#F2B84B', bottoms: 'shorts', shorts: '#2E3A2E', build: 'broad' },
    zoe: { skin: '#E8B48E', hair: '#E2B85A', hairStyle: 'bun', outfit: 'dress', shirt: '#E8718D' },
    inc: { skin: '#D8B79A', hair: '#2A2420', hairStyle: 'bald', facialHair: 'beard', glasses: 'sun', outfit: 'suit', robe: '#2B2A36', trim: '#7A1F2B', build: 'regular' },
    eve: { skin: '#D9A67E', hair: '#1A1416', hairStyle: 'long', outfit: 'dress', shirt: '#F4EDE0' },
  };
  globalThis.CAST = STY;
  const ORDER = ['tom', 'lea', 'zoe', 'eve', 'max', 'inc'];
  const XS = { tom: 130, lea: 285, zoe: 430, eve: 570, max: 715, inc: 865 };
  const SCALE = { tom: 0.9, lea: 0.93, zoe: 0.64, eve: 0.9, max: 0.95, inc: 0.95 };
  const SEED = { tom: 310, lea: 330, zoe: 350, eve: 370, max: 390, inc: 410 };
  const HEAD = 500; // hauteur tête, en unités personnage (s = 1)

  let off, offc; // calque pour les silhouettes
  const activeLine = (who, t) => S.lines.find((l) => l.who === who && t >= l.t && t <= l.end);

  function actor(ctx, who, x, y, s, t, extra = {}) {
    const talking = activeLine(who, t);
    const blink = U.hash(SEED[who], Math.floor(t * 1.3)) < 0.18 && (t * 1.3) % 1 < 0.12 ? 1 : 0;
    Ch.person(ctx, {
      x, y, s, pose: 'stand', style: STY[who], seed: SEED[who], blink,
      mouth: talking ? ((t * 9) % 1 < 0.5 ? 'open' : 'o') : 'flat',
      ...extra,
    });
  }
  const headY = (y, s) => y - HEAD * s;

  // ---------- bulles : jamais sous l'interface TikTok ----------
  function bubbles(ctx, t, pos) {
    for (const l of S.lines) {
      if (t < l.t || t > l.end + 0.25) continue;
      const p = pos[l.who]; if (!p) continue;
      const size = 64;
      const w = G.measure(ctx, l.text, size) + 70;
      const bx = clamp(p.x, SAFE.x + w / 2 + 10, SAFE.x + SAFE.w - w / 2 - 10);
      const by = p.by;
      G.bubble(ctx, l.text, bx, by, p.x, p.hy, t, l.t, l.end, { size });
    }
  }

  // ---------- décors ----------
  function beach(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, 1050);
    g.addColorStop(0, '#2A1E48'); g.addColorStop(0.55, '#8C3F5C'); g.addColorStop(1, '#F08A4B');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soleil couchant
    const sg = ctx.createRadialGradient(W * 0.62, 1010, 0, W * 0.62, 1010, 420);
    sg.addColorStop(0, 'rgba(255,214,140,0.95)'); sg.addColorStop(0.25, 'rgba(255,170,90,0.5)'); sg.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 500, W, 700);
    G.ellipse(ctx, W * 0.62, 1030, 120, 120, { fill: '#FFD58A', lw: 0, seed: 2 });
    // mer
    G.poly(ctx, [[-40, 1040], [W + 40, 1040], [W + 40, 1200], [-40, 1200]], { fill: '#3B4D7A', lw: 4, seed: 5, hatch: { color: 'rgba(255,255,255,0.12)', gap: 14, angle: 0 } });
    for (let i = 0; i < 5; i++) {
      const yy = 1070 + i * 26, ph = t * 1.4 + i;
      G.line(ctx, [[-20, yy + Math.sin(ph) * 4], [W * 0.5, yy + Math.sin(ph + 1) * 4], [W + 20, yy + Math.sin(ph + 2) * 4]], { color: 'rgba(255,220,180,0.35)', lw: 3, seed: 20 + i });
    }
    // île au loin (palmiers)
    G.poly(ctx, [[40, 1042], [120, 1000], [230, 990], [320, 1042]], { fill: '#2A2340', lw: 3, seed: 6 });
    // sable
    G.poly(ctx, [[-40, 1190], [W * 0.4, 1170], [W + 40, 1200], [W + 40, H + 40], [-40, H + 40]], { fill: '#E7C79A', lw: 5, seed: 7, hatch: { color: 'rgba(140,90,40,0.18)', gap: 9 } });
    // écume
    const fo = Math.sin(t * 1.2) * 14;
    G.line(ctx, [[-20, 1196 + fo], [W * 0.3, 1186 + fo], [W * 0.7, 1200 + fo], [W + 20, 1192 + fo]], { color: '#FFF6E4', lw: 9, seed: 9 });
    // jungle au fond à gauche et à droite
    palm(ctx, 60, 1200, 1.15, t, 1);
    palm(ctx, 1010, 1210, 1.3, t, 2);
  }

  function palm(ctx, x, y, s, t, seed) {
    const sway = Math.sin(t * 0.9 + seed) * 0.04;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(sway);
    G.limb(ctx, [[0, 0], [10, -160], [30, -320], [60, -460]], { color: '#6B4A33', lw: 34 });
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.55;
      const ex = 60 + Math.cos(a) * 230, ey = -460 + Math.sin(a) * 120 + 70;
      G.poly(ctx, [[60, -460], [60 + Math.cos(a) * 120, -470 + Math.sin(a) * 90 - 20], [ex, ey], [60 + Math.cos(a) * 110, -450 + Math.sin(a) * 60 + 20]], { fill: k % 2 ? '#2F6B4A' : '#3E8A5A', lw: 4, seed: seed * 10 + k });
    }
    ctx.restore();
  }

  function jungle(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#12261E'); g.addColorStop(0.5, '#1F3F30'); g.addColorStop(1, '#2C3A22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // rayons de lumière
    ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#E8F2C0';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(250 + i * 280, 0); ctx.lineTo(330 + i * 280, 0); ctx.lineTo(200 + i * 320, 1500); ctx.lineTo(100 + i * 320, 1500); ctx.fill(); }
    ctx.restore();
    // sol / chemin
    G.poly(ctx, [[-40, 1180], [W + 40, 1180], [W + 40, H + 40], [-40, H + 40]], { fill: '#3B3420', lw: 4, seed: 41, hatch: { color: 'rgba(0,0,0,0.2)', gap: 9 } });
    G.poly(ctx, [[W / 2 - 60, 1180], [W / 2 + 60, 1180], [W / 2 + 460, H + 40], [W / 2 - 460, H + 40]], { fill: '#6E5A38', lw: 4, seed: 42 });
    // arbres qui défilent (on avance vers la caméra)
    const walking = t < ev.zoeStop ? t - ev.toJungle : ev.zoeStop - ev.toJungle + Math.max(0, t - (ev.zoeStop + 3.6)) * 1;
    const trees = [];
    for (let i = 0; i < 10; i++) {
      const z = (i / 10 + walking * 0.09) % 1;
      const side = i % 2 ? 1 : -1;
      trees.push({ z, side, i });
    }
    trees.sort((a, b) => a.z - b.z);
    for (const tr of trees) {
      const sc = 0.35 + tr.z * tr.z * 2.2;
      const x = W / 2 + tr.side * (170 + tr.z * tr.z * 620);
      const base = 1180 + tr.z * 500;
      const wd = 70 * sc;
      ctx.save(); ctx.globalAlpha = clamp(tr.z * 6);
      G.poly(ctx, [[x - wd / 2, base], [x - wd / 2 * 0.8, -50], [x + wd / 2 * 0.8, -50], [x + wd / 2, base]], { fill: U.hash(tr.i) > 0.5 ? '#2B2016' : '#3A2C1C', lw: 4, seed: 60 + tr.i, hatch: { color: 'rgba(0,0,0,0.25)', gap: 10, angle: 1.4 } });
      // feuilles
      for (let k = 0; k < 3; k++) G.ellipse(ctx, x + tr.side * (40 + k * 30) * sc, 300 + k * 160 + tr.i * 13, 140 * sc, 60 * sc, { fill: k % 2 ? '#24503A' : '#2E6446', lw: 3, seed: 80 + tr.i * 3 + k });
      ctx.restore();
    }
    // lucioles
    for (let i = 0; i < 18; i++) {
      const fx = (U.hash(i, 1) * W + Math.sin(t * 0.7 + i) * 40), fy = 500 + U.hash(i, 2) * 800 + Math.cos(t * 0.9 + i) * 30;
      const a = 0.4 + 0.4 * Math.sin(t * 3 + i * 2);
      ctx.fillStyle = `rgba(230,255,150,${a})`; ctx.beginPath(); ctx.arc(fx, fy, 5, 0, 7); ctx.fill();
    }
    // les notes de la berceuse flottent (seule Zoé les voit)
    for (const n of S.lullaby) {
      const a = t - n.t; if (a < 0 || a > 2.2 || n.t >= ev.hush) continue;
      const nx = 120 + ((n.midi * 37) % 300) + a * 60, ny = 760 - a * 160;
      G.text(ctx, '♪', nx, ny, { size: 64, color: `rgba(255,236,170,${1 - a / 2.2})`, fam: 'Patrick Hand', weight: 400 });
    }
  }

  const NAMES = [
    { text: 'LÉA', x: 400, y: 420, r: -0.06 },
    { text: 'TOM', x: 660, y: 450, r: 0.05 },
    { text: 'MAX', x: 410, y: 560, r: 0.04 },
    { text: 'ZOÉ', x: 670, y: 590, r: -0.05 },
    { text: 'ÈVE', x: 540, y: 700, r: 0.02 },
  ];
  function tree(ctx, t) {
    const dark = clamp((t - ev.toTree) / 8);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, lerp(0, 1, dark) > 0.5 ? '#0C1A16' : '#12241C'); g.addColorStop(1, '#1E2A1A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // fond de jungle sombre
    for (let i = 0; i < 7; i++) G.poly(ctx, [[i * 170 - 40, H], [i * 170 - 10, -40], [i * 170 + 40, -40], [i * 170 + 70, H]], { fill: '#172A20', lw: 3, seed: 200 + i });
    // le grand arbre
    G.poly(ctx, [[150, 1420], [250, 1100], [270, 300], [230, -60], [850, -60], [810, 300], [830, 1100], [930, 1420]], { fill: '#5A4128', lw: 6, seed: 220, hatch: { color: 'rgba(0,0,0,0.22)', gap: 12, angle: 1.5 } });
    // racines
    G.limb(ctx, [[260, 1300], [150, 1400], [40, 1440]], { color: '#4A3420', lw: 40 });
    G.limb(ctx, [[820, 1300], [940, 1400], [1060, 1430]], { color: '#4A3420', lw: 40 });
    // mousse
    for (let i = 0; i < 6; i++) G.ellipse(ctx, i % 2 ? 300 : 780, 380 + i * 170, 26, 60, { fill: 'rgba(60,100,50,0.7)', lw: 0, seed: 240 + i });
    // les noms gravés (vieux)
    for (const n of NAMES) {
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.r);
      G.text(ctx, n.text, 0, 0, { size: 82, fam: 'Permanent Marker', weight: 400, color: '#2A1C10', align: 'center', boil: 0.3 });
      G.text(ctx, n.text, -2, -3, { size: 82, fam: 'Permanent Marker', weight: 400, color: 'rgba(200,160,110,0.35)', align: 'center', boil: 0.3 });
      ctx.restore();
    }
    // Léa touche ÈVE : le nom s'éclaire une seconde
    const glow = t >= S.leaTouch[0] && t < S.leaTouch[1] + 0.4 ? Math.sin(Math.PI * clamp((t - S.leaTouch[0]) / (S.leaTouch[1] + 0.4 - S.leaTouch[0]))) : 0;
    if (glow > 0) {
      const rg = ctx.createRadialGradient(540, 680, 0, 540, 680, 200);
      rg.addColorStop(0, `rgba(255,220,140,${0.5 * glow})`); rg.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = rg; ctx.fillRect(340, 480, 400, 400);
    }
    // T, O, I : gravés tout seuls, bois clair et frais
    const L = ['T', 'O', 'I'];
    ev.letters.forEach((lt, i) => {
      const a = t - lt; if (a < 0) return;
      const pop = ease.outBack(clamp(a / 0.15), 3);
      const x = 400 + i * 140, y = 930;
      ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop); ctx.rotate((U.hash(i, 3) - 0.5) * 0.15);
      G.text(ctx, L[i], 0, 0, { size: 190, fam: 'Permanent Marker', weight: 400, color: '#F3DDB4', align: 'center', stroke: '#2A1C10', strokeW: 10 });
      ctx.restore();
      if (a < 0.4) for (let k = 0; k < 8; k++) { // copeaux
        const ang = U.hash(i, k) * 6.28, d = a * 500;
        ctx.fillStyle = '#E8CFA0'; ctx.fillRect(x + Math.cos(ang) * d, y - 60 + Math.sin(ang) * d + a * a * 600, 10, 4);
      }
    });
  }

  // ---------- scènes ----------
  function sceneBeach(ctx, t) {
    beach(ctx, t);
    const GROUND = 1470;
    const pos = {};
    // silhouettes (0 -> 1 s), puis les visages
    const litU = clamp((t - ev.lit) / 0.35);
    offc.clearRect(0, 0, W, H);
    for (const who of ORDER) {
      if (who === 'eve' && t >= ev.vanish + 0.35) continue;
      const x = XS[who], s = SCALE[who];
      let extra = { eyes: 'normal', look: 0 };
      if (who === 'tom') extra = t > 2.2 ? { eyes: 'wide', brows: 'worried', sweat: 1, gesture: 'shrug' } : { eyes: 'wide', brows: 'worried' };
      if (who === 'lea') extra = { eyes: 'normal', brows: 'determined', look: t > 7 ? -0.8 : 0 };
      if (who === 'max') extra = t > 5.8 && t < 7.6 ? { gesture: 'phone', eyes: 'normal', brows: 'neutral', look: -0.3, lookY: 0.6 } : { brows: 'up' };
      if (who === 'zoe') extra = { eyes: 'wide', look: 0.4 };
      if (who === 'inc') extra = { mouth: 'smirk' };
      const target = who === 'eve' ? offc : ctx;
      if (who === 'eve') {
        // elle s'efface vers le haut
        const v = clamp((t - ev.vanish) / 0.3);
        offc.save(); offc.globalAlpha = 1 - v; offc.translate(x, GROUND); offc.scale(1 - v * 0.6, 1 + v * 0.8); offc.translate(-x, -GROUND);
        actor(offc, who, x, GROUND, s, t, { eyes: 'closed' });
        offc.restore();
      } else {
        if (litU < 1) actor(offc, who, x, GROUND, s, t, extra);
        if (litU > 0) { ctx.save(); ctx.globalAlpha = litU; actor(ctx, who, x, GROUND, s, t, extra); ctx.restore(); }
      }
      void target;
      pos[who] = { x, hy: headY(GROUND, s) + 20, by: headY(GROUND, s) - 110 };
    }
    // silhouettes en noir
    offc.save(); offc.globalCompositeOperation = 'source-in'; offc.fillStyle = '#140E1C'; offc.fillRect(0, 0, W, H); offc.restore();
    ctx.save(); ctx.globalAlpha = 1 - litU * 0.999; ctx.drawImage(off, 0, 0); ctx.restore();
    // Ève, toujours en silhouette, même quand les autres sont éclairés
    if (t >= ev.lit && t < ev.vanish + 0.35) ctx.drawImage(off, 0, 0);
    // fumée où elle était
    const pa = t - ev.vanish;
    if (pa >= 0 && pa < 1.2) for (let k = 0; k < 14; k++) {
      const ang = U.hash(k, 4) * 6.28, d = 30 + pa * 220 * (0.5 + U.hash(k, 5));
      ctx.fillStyle = `rgba(30,20,40,${0.55 * (1 - pa / 1.2)})`;
      ctx.beginPath(); ctx.arc(XS.eve + Math.cos(ang) * d, GROUND - 180 + Math.sin(ang) * d * 0.8 - pa * 120, 22 + pa * 40, 0, 7); ctx.fill();
    }
    // étiquettes de noms
    for (const n of S.nameTags) {
      if (t < n.t) continue;
      const u = ease.outBack(clamp((t - n.t) / 0.25), 2.5);
      const p = pos[n.who];
      ctx.save(); ctx.translate(p.x, p.by + 60); ctx.scale(u, u);
      const w = G.measure(ctx, n.text, 40, 'Bungee', 400) + 30;
      G.rrect(ctx, -w / 2, -34, w, 48, 10, { fill: n.who === 'inc' ? '#7A1F2B' : '#F6F0E2', lw: 3, seed: 500 + n.t * 10 });
      G.text(ctx, n.text, 0, 2, { size: 34, fam: 'Bungee', weight: 400, color: n.who === 'inc' ? '#F6F0E2' : INK, align: 'center' });
      ctx.restore();
    }
    bubbles(ctx, t, pos);
    // le titre qui claque
    hookText(ctx, t);
  }

  function hookText(ctx, t) {
    if (t > 3.4) return;
    const txt = t < ev.vanish ? 'ON ÉTAIT 6.' : 'ON EST 5.';
    const t0 = t < ev.vanish ? 0 : ev.vanish;
    const u = clamp((t - t0) / 0.12);
    const sc = t0 === 0 ? 1 : 1.3 - 0.3 * ease.outBack(u, 3);
    const out = clamp((t - 2.9) / 0.4);
    ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(W / 2 - 50, SAFE.y + 170); ctx.scale(sc, sc); ctx.rotate(-0.03);
    G.text(ctx, txt, 0, 0, { size: 104, fam: 'Bungee', weight: 400, color: '#FFD23F', align: 'center', stroke: INK, strokeW: 16 });
    ctx.restore();
  }

  function sceneJungle(ctx, t) {
    jungle(ctx, t);
    const GROUND = 1440;
    const pos = {};
    const walkers = ['tom', 'lea', 'zoe', 'max', 'inc'];
    const xs = { tom: 170, lea: 530, zoe: 350, max: 720, inc: 870 };
    const ys = { tom: 1460, lea: 1370, zoe: 1500, max: 1480, inc: 1380 };
    // ordre de dessin : du fond vers l'avant
    const order = [...walkers].sort((a, b) => ys[a] - ys[b]);
    for (const who of order) {
      const s = SCALE[who] * (0.92 + (ys[who] - 1330) / 600);
      const stopped = who === 'zoe' ? t >= ev.zoeStop : t >= ev.zoeStop + 0.5 && t < ev.toTree - 1.2;
      const extra = stopped ? { pose: 'stand' } : { pose: 'walk', walk: (t - ev.toJungle) * 0.9 + SEED[who] * 0.01 };
      if (who === 'zoe' && t >= ev.zoeStop) Object.assign(extra, { eyes: 'wide', look: -0.8, lookY: -0.5, gesture: 'pointUp' });
      if (who === 'tom') Object.assign(extra, { eyes: t > 9.9 ? 'normal' : 'wide', brows: 'worried', look: t > 9.9 && t < 12 ? 0.8 : 0, sweat: t > 14.3 ? 1 : 0 });
      if (who === 'lea') Object.assign(extra, { brows: 'determined', look: t > ev.zoeStop + 0.5 ? -0.6 : 0 });
      if (who === 'inc') Object.assign(extra, { mouth: 'smirk' });
      if (who === 'max') Object.assign(extra, { look: t > ev.zoeStop + 0.5 ? -0.5 : 0, brows: t > ev.zoeStop + 0.5 ? 'up' : 'neutral' });
      actor(ctx, who, xs[who], ys[who], s, t, extra);
      pos[who] = { x: xs[who], hy: headY(ys[who], s) + 20, by: headY(ys[who], s) - 100 };
    }
    pos.zoe.by = Math.min(pos.zoe.by, 900);
    bubbles(ctx, t, pos);
  }

  function sceneTree(ctx, t) {
    // poussée lente vers « TOI »
    const push = clamp((t - ev.letters[0]) / (ev.flash - ev.letters[0]));
    const z = 1 + 0.35 * ease.inOutCubic(push);
    ctx.save();
    ctx.translate(W / 2, 860); ctx.scale(z, z); ctx.translate(-W / 2, -860);
    tree(ctx, t);
    ctx.restore();
    // les personnages en bas, de dos au début puis face caméra
    const pos = {};
    const row = { tom: [140, 1520], zoe: [320, 1550], lea: [520, 1500], max: [720, 1525], inc: [890, 1495] };
    const drop = 260 * ease.inCubic(push); // ils glissent hors du cadre pendant la poussée
    for (const who of ['lea', 'inc', 'tom', 'max', 'zoe']) {
      const [x, y0] = row[who]; const y = y0 + drop;
      const s = SCALE[who] * 0.85;
      const staring = t >= ev.stare;
      let extra = { lookY: staring ? 0 : -1, look: 0, eyes: staring ? 'wide' : 'normal' };
      if (who === 'lea') {
        const touching = t >= S.leaTouch[0] && t < S.leaTouch[1];
        Object.assign(extra, { brows: t >= S.leaTouch[1] ? 'worried' : 'determined', gesture: touching ? 'pointUp' : null, mouth: 'flat' });
      }
      if (who === 'tom') Object.assign(extra, { brows: 'worried', sweat: 1, eyes: staring ? 'wide' : 'normal' });
      if (who === 'zoe' && t > 22.7 && t < 24.8) Object.assign(extra, { gesture: 'point', look: 1, lookY: 0 });
      if (who === 'inc') Object.assign(extra, { mouth: t > 22.9 && t < ev.hush ? 'smirk' : 'flat' });
      if (who === 'max') Object.assign(extra, { brows: 'up' });
      if (staring) extra.brows = 'worried';
      actor(ctx, who, x, y, s, t, extra);
      pos[who] = { x, hy: headY(y, s) + 20, by: headY(y, s) - 90 };
    }
    for (const k in pos) pos[k].by = Math.min(pos[k].by, 1060);
    bubbles(ctx, t, pos);
    // obscurité qui monte après « TOI »
    const dk = clamp((t - ev.stare) / (ev.flash - ev.stare));
    if (dk > 0) { ctx.fillStyle = `rgba(5,4,10,${0.55 * dk})`; ctx.fillRect(0, 0, W, H); }
  }

  function sceneDark(ctx, t) {
    ctx.fillStyle = '#07060B'; ctx.fillRect(0, 0, W, H);
    const u = clamp((t - ev.ask) / 0.3);
    if (u > 0) {
      ctx.save(); ctx.globalAlpha = u;
      G.text(ctx, 'Et toi…', W / 2 - 50, 860, { size: 110, fam: 'Permanent Marker', weight: 400, color: '#F3DDB4', align: 'center' });
      G.text(ctx, 'tu fais quoi ?', W / 2 - 50, 1000, { size: 110, fam: 'Permanent Marker', weight: 400, color: '#F3DDB4', align: 'center', alpha: clamp((t - ev.ask - 0.6) / 0.3) });
      ctx.restore();
    }
  }

  function card(ctx, t, t0, letter, text, y, col) {
    const u = ease.outBack(clamp((t - t0) / 0.3), 2.2);
    if (u <= 0) return;
    const bob = Math.sin((t - t0) * 3) * 4;
    const x0 = SAFE.x + 20, w = SAFE.w - 40, h = 220;
    ctx.save(); ctx.translate(W / 2 - 70, y + h / 2 + bob); ctx.scale(u, u); ctx.translate(-(W / 2 - 70), -(y + h / 2));
    G.rrect(ctx, x0, y, w, h, 34, { fill: col, lw: 6, seed: letter.charCodeAt(0) });
    G.ellipse(ctx, x0 + 100, y + h / 2, 70, 70, { fill: '#F6F0E2', lw: 5, seed: 7 + letter.charCodeAt(0) });
    G.text(ctx, letter, x0 + 100, y + h / 2 + 32, { size: 96, fam: 'Bungee', weight: 400, color: INK, align: 'center' });
    const [l1, l2] = text;
    G.text(ctx, l1, x0 + 200, y + 98, { size: 58, color: '#FFFFFF' });
    G.text(ctx, l2, x0 + 200, y + 168, { size: 58, color: '#FFFFFF' });
    ctx.restore();
  }

  function sceneVote(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171230'); g.addColorStop(1, '#3A1F3E'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // pulsation sur le temps
    const ph = ((t - ev.vote) / BEAT) % 1;
    ctx.fillStyle = `rgba(255,210,63,${0.06 * Math.exp(-ph * 5)})`; ctx.fillRect(0, 0, W, H);
    const cx = W / 2 - 70;
    G.text(ctx, "L'ÎLE · ÉPISODE 2", cx, SAFE.y + 60, { size: 40, fam: 'Bungee', weight: 400, color: '#F6F0E2', align: 'center', alpha: 0.8 });
    const tu = ease.outBack(clamp((t - ev.vote) / 0.15), 3);
    ctx.save(); ctx.translate(cx, SAFE.y + 200); ctx.scale(tu, tu);
    G.text(ctx, 'TU DÉCIDES', 0, 0, { size: 104, fam: 'Bungee', weight: 400, color: '#FFD23F', align: 'center', stroke: INK, strokeW: 14 });
    ctx.restore();
    card(ctx, t, ev.cardA, 'A', ['Suivre la mélodie', 'dans la grotte'], SAFE.y + 320, '#C8553D');
    card(ctx, t, ev.cardB, 'B', ['Rester sur la plage', 'et faire un feu'], SAFE.y + 590, '#2F7A74');
    const cu = ease.outBack(clamp((t - ev.comment) / 0.25), 2.5);
    if (cu > 0) {
      ctx.save(); ctx.translate(cx, SAFE.y + 950); ctx.scale(cu, cu); ctx.rotate(-0.03);
      G.caption(ctx, { t: ev.comment, end: 99, text: 'Commente A ou B', x: -260, y: -60, rot: 0, size: 70 }, t);
      ctx.restore();
    }
    const nu = clamp((t - ev.next) / 0.3);
    if (nu > 0) G.text(ctx, 'La majorité gagne. Suite au prochain épisode.', cx, SAFE.y + 1100, { size: 40, fam: 'Patrick Hand', weight: 400, color: '#E9DCC3', align: 'center', alpha: nu });
  }

  // petit repère en haut pendant l'épisode
  function badge(ctx, t) {
    if (t < 3.6 || t >= ev.flash) return;
    G.text(ctx, "L'ÎLE · ÉP. 1", SAFE.x + 20, SAFE.y + 40, { size: 32, fam: 'Bungee', weight: 400, color: 'rgba(246,240,226,0.75)' });
  }

  Studio.film({
    init() { off = G.makeCanvas(W, H); offc = off.getContext('2d'); },
    draw(ctx, t) {
      // tremblement sur les gros coups
      const hits = [[0, 26], [ev.vanish, 14], [ev.toTree, 10], [ev.letters[0], 8], [ev.letters[1], 8], [ev.letters[2], 10], [ev.flash, 22], [ev.vote, 10]];
      let sh = 0; for (const [h, a] of hits) if (t >= h) sh = Math.max(sh, a * Math.exp(-(t - h) * 9));
      ctx.save(); ctx.translate(U.noise1(t * 40, 1) * sh, U.noise1(t * 40, 2) * sh);
      if (t < ev.toJungle) sceneBeach(ctx, t);
      else if (t < ev.toTree) sceneJungle(ctx, t);
      else if (t < ev.flash) sceneTree(ctx, t);
      else if (t < ev.vote) sceneDark(ctx, t);
      else sceneVote(ctx, t);
      ctx.restore();
      badge(ctx, t);
      // flashs
      const flashes = [[ev.vanish, 0.35, 14], [ev.toJungle, 0.5, 14], [ev.toTree, 0.4, 10], [ev.flash, 1, 6], [ev.vote, 0.5, 12]];
      let f = 0; for (const [h, a, d] of flashes) if (t >= h) f = Math.max(f, a * Math.exp(-(t - h) * d));
      if (f > 0.01) { ctx.fillStyle = `rgba(255,248,230,${f})`; ctx.fillRect(0, 0, W, H); }
    },
    post: { paper: 0.35, vignette: 0.4, grain: 0.06 },
    fadeOut: 0.3,
  });
})();
