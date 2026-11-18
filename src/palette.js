/* The city's palette: 48 colours, the most the toolkit's PixelLook shader resolves.
   Hues are taken from the reference painting (plum blacks, slate blue, blue-violet haze, golden yellow, amber, red, violet), pushed
   apart for contrast, and cleaned up into ramps that run dark to light. Two slots (8, 27) hold a green and a blue for shop lights. Index 0 is the void; PixelLook keeps it for the background, so no solid is ever painted with it. */
const NeonPalette = (() => {
  const hex = [
    0x05040a, // 0  void
    0x0d0a10, // 1  structure (plum black) ...
    0x16111b, // 2
    0x211a29, // 3
    0x2f2539, // 4
    0x40334d, // 5
    0x564564, // 6
    0x715e80, // 7
    0x3ee07f, // 8  green (street lights)
    0x111a2e, // 9  slate (cool faces, glass) ...
    0x1b2947, // 10
    0x293e66, // 11
    0x3f588e, // 12
    0x6c86bd, // 13
    0x17132c, // 14 haze (blue-violet) ...
    0x211b3f, // 15
    0x2e2654, // 16
    0x3e346b, // 17
    0x534784, // 18
    0x6f62a0, // 19
    0x2c1d08, // 20 amber / yellow ...
    0x573d10, // 21
    0x8a6618, // 22
    0xc49a22, // 23
    0xf2cc2e, // 24
    0xffe86e, // 25
    0xfffbd6, // 26
    0x2f6bff, // 27 blue (street lights)
    0x7a2a12, // 28 orange / red ...
    0xb4481a, // 29
    0xea6c1e, // 30
    0xffa040, // 31
    0x4a1028, // 32 crimson / pink ...
    0x8a1a3c, // 33
    0xd62a52, // 34
    0xff5c8a, // 35
    0xffa8c4, // 36
    0x1c1240, // 37 violet ...
    0x35207a, // 38
    0x5a3cc0, // 39
    0x8566f5, // 40
    0xb9a6ff, // 41
    0x0e3040, // 42 cyan ...
    0x1a6688, // 43
    0x2fb4e0, // 44
    0xa4f0ff, // 45
    0xd8cfa0, // 46 warm window white
    0xf4f8ff //  47 cool white (plasma core)
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
