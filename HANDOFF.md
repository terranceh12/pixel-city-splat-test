# Handoff: small tasks for Claude Opus 5.5

These are the jobs left over from revision 2 (ravines, cliffs, freighters, lifts) that need no new design: each names
its file, the function to touch, what to change, and how to tell it worked. Harder open issues stay in `DEFERRED.md`
(read its section 2, "Rules the build relies on", before editing anything).

## Before you start

- Build: `node build.js --quick` (13 s, coarse culling) while iterating, `node build.js` (44 s) before committing.
  The toolkit checkout must be at `../siliconjungle/shapeshift-labs-ink-studio`, or pass `--toolkit <path>`.
- Look: `node tools/shot.js dist/index.html shots/x "0,0,3;0,1,3;-1,0.3,3;1,0.5,3" 494 738` writes `shots/x-0.png` … `x-3.png`.
  A pose is `mx,my,t`: hover position in −1…1 and the scene time in seconds. Frames take about 10 s each in the headless software renderer.
- A build must end with `packed N splats` (N under about 700 k), no `Error`, and none of these lines:
  `a painted ship found no clear lane`, `a freighter pack found no clear lane`.
- Palette indices are used as bare numbers. Do not reorder `src/palette.js`.
- Do one task at a time, rebuild, look at the origin pose (`0,0,3`) and one other pose, then commit.

## Tasks

### 1. Measure the frame rate on a real GPU (5 minutes, needs a person or a machine with a GPU)
Open `dist/index.html?debug` in Chrome on the target machine. The top-right readout shows fps and splats drawn.
- If 55 fps or more: record the number in `DEFERRED.md` row A and stop.
- If less: in `src/scene/parts.js` raise `WALL_PX` from 4 to 5 and, in `cliff()`, `px: 5` to `6`; rebuild; measure again; record both numbers.
Check: the readout, and the origin pose still shows window lights on the far towers.

### 2. Calm the gold patch under the fog
From steep poses (`0.5,1,100`) the glow under the fog is a flat gold shape.
- `build.js`, `W.meta.look.warm`: try `[0.36, 0.25, 0.06]`.
- `src/host/shaders.js`, `skyFS`: the factor `pow(-d.y, 3.0) * 1.15`; try `* 0.95`.
Check: at `0.5,1,100` the patch is mostly palette 21 (dark amber) with 22 at its centre and no 23; at `0,0,3` the megatower's foot still shows a warm tint.

### 3. Park ships on the landing courts and in the ports
Nothing is parked anywhere. Templates can already be drawn standing still: a lift car is a `meta.ships` entry the page places without a lane.
- `src/host/main.js`, in the `ships` map: next to the `if (s.lift)` branch add `if (s.park)`: build `M` the same way from `s.x, s.y, s.z, s.yaw, s.sc`, return the same object with `on: true, fade: 0, cycle: 1`. In `placeShips` add `if (s.park) continue;`.
- `src/scene/city.js`: in `shoulder.forEach(...)` (the sunken courts) push `{ tpl: 'dart', park: 1, x: -9.6, y: b.top + 0.45, z: b.z, yaw: 1.2 * k, sc: 1.2 }` into `lifts` for every second court, and a `'tug'` on another. (`lifts` is concatenated into `meta.ships`.)
- A parked ship's engines should be off: the simplest way is a second template. In `src/scene/ships.js` wrap the `engine(...)` calls of `dart` and `tug` in `if (!cold)` and register `'dart-cold'` / `'tug-cold'` by calling `template` twice.
Check: pose `-0.9,0.6,40` shows small craft sitting on the lit courts left of the highway, with no plume.

### 4. More freighter liveries and one more pack
- `src/scene/ships.js`, `'freighter'`: the container ramps come from `ramps[...]`; add a second template `'freighter-b'` with the list rotated and the bridge at the stern (`z` of the two cab boxes negated). Add it to `SHIP` in `src/scene/lanes.js` with the same numbers as `freighter`.
- `src/scene/lanes.js`, the `packs` array: add one pack of three (`freighter-b`, `tanker`, `tug`) in the north-east arm: `{ x: [34, 68], y: [-66, -60], z: [-110, -40], head: 0, fan: 0.15, len: 110 }`.
Check: no `found no clear lane` line; `dist/meta.json` has 7 packs (`ships.filter(s => s.pack)` grows by 3).

### 5. Lift cars: stop at floors
`src/host/main.js`, `placeShips`, the `s.lift` branch. The car eases bottom to top in one go.
Replace the single ease with 3 stops: split `e` into three equal legs, ease each, hold 4 % of the period between legs.
Check: two frames `0,0,20` and `0,0,21` show at least one car that has not moved, and none has jumped.

### 6. Underside of the floor above a cut-through hall
`src/scene/parts.js`, `towerCut`: the `tower(...)` call that builds the segment above a hall. `tower` hands boxes to `W.box`, which lays an under-face only when given `bottom: true`. Add an `under` option to `tower` that is passed to `W.box` as `bottom`, and set it from `towerCut` for every segment but the lowest.
Check: splat count rises by under 5 k; pose `0.6,-1,5` shows no hall open to the sky.

### 7. Keep the repository in step
After any of the above: copy `build.js`, `src/`, `tools/`, `DEFERRED.md`, `HANDOFF.md` and `dist/index.html` into the `pixel-city-splat-test` checkout, tick the task off in this file, commit with a one-line message naming the task, push to `main`.

## Not for this list (needs design; see DEFERRED.md)
Frame-rate work beyond task 1 (row A), better occlusion culling (B), a wider downward hover (C), curved ship lanes (D, E), a ground under the city (M), interiors for the road halls (N).
