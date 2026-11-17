// Génère une voix par personnage avec Piper (TTS hors ligne) -> voix/<n>.wav
//   PIPER_DIR=/chemin/vers/modeles node voix/generer.js
// Modèles : fr_FR-siwis-medium, fr_FR-tom-medium, fr_FR-upmc-medium (huggingface.co/rhasspy/piper-voices)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const sc = require('../score');
const DIR = process.env.PIPER_DIR || '/tmp/claude-0/piper';
// pitch : demi-tons (ffmpeg rubberband-free : asetrate + atempo)
const CAST = {
  lea: { model: 'fr_FR-siwis-medium', len: 1.05, pitch: -1 },
  tom: { model: 'fr_FR-tom-medium', len: 0.72, pitch: 1 },
  max: { model: 'fr_FR-upmc-medium', speaker: 1, len: 1.0, pitch: -2 },
  zoe: { model: 'fr_FR-upmc-medium', speaker: 0, len: 0.95, pitch: 5 },
  inc: { model: 'fr_FR-upmc-medium', speaker: 1, len: 1.35, pitch: -6 },
  narr: { model: 'fr_FR-tom-medium', len: 0.85, pitch: -4 },
};
const out = __dirname;
const all = [...sc.lines, ...sc.narration];
const res = [];
all.forEach((l, i) => {
  const c = CAST[l.who];
  const raw = path.join(out, `_raw.wav`), f = path.join(out, `${l.id}.wav`);
  execFileSync('piper', ['-m', path.join(DIR, c.model + '.onnx'), '-f', raw, '--length-scale', String(c.len), '--sentence-silence', '0.08', ...(c.speaker != null ? ['-s', String(c.speaker)] : [])], { input: l.say || l.text, stdio: ['pipe', 'ignore', 'ignore'] });
  const k = Math.pow(2, c.pitch / 12);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', `asetrate=22050*${k},aresample=48000,atempo=${1 / k},silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse`, '-ac', '1', f]);
  fs.rmSync(raw);
  const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
  res.push(`${l.id.padEnd(8)} ${l.who.padEnd(5)} t=${l.t.toFixed(2)} dur=${d.toFixed(2)} fenêtre=${(l.end - l.t).toFixed(2)} ${d > l.end - l.t ? 'TROP LONG' : ''}  ${l.text}`);
});
console.log(res.join('\n'));
// durées réelles pour les bouches (film.js)
const D = all.map((l) => `    ${l.id}: ${(+execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(out, l.id + '.wav')])).toFixed(3)},`).join('\n');
fs.writeFileSync(path.join(out, 'durees.js'), `// durée réelle (s) de chaque réplique enregistrée dans voix/*.wav — utilisée pour faire bouger les bouches\n(function () {\n  const D = {\n${D}\n  };\n  if (typeof module !== 'undefined') module.exports = D; else globalThis.VOIX_DUR = D;\n})();\n`);
