// Jetline sim - vector and quaternion helpers on plain arrays.
// Vectors are [x, y, z]; quaternions are [x, y, z, w] (Hamilton, same convention as three.js / Unity).
(function (JC) {
  'use strict';
  const M = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    // in place: o += a * s
    axpy: (o, a, s) => { o[0] += a[0] * s; o[1] += a[1] * s; o[2] += a[2] * s; },
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    // Rodrigues rotation of v around unit axis k by angle t
    rotAxis: (v, k, t) => {
      const c = Math.cos(t), s = Math.sin(t), d = M.dot(k, v) * (1 - c), x = M.cross(k, v);
      return [v[0] * c + x[0] * s + k[0] * d, v[1] * c + x[1] * s + k[1] * d, v[2] * c + x[2] * s + k[2] * d];
    },
    qRot: (q, v) => {
      const x = q[0], y = q[1], z = q[2], w = q[3];
      const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    },
    qInvRot: (q, v) => M.qRot([-q[0], -q[1], -q[2], q[3]], v),
    qNorm: (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
    // Hamilton product a * b
    qMul: (a, b) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]],
    // rotation of `angle` around unit `axis`, as a quaternion
    qAxisAngle: (axis, angle) => { const hs = Math.sin(angle / 2); return [axis[0] * hs, axis[1] * hs, axis[2] * hs, Math.cos(angle / 2)]; },
    // one explicit integration step of orientation q with world angular velocity w: q += 0.5 * (w, 0) * q * dt
    qIntegrate: (q, w, dt) => {
      const d = [w[0] * dt * 0.5, w[1] * dt * 0.5, w[2] * dt * 0.5];
      return M.qNorm([
        q[0] + d[0] * q[3] + d[1] * q[2] - d[2] * q[1],
        q[1] - d[0] * q[2] + d[1] * q[3] + d[2] * q[0],
        q[2] + d[0] * q[1] - d[1] * q[0] + d[2] * q[3],
        q[3] - d[0] * q[0] - d[1] * q[1] - d[2] * q[2],
      ]);
    },
    // quaternion from basis: local +X -> cx, +Y -> cy, +Z -> cz (world vectors)
    qFromBasis: (cx, cy, cz) => {
      const m00 = cx[0], m10 = cx[1], m20 = cx[2], m01 = cy[0], m11 = cy[1], m21 = cy[2], m02 = cz[0], m12 = cz[1], m22 = cz[2];
      const tr = m00 + m11 + m22;
      let x, y, z, w;
      if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
      else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
      else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
      else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
      return M.qNorm([x, y, z, w]);
    },
  };
  JC.M = M;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
