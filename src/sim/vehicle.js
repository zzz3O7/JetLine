// Jetline sim - the vehicle model: raycast wheels, suspension, tires, engine/brakes, jet.
// Ports directly to Unity: raycasts become Physics.Raycast, forces become Rigidbody.AddForceAtPosition.
(function (JC) {
  'use strict';
  const M = JC.M;

  // Car local frame: +Z forward, +Y up, +X left; "right" = cross(fwd, up).
  const WHEELS = [
    { x: 0.85, z: 1.35, front: true },
    { x: -0.85, z: 1.35, front: true },
    { x: 0.85, z: -1.3, front: false },
    { x: -0.85, z: -1.3, front: false },
  ];
  const MOUNT_Y = -0.15;          // suspension mount height relative to the center of mass
  const MAX_WHEEL_LOAD = 8;       // a single wheel never pushes harder than this many car weights (bump stop limit)
  const GRIP_LOAD_CAP = 2.5;      // tire grip stops growing above this many car weights of load (hard landings)

  const Vehicle = {
    WHEELS, MOUNT_Y,

    // Cast every wheel's ray. Fills wheel.mount / hit / comp / contact; returns how many wheels touch
    // and the direction of a loop segment under the car, if any.
    senseWheels(car, world, rayLen, down, up) {
      let grounded = 0, loopDir = null;
      for (const wh of car.wheels) {
        wh.mount = M.add(car.pos, M.qRot(car.q, [wh.x, MOUNT_Y, wh.z]));
        const hit = world.raycast(wh.mount, down, rayLen);
        if (!hit || M.dot(hit.n, up) < 0.3) { wh.hit = null; wh.contact = false; wh.comp = 0; wh.prevComp = 0; continue; }
        wh.hit = hit; wh.contact = true;
        grounded++;
        if (hit.box && hit.box.kind === 'loop') loopDir = hit.box.ax[2];
        wh.comp = rayLen - hit.t;
      }
      return { grounded, loopDir };
    },

    // Suspension force along the car's up axis for one wheel.
    suspensionForce(t, car, wh, other, up) {
      // compression speed from how fast the car moves toward the road at this wheel
      // (a finite difference of `comp` explodes when a wheel suddenly lands on a raised edge)
      const mv = M.add(car.vel, M.cross(car.w, M.sub(wh.mount, car.pos)));
      const compVel = Math.max(-40, Math.min(40, -M.dot(mv, up) * Math.max(0, M.dot(wh.hit.n, up))));
      const comp = wh.comp;
      wh.prevComp = comp;
      // dampers: firmer on extension (rebound) so landings don't bounce the car back up
      let fs = t.springK * comp + t.damperC * compVel * (compVel < 0 ? t.reboundDamping : 1);
      // bump stop: the last 20% of travel is much stiffer and soaks up energy
      const bump = t.suspTravel * 0.8;
      if (comp > bump) fs += t.springK * 8 * (comp - bump) + (compVel > 0 ? t.damperC * 6 * compVel : 0);
      fs += t.antiRoll * (comp - other.comp); // anti-roll bar (the other side reads 0 when in the air)
      if (fs < 0) fs = 0;
      const cap = car.mass * t.gravity * MAX_WHEEL_LOAD;
      if (fs > cap) fs = cap;
      return fs;
    },

    // Tire force for one wheel. `mods` comes from the arcade layer (drift); identity values = plain physics:
    //   rearGripMul (1), brakeMul (1), drivePastGrip (null = drive obeys grip), scrubKeep (0).
    //   Continuous drift (mods.continuous): grip falls past the peak slip angle, and drive, brakes and the
    //   handbrake take their share of grip first (cornering gets what is left); mods.slide (0..1) blends the
    //   drift effects in, see tireForceContinuous.
    tireForce(t, car, wh, ctx, mods, inp, load) {
      if (mods.continuous) return Vehicle.tireForceContinuous(t, car, wh, ctx, mods, inp, load);
      const { fwd, right, down, steerAng, vf, speed } = ctx;
      const n = wh.hit.n;
      let wf = wh.front ? M.add(M.mul(fwd, Math.cos(steerAng)), M.mul(right, Math.sin(steerAng))) : fwd;
      wf = M.norm(M.sub(wf, M.mul(n, M.dot(wf, n))));
      const side = M.cross(wf, n);
      const cpt = M.add(wh.mount, M.mul(down, wh.hit.t));
      const vp = M.add(car.vel, M.cross(car.w, M.sub(cpt, car.pos)));
      const vl = M.dot(vp, wf), vs = M.dot(vp, side);
      const gripLoad = Math.min(load, car.mass * t.gravity * GRIP_LOAD_CAP);
      const fmax = t.grip * gripLoad * (wh.front ? 1 : t.rearGrip * mods.rearGripMul);
      // lateral force from slip angle: linear up to slipPeak, then saturated; low speeds blended
      const alpha = Math.atan2(vs, Math.max(Math.abs(vl), 4));
      const fLat = -fmax * Math.max(-1, Math.min(1, alpha / t.slipPeak));
      let fLong = -vl * t.rollRes;
      const drive = !wh.front && inp.throttle > 0 ? inp.throttle * t.engineForce * 0.5 * Math.max(0, 1 - vl / t.engineTopSpeed) : 0;
      if (mods.drivePastGrip === null) fLong += drive;
      if (inp.brake > 0) {
        if (vf > 1.0) fLong -= inp.brake * mods.brakeMul * t.brakeForce * (wh.front ? 0.3 : 0.2) * Math.tanh(vl / 0.5);
        else if (!wh.front) fLong -= inp.brake * t.reverseForce * 0.5 * Math.max(0, 1 + vl / 12);
      }
      // cornering grip has priority; drive and brakes get what is left (at least 35%)
      const longMax = Math.max(0.35 * fmax, Math.sqrt(Math.max(0, fmax * fmax - fLat * fLat)));
      fLong = Math.max(-longMax, Math.min(longMax, fLong));
      if (mods.drivePastGrip !== null) fLong += drive * mods.drivePastGrip;
      let force = M.add(M.mul(side, fLat), M.mul(wf, fLong));
      if (mods.scrubKeep > 0 && speed > 1) {
        // drop most of the tire scrub that would slow the car
        const vd = M.mul(car.vel, 1 / speed), fa = M.dot(force, vd);
        if (fa < 0) force = M.sub(force, M.mul(vd, fa * mods.scrubKeep));
      }
      if (inp.handbrake > 0 && !wh.front) {
        // handbrake: rear wheels only, never reverses, and not softened by drifting (holding it slows a drift)
        force = M.add(force, M.mul(wf, -inp.handbrake * t.handbrakeForce * 0.5 * Math.tanh(vl / 0.5)));
      }
      return { force, cpt, n, vl, vs, slip: alpha / t.slipPeak };
    },

    // Continuous-drift tire: one model for gripping and sliding.
    tireForceContinuous(t, car, wh, ctx, mods, inp, load) {
      const { fwd, right, down, steerAng, vf, speed } = ctx;
      const n = wh.hit.n, s = mods.slide;
      let wf = wh.front ? M.add(M.mul(fwd, Math.cos(steerAng)), M.mul(right, Math.sin(steerAng))) : fwd;
      wf = M.norm(M.sub(wf, M.mul(n, M.dot(wf, n))));
      const side = M.cross(wf, n);
      const cpt = M.add(wh.mount, M.mul(down, wh.hit.t));
      const vp = M.add(car.vel, M.cross(car.w, M.sub(cpt, car.pos)));
      const vl = M.dot(vp, wf), vs = M.dot(vp, side);
      const gripLoad = Math.min(load, car.mass * t.gravity * GRIP_LOAD_CAP);
      const fmax = t.grip * gripLoad * (wh.front ? 1 : t.rearGrip * mods.rearGripMul);
      const alpha = Math.atan2(vs, Math.max(Math.abs(vl), 4));
      // lateral curve: linear up to the peak, then grip falls toward tireSlideGrip as the tire slides further
      const r = Math.abs(alpha) / t.slipPeak;
      const shape = r <= 1 ? r : Math.max(t.tireSlideGrip, 1 - (1 - t.tireSlideGrip) * (r - 1) / t.tireSlideRange);
      // longitudinal demand first: rolling resistance, the grip-bound part of the drive, brakes, handbrake
      const drive = !wh.front && inp.throttle > 0 ? inp.throttle * t.engineForce * 0.5 * Math.max(0, 1 - vl / t.engineTopSpeed) : 0;
      // the engine always uses rear grip (power oversteer); while sliding it pushes harder (drift power)
      let fLong = -vl * t.rollRes + drive * (1 + (t.slidePower - 1) * s);
      if (inp.brake > 0) {
        if (vf > 1.0) fLong -= inp.brake * t.brakeForce * (wh.front ? 0.3 : 0.2) * Math.tanh(vl / 0.5);
        else if (!wh.front) fLong -= inp.brake * t.reverseForce * 0.5 * Math.max(0, 1 + vl / 12);
      }
      if (inp.handbrake > 0 && !wh.front) {
        const hb = inp.handbrake * t.handbrakeForce * 0.5;
        if (hb >= fmax * t.tireSlideGrip && Math.hypot(vl, vs) > 1) {
          // locked wheel: it slides, and its friction opposes the sliding direction (almost no cornering grip)
          const vsl = Math.hypot(vl, vs), f = fmax * t.tireSlideGrip;
          return { force: M.add(M.mul(wf, -f * vl / vsl), M.mul(side, -f * vs / vsl)), cpt, n, vl, vs, slip: alpha / t.slipPeak };
        }
        fLong -= hb * Math.tanh(vl / 0.5);
      }
      fLong = Math.max(-fmax, Math.min(fmax, fLong));
      // cornering gets the grip that is left (friction circle)
      const latMax = Math.sqrt(Math.max(0, fmax * fmax - fLong * fLong));
      const fLat = -Math.sign(alpha) * Math.min(latMax, fmax * shape);
      let force = M.add(M.mul(side, fLat), M.mul(wf, fLong));
      if (s > 0 && speed > 1) {
        // while sliding, most of the scrub that would slow the car is dropped (drifts keep their speed)
        const vd = M.mul(car.vel, 1 / speed), fa = M.dot(force, vd);
        if (fa < 0) force = M.sub(force, M.mul(vd, fa * t.driftKeep * s));
      }
      return { force, cpt, n, vl, vs, slip: alpha / t.slipPeak };
    },

    // Jet thrust along the nose, with optional fuel. Returns the thrust force (or null).
    jet(t, car, inp, grounded, fwd, dt) {
      const unlimited = t.jetUnlimited >= 0.5;
      const on = inp.jet && (unlimited || car.fuel > 0) ? 1 : 0;
      if (on && !unlimited) car.fuel = Math.max(0, car.fuel - dt / t.jetCapacity);
      else if (!inp.jet && grounded >= 2) car.fuel = Math.min(1, car.fuel + dt / t.jetRecharge);
      if (unlimited) car.fuel = 1;
      car.jetLevel += (on - car.jetLevel) * Math.min(1, dt * 12);
      return on ? M.mul(fwd, t.jetThrust) : null;
    },
  };
  JC.Vehicle = Vehicle;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
