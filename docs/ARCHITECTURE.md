# Jetline architecture

A browser prototype of a jet-car stunt racer. The simulation runs headless (Node tests) and in the page;
rendering, input and UI are a separate layer on top.

## Layers

| File | Layer | What it does | In a Unity port |
|---|---|---|---|
| `src/sim/math.js` | engine | vectors and quaternions on plain arrays | `Vector3`, `Quaternion` |
| `src/sim/rigidbody.js` | engine | body state, force accumulation, integration | **replaced** by `Rigidbody` |
| `src/sim/collision-proto.js` | engine, **prototype** | body-vs-track contacts from sampled hull points | **deleted**: car collider + PhysX |
| `src/track/world.js` | engine, **prototype** | raycasts and point queries against track boxes | **deleted**: `MeshCollider` + `Physics.Raycast` |
| `src/sim/vehicle.js` | vehicle | raycast wheels, suspension, tires, engine and brakes, jet and fuel | ports: `AddForceAtPosition` in `FixedUpdate` |
| `src/sim/aero.js` | vehicle | drag, ground effect, air brake flaps, flat-plate lift, tail fin | ports as is |
| `src/sim/arcade.js` | gameplay | drift state machine, auto drift, roll / anti-spin / loop assists, air control | ports as is |
| `src/sim/car.js` | glue | runs the layers in a fixed order each step | `CarController.FixedUpdate` |
| `src/sim/tuning.js` | data | every tunable number, grouped by layer | a `ScriptableObject` |
| `src/track/geometry.js` | content | level piece list → oriented boxes, gates, centerline | mesh generator (visual + collider) |
| `src/track/race.js` | gameplay | gates, timing, splits, respawn | ports as is |
| `src/levels.js` | content | Sky Strip and Skate Park | ports as is (data) |
| `src/game.js` | presentation | three.js scene, camera, input, HUD, tuning panel, skid marks, ghost, sound | rewritten with Unity's own systems |

Rule of thumb: the **vehicle** and **gameplay** layers are the game's feel and are worth porting line by line.
The **engine** layer exists only because a browser has no physics engine.

## One physics step (240 Hz)

`Car.step()` in `src/sim/car.js`:

1. **sense** – cast the four wheel rays (`Vehicle.senseWheels`)
2. **arcade state** – landing window, sideways slide angle, drift state machine (`Arcade.updateLanding`, `Arcade.updateDrift`)
3. **wheels** – suspension force, then tire force, per wheel (`Vehicle.suspensionForce`, `Vehicle.tireForce`).
   Drifting changes the tires only through a small modifier object (`Arcade.tireMods`); with identity values the tire model is plain physics.
4. **assists** – roll assist, anti-spin assist, drift angle hold and carve (`Arcade.groundAssists`)
5. **jet** – thrust and fuel (`Vehicle.jet`)
6. **aero** – flaps follow input, then all aerodynamic forces (`Aero.apply`)
7. **integrate** – forces into velocities, then assist torques, loop assist, air control, then position and orientation
8. **contacts** – body vs track (`resolveBodyContacts`, prototype)

The order matters and is kept exactly; the regression tests detect any change.

## Known plugs (all in the prototype collision layer)

`collision-proto.js` solves contacts one point at a time, with no solver iterations. Three constants
compensate for that, and are labelled `PLUG` in `JC.protoCollision`:

- `contactRotation` (0.7): contact impulses create less rotation than physics says, so clipped corners don't spin the car.
- `maxLaunch` (0.5 m/s): the contacts of one step may stop the car, never launch it.
- `maxSpin` (14 rad/s): angular speed cap. Unity has this built in (`Rigidbody.maxAngularVelocity`).

Two limits in the vehicle layer are deliberate design rather than plugs:
`MAX_WHEEL_LOAD` (a wheel never pushes more than 8 car weights: a bump stop) and
`GRIP_LOAD_CAP` (grip stops growing above 2.5 car weights, so hard landings don't add absurd grip).

## Porting notes for Unity

- **Wheels:** keep the custom raycast wheels from `vehicle.js`. Don't use `WheelCollider`; its friction model is hard to make feel arcade.
- **Forces:** each `forces.at(f, p)` becomes `rb.AddForceAtPosition(f, p)`; `forces.add(f, s)` becomes `rb.AddForce(f * s)`. Gravity comes from Unity.
- **Direct velocity edits** (drift carve, loop assist, air control, air damping) set `rb.velocity` / `rb.angularVelocity` directly, inside `FixedUpdate`, in the same order.
- **Inertia:** set `rb.inertiaTensor` to `Car.inertiaDiag()` (local X = pitch, Y = yaw, Z = roll) with `inertiaTensorRotation = identity`.
- **Handedness:** this code is right-handed with car local +Z forward, +Y up, **+X left**. Unity is left-handed with +X right. Convert by mirroring X: positions `(x, y, z) → (-x, y, z)`, quaternions `(x, y, z, w) → (x, -y, -z, w)`. Cross products flip sign, so `right = cross(fwd, up)` here is `Vector3.Cross(up, fwd)` in Unity. Better: port the formulas, not the numbers, and re-derive each cross product in Unity's convention.
- **Track:** `buildGeometry()` already produces the boxes; generate one mesh per road chain from them (the ribbon builder in `game.js` shows how) and use it for both rendering and a `MeshCollider`. Solid `block` boxes become `BoxCollider`s.
- **Timestep:** set `Time.fixedDeltaTime = 1/240` at first to match, then try lower once it feels the same.

## Tests

```
node build.js        # builds dist/jetline.html
./test/all.sh        # runs every behavior test
./test/all.sh | diff - test/baseline/all.txt    # empty output = behavior unchanged
```

`test/golden.js` drives both levels through scripted and random input and prints full-precision state every
second. A pure refactor must reproduce `test/baseline/all.txt` exactly; an intended behavior change shows up
as a diff, and the baseline is then re-recorded on purpose:

```
./test/all.sh > test/baseline/all.txt
```

Other tests measure specific behavior: `spin.js` (slides and spin-outs), `drift.js` and `autodrift.js`,
`landing*.js` (bounce and drift on landings), `edges.js` (ramp edge hits), `flip3.js` (air rotation vs speed),
`fly.js` (gliding and flight), `park.js` (skate park features), `loopnoassist.js`, `simvar.js` (an autopilot
finishes Sky Strip), `fuzz.js` (random input: no NaNs, no tunneling).

GitHub Actions (`.github/workflows/test.yml`) runs the same check on every pull request. It pins Node 22,
because the baseline is full precision and a different JavaScript engine could round `Math.sin` and friends
differently in the last bits; if a Node upgrade ever makes the check fail with no code change, re-record the baseline.
