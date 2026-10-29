// Jetline sim - aerodynamics: drag, ground effect, air brake flaps, flat-plate lift, tail fin.
// Ports directly to Unity as AddForce / AddForceAtPosition calls.
(function (JC) {
  'use strict';
  const M = JC.M;

  JC.Aero = {
    // Adds every aerodynamic force for this step. ctx: { fwd, up, down, vf, speed, grounded }.
    apply(t, car, forces, world, ctx) {
      const { fwd, up, down, vf, speed, grounded } = ctx;
      const pos = car.pos, q = car.q, vel = car.vel, w = car.w;
      const pointVel = (P) => M.add(vel, M.cross(w, M.sub(P, pos)));

      // drag through the center of mass
      forces.add(vel, -t.dragCoef * speed);

      // ground effect: full with wheels down, fades out over a few meters above the road
      // (so crests don't launch the car)
      let prox = grounded >= 2 ? 1 : 0;
      if (!prox && vf > 0) {
        const g = world.raycast(pos, down, 3.5);
        if (g && M.dot(g.n, up) > 0.5) prox = Math.max(0, 1 - (g.t - 0.9) / 2.6);
      }
      if (prox > 0 && vf > 0) {
        const D = prox * (t.downforce + t.airbrakeDownforce * car.flaps) * vf * vf;
        forces.at(M.mul(up, -D / 2), M.add(pos, M.qRot(q, [0, 0, 1.3])));
        forces.at(M.mul(up, -D / 2), M.add(pos, M.qRot(q, [0, 0, -1.3])));
      }

      // air brake flaps: drag at a point behind (and optionally above) the center of mass
      if (car.flaps > 0.01) {
        const P = M.add(pos, M.qRot(q, [0, t.airbrakeHeight, -t.airbrakeArm]));
        const vp = pointVel(P);
        forces.at(M.mul(vp, -t.airbrakeDrag * car.flaps * M.len(vp)), P);
      }

      // flat-plate lift along the car's up axis: the body gives a little, opened air brakes (wings) a lot.
      // Pitch sets the lift, roll turns the flight path.
      {
        const P = M.add(pos, M.qRot(q, [0, 0, t.wingCenter]));
        const vp = pointVel(P);
        const vn = M.dot(vp, up);
        const k = t.bodyLift + t.wingLift * car.flaps;
        car.lift = -k * M.len(vp) * vn;
        forces.at(M.mul(up, car.lift), P);
      }

      // tail fin: resists sideways/vertical airflow at the tail, aligning the nose with the travel direction
      {
        const P = M.add(pos, M.qRot(q, [0, 0.2, -2.0]));
        const vp = pointVel(P);
        const perp = M.sub(vp, M.mul(fwd, M.dot(vp, fwd)));
        forces.at(M.mul(perp, -t.finStability * M.len(vp)), P);
      }
    },
  };
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
