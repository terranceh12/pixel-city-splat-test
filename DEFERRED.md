# Night Traffic Megacity — state of the build and deferred work

This is the hand-off note for whoever continues the scene. It is self-contained: what exists, the rules it relies on,
what was worked around instead of solved, and how to check each next step.

## 1. What exists

One self-contained page (`dist/index.html`, 2.72 MB) built by `node build.js` from the ink-studio toolkit.

**Revision 6 (fisheye lens, stars, a moon that casts shadows, smaller low traffic).**
- The camera is a fisheye (rule 2). A ray θ off the axis lands tan(0.4·θ)/0.4 from the middle of the frame, so straight edges bow outward toward the frame's sides and far more fits in. A portrait window is 46° high where it was 30°; a wide window shows up to 120° across. The bend is still pinned at the painting's pixel (275, 258), and the eye positions are unchanged.
- Stars fill the sky: single art pixels, a few brighter, twinkling in steps, fading out in the haze toward the horizon (`skyFS` in `shaders.js`).
- A moon hangs high to the east, 33° up and a little behind the eye, out of frame from every pose (its disc and halo are drawn in the sky all the same). It is the scene's key light (rule 19):
  - faces that turn toward it get a cool, silvery light;
  - the city's own bulk casts long shadows westward: towers onto lower roofs and the highway deck, the east bank down onto the ravine floors.
  - The shadows are worked out once, at build time, from a depth map seen from the moon. About half of the moon-facing surface is in shadow.
- The ships between this city and the one below are smaller, so the drop reads as longer. Every lane whose highest point is below y −15 flies its ship at 0.62 of its size at y −20, shrinking to 0.42 by y −87. This covers the open gap under the bridge, the convoys and packs in the ravines, and the low crossings. The racers deep under the floor are at 0.8, since they are already tiny. Ships at road height, the painted hauler and the close passes keep their size.

**Revision 5 (the island opened underneath, low traffic on its open side).**
- As in the painting, the abyss now shows under the near highway. Past its foot by the bend (z > 12) the island is a bridge: the highway, and the storeys under it that L1 runs through behind the slit, down to y −16. Below that there is nothing, down to the city far below.
- The island's lower shoulder on the west side is gone there too, so the left side opens. One sunk court is left, on the foot. L1 now crosses open air to the bridge's west face, with no legs past x −17.
- L2, which used to end inside the island where it is now open, ends inside the foot instead.
- Ships fly on the open side, between this city and the one below:
  - down the west ravine: a convoy (a freighter and two tugs) coming toward the eye, a liner going away, and a dart higher up between the two lower roads;
  - three more (a liner, a dart and a tug) crossing under the bridge from one ravine to the other;
  - three racers deep in the west ravine.
- Each is timed to be on its way, in view, in the first half minute after the page opens.

**Revision 4 (slit window, fast traffic, smaller lifts).**
- The lower highway L1 no longer stops inside the island. It enters a little nearer the bend than before, turns toward the eye inside the island and runs on behind its east face, to z 110. Its upper storeys stand on a slit: a thin window line through which the road's traffic shows. The slit has a run of small lamps along its lintel, so it reads as a lit line even where the road is out of sight.
- Thirteen fast ships ("racers", in cyan and pink) fly in three streams between the city's floor and the city far below, at 22–30 units a second (other ships do 0.5–2.3). Two streams run up and down the east ravine at y −142 and −155. The third crosses under everything at y −177, showing in each ravine it passes under. Each racer trails a long streak of light.
- The glass lift cars are 0.8 of their old size.

**Revision 3 (palette, deep city, traffic).**
- The palette is regenerated from OKLCH ramps (`tools/palette_gen.py`), so steps are perceptually even and the accent hues sit at matched lightness. The golds are less saturated.
- The gold glow under the fog is gone. Fog now stops thickening below a cap. Through it, the abyss shows a city far below, seen from the air (`deepCity()` in `city.js`, at y −186). Its streets are continuous strokes, with car lights on the avenues, dim and dark districts, and wisps of fog drifting over it.
- Car lights on every highway are rainbow coloured, one colour per car.
- Three high roads (H1–H3) weave through the distant skyline.
- There are 114 landmark towers in nine shapes, each built to do something: twist, stack, gate, terrace, needle, twin, dock, diagrid and crown. Twelve are placed by hand where the painting's distant skyline shows.
- Four ships pass close to the camera on a loop: a wing ship at about 9 s, two darts at about 24 s and a liner at about 44 s.
- The small revision-2 follow-ups are done (the hand-off list has been removed):
  - 15 ships are parked: in ports, on dock landmarks, and (since revision 5) on the one court left on the island's foot;
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
| Sculpt | `src/scene/city.js`, `parts.js`, `ships.js` | Every solid is a signed-distance box, ball or lathe handed to the toolkit's sculptor (`makeSculpt`, `K.sculpt`). That covers roads, towers, cliffs (`PT.cliff`), cut-through towers (`PT.towerCut`), landmarks (`PT.landmark`), the megatower, 9 ship kinds (16 templates, counting near, parked, livery and colour variants) and the lift car. Pipes are laid by hand as rings of discs (`W.pipe`). The deep city is laid by hand as light strokes (`deepCity()`). |
| Bake | toolkit `S.bake()` behind `src/bake/ir.js` | The sculptor projects sample points onto the SDF surface, lights them and emits splats. A recorder in front of the builder keeps the axis, two sigmas, palette index, motion kind and flags of each splat. |
| Cull | `src/scene/pvs.js` | Before baking, candidate sample points are tested from 2,840 eye positions on the hover range, each a depth picture taken through the same fisheye as the page. This removes 4 % (27 k of 660 k). |
| Moon shadows | `src/scene/world.js` `W.moonShade()` | After the city is baked (and before the ships are), the candidates are drawn into a 4096² depth map seen from the moon, over radius 480 about the bend (0.18 units to a texel). Every lit splat that faces the moon but lies behind that map is flagged MSH (64): 128 k of 256 k. |
| Pack | `src/bake/ir.js` `pack()` | 16-bit positions per group, delta-coded, gzip. 759,612 splats pack to 1.72 MB. |
| Draw | `src/host/main.js`, `shaders.js` | WebGL2. Solid splats are depth-tested point sprites cut at half strength. Glows are additive instanced quads. Each splat's footprint is its covariance pushed through the fisheye's Jacobian (EWA), so splats stay whole as the lens bends; depth is distance from the eye. The scene is drawn at 2× art resolution, resolved by the toolkit's own `PixelLook.glsl`, then blown up in whole pixels. A 128² floor-light texture, recomputed each frame, tints the fog and lights walls from below. The moon lights every solid splat that faces it and is not flagged MSH. The sky shader draws the stars, the moon's disc and its halo. |

Numbers from the last build:
- 2,039 grid plots: 1,887 plain towers, 43 built round a road and 109 landmarks;
- 12 hand-placed landmarks and 9 named towers;
- 5 lower highways, 3 high roads and 6 pipes;
- 62 ship lanes (22 ships fly in 8 packs; 4 are close passes; 16 are racers in 4 streams);
- 10 lift cars and 15 parked ships;
- 379 fog-floor lights, 1,703 street lights and 89 signs (the wider lens sees more of the street lights, which are only laid where an eye can see them);
- 4,487 deep-city lights.

Bake time is about 150 s, nearly all of it the visibility pass. Its depth pictures are taken through the fisheye, which is slower than the old pinhole and covers more of the city.

Rebuild with `node build.js`. The toolkit checkout is expected at `../siliconjungle/shapeshift-labs-ink-studio`; otherwise pass `--toolkit <path>`.

Build flags:
- `--quick`: coarse visibility (eye step 3° instead of 1°);
- `--px 2`: splat spacing in art pixels;
- `--step 1`: eye step in degrees;
- `--nocull`: skips the visibility pass, so a build takes about 15 s. Useful for trying changes to the scene; the result holds about 27 k more splats;
- `--hist`: splat counts by distance and height.

`node tools/repage.js` rewrites the page around the splats the last build packed, with the current `src/host/*`, `src/campath.js` and `src/palette.js`. It takes a few seconds. Use it for changes to the shaders or the host. The camera path is read again, but the splats were placed and culled for the path as it stood when baked, so a change to `campath.js` still needs a full build. So does a change to `look` in `build.js`, which travels in the packed meta.

Page debug parameters:
- `?debug`: fps and splat count;
- `?mx=0.3&my=0.5&t=12`: hold a pose and a time;
- `?art=720`;
- `?only=ship`;
- `?not=tile`;
- `?cam=ex,ey,ez,tx,ty,tz`: put the eye anywhere, looking at a target. Splat spacing is only right from the hover range, so views from elsewhere look coarse. Use them to check geometry, not looks;
- `?moonk=4`: the moonlight four times as strong, to see its shadows;
- `?moondbg`: faces the moon lights drawn green and faces in its shadow red (after the palette resolve, teal and crimson).

Headless check: `node tools/shot.js dist/index.html shots/x "0,0,3;1,1,60" 494 738`. Each pose is `mx,my,t`, and the page parameters can be passed through `QS="cam=…&t=5"`.

## 2. Rules the build relies on (do not break)

1. **World frame.** The origin is the highway bend at road level. The near highway runs toward +Z, the far highway 18° left of −Z. One unit is about three storeys.
2. **Camera.** `src/campath.js` is shared by the baker and the page.
   - The orbit radius is 68 about the bend. The origin pose matches the reference frame (494×738, bend pinned at pixel 275,258).
   - The hover range is ±35° azimuth, +36° / −3.4° elevation.
   - **The lens is a fisheye.** A ray θ off the axis lands `lensR(θ) = tan(kθ)/k` lens units from the middle of the frame, with `k` 0.4 (`lensTh` is the inverse). Its limits are:
     - a portrait window is 46° high (`fovV`);
     - a wide window reaches at most 60° to each side (`fovHMax`);
     - a tall window reaches at most 62° up and down (`tanVMax`).
   - The bend stays pinned at the reference pixel, measured in lens units. So the origin pose looks about 4.5° further down than the old 30° pinhole did (pitch 21° against 16.5°); the eye itself has not moved.
   - **Things laid out in the old frame use `poseRef`**, the old pose through the old pinhole. These are the close passes (rule 15), placed by depth and lift in front of the starting eye, so they still pass where and when they were planned.
   - **Everything that decides what the lens can see works in lens units.** That means `toLens` and `lensDir`, `seenFrom` (`util.js`, margins `SEE_H` and `SEE_V`), the visibility pass's depth pictures (`pvs.js`) and the page's group test `sees()` (`main.js`). The vertex shader projects with the fisheye's own Jacobian (`u_k`), and its depth is distance from the eye, not z. Change `k` or a field of view in all of them at once, by changing `campath.js`.
   - **Changing any constant here requires a rebake**: splat spacing and culling are computed for this exact range and lens.
3. **Nothing may stand in the eye's swept volume.** `city.js` caps tower tops inside the wedge az −50°…54°, radius 38–92. `lanes.js` keeps each ship a set distance from every eye position: 9–19 units times its scale, by kind, and 4.5–9 units for the close passes.
4. **Splat spacing is chosen per box from the nearest eye that can actually see it** (`util.js seenFrom/resBox`). Walls are 4 art px, windows 2, decks 2. Distance is turned into art pixels with `F_ART` (300). It was lowered from 340 with the fisheye, whose middle is less magnified than the old pinhole's.
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
8. **The lie of the land is one set of rectangles** at the top of `city.js` (`RV`, `ISLAND`, `inRavine`, `hwx`). Grid towers, street lights, the lane planner's `ground` rule and the deep city all ask `inRavine`. If you move a ravine there, move every bank (`bank(...)` call) that borders it. The open air under the island's bridge (`HOLLOW`, from `HOLLOW_Z`) is not a ravine as far as `inRavine` is concerned; only the fog and the low traffic's ground rule (rule 18) treat it as one.
9. **Ships below y = 12 stay inside ravines** (`lanes.js`, the `ground` option), unless they fly wholly under the city's floor (`W.FOG_CUT`, −170). Every cliff bay is a keep-out box. Legs and keep-out boxes block only down to the floor, so the air under it is open. A lane that cannot be flown is skipped with a console line, never forced.
10. **Roads are passed to cliffs and towers** (`roads`, `lowerRoads`). A hall is left open wherever a road's centre line enters a footprint. A new road must be added to `roads` before the cliffs and the grid are built. The high roads are, and the tower at (44, −140) is built round H3 by `heroCut`. The one exception is L1 inside the island's east cliff (rule 16): it is left out of that cliff's roads, because the slit is its room.
11. **Lift cars and parked ships are `meta.ships` entries without a lane.**
    - Lift entries carry `lift: 1` (`x, z, yaw, y0, y1, per, ph`). The page moves them in `placeShips`, with three stops per trip. The template is modelled at size 1; `LIFT_SC` in `city.js` (0.8) scales the cars and their distance out from the tower's face together.
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
    - `lanes.js close()` puts a lane through a point `depth` units in front of the origin eye, offset by `lift` and turned by `turn`. "In front" means along the old pinhole pose (`poseRef`, rule 2), so the lanes did not move when the lens changed. Through the fisheye their straight runs bow a little as they cross the frame.
    - It then checks that the whole run stays `least` units from every hover pose (`util.js eyePatchDist`).
    - If none fits, it prints `(a close pass found no clear lane …)` and skips the ship.
    - Close ships use their own finer templates with smaller halos (`'wing-near'`, `'dart-near'`, `'liner-near'`, `haloK`).

16. **The slit in the island's east face** (`SLIT` in `city.js`).
    - The east cliff's bays whose middles lie past `HOLLOW_Z` (z 12) stop at the slit's floor (y −11.5). The storeys above (y −10.1 up to the road deck) are built separately, flush with the face line, with their underside drawn (`under: true`).
    - Nothing may stand out over the slit, or it hides the road from above. L1's outer lanes run 0.1 inside the face so they show through it.
    - Moving L1 means moving `SLIT` with it.
17. **The fast streams** (`lanes.js stream()`).
    - Their lanes carry `below: 1`, so the grid towers are not cut down for them (they would be cut away entirely). They are planned last, so adding or moving one does not move any other lane.
    - Racers carry their lights through the fog in two ways. Their templates are built with `nofog`, which sets `W.orFlags` so that every lamp and glow gets the NOFOG flag (the shader now honours NOFOG on additive glows too). Their lanes also carry `fogK: 0.4`, which the page passes as `u_gfog` to scale the fog's optical depth for that ship.
    - They never come nearer the eye than about 150 units, so their lights are sized for that.

18. **The bridge** (`HOLLOW_Z`, `BRIDGE_BOT`, `HOLLOW` in `city.js`).
    - A cliff's `bottom` may be a function of the bay (`PT.cliff`), so a bay can end in mid air. Past `HOLLOW_Z` the island's east cliff and west wall end at `BRIDGE_BOT` (y −16), and its shoulder is not built at all. Before `HOLLOW_Z` (the foot, by the bend) everything still stands all the way down: L2 ends in it, the pipelines start from it, and its court is there.
    - Nothing may be built under the bridge. L1's legs stop at x −17. L4 passes under the bridge at y −64, with one of its legs under it.
    - The lane planner plans in two passes. First, every lane that existed before is planned against the island whole (the `kept` list with the old island box), so those lanes come out as they did. Then it rebuilds its blockers from `keptOpen`, where the island is its foot plus a bridge with a bottom, and uses `groundOpen`, where the open air counts as a ravine. The low traffic on the open side is planned in that second pass, and is timed with `timed()` to be in view early.
    - Any change to what the first pass sees (roads, legs, kept boxes) re-draws every random lane after the first one it touches. That happened once in this revision (the hauler moved 4 units, the packs moved). After such a change, check the close passes (§5 check 5): their timing is set from `tMid` and survives.
    - Once all lanes are planned, every lane whose highest point is below y −15 has its ship scaled down: 0.62 at y −20, falling 0.003 a unit to 0.42. Racers (`below: 1`) are scaled to 0.8 instead. The hauler and the close passes are never scaled. The scaling is applied after planning and after `air` (the towers cut down under lanes) in `city.js`. So clearances and cuts were made for full-size ships, and the smaller ships have more room than they need. `half` is scaled with `sc`, so the lane's record stays consistent.

19. **The moon** (`W.moon` in `world.js`, `look.moon` in `build.js`).
    - `W.moon` is the one direction toward the moon, a unit vector about 33° up, to the east (+X) and a little toward +Z. The sculptor's sun is set to it, so the bake's own shading agrees with the page's moonlight. `look.moon` carries the same direction, and the light's colour `col`, to the page.
    - The shadows are baked. `W.moonShade()` runs after `bakeBoxes()`:
      - it draws the candidates (the same points the cull tests, each a square of 0.6 of its radius) into a 4096² depth map seen from the moon, over radius 480 about the bend;
      - every lit, non-emissive, non-additive splat that faces the moon (N·L > 0.02) is tested at a point pushed out along its normal and toward the moon;
      - a splat lying more than a bias (0.35 units plus 1.5 texels) behind the map is flagged MSH (flag 64).
    - The vertex shader adds `col × max(0, N·L)` to every lit solid splat that is not flagged, and `col × 0.3` to unlit ones.
    - Changing the moon's direction or colour needs a full build: the direction is baked into the flags, and the colour travels in the packed meta. To try strengths on the page, use `?moonk=`.
    - Ships, lift cars and parked ships are sculpted after the shadow pass. They neither cast nor receive moon shadows (row V).

## 3. Worked around, not solved

| # | Issue | Workaround in place | Proper fix |
| --- | --- | --- | --- |
| A | **Frame rate on real GPUs is unmeasured.** Only a software renderer was available (9–17 s per frame there, which says nothing about hardware). Revisions 2–4 raised the load and revision 5 lowered it a little. Revision 6 raised it most, because the fisheye shows much more of the city at once. | Solid pass is point sprites. 750–785 k points are submitted per frame at the six portrait test poses, and 810–850 k in a 16:9 window. The bake holds 760 k. | Open with `?debug` in Chrome on the target hardware and record the fps here. If it is under 55 fps: (1) in `parts.js`, raise `WALL_PX` from 4 to 5 and the cliffs' `px: 5` to `6`, then rebuild and measure again; (2) split each tile by wall facing and skip back-facing groups per frame; (3) drop ring-2 towers beyond radius 600; (4) narrow the lens (`fovHMax`, `fovV` in `campath.js`). |
| B | **Visibility pass removes only 4 %** (27 k of 660 k). Streets are open in too many directions from a 70°×39° eye range for point-sampled occlusion to prove much, and the fisheye (up to 120° across) sees round more corners than the old lens did; it used to remove 12 %. | Kept, since it is safe: at three in-between poses, culled and un-culled renders differ in 0.011–0.031 % of pixels. | A from-region occlusion test, or per-pose index buffers chosen at runtime. Expect roughly half the splats. |
| C | **Vertical hover is lopsided**: 36° up, 3.4° down. Any lower and the eye would pass through the road deck. | Documented; arrow keys and hover both respect it. | Either raise the origin elevation and re-pin the bend, or let the orbit radius shrink as the eye drops. Rebake after. |
| D | **The painted hauler starts beside the island wall.** With the east ravine walled in, no straight run through its painted spot was long enough behind it. | Its spot was moved 3 units east and it is allowed a 4-unit run-in, so it fades in next to the wall. All four painted ships fly. | Now that the island is open underneath, plan it in the second pass a few units lower (y ≤ −20), so it comes out from under the bridge. That moves it on the screen, so check it against the painting. |
| E | **Ships fly straight lines and can pass through each other.** | Lanes are checked against roads, road legs, named towers, hand-placed landmarks and the eye. Grid towers are cut down under each lane, and random landmarks are not placed near one. Close passes are timed apart (9 s, 24 s, 44 s) but not checked against other ships. | Lane-to-lane time separation; banking on gentle arcs. |
| F | **Reference matching is by eye.** Megatower, highway, bend, named towers, the hauler, the wing ship, the pipeline bundle, the three ravines and the 12 hand-placed landmarks are placed by unprojecting reference pixels. Bank lines are straight and the cliff bays are seeded, not traced. | — | Unproject more reference pixels with `CamPath.refToDepth` and add them as `hero({...})` entries in `city.js`. |
| G | **Windows are not baked by the sculptor's material.** With windows as a material texture every wall needed 2-pixel splats (1.2 M wall splats). | Walls are sculpted coarse and dark; each lit window is its own emissive splat laid over the wall and culled with it. | None needed unless inked detail (`S.fine`) is wanted. |
| H | **Light shimmer.** Lamps tinting dark walls land between close palette steps, so smooth light motion made whole faces flicker. | Lamps and fog-floor lights step six times a second. Dither amplitude is 0.014 on solids and 1.5× that on bare haze. Now 23 % of pixels change in 0.6 s and 5.8 % in 0.05 s. Nearly all of the 0.05 s change is moving traffic, ships and drifting dust (rainbow cars change more pixels than one amber colour did). No wall face flickers. | A dedicated lit ramp per wall ramp, so lamp light moves whole palette steps. |
| I | **Soft glows band into rings** after palette quantisation (sign halos, the light well at the megatower's foot). | Glow strengths lowered; haze banks and deep fog wisps kept faint. | Blue-noise dither for the additive pass only. |
| J | **Inked silhouettes against lit haze looked like cracks.** | Lit haze writes itself as "something there", so only silhouettes against the black void are inked. | — |
| K | **No fallback** without WebGL2 or `DecompressionStream` (Safari before 16.4, Firefox before 113). | The page prints a one-line message. | Ship the pack uncompressed behind a size check, or include a small inflate routine. |
| M | **The near city has no ground.** Banks are cliffs 8–10 units thick, and behind them towers stand in fog. | The deep city at y −186 now gives the abyss a lit floor. Street lights sit at one "street level" (`bankTop - 3…10`). From the highest poses, the gaps between near towers still show fog, not streets. | A coarse ground slab per tile behind the banks. |
| N | **L2 ends inside the island's foot**, so that the painting's empty right half stays empty. Its hall through the foot's west face is open, but there is nothing inside. (L1 used to end in the island too; it now runs on inside the bridge, rule 16.) | — | Carry L2 under the bridge and out across the east ravine, or give it a ramp up into the foot. |
| Q | **White light seen through fog turns lilac.** There is no pale grey-blue step between haze 19 and white 47, so fogged white street lights in the deep city resolve to violet. | Accepted as the blue-white LED look of new districts; old districts use warm whites and ambers. | Spend a palette slot on a fogged white. |
| R | **The third high road (H3) reads almost as a horizon line.** At that distance perspective flattens every route through it. | Lowered, and distant towers were allowed to grow taller so they break it into pieces. | Bring it nearer, or give it a visible climb (a ramp or spiral interchange). |
| S | **The slit shows only from the right half of the hover range.** From the starting pose the island's east face is seen edge-on, and from the left it faces away. The face nearer the eye than z ≈ 48 is never in the picture at all. From the highest poses the slit is too foreshortened to see into. | L1 was brought into the island about 12 units nearer the bend than before, so its traffic shows along most of the stretch that can be seen (z 28–48; z 12–28 shows the lit lintel and the road curving in). | A second slit on the west face, for the left of the hover range. |
| T | **Racers are small where they fly** (150–280 units from the eye, at the bottom of the fog). In a still picture they can be lost against the lit fog over the deep city; they read by moving. | Lights sized for the distance, a streak of hard light behind each, and less fog for them than they are really in (`fogK`). | A wider additive streak drawn in its own pass, or fewer, larger craft. |
| U | **What shows under the bridge is mostly dark air.** The eye is always above the bridge, and the fog only thickens far down. So from the starting pose the hollow shows only on the left, where the shoulder was. It reads best from the raised and left poses, where the city far below shows through it. | The low traffic is put where the starting pose sees it, on the left. | Faintly lit haze at mid depth in the ravines and under the bridge, like the painting's grey void; that would change the look of every ravine, so try it on its own. |
| V | **Ships cast no moon shadows and receive none.** The shadows are baked into the city's splats once. Ships, lift cars and parked ships are sculpted after that pass, and they move. | Ships are moonlit on the faces that turn toward the moon wherever they are, so a ship passing through a tower's shadow stays lit. Their own hull and engine lights carry them anyway. | Give the page a coarse copy of the moon's depth map (a 512² texture is enough at their size) and test ship splats against it in the vertex shader. Shadows cast by ships onto the city would need a shadow pass every frame. |
| W | **The moon's shadow map covers radius 480 about the bend only** (0.18 units to a texel). Beyond it nothing is shaded, so every moon-facing face of the far skyline is lit, and nothing out there throws a shadow inward. | Out there the haze is thick and the faces are small, so the missing shadows do not show from the hover range. | A second, coarser map out to the far skyline (radius 800), tested only by splats the first one does not cover. |
| X | **The moon never shows.** From every pose it sits at least 90° off the view axis, and the corner of the widest window reaches 68°, so it is always out of frame, as expected. | Its disc and halo are drawn in the sky shader, so a future camera that turns toward it will find it in place. | If it should be seen, lower its elevation or swing it toward −Z (`W.moon`), then rebuild: the shadows move with it. |

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

1. `node build.js` ends with `packed N splats` and no `Error`. N should stay under about 800 k (760 k now). The `moon shadows:` line should report roughly half of the tested splats in shadow; far fewer means the shadow map is missing occluders, far more means its bias is too small. None of these lines should appear:
   - `(a painted ship found no clear lane …)`
   - `(a freighter pack found no clear lane …)`
   - `(a close pass found no clear lane …)`
   - `(a stream of fast ships found no clear lane …)`
2. `node tools/shot.js dist/index.html shots/x "0,0,3;0,1,3;-1,0.3,3;1,0.5,3" 494 738` prints four `pose` lines and no `NEON_ERROR`.
3. Compare the origin pose (`0,0,3`) with the reference. The fisheye shows more than the painting on every side and bows straight edges near the frame's sides; that is expected. You should see:
   - the bend near pixel (275, 258);
   - the megatower with lift cars right of it;
   - the right half empty down to haze, except for the hauler;
   - pipes left of the far highway;
   - the wing ship at the upper left.
4. Corner poses show no black sprites, no holes at silhouettes and no geometry in front of the lens. The steep pose `0,1,3` shows the deep city's street grid through the fog.
5. Run poses `0,0,9;0,0,24.5;0,0,44` at 960×540. They should show the wing ship, the two darts and the liner passing near the highway.
6. Take two frames 0.05 s apart at one pose. They should differ in about 6 % of pixels (6.1 % at `0.25,0.3,2`), nearly all on moving traffic, ships, dust and twinkling stars. Change well above that, or change spread over wall faces, means shimmer is back (row H).
7. Build un-culled with `node build.js --nocull --out dist/nocull/index.html`. At three in-between poses (`0.25,0.3,2;-0.6,0.5,7;0.8,0.2,11`) it should differ from the culled build in under 0.1 % of pixels (0.011–0.031 % now).
8. Pose `1,0,6` at 960×540 shows the slit as a thin lit line along the island's east face under the main highway, with coloured traffic in it.
9. Pose `0.5,0.8,4` at 960×540 shows cyan and pink streaks (racers) over the deep city in the east ravine. `node` and `src/campath.js` can project a lane's position at time t onto the screen when you need to find one.
10. Pose `-1,0.3,15` at 1280×720 with `?art=720` shows the bridge standing over open air, L1 crossing to it, and the convoy in the west ravine below L1. Pose `-0.8,0.6,15` also shows the city far below through the opening. The low ships there should look clearly smaller than ships at road height.
11. `QS=moondbg node tools/shot.js dist/index.html shots/md "0,0,6;0,0.9,6" 960 540` shows the moon's light and shadow. Faces it lights are drawn teal and faces in shadow crimson. You should see:
    - crimson on the highway deck west of the megatower, and on the ravine floors under the east bank;
    - teal on tower tops and east faces;
    - no crimson speckle scattered over teal faces (shadow acne) and no teal islands in the middle of a shadow (light leaking).
12. The sky shows stars above the skyline, fading out toward the horizon, and none in front of anything.
