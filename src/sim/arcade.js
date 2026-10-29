// Jetline sim - the arcade layer: rules that make the car fun rather than realistic.
// Drift state machine and auto drift, roll / spin / loop assists, air control.
// Ports to Unity as-is (plain math on the Rigidbody's velocity and angular velocity).
(function (JC) {
  'use strict';
  const M = JC.M;
  const ASSIST_SLOPE = 0.07;   // ground normal y range over which assists fade out on slopes

  const Arcade = {
    // A short window after touching down from a real jump (not a bump), used to catch sideways landings as drifts.
    updateLanding(t, car, grounded, dt) {
      if (grounded > 0 && car.airTime > t.landingMinAir) car.landTimer = 0.6;
      car.landTimer = Math.max(0, (car.landTimer || 0) - dt);
    },

    // Drift state machine.
    //   start: brake while steering hard at speed (kicks the rear out to driftKick), or with autoDrift on:
    //          landing sideways after a real jump, or a slide past autoDriftAngle that lasts autoDriftHold
    //   during: the drift angle is yours: steering into the drift widens it, steering out narrows it,
    //          no input holds it (see groundAssists)
    //   end:   angle brought back to (almost) straight, too slow, or airborne
    // car.driftAngle is the held angle in rad (positive = nose pointing into the turn).
    updateDrift(t, car, inp, grounded, vf, beta, dt) {
      const steerIn = inp.steer || 0;
      const start = (dir, angle) => {
        car.drifting = true; car.driftDir = dir; car.driftTimer = 0;
        car.driftAngle = Math.min(t.driftMaxAngle, angle);
      };
      if (!car.drifting) {
        // how long the car has been sliding past the auto-drift angle (filters out bump spikes)
        car.slideTimer = Math.abs(beta) > t.autoDriftAngle && grounded >= 2 ? (car.slideTimer || 0) + dt : 0;
        if (grounded >= 3 && vf > t.driftMinSpeed && Math.abs(steerIn) > 0.4 && inp.brake > 0.5) {
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
      } else {
        car.driftTimer += dt;
        if (vf < 9 || car.airTime > 0.35 || car.driftAngle <= t.driftExitAngle) car.drifting = false;
      }
    },

    // How drifting changes the tire model (identity values when not drifting).
    tireMods(t, drifting) {
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
      if (grounded >= 2 && Math.abs(vf) > 8) {
        if (car.drifting) {
          // the angle is the player's: steering into the drift widens it, steering out narrows it, no input holds it
          const k = (inp.steer || 0) * car.driftDir;
          car.driftAngle = Math.max(0, Math.min(t.driftMaxAngle, car.driftAngle + k * t.driftSteerRate * dt));
          const target = -car.driftDir * car.driftAngle;
          const dBeta = car.prevBeta === undefined ? 0 : (beta - car.prevBeta) / dt;
          yawAssist = (target - beta) * 22 - dBeta * 8;
          // carve: turn the velocity toward the nose, so a drift goes round the corner without losing speed
          // (a wider angle turns tighter)
          const nv = M.rotAxis(vel, up, beta * t.driftCarve * dt);
          vel[0] = nv[0]; vel[1] = nv[1]; vel[2] = nv[2];
        } else if (t.spinAssist > 0) {
          // anti-spin: past ~8 degrees of slide, nudge the nose toward the direction of travel (flat ground only)
          const ex = Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.14);
          yawAssist = -ex * 14 * t.spinAssist * flatness;
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
          // the control surfaces are the air brake flaps: no flaps, (almost) no control
          const ctl = t.airControlBase + (1 - t.airControlBase) * car.flaps;
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
