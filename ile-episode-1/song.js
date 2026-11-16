// THE SONG — every sound comes from score.js.  node song.js  (LUFS=-14 node song.js)
const path = require('path');
const { SR, Bus, reverb, pingpong } = require('./engine/audio/dsp');
const I = require('./engine/audio/instruments');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { T, BEAT, DURATION, m, ev, clock } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const drums = bus(), bass = bus(), pad = bus(), keys = bus(), fx = bus(), amb = bus();
const verb = bus(), dly = bus();
const quiet = (t) => (t >= ev.hush && t < ev.flash) || (t >= ev.flash + 0.05 && t < ev.vote);

// ---------- 0.0 s : le coup d'ouverture ----------
fx.addMono(I.subBoom(1.6, 70, 32), 0, 0.9);
fx.addMono(I.thud(55, 0.12), 0, 0.8);
drums.addMono(I.kick({ punch: 1.3 }), 0, 1.0);
drums.addMono(I.crash(3), 0, 0.35);
verb.addMono(I.clap(), 0, 0.5);
// 0.4 s : la silhouette disparaît
fx.addMono(I.noiseSweep(0.32, 300, 7000, { q: 1.2, shape: (x) => x * x, pink: true }), ev.vanish - 0.32, 0.35);
drums.addMono(I.kick({ punch: 1.4 }), ev.vanish, 0.9);
drums.addMono(I.clap({ decay: 0.08 }), ev.vanish, 0.8);
fx.addMono(I.subBoom(0.8, 90, 40), ev.vanish + 0.03, 0.3);
verb.addMono(I.thwack(), ev.vanish, 0.35);

// ---------- ambiances ----------
amb.addMono(I.noiseSweep(ev.toJungle, 700, 450, { q: 0.6, pink: true, shape: (x) => 0.6 + 0.4 * Math.sin(x * 9) ** 2 }), 0, 0.22); // la mer
amb.addMono(I.noiseSweep(ev.toTree - ev.toJungle, 5200, 5600, { q: 9 }), ev.toJungle, 0.05); // insectes
{
  const r = require('./engine/util').mulberry32(7);
  for (let t = ev.toJungle + 0.4; t < ev.toTree - 0.3; t += 0.6 + r() * 1.1) {
    const p = 84 + Math.floor(r() * 8);
    amb.addMono(I.pulse(p, 0.06, { duty: 0.5, decay: 0.05 }), t, 0.05, r() * 1.6 - 0.8);
    amb.addMono(I.pulse(p + 3, 0.05, { duty: 0.5, decay: 0.04 }), t + 0.08, 0.04, r() * 1.6 - 0.8);
  }
}

// ---------- pads + basse ----------
for (const c of sc.chords) {
  const t1 = c.t0 < ev.hush && c.t1 > ev.hush ? ev.hush : c.t1;
  const voteSec = c.t0 >= ev.vote;
  const opts = voteSec ? { cutoff: 2400, attack: 0.04 } : { cutoff: 900, attack: 0.8, release: 1.2 };
  for (const n of c.notes) { const { L, R } = I.padNote(n, t1 - c.t0, opts); pad.addStereo(L, R, c.t0, voteSec ? 0.07 : 0.09); }
  if (!voteSec) bass.addMono(I.bass(c.bass, t1 - c.t0, { bright: 0.1, sub: 1 }), c.t0, 0.35);
}
// pulsation de tension dans la jungle (croches graves)
clock.eachStep(4, 11, 8, (t) => {
  if (t < ev.toJungle || t >= ev.hush) return;
  const c = sc.chordAt(t); if (!c) return;
  bass.addMono(I.bass(m('A1') === c.bass ? c.bass + 12 : c.bass + 12, BEAT / 2 * 0.6, { bright: 0.3 }), t, 0.22);
});
// battements de cœur quand Léa touche l'arbre
for (const t of sc.heartbeats) fx.addMono(I.heartbeat(), t, 0.7);

// ---------- la berceuse que seule Zoé entend ----------
sc.lullaby.forEach((n, i) => {
  if (n.t >= ev.hush) return;
  const grow = Math.min(1, 0.45 + (n.t - ev.zoeStop) / 12);
  const mb = I.musicBox(n.midi);
  keys.addMono(mb, n.t, 0.22 * grow, -0.45);
  verb.addMono(mb, n.t, 0.2 * grow);
  dly.addMono(mb, n.t, 0.1 * grow);
});

// ---------- les coupes ----------
fx.addMono(I.noiseSweep(0.4, 400, 5000, { q: 1, shape: (x) => x * x, pink: true }), ev.toJungle - 0.4, 0.3);
fx.addMono(I.thud(70, 0.08), ev.toJungle, 0.55);
drums.addMono(I.kick(), ev.toJungle, 0.7);
// l'arbre : grosse note grave
fx.addMono(I.subBoom(2.4, 60, 30), ev.toTree + 0.03, 0.4);
drums.addMono(I.clap({ decay: 0.1 }), ev.toTree, 0.8);
drums.addMono(I.kick({ punch: 1.2 }), ev.toTree, 0.9);
drums.addMono(I.crash(9), ev.toTree, 0.25);
bass.addMono(I.bass(m('E1'), 2.4, { sub: 1, bright: 0.4 }), ev.toTree, 0.5);

// ---------- bulles + étiquettes ----------
for (const l of sc.lines) fx.addMono(I.pop(l.who === 'zoe' ? 1.3 : l.who === 'tom' ? 1.1 : 0.9), l.t, 0.16);
sc.nameTags.forEach((n, i) => fx.addMono(I.woodTick(1 + i * 0.12), n.t, 0.35));

// ---------- le rebondissement : T, O, I gravés tout seuls ----------
for (const t of ev.letters) {
  fx.addMono(I.noiseSweep(0.28, 8000, 2500, { q: 5, shape: (x) => (x < 0.1 ? x * 10 : 1 - (x - 0.1) / 0.9) }), t, 0.55);
  fx.addMono(I.woodTick(0.6), t, 0.7);
  fx.addMono(I.thud(90, 0.05), t, 0.45);
  verb.addMono(I.woodTick(0.6), t, 0.3);
}
// drone très grave sous le regard caméra
fx.addMono(I.noiseSweep(ev.flash - ev.stare, 120, 300, { q: 2, pink: true, shape: (x) => x }), ev.stare, 0.25);
for (const t of [ev.stare, ev.stare + BEAT * 2]) fx.addMono(I.heartbeat(), t, 0.8);
// éclair + tonnerre
drums.addMono(I.crash(21), ev.flash, 0.55);
fx.addMono(I.subBoom(2.4, 80, 25), ev.flash, 0.9);
fx.addMono(I.thud(50, 0.15), ev.flash, 0.8);
fx.addMono(I.noiseSweep(2.4, 1400, 60, { q: 0.7, pink: true, shape: (x) => Math.exp(-x * 3) }), ev.flash, 0.6);
verb.addMono(I.crash(22), ev.flash, 0.3);

// ---------- le vote : ça repart ----------
const K = I.kick(), CL = I.clap(), HC = I.hat(false, 31);
const kicks = [];
drums.addMono(I.crash(40), ev.vote, 0.4);
fx.addMono(I.subBoom(1.2), ev.vote, 0.6);
clock.eachStep(14, 16, 8, (t, b, s) => {
  if (s % 2 === 0) { drums.addMono(K, t, 0.85); kicks.push(t); }
  if (s % 4 === 2) { drums.addMono(CL, t, 0.5); verb.addMono(CL, t, 0.2); }
  drums.addMono(HC, t, s % 2 ? 0.2 : 0.1, 0.25);
  const c = sc.chordAt(t); if (!c) return;
  bass.addMono(I.bass(c.bass + 12 + (s % 2 ? 12 : 0), BEAT / 2 * 0.8, { sub: 0.8 }), t, 0.45);
  const arp = c.notes[s % c.notes.length] + 12;
  keys.addMono(I.pluck(arp, { decay: 0.2 }), t, 0.14, s % 2 ? 0.3 : -0.3);
});
for (const t of [ev.cardA, ev.cardB, ev.comment]) fx.addMono(I.pop(1.2), t, 0.35);

// ---------- mix ----------
MIX.sidechain([pad, bass], kicks);
const stems = { drums, bass, pad, keys, fx, amb, verb: reverb(verb, { room: 0.88, damp: 0.35 }), dly: pingpong(dly, BEAT * 0.75, 0.35, 3000) };
const GAIN = { drums: 0.55, bass: 0.8, pad: 2.4, keys: 1.1, fx: 0.9, amb: 1.0, verb: 1, dly: 0.8 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 24);
MIX.gate(mix, ev.hush, ev.letters[0] - 0.01); // silence total quand la mélodie s'arrête
MIX.fadeOut(mix, DURATION - 0.5, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.8'), undefined, { lufs: parseFloat(process.env.LUFS || '-14') });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s, ${M.lufs.toFixed(1)} LUFS)`);
void quiet;
