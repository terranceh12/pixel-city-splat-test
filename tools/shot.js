// node tools/shot.js <html> <outPrefix> "mx,my,t;mx,my,t;..." [w] [h]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const [html, out, poses, w, h] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: +(w || 494), height: +(h || 738) } });
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + require('path').resolve(html) + (process.env.QS ? '?' + process.env.QS : ''));
  const t0 = Date.now();
  await page.waitForFunction(() => (window.NEON && window.NEON.ready) || window.NEON_ERROR, null, { timeout: 180000 }).catch(e => logs.push('TIMEOUT waiting ready'));
  const err = await page.evaluate(() => window.NEON_ERROR || null);
  if (err) { console.log('NEON_ERROR', err); console.log(logs.join('\n')); await browser.close(); process.exit(1); }
  console.log('ready in', Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => window.NEON.timing || null)));
  let i = 0;
  for (const p of poses.split(';')) {
    const [mx, my, t] = p.split(',').map(Number);
    await page.evaluate(([mx, my, t]) => { window.NEON.hold(mx, my, t); window.__f = window.NEON.stats.frame || 0; }, [mx, my, t]);
    const t1 = Date.now();
    await page.waitForFunction(() => (window.NEON.stats.frame || 0) >= window.__f + 2, null, { timeout: 300000, polling: 250 });
    const st = await page.evaluate(() => ({ drawn: window.NEON.stats.drawn, groups: window.NEON.stats.groups, aw: window.NEON.T.aw, ah: window.NEON.T.ah, px: window.NEON.T.px, prof: window.NEON.stats.prof }));
    await page.screenshot({ path: out + '-' + i + '.png', timeout: 300000 });
    console.log('pose', p, JSON.stringify(st), 'frames took', Date.now() - t1, 'ms');
    i++;
  }
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
