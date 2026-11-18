/* The city's palette: 48 colours, the most the toolkit's PixelLook shader resolves.
   Made by tools/palette_gen.py from even OKLCH steps: the ramps run smoothly, and the accent hues (gold, orange, crimson, violet, cyan,
   blue, green) sit at matched lightness and chroma, so the night reads as one scheme however many colours are lit. Hues follow the
   reference painting: indigo-plum structure, blue-violet haze that turns mauve-grey where it is lit, soft gold.
   Index 0 is the void; PixelLook keeps it for the background, so no solid is ever painted with it. Indices are used by number all
   over the scene code: change a value freely, never the order. */
const NeonPalette = (() => {
  const hex = [
    0x030309, // 0  void
    0x0b0812, // 1  structure (indigo-plum greys) ...
    0x13101d, // 2
    0x1d1a2a, // 3
    0x2a273a, // 4
    0x39384d, // 5
    0x4c4b64, // 6
    0x63637d, // 7
    0x67d89c, // 8  green (shop lights, signals)
    0x0d1624, // 9  slate blue (glass, cool faces) ...
    0x19273b, // 10
    0x293b56, // 11
    0x405677, // 12
    0x6a82a4, // 13
    0x151325, // 14  haze (blue-violet, mauve-grey where lit) ...
    0x221f35, // 15
    0x322e46, // 16
    0x443e56, // 17
    0x5b5268, // 18
    0x77697b, // 19
    0x38240f, // 20  gold (soft, creamy at the top) ...
    0x563913, // 21
    0x7b551b, // 22
    0xa67a32, // 23
    0xcfa352, // 24
    0xebce8a, // 25
    0xf8efcf, // 26
    0x5992e7, // 27  blue
    0x773822, // 28  orange / tail red ...
    0xa7542e, // 29
    0xd07940, // 30
    0xeaa76b, // 31
    0x4c1b27, // 32  crimson / pink ...
    0x792b3f, // 33
    0xaf455f, // 34
    0xdc7795, // 35
    0xf0b4c9, // 36
    0x281f45, // 37  violet ...
    0x423272, // 38
    0x634fa3, // 39
    0x8c78d3, // 40
    0xbbb0f3, // 41
    0x0f3845, // 42  cyan ...
    0x1b6b80, // 43
    0x3fa8c0, // 44
    0xa8e8ef, // 45
    0xece0c4, // 46  warm window white
    0xf1f8ff  // 47  cool white (plasma core)
  ];
  // ramps, dark to light, as palette indices
  const R = {
    plum: [1, 2, 3, 4, 5, 6],
    plumHi: [2, 3, 4, 5, 6, 7],
    slate: [1, 9, 10, 11, 12],
    slateHi: [9, 10, 11, 12, 13],
    warm: [1, 14, 15, 16, 17],
    deck: [1, 2, 3, 4],
    amber: [20, 21, 22, 23, 24, 25, 26],
    orange: [28, 28, 29, 30, 31],
    pink: [32, 33, 34, 35, 36],
    violet: [37, 38, 39, 40, 41],
    cyan: [42, 43, 44, 45, 47],
    haze: [14, 15, 16, 17, 18, 19]
  };
  const rgb = hex.map(h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);
  return { hex, rgb, R };
})();
if (typeof module !== 'undefined') module.exports = NeonPalette;
