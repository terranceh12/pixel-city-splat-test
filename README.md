# Pixel City Splat Test

An animated, pixel-art Gaussian-splat city at night, after a retro sci-fi concept painting. Solids are signed-distance shapes sculpted with the ink-studio toolkit, baked into about 760,000 splats, drawn with WebGL2 through a fisheye lens and resolved to a 48-colour palette with the toolkit's `PixelLook` shader. An off-screen moon lights the city and casts its shadows, baked at build time; stars fill the sky. Hover to orbit the camera about the bend in the elevated highway.

- `dist/index.html`: the built page. Open it in a browser with WebGL2.
- `node build.js`: rebuilds it. Needs a checkout of `siliconjungle/shapeshift-labs-ink-studio` at `../siliconjungle/shapeshift-labs-ink-studio` or `--toolkit <path>`.
- `DEFERRED.md`: the rules the build relies on, and what was worked around.
- `tools/palette_gen.py`: generates the palette in `src/palette.js` from OKLCH ramps.
- `tools/repage.js`: rewrites the page around the splats already built, for changes to the shaders or the page code alone.

The ink-studio toolkit is private and `UNLICENSED`; this repo does not include its source, but the built page embeds its palette shader and data baked with it.
