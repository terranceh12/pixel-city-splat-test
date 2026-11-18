# Night Traffic Megacity — state of the build and deferred work

This is the hand-off note for whoever continues the scene. It is self-contained: what exists, the rules it relies on,
what was worked around instead of solved, and how to check each next step.

## 1. What exists

One self-contained page (`dist/index.html`, 2.52 MB) built by `node build.js` from the ink-studio toolkit.

**Revision 3 (palette, deep city, traffic).**
- The palette is regenerated from OKLCH ramps (`tools/palette_gen.py`), so steps are perceptually even and the accent hues sit at matched lightness. The golds are less saturated.
- The gold glow under the fog is gone. Fog now stops thickening below a cap. Through it, the abyss shows a city far below, seen from the air (`deepCity()` in `city.js`, at y −186). Its streets are continuous strokes, with car lights on the avenues, dim and dark districts, and wisps of fog drifting over it.
- Car lights on every highway are rainbow coloured, one colour per car.
- Three high roads (H1–H3) weave through the distant skyline.
- There are 114 landmark towers in nine shapes, each built to do something: twist, stack, gate, terrace, needle, twin, dock, diagrid and crown. Twelve are placed by hand where the painting's distant skyline shows.
- Four ships pass close to the camera on a loop: a wing ship at about 9 s, two darts at about 24 s and a liner at about 44 s.
- The small revision-2 follow-ups are done (the hand-off list has been removed):
  - 15 ships are parked on courts, in ports and on dock landmarks;
  - there is a second freighter livery and a seventh pack;
  - lift cars stop at three floors;
  - cut-through halls have ceilings.

**Revision 2 (ravines).** Revision 2 cut away the low city near the eye where the painting is empty. That left an island (the wall under the near highway, with the megatower at its bend) between three ravines. Their banks are faceted cliffs with windows and carved landing ports. Revision 2 also added:
- buildings built round the roads that pass through them;
- floating pipelines;
- freighter packs;
- glass lifts;
- street-level shop lights;
- blue-violet distance haze.

| Stage | Where | What it does |
| --- | --- | --- |
| Sculpt | `src/scene/city.js`, `parts.js`, `ships.js` | Every solid is a signed-distance box, ball or lathe handed to the toolkit's sculptor (`makeSculpt`, `K.sculpt`). That covers roads, towers, cliffs (`PT.cliff`), cut-through towers (`PT.towerCut`), landmarks (`PT.landmark`), the megatower, 8 ship kinds (14 templates, counting near, parked and livery variants) and the lift car. Pipes are laid by hand as rings of discs (`W.pipe`). The deep city is laid by hand as light strokes (`deepCity()`). |
| Bake | toolkit `S.bake()` behind `src/bake/ir.js` | The sculptor projects sample points onto the SDF surface, lights them and emits splats. A recorder in front of the builder keeps the axis, two sigmas, palette index, motion kind and flags of each splat. |
| Cull | `src/scene/pvs.js` | Before baking, candidate sample points are tested from 2,840 eye positions on the hover range. This removes 13 % (88 k of 680 k). |
| Pack | `src/bake/ir.js` `pack()` | 16-bit positions per group, delta-coded, gzip. 702,443 splats pack to 1.60 MB. |
| Draw | `src/host/main.js`, `shaders.js` | WebGL2. Solid splats are depth-tested point sprites cut at half strength. Glows are additive instanced quads. The scene is drawn at 2× art resolution, resolved by the toolkit's own `PixelLook.glsl`, then blown up in whole pixels. A 128² floor-light texture, recomputed each frame, tints the fog and lights walls from below. |

Numbers from the last build:
- 2,039 grid plots: 1,894 plain towers, 43 built round a road and 102 landmarks;
- 12 hand-placed landmarks and 9 named towers;
- 5 lower highways, 3 high roads and 6 pipes;
- 36 ship lanes (19 ships fly in 7 packs; 4 are close passes);
- 10 lift cars and 15 parked ships;
- 379 fog-floor lights, 1,388 street lights and 90 signs;
- 4,419 deep-city lights.

Bake time is 44 s, most of it the visibility pass.

Rebuild with `node build.js`. The toolkit checkout is expected at `../siliconjungle/shapeshift-labs-ink-studio`; otherwise pass `--toolkit <path>`.

Build flags:
- `--quick`: coarse visibility, 13 s;
- `--px 2`: splat spacing in art pixels;
- `--step 1`: eye step in degrees;
- `--nocull`;
- `--hist`: splat counts by distance and height.

Page debug parameters:
- `?debug`: fps and splat count;
- `?mx=0.3&my=0.5&t=12`: hold a pose and a time;
- `?art=720`;
- `?only=ship`;
- `?not=tile`;
- `?cam=ex,ey,ez,tx,ty,tz`: put the eye anywhere, looking at a target. Splat spacing is only right from the hover range, so views from elsewhere look coarse. Use them to check geometry, not looks.

Headless check: `node tools/shot.js dist/index.html shots/x "0,0,3;1,1,60" 494 738`. Each pose is `mx,my,t`, and the page parameters can be passed through `QS="cam=…&t=5"`.

## 2. Rules the build relies on (do not break)

1. **World frame.** The origin is the highway bend at road level. The near highway runs toward +Z, the far highway 18° left of −Z. One unit is about three storeys.
2. **Camera.** `src/campath.js` is shared by the baker and the page.
   - The orbit radius is 68 about the bend. The origin pose matches the reference frame (494×738, bend pinned at pixel 275,258).
   - The hover range is ±35° azimuth, +36° / −3.4° elevation.
   - **Changing any constant here requires a rebake**: splat spacing and culling are computed for this exact range.
3. **Nothing may stand in the eye's swept volume.** `city.js` caps tower tops inside the wedge az −50°…54°, radius 38–92. `lanes.js` keeps each ship a set distance from every eye position: 9–19 units times its scale, by kind, and 4.5–9 units for the close passes.
4. **Splat spacing is chosen per box from the nearest eye that can actually see it** (`util.js seenFrom/resBox`). Walls are 4 art px, windows 2, decks 2.
5. **The palette is 48 colours** (`src/palette.js`), the most `PixelLook.glsl` resolves.
   - The colours are generated: `python3 tools/palette_gen.py shots/swatch.png` prints the list for `src/palette.js` and writes a swatch. Edit a ramp in the script, not the hex.
   - Indices are referred to by number all over the scene code, so never reorder them:

     | Index | Role |
     | --- | --- |
     | 0 | Void, never painted on a solid |
     | 1–7 | Structure |
     | 8 | Green |
     | 9–13 | Slate |
     | 14–19 | Haze |
     | 20–26 | Gold |
     | 27 | Blue |
     | 28–31 | Orange |
     | 32–36 | Crimson and pink |
     | 37–41 | Violet |
     | 42–45 | Cyan |
     | 46 | Warm white |
     | 47 | Cool white |
6. **Solid splats must stay small on screen.** They are point sprites, and the scene target has an 8-art-pixel border so sprites are not dropped at the frame edge. Anything large and soft belongs in the additive pass.
7. **Every recorded splat needs a unit axis.** The sculptor returns a zero normal in creases where two solids meet. `ir.js` replaces it with +Y and the vertex shader guards it. Removing either guard brings back full-screen black sprites.
8. **The lie of the land is one set of rectangles** at the top of `city.js` (`RV`, `ISLAND`, `inRavine`, `hwx`). Grid towers, street lights, the lane planner's `ground` rule and the deep city all ask `inRavine`. If you move a ravine there, move every bank (`bank(...)` call) that borders it.
9. **Ships below y = 12 stay inside ravines** (`lanes.js`, the `ground` option), and every cliff bay is a keep-out box. A lane that cannot be flown is skipped with a console line, never forced.
10. **Roads are passed to cliffs and towers** (`roads`, `lowerRoads`). A hall is left open wherever a road's centre line enters a footprint. A new road must be added to `roads` before the cliffs and the grid are built. The high roads are, and the tower at (44, −140) is built round H3 by `heroCut`.
11. **Lift cars and parked ships are `meta.ships` entries without a lane.**
    - Lift entries carry `lift: 1` (`x, z, yaw, y0, y1, per, ph`). The page moves them in `placeShips`, with three stops per trip.
    - Parked entries carry `park: 1` (`x, y, z, yaw, sc`). They use the templates `dart-cold` and `tug-cold`, which have their engines off.
    - The lane planner does not see either kind. A parked ship must sit on something that is already a keep-out box: a court, a port apron or a dock arm.
    - `meta.ships` is assigned after the grid, because dock landmarks add parking spots while it is built.
12. **The fog has a floor.**
    - Height fog thickens downward only as far as `yc = fogY − fogC·fogH` (`build.js`, `look.fogC`). Below that it keeps the same density.
    - The sky shader solves where the optical depth along a downward ray reaches 1 under that cap.
    - Lowering `fogC` hides the deep city; raising it turns the abyss black.
    - Deep-city lights carry the NOFOG flag (2), which here means fog counts at 0.42, not that it is ignored.
    - `look.warm` now only lights walls from below. It no longer tints fog or sky, which is what made the gold patch.
13. **Rainbow traffic is a flag, not a palette entry.**
    - TRAIL splats with flag 32 pick one of ten car colours per car from a hash in the shader (`RB` for solid splats, `RBH` for the additive halo, in `shaders.js`).
    - Road edge lines (palette 39) are left violet on purpose.
    - To change the car colours, edit those two lists of palette indices.
14. **Landmarks are capped in height** to `6 + 0.16·r` (r is the distance from the bend) and enlarged 1.35× in plan, so their tops stay inside a landscape frame. Each reaches past its plot. Random ones are therefore kept 1.75 plot radii clear of roads and lanes, and hand-placed ones are cleared with `keep()`.
15. **Close passes are planned from the origin pose.**
    - `lanes.js close()` puts a lane through a point `depth` units in front of the origin eye, offset by `lift` and turned by `turn`.
    - It then checks that the whole run stays `least` units from every hover pose (`util.js eyePatchDist`).
    - If none fits, it prints `(a close pass found no clear lane …)` and skips the ship.
    - Close ships use their own finer templates with smaller halos (`'wing-near'`, `'dart-near'`, `'liner-near'`, `haloK`).

## 3. Worked around, not solved

| # | Issue | Workaround in place | Proper fix |
| --- | --- | --- | --- |
| A | **Frame rate on real GPUs is unmeasured.** Only a software renderer was available (10–12 s per frame there, which says nothing about hardware). Revisions 2 and 3 raised the load. | Solid pass is point sprites. 544–600 k points are submitted per frame at the six test poses; the bake holds 702 k. | Open with `?debug` in Chrome on the target hardware and record the fps here. If it is under 55 fps: (1) in `parts.js`, raise `WALL_PX` from 4 to 5 and the cliffs' `px: 5` to `6`, then rebuild and measure again; (2) split each tile by wall facing and skip back-facing groups per frame; (3) drop ring-2 towers beyond radius 600. |
| B | **Visibility pass removes only 13 %** (88 k of 680 k). Streets are open in too many directions from a 70°×39° eye range for point-sampled occlusion to prove much. | Kept, since it looks safe: at two in-between poses, culled and un-culled renders differ in 0.003 % and 0.066 % of pixels. | A from-region occlusion test, or per-pose index buffers chosen at runtime. Expect roughly half the splats. |
| C | **Vertical hover is lopsided**: 36° up, 3.4° down. Any lower and the eye would pass through the road deck. | Documented; arrow keys and hover both respect it. | Either raise the origin elevation and re-pin the bend, or let the orbit radius shrink as the eye drops. Rebake after. |
| D | **The painted hauler starts beside the island wall.** With the east ravine walled in, no straight run through its painted spot was long enough behind it. | Its spot was moved 3 units east and it is allowed a 4-unit run-in, so it fades in next to the wall. All four painted ships fly. | Curved lanes, or a port in the wall for it to come out of. |
| E | **Ships fly straight lines and can pass through each other.** | Lanes are checked against roads, road legs, named towers, hand-placed landmarks and the eye. Grid towers are cut down under each lane, and random landmarks are not placed near one. Close passes are timed apart (9 s, 24 s, 44 s) but not checked against other ships. | Lane-to-lane time separation; banking on gentle arcs. |
| F | **Reference matching is by eye.** Megatower, highway, bend, named towers, the hauler, the wing ship, the pipeline bundle, the three ravines and the 12 hand-placed landmarks are placed by unprojecting reference pixels. Bank lines are straight and the cliff bays are seeded, not traced. | — | Unproject more reference pixels with `CamPath.refToDepth` and add them as `hero({...})` entries in `city.js`. |
| G | **Windows are not baked by the sculptor's material.** With windows as a material texture every wall needed 2-pixel splats (1.2 M wall splats). | Walls are sculpted coarse and dark; each lit window is its own emissive splat laid over the wall and culled with it. | None needed unless inked detail (`S.fine`) is wanted. |
| H | **Light shimmer.** Lamps tinting dark walls land between close palette steps, so smooth light motion made whole faces flicker. | Lamps and fog-floor lights step six times a second. Dither amplitude is 0.014 on solids and 1.5× that on bare haze. Now 22 % of pixels change in 0.6 s and 5.6 % in 0.05 s. Nearly all of the 0.05 s change is moving traffic, ships and drifting dust (rainbow cars change more pixels than one amber colour did). No wall face flickers. | A dedicated lit ramp per wall ramp, so lamp light moves whole palette steps. |
| I | **Soft glows band into rings** after palette quantisation (sign halos, the light well at the megatower's foot). | Glow strengths lowered; haze banks and deep fog wisps kept faint. | Blue-noise dither for the additive pass only. |
| J | **Inked silhouettes against lit haze looked like cracks.** | Lit haze writes itself as "something there", so only silhouettes against the black void are inked. | — |
| K | **No fallback** without WebGL2 or `DecompressionStream` (Safari before 16.4, Firefox before 113). | The page prints a one-line message. | Ship the pack uncompressed behind a size check, or include a small inflate routine. |
| M | **The near city has no ground.** Banks are cliffs 8–10 units thick, and behind them towers stand in fog. | The deep city at y −186 now gives the abyss a lit floor. Street lights sit at one "street level" (`bankTop - 3…10`). From the highest poses, the gaps between near towers still show fog, not streets. | A coarse ground slab per tile behind the banks. |
| N | **Two lower highways end inside the island** (L1, L2), so that the painting's empty right half stays empty. Their halls through the shoulder are open, with ceilings now, but there is nothing inside. | — | Model the halls' interiors, or bend the roads along the island. |
| Q | **White light seen through fog turns lilac.** There is no pale grey-blue step between haze 19 and white 47, so fogged white street lights in the deep city resolve to violet. | Accepted as the blue-white LED look of new districts; old districts use warm whites and ambers. | Spend a palette slot on a fogged white. |
| R | **The third high road (H3) reads almost as a horizon line.** At that distance perspective flattens every route through it. | Lowered, and distant towers were allowed to grow taller so they break it into pieces. | Bring it nearer, or give it a visible climb (a ramp or spiral interchange). |

Resolved in revision 3:
- **L.** The gold patch under the fog went with the fog rework (rule 12).
- **O.** The landing courts and ports were empty; they now have parked ships (rule 11).
- **P.** Cut-through halls had no underside; the segment above a hall now gets one (`tower(..., { under: true })`).

## 4. Not started

- Sound, a time-of-night or weather control, and any on-screen controls beyond the fading hint.
- Toolkit features not used yet that would suit the scene:
  - `K.weather` rain;
  - `K.flock` for small traffic swarms;
  - `S.fine` inked detail on near surfaces;
  - `S.bounce` for sign light baked into walls.
- The toolkit repository is marked private and `UNLICENSED`. The page embeds its `PixelLook.glsl` (2 kB) and data baked with it, not its source. Check with its author before sharing the page publicly.

## 5. Checks to rerun after any change

1. `node build.js` ends with `packed N splats` and no `Error`. N should stay under about 720 k. None of these lines should appear:
   - `(a painted ship found no clear lane …)`
   - `(a freighter pack found no clear lane …)`
   - `(a close pass found no clear lane …)`
2. `node tools/shot.js dist/index.html shots/x "0,0,3;0,1,3;-1,0.3,3;1,0.5,3" 494 738` prints four `pose` lines and no `NEON_ERROR`.
3. Compare the origin pose (`0,0,3`) with the reference. You should see:
   - the bend near pixel (275, 258);
   - the megatower with lift cars right of it;
   - the right half empty down to haze, except for the hauler;
   - pipes left of the far highway;
   - the wing ship at the upper left.
4. Corner poses show no black sprites, no holes at silhouettes and no geometry in front of the lens. The steep pose `0,1,3` shows the deep city's street grid through the fog.
5. Run poses `0,0,9;0,0,24.5;0,0,44` at 960×540. They should show the wing ship, the two darts and the liner passing near the highway.
6. Take two frames 0.05 s apart at one pose. They should differ in about 6 % of pixels (5.6 % at `0.25,0.3,2`), nearly all on moving traffic and ships. Change well above that, or change spread over wall faces, means shimmer is back (row H).
7. Build un-culled with `node build.js --nocull --out dist/nocull/index.html`. At two in-between poses it should differ from the culled build in under 0.1 % of pixels.
