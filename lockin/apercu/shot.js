const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1700, height: 400 } });
  p.on('console', (m) => console.log('console:', m.text()));
  p.on('pageerror', (e) => console.log('error:', e.message));
  await p.goto('file://' + process.argv[2] + '/index.html' + (process.argv[4] ? '#' + process.argv[4] : ''));
  await p.waitForFunction('window.done === true', null, { timeout: 120000 });
  await p.screenshot({ path: process.argv[2] + '/' + (process.argv[3] || 'out') + '.png', fullPage: true });
  await b.close();
})();
