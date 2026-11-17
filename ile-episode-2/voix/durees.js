// durée réelle (s) de chaque réplique enregistrée dans voix/*.wav — utilisée pour faire bouger les bouches
(function () {
  const D = {
    l01: 0.753,
    l02: 1.558,
    l03: 1.092,
    l04: 0.973,
    l05: 1.564,
    l06: 1.524,
    l07: 0.904,
    l08: 1.688,
    l09: 1.174,
    l10: 0.986,
    l11: 2.521,
    l12: 0.641,
    n2: 1.874,
  };
  if (typeof module !== 'undefined') module.exports = D; else globalThis.VOIX_DUR = D;
})();
