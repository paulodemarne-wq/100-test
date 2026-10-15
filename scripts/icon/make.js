// Renders the Vainc logo (padlock holding the timer ring) into the app icon files.
// Run: node scripts/icon/make.js assets   (needs Playwright with Chromium)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const mark = (bg, body, shackle, ringBg, ring, opts = {}) => `
${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
<g transform="${opts.t || ''}">
<path d="M36 46V36a14 14 0 0 1 28 0v10" fill="none" stroke="${shackle}" stroke-width="8" stroke-linecap="round"/>
<rect x="24" y="43" width="52" height="40" rx="13" fill="${body}"/>
${ringBg ? `<circle cx="50" cy="63" r="10" fill="none" stroke="${ringBg}" stroke-width="5"/>` : ''}
<path d="M50 53a10 10 0 1 1-10 10" fill="none" stroke="${ring}" stroke-width="5" stroke-linecap="round"/>
</g>`;
const files = {
  // iOS: full square (iOS rounds the corners itself), logo a bit smaller than the box.
  'icon.png': [1024, mark('#5856D6', '#FFFFFF', '#FFFFFF', '#DCDBFA', '#5856D6')],
  'splash-icon.png': [1024, mark(null, '#5856D6', '#5856D6', '#DCDBFA', '#FFFFFF')],
  'favicon.png': [48, mark('#5856D6', '#FFFFFF', '#FFFFFF', null, '#5856D6')],
  // Android adaptive icon: the logo in the middle 2/3 (the rest can be cut by the mask).
  'android-icon-foreground.png': [1024, mark(null, '#FFFFFF', '#FFFFFF', '#DCDBFA', '#5856D6', { t: 'translate(16.5 16.5) scale(0.67)' })],
  'android-icon-background.png': [1024, '<rect width="100" height="100" fill="#5856D6"/>'],
  'android-icon-monochrome.png': [1024, mark(null, '#000000', '#000000', null, '#FFFFFF', { t: 'translate(16.5 16.5) scale(0.67)' })],
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  for (const [name, [size, svg]] of Object.entries(files)) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent"><svg width="${size}" height="${size}" viewBox="0 0 100 100">${svg}</svg></body></html>`);
    await p.screenshot({ path: process.argv[2] + '/' + name, omitBackground: true });
  }
  await b.close();
})();
