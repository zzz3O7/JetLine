// Jetline sim - minimal rigid body: state, force accumulation, integration.
// In a Unity port this whole file is replaced by Rigidbody (AddForceAtPosition, FixedUpdate integration).
(function (JC) {
  'use strict';
  const M = JC.M;

  // Collects forces and torques (about `origin`) for one step.
  class Forces {
    constructor(origin, gravityForce) { this.o = origin; this.F = gravityForce.slice(); this.T = [0, 0, 0]; }
    // force f applied at world point p
    at(f, p) { M.axpy(this.F, f, 1); M.axpy(this.T, M.cross(M.sub(p, this.o), f), 1); }
    // force through the center of mass, scaled
    add(f, s) { M.axpy(this.F, f, s); }
  }

  // Subclasses provide `mass` and `inertiaDiag()` (local pitch / yaw / roll axes).
  class RigidBody {
    setPose(pos, q, vel) { this.pos = pos.slice(); this.q = q.slice(); this.vel = vel; this.w = [0, 0, 0]; }
    get fwd() { return M.qRot(this.q, [0, 0, 1]); }
    get up() { return M.qRot(this.q, [0, 1, 0]); }
    get speed() { return M.len(this.vel); }
    // inverse inertia tensor applied in world space: local X = pitch axis, Y = yaw, Z = roll
    invIw(v) {
      const l = M.qInvRot(this.q, v), I = this.inertiaDiag();
      return M.qRot(this.q, [l[0] / I[0], l[1] / I[1], l[2] / I[2]]);
    }
    // impulse J at offset r from the center; rotScale < 1 damps the rotational part (see collision-proto.js)
    applyImpulse(J, r, rotScale = 1) {
      M.axpy(this.vel, J, 1 / this.mass);
      M.axpy(this.w, this.invIw(M.cross(r, J)), rotScale);
    }
    integrateForces(forces, dt) {
      M.axpy(this.vel, forces.F, dt / this.mass);
      M.axpy(this.w, this.invIw(forces.T), dt);
    }
    integratePose(dt) {
      M.axpy(this.pos, this.vel, dt);
      this.q = M.qIntegrate(this.q, this.w, dt);
    }
    // rotate heading and velocity together around `axis` (used by the loop assist)
    rotateWithVelocity(axis, angle) {
      this.vel = M.rotAxis(this.vel, axis, angle);
      this.q = M.qNorm(M.qMul(M.qAxisAngle(axis, angle), this.q));
    }
  }
  JC.Forces = Forces;
  JC.RigidBody = RigidBody;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
