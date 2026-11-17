// L'ÎLE — ÉPISODE 2 « La grotte »
// THE SCORE — the single source of truth for music AND picture.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const MU = node ? require('./engine/music') : globalThis.MUSIC;
  const { m, makeClock, placeBar, makeChords } = MU;

  const FPS = 30;
  const FORMAT = U.pickFormat('9:16');
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const WIDE = W / H > 1.2;
  const clock = makeClock({ bpm: 96, offset: 0 }); // 1 temps = 0.625 s, 1 mesure = 2.5 s
  const { T, BEAT } = clock;
  const DURATION = T(16); // 40 s

  const ev = {
    slam: 0.0, // « LE CHOIX EST FAIT » + « A : LA GROTTE »
    torch: 0.4, // la torche de Léa s'allume
    inside: T(2, 2), // 6.25 : dans la grotte
    wall: T(4), // 10 : les peintures sur le mur
    box: T(6), // 15 : la boîte à musique
    rumble: T(11), // 27.5 : ça gronde, la berceuse s'arrête
    collapse: T(11, 2), // 28.75 : l'entrée s'effondre
    inc: T(13), // 32.5 : l'inconnu parle pour la première fois
    vote: T(14), // 35
    cardA: T(14, 1),
    cardB: T(14, 2),
    comment: T(15),
    next: T(15, 2),
  };
  const S = {
    hook: [0, 3.8],
    entrance: [3.8, ev.inside],
    walk: [ev.inside, ev.wall],
    wall: [ev.wall, ev.box],
    box: [ev.box, ev.rumble],
    collapse: [ev.rumble, ev.inc],
    inc: [ev.inc, ev.vote],
    vote: [ev.vote, DURATION],
  };

  const lines = [
    { who: 'max', t: 1.0, end: 2.1, text: 'Mauvaise idée.' },
    { who: 'tom', t: 2.2, end: 3.9, text: 'Qui a choisi ça ?!' },
    { who: 'lea', t: 4.1, end: 6.0, text: 'Restez derrière moi.' },
    { who: 'zoe', t: 8.4, end: 9.9, text: 'Regardez les murs !' },
    { who: 'max', t: 10.6, end: 12.7, text: 'On est dessinés. Tous les six.' },
    { who: 'tom', t: 12.9, end: 14.8, text: 'Pourquoi elle est barrée ?' },
    { who: 'zoe', t: 15.9, end: 17.9, text: 'Ma boîte à musique…' },
    { who: 'zoe', t: 18.4, end: 20.9, text: "Je l'avais perdue. À 5 ans.", say: "Je l'avais perdue. À cinq ans." },
    { who: 'max', t: 21.4, end: 23.6, text: "Quelqu'un l'a apportée ici." },
    { who: 'lea', t: 24.2, end: 26.0, text: "C'est impossible." },
    { who: 'tom', t: 29.9, end: 32.45, text: 'La sortie ! Elle est bouchée !' },
    { who: 'inc', t: T(13, 1), end: T(13, 3.6), text: 'Enfin.' },
  ];
  lines.forEach((l, i) => { l.id = 'l' + String(i + 1).padStart(2, '0'); });
  const narration = [
    { id: 'n2', who: 'narr', t: T(15), end: T(16) - 0.1, text: 'Commente A ou B.', say: 'Commente A, ou B.' },
  ];
  const nameTags = [];

  const { chords, chordAt } = makeChords(clock, {
    Am: { notes: ['A3', 'C4', 'E4'], bass: 'A1' },
    F: { notes: ['A3', 'C4', 'F4'], bass: 'F1' },
    Dm: { notes: ['A3', 'D4', 'F4'], bass: 'D2' },
    E: { notes: ['G#3', 'B3', 'E4'], bass: 'E1' },
    C: { notes: ['G3', 'C4', 'E4'], bass: 'C2' },
    G: { notes: ['G3', 'B3', 'D4'], bass: 'G1' },
    Bb: { notes: ['Bb3', 'D4', 'F4'], bass: 'Bb1' },
  }, [
    [0, 0, 4, 'Am'], [1, 0, 4, 'F'], [2, 0, 4, 'Dm'], [3, 0, 4, 'E'],
    [4, 0, 4, 'Am'], [5, 0, 4, 'Bb'], [6, 0, 4, 'Am'], [7, 0, 4, 'F'],
    [8, 0, 4, 'Dm'], [9, 0, 4, 'E'], [10, 0, 4, 'Am'],
    [13, 0, 4, 'Bb'],
    [14, 0, 2, 'Am'], [14, 2, 2, 'F'], [15, 0, 2, 'C'], [15, 2, 2, 'G'],
  ]);

  // la berceuse revient : elle sort de la boîte à musique (barres 6 à 10)
  const LULL = {
    a: [['E5', 0, 2], ['A5', 2, 2], ['G5', 4, 1], ['E5', 5, 1], ['C5', 6, 2]],
    b: [['D5', 0, 2], ['E5', 2, 1], ['C5', 3, 1], ['B4', 4, 4]],
  };
  const lullaby = [LULL.a, LULL.b, LULL.a, LULL.b, LULL.a].flatMap((bar, i) => placeBar(clock, bar, 6 + i));

  const markers = {
    torch: ev.torch,
    inside: { t: ev.inside, sync: 'av' },
    wall: { t: ev.wall, sync: 'av' },
    box: { t: ev.box, sync: 'av' },
    rumble: ev.rumble,
    collapse: { t: ev.collapse, sync: 'av' },
    inc: { t: ev.inc, sync: 'av' },
    vote: { t: ev.vote, sync: 'av' },
  };
  const subtitles = lines.map((l) => ({ t: l.t, end: l.end, text: l.text }));

  const SCORE = { FPS, FORMAT, W, H, SAFE, WIDE, DURATION, clock, T, BEAT, S, m, chords, chordAt, ev, lines, narration, nameTags, lullaby, markers, subtitles };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
