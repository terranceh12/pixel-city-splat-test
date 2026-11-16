/* The city's palette: 48 colours, the most the toolkit's PixelLook shader resolves.
   Hues are taken from the reference painting (plum blacks, charcoal slate, mauve haze, golden yellow, amber, red, violet) and cleaned
   up into ramps that run dark to light. Index 0 is the void; PixelLook keeps it for the background, so no solid is ever painted with it. */
const NeonPalette = (() => {
  const hex = [
    0x07060a, // 0  void
    0x100d14, // 1  structure (plum black) ...
    0x17131c, // 2
    0x1f1a25, // 3
    0x28222e, // 4
    0x322b38, // 5
    0x3e3643, // 6
    0x4d4450, // 7
    0x605560, // 8
    0x1a1c28, // 9  slate (cool faces, glass) ...
    0x242838, // 10
    0x30364a, // 11
    0x414963, // 12
    0x5a6480, // 13
    0x241c20, // 14 haze (warm mauve fog) ...
    0x30262a, // 15
    0x3e3234, // 16
    0x4e403f, // 17
    0x62514b, // 18
    0x7a665c, // 19
    0x33260f, // 20 amber / yellow ...
    0x57421a, // 21
    0x856a26, // 22
    0xb8982f, // 23
    0xe3c43c, // 24
    0xf6e27a, // 25
    0xfff7cf, // 26
    0x3f1a10, // 27 orange / red ...
    0x6e2d18, // 28
    0xa44a20, // 29
    0xd9702a, // 30
    0xf59c45, // 31
    0x45142a, // 32 crimson / pink ...
    0x7c1f3e, // 33
    0xb83258, // 34
    0xec5f86, // 35
    0xffa3bd, // 36
    0x20163a, // 37 violet ...
    0x37266a, // 38
    0x563ca6, // 39
    0x7d62de, // 40
    0xb09cff, // 41
    0x12303f, // 42 cyan ...
    0x1f5f7c, // 43
    0x3aa0c6, // 44
    0xa8ecff, // 45
    0xcfc9a6, // 46 warm window white
    0xf2f6ff //  47 cool white (plasma core)
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
    orange: [27, 28, 29, 30, 31],
    pink: [32, 33, 34, 35, 36],
    violet: [37, 38, 39, 40, 41],
    cyan: [42, 43, 44, 45, 47],
    haze: [14, 15, 16, 17, 18, 19]
  };
  const rgb = hex.map(h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);
  return { hex, rgb, R };
})();
if (typeof module !== 'undefined') module.exports = NeonPalette;
