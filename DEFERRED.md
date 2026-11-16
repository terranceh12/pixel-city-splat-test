# Night Traffic Megacity — state of the build and deferred work

This is the hand-off note for whoever continues the scene. It is self-contained: what exists, the rules it relies on,
what was worked around instead of solved, and how to check each next step.

## 1. What exists

One self-contained page (`dist/index.html`, 1.61 MB) built by `node build.js` from the ink-studio toolkit.

| Stage | Where | What it does |
| --- | --- | --- |
| Sculpt | `src/scene/city.js`, `parts.js`, `ships.js` | Every solid is a signed-distance box/ball/lathe handed to the toolkit's sculptor (`makeSculpt`, `K.sculpt`). Roads, towers, megatower, 5 ship kinds. |
| Bake | toolkit `S.bake()` behind `src/bake/ir.js` | The sculptor projects sample points onto the SDF surface, lights them, and emits splats. A recorder in front of the builder keeps axis, two sigmas, palette index and motion tags per splat. |
| Cull | `src/scene/pvs.js` | Candidate sample points are tested from 2,840 eye positions on the hover range before baking. |
| Pack | `src/bake/ir.js` `pack()` | 16-bit positions per group, delta-coded, gzip. 519,029 splats → 0.99 MB. |
| Draw | `src/host/main.js`, `shaders.js` | WebGL2. Solid splats are depth-tested point sprites cut at half strength; glows are additive instanced quads. Drawn at 2× art resolution, resolved by the toolkit's own `PixelLook.glsl`, blown up in whole pixels. |

Numbers from the last build: 2,362 grid towers plus 14 named ones, 5 lower highways and 4 rails, 42 ship lanes,
314 fog-floor lights, 94 signs, 128,181 window lights. Bake time 37 s, of which the visibility pass is 29 s.

Rebuild: `node build.js` (toolkit checkout expected at `../siliconjungle/shapeshift-labs-ink-studio`, or `--toolkit <path>`).
Flags: `--quick` (coarse visibility, 12 s), `--px 2` (splat spacing in art pixels), `--step 1` (eye step in degrees),
`--nocull`, `--hist` (splat counts by distance and height).
Page debug: `?debug` (fps and splat count), `?mx=0.3&my=0.5&t=12` (hold a pose and time), `?art=720`, `?only=ship`, `?not=tile`.
Headless check: `node tools/shot.js dist/index.html shots/x "0,0,3;1,1,60" 494 738`.

## 2. Rules the build relies on (do not break)

1. **World frame.** Origin is the highway bend at road level. Near highway runs toward +Z, far highway 18° left of −Z. One unit ≈ three storeys.
2. **Camera.** `src/campath.js` is shared by baker and page. Orbit radius 68 about the bend; origin pose matches the reference frame (494×738, bend pinned at pixel 275,258). Hover range ±35° azimuth, +36° / −3.4° elevation. **Changing any constant here requires a rebake**: splat spacing and culling are computed for this exact range.
3. **Nothing may stand in the eye's swept volume.** `city.js` caps tower tops inside the wedge az −50°…54°, radius 38–92; `lanes.js` keeps each ship a set distance from every eye position (9–19 units times its scale, by kind).
4. **Splat spacing is chosen per box from the nearest eye that can actually see it** (`util.js seenFrom/resBox`). Walls 4 art px, windows 2, decks 2.
5. **Palette is 48 colours** (`src/palette.js`), the most `PixelLook.glsl` resolves. Index 0 is the void and is never painted on a solid.
6. **Solid splats must stay small on screen** (they are point sprites; the scene target has an 8-art-pixel border so sprites are not dropped at the frame edge). Anything large and soft belongs in the additive pass.
7. **Every recorded splat needs a unit axis.** The sculptor returns a zero normal in creases where two solids meet; `ir.js` replaces it with +Y and the vertex shader guards it. Removing either guard brings back full-screen black sprites.

## 3. Worked around, not solved

| # | Issue | Workaround in place | Proper fix |
| --- | --- | --- | --- |
| A | **Frame rate on real GPUs is unmeasured.** Only a software renderer was available (3–5 s per frame there, which says nothing about hardware). | Splat count cut from 1.32 M to 0.52 M; solid pass moved from instanced quads to point sprites (a quarter of the vertex work). 360–535 k points are submitted per frame. | Open with `?debug` on target hardware. If under 60 fps: (1) split each tile by wall facing and skip back-facing groups per frame, (2) raise `WALL_PX` in `parts.js` from 4 to 5, (3) drop ring-2 towers beyond radius 600. |
| B | **Visibility pass removes only 11 %** (62 k of 543 k). Streets are open in too many directions from a 70°×39° eye range for point-sampled occlusion to prove much. | Kept, since it looks safe: at three in-between poses, culled and un-culled renders differ strongly in 0.04 % of pixels (0.23 % counting any change). The one cluster inspected was a sign caught in a different animation phase, not a hole; the rest were not inspected. | A from-region occlusion test, or per-pose index buffers chosen at runtime. Expect roughly half the splats. |
| C | **Vertical hover is lopsided**: 36° up, 3.4° down. The eye would pass through the road deck below that. | Documented; arrow keys and hover both respect it. | Either raise the origin elevation and re-pin the bend, or let the orbit radius shrink as the eye drops. Rebake after. |
| D | **Fourth painted ship has no lane.** The small craft left of the highway in the reference cannot fly a straight 38-unit run at its spot without clipping a tower or a road. | Skipped; 15 other darts fly. The build prints `(a painted ship found no clear lane: true true true false)`. | Curved lanes (two-segment paths) in `lanes.js`, or move the named tower at (−21.5, 13.5). |
| E | **Ships fly straight lines and can pass through each other.** | Lanes are checked against roads, road legs, named towers and the eye; grid towers are cut down under each lane. | Lane-to-lane time separation; banking on gentle arcs. |
| F | **Reference matching is by eye.** Megatower, highway, bend, the two long buildings beside the road, three named towers, the hauler and the wing ship are placed by unprojecting reference pixels. Everything else is a seeded grid. The wall-and-rails area left of the far highway is simplified to one slab and four rails. | — | Unproject more reference pixels with `CamPath.refToDepth` and add them as `hero({...})` entries in `city.js`. |
| G | **Windows are not baked by the sculptor's material.** With windows as a material texture every wall needed 2-pixel splats (1.2 M wall splats). | Walls are sculpted coarse and dark; each lit window is its own emissive splat laid over the wall and culled with it. | None needed unless inked detail (`S.fine`) is wanted. |
| H | **Light shimmer.** Lamps tinting dark walls land between close palette steps, so smooth light motion made whole faces flicker (35 % of pixels changed in 0.6 s). | Lamps and fog-floor lights step six times a second; dither amplitude 0.014 on solids, 2.6× that on bare haze. Now 20 % of pixels change in 0.6 s and 2.6 % in 0.05 s. | A dedicated lit ramp per wall ramp so lamp light moves whole palette steps. |
| I | **Soft glows band into rings** after palette quantisation (sign halos, the light well at the megatower's foot). | Glow strengths lowered; haze banks kept faint. | Blue-noise dither for the additive pass only. |
| J | **Inked silhouettes against lit haze looked like cracks.** | Lit haze writes itself as "something there" so only silhouettes against the black void are inked. | — |
| K | **No fallback** without WebGL2 or `DecompressionStream` (Safari before 16.4, Firefox before 113). | The page prints a one-line message. | Ship the pack uncompressed behind a size check, or include a small inflate routine. |

## 4. Not started

- Sound, a time-of-night or weather control, and any on-screen controls beyond the fading hint.
- Parked ships on the three landing pads (the pads have chasing lights only).
- Toolkit features not used yet that would suit the scene: `K.weather` rain, `K.flock` for small traffic swarms, `S.fine` inked detail on near surfaces, `S.bounce` for sign light baked into walls.
- The toolkit repository is marked private and `UNLICENSED`. The page embeds its `PixelLook.glsl` (2 kB) and data baked with it, not its source. Check with its author before sharing the page publicly.

## 5. Checks to rerun after any change

1. `node build.js` ends with `packed N splats` and no `Error`; N should stay under about 600 k.
2. `node tools/shot.js dist/index.html shots/x "0,0,3;0,1,3;-1,0,3;1,1,60" 494 738` prints four `pose` lines and no `NEON_ERROR`.
3. Origin pose (`0,0,3`) beside the reference: bend near pixel (275, 258), megatower streaks right of it, hauler lower right, wing ship upper left.
4. Corner poses show no black sprites, no holes at silhouettes, no geometry in front of the lens.
5. Two frames 0.05 s apart at one pose differ in under 5 % of pixels.
