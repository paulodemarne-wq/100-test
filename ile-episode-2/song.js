// THE SONG — épisode 2. Every sound comes from score.js.  node song.js
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

// ---------- 0.0 s : le résultat claque ----------
drums.addMono(I.kick({ punch: 1.4 }), 0, 1.0);
drums.addMono(I.clap({ decay: 0.1 }), 0, 0.7);
drums.addMono(I.crash(3), 0, 0.35);
fx.addMono(I.subBoom(1.6, 70, 32), 0.02, 0.6);
verb.addMono(I.clap(), 0, 0.4);
// 0.4 s : la torche s'allume (fwoosh)
fx.addMono(I.noiseSweep(0.5, 500, 3000, { q: 0.8, pink: true, shape: (x) => (x < 0.08 ? x / 0.08 : Math.exp(-(x - 0.08) * 6)) }), ev.torch, 0.6);
fx.addMono(I.thud(120, 0.04), ev.torch, 0.4);

// ---------- ambiances : vent dehors, gouttes dedans ----------
amb.addMono(I.noiseSweep(ev.inside, 600, 300, { q: 0.7, pink: true, shape: (x) => 0.5 + 0.5 * Math.sin(x * 7) ** 2 }), 0, 0.2);
amb.addMono(I.noiseSweep(ev.rumble - ev.inside, 220, 180, { q: 1.5, pink: true }), ev.inside, 0.1); // souffle de la grotte
{
  const r = require('./engine/util').mulberry32(11);
  for (let t = ev.inside + 0.3; t < ev.rumble; t += 0.7 + r() * 1.3) { // gouttes d'eau
    const d = I.marimba(88 + Math.floor(r() * 6), { thock: 0, decay: 0.15 });
    amb.addMono(d, t, 0.06, r() * 1.4 - 0.7); verb.addMono(d, t, 0.08);
  }
}

// ---------- pads + basse ----------
for (const c of sc.chords) {
  const t1 = c.t0 < ev.rumble && c.t1 > ev.rumble ? ev.rumble : c.t1;
  const voteSec = c.t0 >= ev.vote;
  const opts = voteSec ? { cutoff: 2400, attack: 0.04 } : { cutoff: 850, attack: 0.8, release: 1.2 };
  for (const n of c.notes) { const { L, R } = I.padNote(n, t1 - c.t0, opts); pad.addStereo(L, R, c.t0, voteSec ? 0.07 : 0.09); }
  if (!voteSec) bass.addMono(I.bass(c.bass, t1 - c.t0, { bright: 0.1, sub: 1 }), c.t0, 0.35);
}
// pas lents dans la grotte (tom grave sur les temps)
clock.eachStep(2, 4, 4, (t, b, s) => { if (t >= ev.inside) { drums.addMono(I.tom(70, 0.25), t, 0.35); } });

// ---------- la berceuse sort de la boîte ----------
for (const n of sc.lullaby) {
  if (n.t >= ev.rumble) continue;
  const mb = I.musicBox(n.midi);
  keys.addMono(mb, n.t, 0.24); verb.addMono(mb, n.t, 0.2); dly.addMono(mb, n.t, 0.1);
}

// ---------- les coupes ----------
for (const t of [ev.inside, ev.wall, ev.box]) {
  drums.addMono(I.kick({ punch: 1.2 }), t, 0.75);
  drums.addMono(I.clap({ decay: 0.08 }), t, 0.45);
  fx.addMono(I.subBoom(1.2, 70, 35), t + 0.03, 0.3);
}
// le X rouge sur Ève
fx.addMono(I.scribble(0.6, 5), sc.lines[5].t - 0.4, 0.4);

// ---------- l'éboulement ----------
fx.addMono(I.noiseSweep(ev.collapse - ev.rumble, 60, 160, { q: 1, pink: true, shape: (x) => x }), ev.rumble, 0.8); // grondement qui monte
drums.addMono(I.kick({ punch: 1.5 }), ev.collapse, 1.0);
drums.addMono(I.crash(17), ev.collapse, 0.5);
fx.addMono(I.thud(45, 0.2), ev.collapse, 0.9);
fx.addMono(I.subBoom(3, 80, 25), ev.collapse + 0.02, 0.9);
fx.addMono(I.noiseSweep(3, 1500, 80, { q: 0.6, pink: true, shape: (x) => Math.exp(-x * 2.5) }), ev.collapse, 0.4);
{ const r = require('./engine/util').mulberry32(5); for (let i = 0; i < 10; i++) fx.addMono(I.thud(70 + r() * 80, 0.06), ev.collapse + 0.4 + r() * 1.2, 0.35, r() - 0.5); }

// ---------- l'inconnu : silence, un seul accord grave ----------
drums.addMono(I.kick(), ev.inc, 0.6);
fx.addMono(I.subBoom(2.5, 55, 30), ev.inc, 0.3);
fx.addMono(I.heartbeat(), ev.inc + BEAT * 2.5, 0.7);

// ---------- le vote ----------
const K = I.kick(), CL = I.clap(), HC = I.hat(false, 31);
const kicks = [];
drums.addMono(I.crash(40), ev.vote, 0.4);
drums.addMono(I.clap({ decay: 0.1 }), ev.vote, 0.8);
fx.addMono(I.thud(60, 0.1), ev.vote, 0.7);
clock.eachStep(14, 16, 8, (t, b, s) => {
  if (s % 2 === 0) { drums.addMono(K, t, 0.85); kicks.push(t); }
  if (s % 4 === 2) { drums.addMono(CL, t, 0.5); verb.addMono(CL, t, 0.2); }
  drums.addMono(HC, t, s % 2 ? 0.2 : 0.1, 0.25);
  const c = sc.chordAt(t); if (!c) return;
  bass.addMono(I.bass(c.bass + 12 + (s % 2 ? 12 : 0), BEAT / 2 * 0.8, { sub: 0.8 }), t, 0.45);
  keys.addMono(I.pluck(c.notes[s % c.notes.length] + 12, { decay: 0.2 }), t, 0.14, s % 2 ? 0.3 : -0.3);
});
for (const t of [ev.cardA, ev.cardB, ev.comment]) fx.addMono(I.pop(1.2), t, 0.35);
for (const l of sc.lines) fx.addMono(I.pop(l.who === 'zoe' ? 1.3 : l.who === 'tom' ? 1.1 : 0.9), l.t, 0.12);

// ---------- les voix (Piper, voix/*.wav) ----------
const voice = bus();
for (const l of [...sc.lines, ...sc.narration]) {
  const v = MIX.loadAudio(path.join(__dirname, 'voix', l.id + '.wav'), { at: l.t, length: DURATION });
  v.mixInto(voice, l.who === 'narr' ? 1.1 : 1);
  if (l.who === 'narr' || l.who === 'inc') v.mixInto(verb, 0.3);
}
MIX.duck([pad, bass, keys, amb, drums, fx], voice, { depth: 0.55, release: 0.3 });

// ---------- mix ----------
MIX.sidechain([pad, bass], kicks);
const stems = { voice, drums, bass, pad, keys, fx, amb, verb: reverb(verb, { room: 0.9, damp: 0.35 }), dly: pingpong(dly, BEAT * 0.75, 0.35, 3000) };
const GAIN = { voice: 1.6, drums: 0.55, bass: 0.8, pad: 2.4, keys: 1.1, fx: 0.9, amb: 1.0, verb: 1, dly: 0.8 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 24);
MIX.fadeOut(mix, DURATION - 0.5, DURATION);
const M = MIX.master(mix, 0.8, undefined, { lufs: parseFloat(process.env.LUFS || '-14') });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s, ${M.lufs.toFixed(1)} LUFS)`);
