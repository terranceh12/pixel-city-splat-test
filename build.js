/* Builds the page: sculpts the city with the ink-studio toolkit, bakes it to splats, packs them, and writes one self-contained
   HTML file.   node build.js [--px 2] [--step 2] [--out dist/index.html] [--toolkit path] [--quick] */
const fs = require('fs'),
  path = require('path');
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? def : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1];
};
const TOOLKIT = arg('toolkit', path.join(__dirname, '..', 'siliconjungle', 'shapeshift-labs-ink-studio')),
  OUT = arg('out', path.join(__dirname, 'dist', 'index.html')),
  QUICK = !!arg('quick', false);
const t0 = Date.now(),
  lap = s => console.log(('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's]').padEnd(9) + s);

const studio = require(TOOLKIT),
  kit = studio.load();
const U = require('./src/scene/util.js');
U.setPx(+arg('px', 2));
const { makeWorld } = require('./src/scene/world.js');
const { pack, SIG_LO, SIG_K } = require('./src/bake/ir.js');
const buildCity = require('./src/scene/city.js');
const buildShips = require('./src/scene/ships.js');

const W = makeWorld(kit, { seed: 7 });
const city = buildCity(W);
lap('laid out: ' + JSON.stringify(city.stats) + ', ' + W.solids.length + ' box solids, ' + W.cands.count() + ' places for splats');
const cull = W.cull({ step: +arg('step', QUICK ? 3 : 1), all: !!arg('nocull', false) });
lap('seen from somewhere on the eye\'s path: ' + cull.seen + ' of ' + cull.cands);
console.log(Object.entries(cull.by).map(e => '  ' + e[0].padEnd(10) + String(e[1][1]).padStart(8) + ' of ' + e[1][0]).join('\n'));
const lights = W.layLights();
lap('lit ' + lights + ' windows and roof lamps');
const laid = W.bakeBoxes();
lap('baked ' + laid + ' solids');
const ms = W.moonShade();
lap('moon shadows: ' + ms.marked + ' of ' + ms.tested + ' splats it would light are in shadow (' + ms.texel.toFixed(2) + ' units to a texel)');
buildShips(W);
lap('ships sculpted');
const groups = W.finish();
if (arg('hist', false)) {
  // HIST: where the splats went, by distance from the bend and by height
  const rb = [40, 80, 178, 432, 1e9], yb = [-60, -30, 0, 1e9], H = rb.map(() => yb.map(() => 0)), RS = {};
  for (const g of groups) {
    if (g.meta.tpl || g.pass) continue;
    for (let i = 0; i < g.n; i++) {
      const o = i * 16, r = Math.hypot(g.rows[o], g.rows[o + 2]), y = g.rows[o + 1];
      H[rb.findIndex(v => r < v)][yb.findIndex(v => y < v)]++;
      const k = (Math.round(g.rows[o + 8] / 0.46 * 20) / 20).toFixed(2);
    }
  }
  console.log('r \\ y      <-60    -60..-30   -30..0     >0');
  rb.forEach((v, i) => console.log(('r<' + v).padEnd(10) + H[i].map(n => String(n).padStart(9)).join(' ')));
}
const P = pack(groups);
lap('packed ' + P.N + ' splats in ' + P.groups.length + ' groups: ' + (P.raw / 1e6).toFixed(2) + ' MB raw, ' + (P.bin.length / 1e6).toFixed(2) + ' MB gzipped');

W.meta.look = {
  // height fog: density fogRho at fogY, rising e-fold every fogH units down, no denser below fogC scale heights under fogY
  fogY: -110,
  fogH: 24,
  fogRho: 0.0085,
  fogC: 0.85,
  fogU: 0,
  sky: 1,
  upH: 44,
  far0: 540,
  far1: 765,
  pool0: 380,
  pool1: 700,
  fogLo: [0.2, 0.183, 0.255], // deep in it: grey-violet, lit a little from below
  fogHi: [0.1, 0.09, 0.155],
  haze: [0.125, 0.112, 0.2, 0.0017], // the air between the eye and far things
  warm: [0.06, 0.045, 0.03], // light from the city under the fog, on what stands in it
  dil: 0.3,
  dither: 0.014,
  rim: 1,
  moon: { dir: W.moon.map(v => +v.toFixed(4)), col: [0.31, 0.36, 0.62] } // the way to the moon, and its light (cool, silvery)
};
const strip = g => {
  const o = {};
  for (const k of ['name', 'pass', 'start', 'count', 'lo', 'sz', 'alo', 'asz', 'bs', 'tpl', 'unlit']) if (g[k] !== undefined) o[k] = g[k];
  return o;
};
const meta = Object.assign({ N: P.N, sigLo: SIG_LO, sigK: SIG_K, groups: P.groups.map(strip) }, W.meta);
// who has what
const by = {};
for (const g of P.groups) {
  const k = g.name.replace(/[-\d ,]+$/, '').trim() + (g.pass ? ' +' : '');
  by[k] = (by[k] || 0) + g.count;
}
console.log(
  Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .map(e => '  ' + e[0].padEnd(22) + e[1])
    .join('\n')
);

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const shaders = read('src/host/shaders.js').replace('PIXEL_LOOK_GLSL', () => kit.PixelLook.glsl);
const html = read('src/host/page.html')
  .replace('/*PALETTE*/', () => read('src/palette.js'))
  .replace('/*CAMPATH*/', () => read('src/campath.js'))
  .replace('/*SHADERS*/', () => shaders)
  .replace('/*PACK*/', () => 'window.NEON_PACK = { meta: ' + JSON.stringify(meta) + ', b64: "' + P.bin.toString('base64') + '" };')
  .replace('/*MAIN*/', () => read('src/host/main.js'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
fs.writeFileSync(path.join(path.dirname(OUT), 'meta.json'), JSON.stringify(meta));
lap('wrote ' + OUT + ' (' + (html.length / 1e6).toFixed(2) + ' MB), meta ' + (JSON.stringify(meta).length / 1e3).toFixed(0) + ' kB');
