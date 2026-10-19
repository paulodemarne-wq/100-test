// Generates docs/privacy.html, docs/terms.html and docs/index.html from src/lib/legalText.ts (the same text as in the app).
// Run: npx esbuild scripts/legal/make-legal.ts --bundle --platform=node --outfile=/tmp/legal.js && node /tmp/legal.js
// Publish: GitHub → Settings → Pages → Branch main, folder /docs. The links then are
//   https://paulodemarne-wq.github.io/100-test/privacy.html and .../terms.html
import { mkdirSync, writeFileSync } from 'node:fs';
import { LEGAL, LegalDoc } from '../../src/lib/legalText';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const page = (doc: LegalDoc) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} · Vainc</title>
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px 18px 60px;color:#111}h1{font-size:28px}h2{font-size:19px;margin-top:28px}.d{color:#666;font-size:14px}a{color:#5856D6}</style></head>
<body><h1>${esc(doc.title)}</h1><p class="d">Vainc · mise à jour : ${esc(doc.updated)}</p>
${doc.sections.map((s) => `<h2>${esc(s.h)}</h2>\n${s.p.map((t) => `<p>${esc(t)}</p>`).join('\n')}`).join('\n')}
<p class="d"><a href="index.html">Vainc</a> · <a href="privacy.html">Confidentialité</a> · <a href="terms.html">Conditions</a></p></body></html>
`;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/privacy.html', page(LEGAL.privacy));
writeFileSync('docs/terms.html', page(LEGAL.terms));
writeFileSync(
  'docs/index.html',
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vainc</title><style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px 18px}a{color:#5856D6}</style></head><body><h1>Vainc</h1><p>Révise avec tes amis. Restez concentrés, ensemble.</p><p><a href="privacy.html">Politique de confidentialité</a><br><a href="terms.html">Conditions d’utilisation</a></p></body></html>\n`,
);
console.log('docs/*.html written');
