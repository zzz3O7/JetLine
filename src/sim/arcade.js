// Jetline sim - the arcade layer: rules that make the car fun rather than realistic.
// Drift state machine and auto drift, roll / spin / loop assists, air control.
// Ports to Unity as-is (plain math on the Rigidbody's velocity and angular velocity).
(function (JC) {
  'use strict';
  const M = JC.M;
  const ASSIST_SLOPE = 0.07;   // ground normal y range over which assists fade out on slopes
  const STEER_LIMIT_AFTER_DRIFT = 1.0;   // s
  const SWITCH_BUFFER = 0.2;             // s a brake tap during a drift waits for the steering to cross over
  const FRONT_AXLE = JC.Vehicle.WHEELS[0].z, REAR_AXLE = JC.Vehicle.WHEELS[2].z;   // m ahead of the center of mass

  const Arcade = {
    // A short window after touching down from a real jump (not a bump), used to catch sideways landings as drifts.
    updateLanding(t, car, grounded, dt) {
      if (grounded > 0 && car.airTime > t.landingMinAir) car.landTimer = 0.6;
      car.landTimer = Math.max(0, (car.landTimer || 0) - dt);
    },

    // Steering limit: full steering asks for more than the front tires can give at speed, which only scrubs
    // them (understeer) and can tip the car into a slide. This trims the steering angle to at most
    // steerLimit x slipPeak past the direction the front axle is actually moving, so full steering is the
    // tightest grip turn. It only ever reduces steering (never adds countersteer), and is off while
    // drifting (the drift assists own the car then), for STEER_LIMIT_AFTER_DRIFT s after a drift so a flick
    // into the next drift stays the player's, when slow, and in reverse.
    limitSteer(t, car, inp, steerAng, fwd, right, vf) {
      const cont = t.driftModel >= 0.5;
      if (t.steerLimit <= 0 || inp.steerAssist === false || (cont ? car.sideways >= 0.25 : car.drifting) ||
        (!cont && car.sinceDrift < STEER_LIMIT_AFTER_DRIFT) || vf < 5 || steerAng === 0) return steerAng;
      const vF = M.add(car.vel, M.cross(car.w, M.mul(fwd, FRONT_AXLE)));
      const dir = Math.atan2(M.dot(vF, right), Math.max(M.dot(vF, fwd), 4)); // same low-speed floor as the tire model
      let L = t.steerLimit * t.slipPeak;
      if (t.steerLimitRear > 0) {
        // rear tires past their peak in this turn (the tail stepping out): steer less, so the rear can hold
        const vR = M.add(car.vel, M.cross(car.w, M.mul(fwd, REAR_AXLE)));
        const rear = -Math.sign(steerAng) * Math.atan2(M.dot(vR, right), Math.max(M.dot(vR, fwd), 4)) / t.slipPeak;
        L *= Math.max(0, 1 - t.steerLimitRear * Math.max(0, rear - 0.9));
      }
      const limited = steerAng > 0 ? Math.min(steerAng, Math.max(0, dir + L)) : Math.max(steerAng, Math.min(0, dir - L));
      // continuous model: the limit fades out as the car slides, so it never fights a drift
      return cont ? limited + (steerAng - limited) * Math.min(1, 4 * (car.sideways || 0)) : limited;
    },

    // Continuous drift: the front wheel angle. While the car slides, the wheels self-align with the direction
    // the front axle moves in (caster), and the steering range opens up: input is then relative to the motion.
    steerContinuous(t, car, steerAng, inp, fwd, right) {
      const s = car.sideways || 0;
      if (s <= 0) return steerAng;
      const vF = M.add(car.vel, M.cross(car.w, M.mul(fwd, FRONT_AXLE)));
      const dir = Math.atan2(M.dot(vF, right), Math.max(Math.abs(M.dot(vF, fwd)), 4));
      return steerAng + s * (t.driftCaster * dir + (inp.steer || 0) * t.driftSteerRange);
    },

    // Continuous drift: no drift state. The slide factor (0..1) follows the slide angle - effects fade in from
    // slideStart to slideFull and out again past slideSpin, so a spin carries on by its own momentum.
    // car.drifting / driftDir are only derived from it, for the HUD, skid marks, sound and camera.
    updateSlide(t, car, grounded, vf, dt) {
      const fwd = car.fwd, right = M.cross(fwd, car.up);
      const a = Math.abs(Math.atan2(M.dot(car.vel, right), M.dot(car.vel, fwd)));   // 0..pi (pi = backwards)
      const smooth = (x, a0, a1) => { const u = Math.max(0, Math.min(1, (x - a0) / (a1 - a0))); return u * u * (3 - 2 * u); };
      const speedFade = smooth(Math.abs(vf), 4, 9);
      // sideways: how far into a slide the car is (stays 1 through a spin); slide: the drift effects, which fade
      // out again past slideSpin
      car.sideways = grounded >= 2 ? smooth(a, t.slideStart, t.slideFull) * speedFade : 0;
      car.slide = car.sideways * (1 - smooth(a, t.slideSpin, Math.PI / 2));
      const beta = Math.atan2(M.dot(car.vel, right), Math.max(1, Math.abs(vf)));
      car.drifting = car.slide > 0.3;
      if (car.drifting) car.driftDir = -Math.sign(beta);
      car.sinceDrift = car.drifting ? 0 : (car.sinceDrift || 0) + dt;
    },

    // Drift state machine.
    //   start: brake while steering hard at speed (kicks the rear out to driftKick), or with autoDrift on:
    //          landing sideways after a real jump, or a slide past autoDriftAngle that lasts autoDriftHold
    //   during: driftControl 0: steering into the drift widens the angle, steering out narrows it, no input holds it
    //           driftControl 1: the steering amount sets the angle (see groundAssists)
    //   switch: brake tap while steering the other way starts a drift that way (the assists swing the car over)
    //   end:   angle brought back to (almost) straight / steering released, too slow, or airborne
    // car.driftAngle is the held angle in rad (positive = nose pointing into the turn).
    updateDrift(t, car, inp, grounded, vf, beta, dt) {
      const steerIn = inp.steer || 0;
      const start = (dir, angle) => {
        car.drifting = true; car.driftDir = dir; car.driftTimer = 0;
        car.driftAngle = Math.min(t.driftMaxAngle, angle);
      };
      car.sinceDrift = car.drifting ? 0 : (car.sinceDrift || 0) + dt;
      const anyBrake = Math.max(inp.brake || 0, inp.handbrake || 0);
      car.brakeBuf = car.drifting && anyBrake > 0.5 ? SWITCH_BUFFER : Math.max(0, (car.brakeBuf || 0) - dt);
      if (!car.drifting) {
        // how long the car has been sliding past the auto-drift angle (filters out bump spikes)
        car.slideTimer = Math.abs(beta) > t.autoDriftAngle && grounded >= 2 ? (car.slideTimer || 0) + dt : 0;
        if (grounded >= 3 && vf > t.driftMinSpeed && Math.abs(steerIn) > 0.4 && anyBrake > 0.5) {
          const dir = Math.sign(steerIn);
          start(dir, Math.max(t.driftKick, -dir * beta));
        } else if (t.autoDrift >= 0.5 && grounded >= 2 && vf > t.driftMinSpeed * 0.7 && Math.abs(beta) > t.autoDriftAngle && Math.abs(beta) < 1.5) {
          let ny = 0, cnt = 0;
          for (const wh of car.wheels) if (wh.hit) { ny += wh.hit.n[1]; cnt++; }
          ny = cnt ? ny / cnt : 0;
          const steeringIn = Math.abs(steerIn) > 0.3 && Math.sign(steerIn) === -Math.sign(beta);
          if (car.landTimer > 0 && ny > 0.75) {
            // landed sideways: catch it as a drift at the angle it landed with
            start(-Math.sign(beta), Math.abs(beta));
          } else if (steeringIn && grounded >= 3 && vf > t.driftMinSpeed && ny > 0.8 && car.slideTimer >= t.autoDriftHold) {
            // a real slide (not a bump spike) while steering into the turn
            start(-Math.sign(beta), Math.abs(beta));
          }
        }
      } else if (grounded >= 3 && vf > t.driftMinSpeed && car.brakeBuf > 0 && steerIn * car.driftDir < -0.3) {
        // switch: brake tap while steering the other way swings the car straight into a drift that way
        // (the tap is remembered for SWITCH_BUFFER s, so pressing both keys together works on a keyboard)
        car.brakeBuf = 0;
        start(-car.driftDir, 0);
      } else {
        car.driftTimer += dt;
        // a short grace period after the start, so a drift starting nearly straight can be widened
        const exit = t.driftControl >= 0.5
          ? (Math.abs(steerIn) < 0.15 || Math.sign(steerIn) !== car.driftDir) && Math.abs(beta) < 0.16
          : car.driftTimer > 0.25 && car.driftAngle <= t.driftExitAngle;
        if (vf < 9 || car.airTime > 0.35 || exit) car.drifting = false;
      }
    },

    // How drifting changes the tire model (identity values when not drifting).
    tireMods(t, drifting, car) {
      if (t.driftModel >= 0.5) {
        const s = car.slide || 0;
        return { continuous: true, slide: s, rearGripMul: 1 + (t.slideRearGrip - 1) * s };
      }
      return drifting
        ? { rearGripMul: t.driftGrip, brakeMul: 0.2, drivePastGrip: t.driftPower, scrubKeep: t.driftKeep }
        : { rearGripMul: 1, brakeMul: 1, drivePastGrip: null, scrubKeep: 0 };
    },

    // Assists that act while the wheels are down. Returns angular accelerations (rad/s^2) around
    // the car's forward axis (roll) and up axis (yaw). While drifting this also carves the velocity.
    groundAssists(t, car, inp, ctx, dt) {
      const { fwd, up, vf, grounded, beta } = ctx;
      const w = car.w, vel = car.vel;
      let rollAssist = 0, yawAssist = 0;
      let nA = [0, 1, 0];
      if (grounded >= 1) {
        nA = [0, 0, 0];
        for (const wh of car.wheels) if (wh.hit) M.axpy(nA, wh.hit.n, 1);
        nA = M.norm(nA);
      }
      // 1 on flat ground, fading to 0 on slopes steeper than ~25 degrees (ramps, walls)
      const flatness = Math.max(0, Math.min(1, (nA[1] - 0.9) / ASSIST_SLOPE));
      car.flatness = flatness;
      // roll assist: keeps the car flat to the road through bank changes
      if (grounded >= 2 && t.stability > 0) {
        const err = M.dot(M.cross(up, nA), fwd);
        rollAssist = (err * 70 - M.dot(w, fwd) * 9) * t.stability;
      }
      const dBeta = car.prevBeta === undefined ? 0 : (beta - car.prevBeta) / dt;
      if (t.driftModel >= 0.5) {
        // continuous: no angle hold; the carve fades in with the slide (rotating vel toward the nose)
        const s = car.slide || 0;
        if (s > 0) {
          const nv = M.rotAxis(vel, up, beta * t.slideCarve * s * dt);
          vel[0] = nv[0]; vel[1] = nv[1]; vel[2] = nv[2];
        }
        // steering controls how fast the slide angle changes (no target angle): into the slide widens it,
        // nothing relaxes it slowly, countersteer straightens it fast. Fades out past slideSpin (with s).
        if (s > 0 && t.slideControl > 0) {
          const dir = -Math.sign(beta) || 1;                     // +1 = sliding with the nose to the right
          const u = (inp.steer || 0) * dir;                      // > 0 = steering into the slide
          const A = Math.abs(beta);
          const rate = u >= 0 ? u * t.slideRateIn - (1 - u) * t.slideRelax * A : u * t.slideRateOut - t.slideRelax * A;
          yawAssist = (-dir * rate - dBeta) * t.slideControl * s;
        }
      } else if (grounded >= 2 && Math.abs(vf) > 8) {
        if (car.drifting) {
          const k = (inp.steer || 0) * car.driftDir; // > 0 = steering into the drift
          if (t.driftControl >= 0.5) {
            // steering sets the angle: full steering = driftTargetAngle, releasing straightens the car
            car.driftAngle = k > 0.15 ? t.driftTargetAngle * (0.35 + 0.65 * k) : 0;
          } else {
            // the angle is the player's: steering into the drift widens it, steering out narrows it, no input holds it
            car.driftAngle = Math.max(0, Math.min(t.driftMaxAngle, car.driftAngle + k * t.driftSteerRate * dt));
          }
          const target = -car.driftDir * car.driftAngle;
          // countersteering straightens the car faster than just letting go (stiffer, equally damped hold)
          const g = 1 + t.driftRecover * Math.max(0, -k);
          yawAssist = (target - beta) * 22 * g - dBeta * 8 * Math.sqrt(g);
          // carve: turn the velocity toward the nose, so a drift goes round the corner without losing speed
          // (a wider angle turns tighter)
          const nv = M.rotAxis(vel, up, beta * t.driftCarve * dt);
          vel[0] = nv[0]; vel[1] = nv[1]; vel[2] = nv[2];
        } else {
          if (t.spinAssist > 0) {
            // anti-spin: past ~8 degrees of slide, nudge the nose toward the direction of travel (flat ground only)
            const ex = Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.14);
            yawAssist = -ex * 14 * t.spinAssist * flatness;
          }
          if (t.driftCatch > 0 && car.sinceDrift < t.driftCatch) {
            // catch after a drift: the car comes out of a drift rotating; damp that swing for a moment (fading
            // out), so a countersteered exit settles straight instead of throwing the car into the opposite slide
            const f = (1 - car.sinceDrift / t.driftCatch) * flatness;
            yawAssist += (-beta * 12 - dBeta * 8) * f;
          }
        }
      }
      return { rollAssist, yawAssist };
    },

    // Loops are skewed sideways (exit beside the entry): optionally turn heading and velocity along them.
    loopAssist(t, car, loopDir, grounded, fwd, up, dt) {
      if (!loopDir || grounded < 2 || t.loopAssist <= 0) return;
      const err = Math.asin(Math.max(-1, Math.min(1, M.dot(M.cross(fwd, loopDir), up))));
      car.rotateWithVelocity(up, err * Math.min(1, dt * 25) * t.loopAssist);
    },

    // In the air: pitch / roll (/ yaw) control through the air brake flaps, plus angular damping.
    airControl(t, car, inp, grounded, fwd, up, right, dt) {
      const w = car.w;
      if (grounded === 0) {
        car.airTime += dt;
        if (!car.bodyContact) {
          // control comes from the air brake flaps, or from the jet while it is actually firing
          const ctl = t.airControlBase + (1 - t.airControlBase) * Math.max(car.flaps, t.jetAirControl * car.jetLevel);
          M.axpy(w, right, (inp.pitch || 0) * t.airPitch * ctl * dt);
          M.axpy(w, up, -(inp.steer || 0) * t.airYaw * ctl * dt);
          const rollIn = Math.max(-1, Math.min(1, (inp.roll || 0) + (t.airYaw > 0 ? 0 : (inp.steer || 0))));
          M.axpy(w, fwd, rollIn * t.airRoll * ctl * dt);
        }
        const k = Math.max(0, 1 - t.airDamping * dt);
        w[0] *= k; w[1] *= k; w[2] *= k;
      } else car.airTime = 0;
    },
  };
  JC.Arcade = Arcade;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
