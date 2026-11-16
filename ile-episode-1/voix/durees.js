// durée réelle (s) de chaque réplique enregistrée dans voix/*.wav — utilisée pour faire bouger les bouches
(function () {
  const D = {
    l01: 0.672,
    l02: 2.056,
    l03: 1.551,
    l04: 0.664,
    l05: 1.476,
    l06: 1.605,
    l07: 1.573,
    l08: 1.124,
    l09: 1.651,
    l10: 1.479,
    n1: 2.294,
    n2: 1.802,
  };
  if (typeof module !== 'undefined') module.exports = D; else globalThis.VOIX_DUR = D;
})();
