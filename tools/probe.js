// node tools/probe.js <html> "mx,my,t" : reads back the scene picture before the palette, at a few places
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const [html, pose] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 494, height: 738 } });
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + require('path').resolve(html) + (process.env.QS ? '?' + process.env.QS : ''));
  await page.waitForFunction(() => (window.NEON && window.NEON.ready) || window.NEON_ERROR, null, { timeout: 180000 });
  const [mx, my, t] = pose.split(',').map(Number);
  await page.evaluate(([mx, my, t]) => { window.NEON.hold(mx, my, t); window.__f = window.NEON.stats.frame || 0; }, [mx, my, t]);
  await page.waitForFunction(() => (window.NEON.stats.frame || 0) >= window.__f + 2, null, { timeout: 300000, polling: 250 });
  const out = await page.evaluate(() => {
    const N = window.NEON, gl = N.gl, T = N.T, res = { maxPt: N.maxPt, look: N.meta.look, sw: T.sw, sh: T.sh, aw: T.aw, ah: T.ah, err: gl.getError(), px: [] };
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene);
    res.fb = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    const b = new Uint8Array(4);
    for (const [fx, fy] of [[0.5, 0.95], [0.9, 0.2], [0.9, 0.5], [0.5, 0.6], [0.6, 0.65], [0.1, 0.3], [0.62, 0.35], [0.3, 0.7]]) {
      const x = Math.floor(fx * T.sw), y = Math.floor(fy * T.sh);
      gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      const c = Array.from(b);
      gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      res.px.push([fx, fy, c.join(','), Array.from(b).join(',')]);
    }
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return res;
  });
  console.log(JSON.stringify(out, null, 0));
  if (logs.length) console.log(logs.slice(0, 12).join('\n'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
