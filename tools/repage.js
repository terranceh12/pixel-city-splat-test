/* Rewrites the page around the splats an earlier build packed, so a change to the page alone (shaders, the host, the
   camera path) needs no new bake.   node tools/repage.js [--in dist/index.html] [--out dist/index.html] [--toolkit path]
   The camera path is read again too, but the splats were placed and culled for the path as it stood when baked. */
const fs = require('fs'),
  path = require('path');
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? def : process.argv[i + 1];
};
const ROOT = path.join(__dirname, '..'),
  IN = arg('in', path.join(ROOT, 'dist', 'index.html')),
  OUT = arg('out', IN),
  TOOLKIT = arg('toolkit', path.join(ROOT, '..', 'siliconjungle', 'shapeshift-labs-ink-studio'));
const kit = require(TOOLKIT).load();
const old = fs.readFileSync(IN, 'utf8'),
  a = old.indexOf('window.NEON_PACK = {'),
  b = old.indexOf('" };', a);
if (a < 0 || b < 0) throw new Error('no packed splats in ' + IN);
const pack = old.slice(a, b + 4);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('src/host/page.html')
  .replace('/*PALETTE*/', () => read('src/palette.js'))
  .replace('/*CAMPATH*/', () => read('src/campath.js'))
  .replace('/*SHADERS*/', () => read('src/host/shaders.js').replace('PIXEL_LOOK_GLSL', () => kit.PixelLook.glsl))
  .replace('/*PACK*/', () => pack)
  .replace('/*MAIN*/', () => read('src/host/main.js'));
fs.writeFileSync(OUT, html);
console.log('wrote ' + OUT + ' (' + (html.length / 1e6).toFixed(2) + ' MB)');
