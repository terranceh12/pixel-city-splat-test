# Night Traffic Megacity — state of the build and deferred work

This is the hand-off note for whoever continues the scene. It is self-contained: what exists, the rules it relies on,
what was worked around instead of solved, and how to check each next step.

## 1. What exists

One self-contained page (`dist/index.html`, 2.19 MB) built by `node build.js` from the ink-studio toolkit.

**Revision 2 (ravines).** The low city near the eye was cut away where the painting is empty, leaving an island (the wall under the near highway, with the megatower at its bend) between three ravines; their banks are faceted cliffs with windows and carved landing ports. Also new: buildings built round the roads that pass through them, floating pipelines, freighter packs, glass lifts, street-level shop lights, a warm glow under the fog, blue-violet distance haze, and a higher-contrast palette. Easy follow-up tasks are in `HANDOFF.md`; this file keeps the rules and the harder open issues.

| Stage | Where | What it does |
| --- | --- | --- |
| Sculpt | `src/scene/city.js`, `parts.js`, `ships.js` | Every solid is a signed-distance box/ball/lathe handed to the toolkit's sculptor (`makeSculpt`, `K.sculpt`). Roads, towers, cliffs (`PT.cliff`), cut-through towers (`PT.towerCut`), megatower, 8 ship kinds and the lift car. Pipes are laid by hand as rings of discs (`W.pipe`). |
| Bake | toolkit `S.bake()` behind `src/bake/ir.js` | The sculptor projects sample points onto the SDF surface, lights them, and emits splats. A recorder in front of the builder keeps axis, two sigmas, palette index and motion tags per splat. |
| Cull | `src/scene/pvs.js` | Candidate sample points are tested from 2,840 eye positions on the hover range before baking. Removes 13 % (84 k of 650 k). |
| Pack | `src/bake/ir.js` `pack()` | 16-bit positions per group, delta-coded, gzip. 622,765 splats → 1.38 MB. |
| Draw | `src/host/main.js`, `shaders.js` | WebGL2. Solid splats are depth-tested point sprites cut at half strength; glows are additive instanced quads. Drawn at 2× art resolution, resolved by the toolkit's own `PixelLook.glsl`, blown up in whole pixels. |

Numbers from the last build: 2,152 grid towers (36 of them built round a road) plus 11 named ones, 5 lower highways, 6 pipes, 29 ship lanes (16 of the ships fly in 6 packs), 10 lift cars, 334 fog-floor lights, 1,476 street lights, 101 signs, 168,812 window lights. Bake time 44 s, of which the visibility pass is 35 s.

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
5. **Palette is 48 colours** (`src/palette.js`), the most `PixelLook.glsl` resolves. Index 0 is the void and is never painted on a solid. Indices are referred to by number all over the scene code: 8 is green and 27 is blue (shop lights), 14–19 is the blue-violet haze ramp, 20–26 amber. Change a colour's value freely; do not reorder.
6. **Solid splats must stay small on screen** (they are point sprites; the scene target has an 8-art-pixel border so sprites are not dropped at the frame edge). Anything large and soft belongs in the additive pass.
7. **Every recorded splat needs a unit axis.** The sculptor returns a zero normal in creases where two solids meet; `ir.js` replaces it with +Y and the vertex shader guards it. Removing either guard brings back full-screen black sprites.

8. **The lie of the land is one set of rectangles** at the top of `city.js` (`RV`, `ISLAND`, `inRavine`, `hwx`). Grid towers, street lights, the lane planner's `ground` rule and the deep lights all ask `inRavine`. Move a ravine there and every bank (`bank(...)` calls) that borders it.
9. **Ships below y = 12 stay inside ravines** (`lanes.js`, the `ground` option), and every cliff bay is a keep-out box. A lane that cannot be flown is skipped with a console line, never forced.
10. **Roads are passed to cliffs and towers** (`roads`, `lowerRoads`): a hall is left open wherever a road's centre line enters a footprint. A new road must be added to `roads` before the cliffs are built.
11. **Lift cars are `meta.ships` entries with `lift: 1`** (`x, z, yaw, y0, y1, per, ph`); the page moves them in `placeShips`. They have no lane and are not seen by the lane planner.

## 3. Worked around, not solved

| # | Issue | Workaround in place | Proper fix |
| --- | --- | --- | --- |
| A | **Frame rate on real GPUs is unmeasured.** Only a software renderer was available (9–12 s per frame there, which says nothing about hardware). Revision 2 raised the load. | Solid pass is point sprites. 490–530 k points are submitted per frame (was 360–535 k); the bake holds 623 k (was 519 k). | Open with `?debug` on target hardware. If under 60 fps: (1) split each tile by wall facing and skip back-facing groups per frame, (2) raise `WALL_PX` in `parts.js` from 4 to 5, (3) drop ring-2 towers beyond radius 600. |
| B | **Visibility pass removes only 13 %** (84 k of 650 k). Streets are open in too many directions from a 70°×39° eye range for point-sampled occlusion to prove much. | Kept, since it looks safe: at two in-between poses of revision 2, culled and un-culled renders differ in 0.01 % and 0.08 % of pixels. The differences were not inspected one by one. | A from-region occlusion test, or per-pose index buffers chosen at runtime. Expect roughly half the splats. |
| C | **Vertical hover is lopsided**: 36° up, 3.4° down. The eye would pass through the road deck below that. | Documented; arrow keys and hover both respect it. | Either raise the origin elevation and re-pin the bend, or let the orbit radius shrink as the eye drops. Rebake after. |
| D | **The painted hauler starts beside the island wall.** With the east ravine walled in, no straight run through its painted spot was long enough behind it. | Its spot was moved 3 units east and it is allowed a 4-unit run-in, so it fades in next to the wall. All four painted ships now fly. | Curved lanes, or a port in the wall for it to come out of. |
| E | **Ships fly straight lines and can pass through each other.** | Lanes are checked against roads, road legs, named towers and the eye; grid towers are cut down under each lane. | Lane-to-lane time separation; banking on gentle arcs. |
| F | **Reference matching is by eye.** Megatower, highway, bend, named towers, the hauler, the wing ship, the pipeline bundle and the three ravines are placed by unprojecting reference pixels (the painting's empty right half, its black lower left, the dark bands left of the far highway). Bank lines are straight and the cliff bays are seeded, not traced. | — | Unproject more reference pixels with `CamPath.refToDepth` and add them as `hero({...})` entries in `city.js`. |
| G | **Windows are not baked by the sculptor's material.** With windows as a material texture every wall needed 2-pixel splats (1.2 M wall splats). | Walls are sculpted coarse and dark; each lit window is its own emissive splat laid over the wall and culled with it. | None needed unless inked detail (`S.fine`) is wanted. |
| H | **Light shimmer.** Lamps tinting dark walls land between close palette steps, so smooth light motion made whole faces flicker (35 % of pixels changed in 0.6 s). | Lamps and fog-floor lights step six times a second; dither amplitude 0.014 on solids, 2.6× that on bare haze. Now 20 % of pixels change in 0.6 s and 2.6 % in 0.05 s. | A dedicated lit ramp per wall ramp so lamp light moves whole palette steps. |
| I | **Soft glows band into rings** after palette quantisation (sign halos, the light well at the megatower's foot). | Glow strengths lowered; haze banks kept faint. | Blue-noise dither for the additive pass only. |
| J | **Inked silhouettes against lit haze looked like cracks.** | Lit haze writes itself as "something there" so only silhouettes against the black void are inked. | — |
| L | **The warm glow under the fog bands into flat gold patches** seen from steep angles. The palette has four amber steps and nothing between amber and the violet haze. | Ordered dither on bare haze; glow strength held down (`look.warm`, the `pow(-d.y, 3.0)` term in `skyFS`). | Give up two palette slots for dusk browns, or blue-noise dither for haze. |
| M | **The city has no ground.** Banks are cliffs 8–10 units thick; behind them towers stand in fog as before. From the highest poses the gaps between near towers show fog, not streets. | Street lights sit at one "street level" (`bankTop - 3…10`). | A coarse ground slab per tile behind the banks. |
| N | **Two lower highways now end inside the island** (L1, L2) so that the painting's empty right half stays empty; their halls through the shoulder are open but there is nothing inside. | — | Model the halls' interiors, or bend the roads along the island. |
| O | **Landing ports and courts are empty.** Ports are a recessed lit hall behind an apron with guide lights; courts are sunken roofs with pad lights. No ship is parked or ever lands. | — | See HANDOFF.md task 3. |
| P | **Cut-through halls show no underside.** The floor above a hall is not laid (the eye is nearly always above it). From the lowest pose a hall near eye level can show a missing ceiling. | — | Pass `bottom: true` to `W.box` for the segment above a hall. |
| K | **No fallback** without WebGL2 or `DecompressionStream` (Safari before 16.4, Firefox before 113). | The page prints a one-line message. | Ship the pack uncompressed behind a size check, or include a small inflate routine. |

## 4. Not started

- Sound, a time-of-night or weather control, and any on-screen controls beyond the fading hint.
- Toolkit features not used yet that would suit the scene: `K.weather` rain, `K.flock` for small traffic swarms, `S.fine` inked detail on near surfaces, `S.bounce` for sign light baked into walls.
- The toolkit repository is marked private and `UNLICENSED`. The page embeds its `PixelLook.glsl` (2 kB) and data baked with it, not its source. Check with its author before sharing the page publicly.

## 5. Checks to rerun after any change

1. `node build.js` ends with `packed N splats` and no `Error`; N should stay under about 700 k; no `found no clear lane` line.
2. `node tools/shot.js dist/index.html shots/x "0,0,3;0,1,3;-1,0.3,3;1,0.5,3" 494 738` prints four `pose` lines and no `NEON_ERROR`.
3. Origin pose (`0,0,3`) beside the reference: bend near pixel (275, 258), megatower with lift cars right of it, the right half empty down to haze except the hauler, pipes left of the far highway, wing ship upper left.
4. Corner poses show no black sprites, no holes at silhouettes, no geometry in front of the lens.
5. Two frames 0.05 s apart at one pose differ in under 5 % of pixels (last measured before revision 2; not re-measured).
