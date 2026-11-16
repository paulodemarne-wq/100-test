// L'ÎLE — ÉPISODE 1 « On était 6 »
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
  const clock = makeClock({ bpm: 96, offset: 0 }); // 1 beat = 0.625 s, 1 bar = 2.5 s
  const { T, BEAT } = clock;
  const DURATION = T(16); // 40 s

  // ---------- scenes ----------
  const ev = {
    slam: 0.0, // "ON ÉTAIT 6." claque sur la toute première image
    vanish: 0.4, // une silhouette disparaît -> "ON EST 5."
    lit: 1.0, // la lumière revient, on voit les visages
    toJungle: T(3, 2), // 8.75
    zoeStop: T(5), // 12.5 : Zoé entend la mélodie
    toTree: T(7), // 17.5 : l'arbre aux noms
    hush: T(11), // 27.5 : la mélodie s'arrête net
    letters: [T(11, 1), T(11, 2), T(11, 3)], // T, O, I gravés tout seuls
    stare: T(12, 2), // 31.25 : tout le monde regarde la caméra
    flash: T(13), // 32.5 : éclair
    ask: T(13, 1.5), // texte dans le noir
    vote: T(14), // 35 : carte de vote
    cardA: T(14, 1),
    cardB: T(14, 2),
    comment: T(15),
    next: T(15, 2),
  };
  const S = {
    hook: [0, 3.6],
    beach: [3.6, ev.toJungle],
    jungle: [ev.toJungle, ev.toTree],
    tree: [ev.toTree, ev.hush],
    twist: [ev.hush, ev.vote],
    vote: [ev.vote, DURATION],
  };

  // ---------- dialogue (bulles) ----------
  const lines = [
    { who: 'lea', t: 1.05, end: 2.15, text: 'Où est-elle ?' },
    { who: 'tom', t: 2.25, end: 3.95, text: 'Qui ? On a toujours été 5 !' },
    { who: 'max', t: 6.0, end: 7.5, text: 'Pas de réseau. Évidemment.' },
    { who: 'lea', t: 7.6, end: 8.7, text: 'Suivez-moi.' },
    { who: 'tom', t: 10.0, end: 11.9, text: 'Elle connaît le chemin ?' },
    { who: 'zoe', t: 12.55, end: 14.2, text: 'Vous entendez ?' },
    { who: 'tom', t: 14.4, end: 16.1, text: "Non… et j'aime pas ça." },
    { who: 'max', t: 18.4, end: 20.2, text: 'Nos noms ?! Gravés ?!' },
    { who: 'tom', t: 20.6, end: 22.4, text: "Et c'est qui, Ève ?" },
    { who: 'zoe', t: 22.8, end: 24.7, text: "Lui, il n'est pas dessus." },
  ];
  const nameTags = [
    { who: 'tom', t: T(1, 3), text: 'TOM' },
    { who: 'lea', t: T(1, 3.5), text: 'LÉA' },
    { who: 'zoe', t: T(2, 0), text: 'ZOÉ' },
    { who: 'max', t: T(2, 0.5), text: 'MAX' },
    { who: 'inc', t: T(2, 1), text: '???' },
  ];
  const leaTouch = [T(10), T(10, 3)]; // Léa touche le nom « ÈVE », retire la main
  const heartbeats = [T(10), T(10, 2), T(10, 3.5)];

  // ---------- harmony ----------
  const { chords, chordAt } = makeChords(clock, {
    Am: { notes: ['A3', 'C4', 'E4'], bass: 'A1' },
    F: { notes: ['A3', 'C4', 'F4'], bass: 'F1' },
    Dm: { notes: ['A3', 'D4', 'F4'], bass: 'D2' },
    E: { notes: ['G#3', 'B3', 'E4'], bass: 'E1' },
    C: { notes: ['G3', 'C4', 'E4'], bass: 'C2' },
    G: { notes: ['G3', 'B3', 'D4'], bass: 'G1' },
  }, [
    [0, 0, 4, 'Am'], [1, 0, 4, 'Am'], [2, 0, 4, 'F'], [3, 0, 4, 'E'],
    [4, 0, 4, 'Am'], [5, 0, 4, 'F'], [6, 0, 4, 'Dm'], [7, 0, 4, 'E'],
    [8, 0, 4, 'Am'], [9, 0, 4, 'F'], [10, 0, 4, 'E'],
    [14, 0, 2, 'Am'], [14, 2, 2, 'F'], [15, 0, 2, 'C'], [15, 2, 2, 'G'],
  ]);

  // berceuse de boîte à musique (Zoé l'entend), de la barre 5 à la barre 10
  const LULL = {
    a: [['E5', 0, 2], ['A5', 2, 2], ['G5', 4, 1], ['E5', 5, 1], ['C5', 6, 2]],
    b: [['D5', 0, 2], ['E5', 2, 1], ['C5', 3, 1], ['B4', 4, 4]],
  };
  const lullaby = [LULL.a, LULL.b, LULL.a, LULL.b, LULL.a, LULL.b].flatMap((bar, i) => placeBar(clock, bar, 5 + i));

  const markers = {
    vanish: { t: ev.vanish, sync: 'a' },
    lit: ev.lit,
    jungle: { t: ev.toJungle, sync: 'av' },
    zoe: ev.zoeStop,
    tree: { t: ev.toTree, sync: 'av' },
    hush: ev.hush,
    letterT: { t: ev.letters[0], sync: 'a' },
    stare: ev.stare,
    flash: { t: ev.flash, sync: 'av' },
    vote: { t: ev.vote, sync: 'av' },
  };

  const subtitles = lines.map((l) => ({ t: l.t, end: l.end, text: l.text }));

  const SCORE = { FPS, FORMAT, W, H, SAFE, WIDE, DURATION, clock, T, BEAT, S, m, chords, chordAt, ev, lines, nameTags, leaTouch, heartbeats, lullaby, markers, subtitles };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
