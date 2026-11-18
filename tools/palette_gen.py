"""Builds the city's 48-colour palette from OKLCH steps (perceptually even), so ramps run smoothly and the accent hues sit at matched
lightness and chroma. Prints the hex list for src/palette.js and writes a swatch. Indices keep the roles the scene code relies on."""
import math, sys
from PIL import Image, ImageDraw

def oklch(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    def rgb(a, b):
        l_ = L + 0.3963377774 * a + 0.2158037573 * b
        m_ = L - 0.1055613458 * a - 0.0638541728 * b
        s_ = L - 0.0894841775 * a - 1.2914855480 * b
        l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
        r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        return r, g, bb
    k = 1.0
    while True:  # pull chroma in until the colour is inside sRGB
        r, g, bb = rgb(a * k, b * k)
        if min(r, g, bb) >= -1e-4 and max(r, g, bb) <= 1 + 1e-4: break
        k -= 0.02
    enc = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return tuple(max(0, min(255, round(enc(max(0, min(1, v))) * 255))) for v in (r, g, bb))

P = [None] * 48
P[0] = oklch(0.105, 0.018, 285)                                   # void
for i, (L, C) in enumerate([(0.145, 0.02), (0.185, 0.025), (0.23, 0.03), (0.285, 0.034), (0.35, 0.037), (0.425, 0.04), (0.51, 0.04)]):
    P[1 + i] = oklch(L, C, 296 - i * 2)                             # 1-7 structure: indigo-plum greys
P[8] = oklch(0.80, 0.135, 158)                                    # 8 green (mint)
for i, (L, C) in enumerate([(0.2, 0.03), (0.27, 0.042), (0.35, 0.052), (0.45, 0.06), (0.6, 0.06)]):
    P[9 + i] = oklch(L, C, 258)                                     # 9-13 slate blue (glass, cool faces)
for i, (L, C, h) in enumerate([(0.2, 0.035, 288), (0.255, 0.04, 290), (0.315, 0.043, 292), (0.38, 0.042, 296), (0.455, 0.038, 305), (0.54, 0.032, 318)]):
    P[14 + i] = oklch(L, C, h)                                      # 14-19 haze: blue-violet, warming to mauve-grey where it is lit
for i, (L, C, h) in enumerate([(0.28, 0.045, 66), (0.37, 0.066, 70), (0.48, 0.088, 74), (0.61, 0.104, 77), (0.74, 0.112, 81), (0.86, 0.092, 87), (0.95, 0.042, 94)]):
    P[20 + i] = oklch(L, C, h)                                      # 20-26 gold: soft, creamy at the top
P[27] = oklch(0.66, 0.14, 258)                                    # 27 blue
for i, (L, C, h) in enumerate([(0.42, 0.095, 40), (0.54, 0.12, 44), (0.66, 0.13, 52), (0.78, 0.11, 62)]):
    P[28 + i] = oklch(L, C, h)                                      # 28-31 orange / tail red
for i, (L, C, h) in enumerate([(0.3, 0.075, 8), (0.41, 0.11, 8), (0.54, 0.14, 8), (0.69, 0.13, 2), (0.83, 0.075, 356)]):
    P[32 + i] = oklch(L, C, h)                                      # 32-36 crimson / pink
for i, (L, C) in enumerate([(0.27, 0.07), (0.37, 0.105), (0.49, 0.13), (0.63, 0.135), (0.79, 0.095)]):
    P[37 + i] = oklch(L, C, 292)                                    # 37-41 violet
for i, (L, C, h) in enumerate([(0.32, 0.05, 222), (0.49, 0.08, 220), (0.68, 0.1, 216), (0.89, 0.065, 205)]):
    P[42 + i] = oklch(L, C, h)                                      # 42-45 cyan
P[46] = oklch(0.91, 0.04, 88)                                     # 46 warm window white
P[47] = oklch(0.975, 0.014, 250)                                  # 47 cool white (plasma core)

hexes = ['0x%02x%02x%02x' % c for c in P]
print('\n'.join(hexes))
im = Image.new('RGB', (48 * 22, 70), (40, 40, 40)); d = ImageDraw.Draw(im)
for i, c in enumerate(P):
    d.rectangle([i * 22, 0, i * 22 + 21, 50], fill=c); d.text((i * 22 + 3, 54), str(i), fill=(200, 200, 200))
im = im.resize((im.width, im.height * 2), Image.NEAREST); im.save(sys.argv[1] if len(sys.argv) > 1 else 'swatch.png')
