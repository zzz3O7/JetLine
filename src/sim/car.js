// Jetline sim - the car: a rigid body stepped through the layers in a fixed order.
//
//   1. sense      raycast wheels                          (vehicle.js)
//   2. arcade     landing window, drift state             (arcade.js)
//   3. wheels     suspension + tire forces                (vehicle.js, drift changes tires via arcade mods)
//   4. assists    roll / anti-spin / drift hold + carve   (arcade.js)
//   5. jet        thrust and fuel                         (vehicle.js)
//   6. aero       drag, ground effect, flaps, lift, fin   (aero.js)
//   7. integrate  forces, then assists, loop assist, air control, then pose   (rigidbody.js, arcade.js)
//   8. contacts   body vs track                           (collision-proto.js, PROTOTYPE stand-in)
(function (JC) {
  'use strict';
  const M = JC.M, V = JC.Vehicle, A = JC.Arcade;

  class Car extends JC.RigidBody {
    constructor(tuning) {
      super();
      this.t = tuning;
      this.wheels = V.WHEELS.map((w) => ({ ...w, comp: 0, prevComp: 0, contact: false, spin: 0, steer: 0 }));
      this.reset([0, 1, 0], [0, 0, 0, 1], 0);
    }
    get mass() { return this.t.mass; }
    // box-shaped body, 1.8 x 0.7 x 4.2 m; roll inertia raised 1.5x so the car is less tippy
    inertiaDiag() {
      const m = this.t.mass;
      return [m / 12 * (0.49 + 17.6), m / 12 * (3.24 + 17.6), m / 12 * (3.24 + 0.49) * 1.5];
    }
    reset(pos, q, speed) {
      this.setPose(pos, q, M.mul(M.qRot(q, [0, 0, 1]), speed || 0));
      for (const w of this.wheels) { w.comp = w.prevComp = 0; w.contact = false; }
      this.grounded = 0; this.bodyContact = false; this.airTime = 0; this.flaps = 0; this.jetLevel = 0;
      this.fuel = 1; this.hullPrev = null; this.drifting = false; this.driftTimer = 0; this.driftDir = 0;
      this.driftAngle = 0; this.slideTimer = 0; this.landTimer = 0;
    }

    step(dt, inp, world) {
      const t = this.t;
      const pos = this.pos, vel = this.vel, w = this.w;
      const fwd = this.fwd, up = this.up, right = M.cross(fwd, up), down = M.mul(up, -1);
      const forces = new JC.Forces(pos, [0, -t.gravity * this.mass, 0]);
      const vf = M.dot(vel, fwd);
      const speed = M.len(vel);
      const steerAng = (inp.steer || 0) * t.steerMax / (1 + Math.abs(vf) * t.steerFalloff);
      const rayLen = t.suspTravel + t.wheelRadius;

      // 1. sense
      for (const wh of this.wheels) wh.steer = wh.front ? steerAng : 0;
      const { grounded, loopDir } = V.senseWheels(this, world, rayLen, down, up);

      // 2. arcade state
      A.updateLanding(t, this, grounded, dt);
      const beta = Math.atan2(M.dot(vel, right), Math.max(1, Math.abs(vf))); // sideways slide angle
      this.prevBeta = this.slip; this.slip = beta;
      A.updateDrift(t, this, inp, grounded, vf, beta, dt);
      const mods = A.tireMods(t, this.drifting);

      // 3. wheel forces
      const tireCtx = { fwd, right, down, steerAng, vf, speed };
      for (let i = 0; i < 4; i++) {
        const wh = this.wheels[i];
        if (!wh.hit) continue;
        const fs = V.suspensionForce(t, this, wh, this.wheels[i ^ 1], up);
        forces.at(M.mul(up, fs), wh.mount);
        const tire = V.tireForce(t, this, wh, tireCtx, mods, inp, fs);
        forces.at(tire.force, wh.mount); // at mount height, which keeps the car from tipping over
        wh.spin += tire.vl * dt / t.wheelRadius;
        wh.cp = tire.cpt; wh.n = tire.n; wh.slipV = tire.vs; wh.longV = tire.vl; wh.slip = tire.slip; wh.brakeOn = inp.brake > 0.5 && vf > 3;
      }
      this.grounded = grounded;
      this.inLoop = !!loopDir;

      // 4. assists (and the drift carve, which turns `vel` in place)
      const { rollAssist, yawAssist } = A.groundAssists(t, this, inp, { fwd, up, vf, grounded, beta }, dt);

      // 5. jet
      const thrust = V.jet(t, this, inp, grounded, fwd, dt);
      if (thrust) forces.at(thrust, pos);

      // 6. aero
      this.flaps += ((inp.airbrake ? 1 : 0) - this.flaps) * Math.min(1, dt * 10);
      JC.Aero.apply(t, this, forces, world, { fwd, up, down, vf, speed, grounded });

      // 7. integrate
      this.integrateForces(forces, dt);
      if (rollAssist) M.axpy(w, fwd, rollAssist * dt);
      if (yawAssist) M.axpy(w, up, yawAssist * dt);
      A.loopAssist(t, this, loopDir, grounded, fwd, up, dt);
      A.airControl(t, this, inp, grounded, fwd, up, right, dt);
      this.integratePose(dt);

      // 8. contacts
      this.bodyContact = JC.resolveBodyContacts(this, world);
    }
  }
  Car.WHEELS = V.WHEELS; Car.MOUNT_Y = V.MOUNT_Y;
  JC.Car = Car;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
