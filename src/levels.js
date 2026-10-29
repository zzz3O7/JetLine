// Jetline - level definitions (see track/geometry.js for the piece format)
(function (JC) {
  'use strict';

  // ---------- helpers for building ramps ----------
  const D = Math.PI / 180;
  // a ramp that changes height by h (up if > 0) with slope `deg`, ending level again
  function ramp(h, deg, curve = 5) {
    const th = deg * D, rc = (curve / th) * (1 - Math.cos(th)), sg = Math.sign(h);
    const mid = Math.max(0, (Math.abs(h) - 2 * rc) / Math.sin(th));
    return [{ c: curve, pitch: sg * deg }, { s: mid }, { c: curve, pitch: -sg * deg }];
  }
  // a kicker: curves up to `deg` and keeps going straight for `lip` meters (ends pitched up)
  const kicker = (deg, curve, lip) => [{ c: curve, pitch: deg }, { s: lip }];
  const kickerHeight = (deg, curve, lip) => (curve / (deg * D)) * (1 - Math.cos(deg * D)) + lip * Math.sin(deg * D);
  // landing that starts pitched down at `deg` (after a gap) and drops h to level ground
  function landing(h, deg, curve = 6) {
    const th = deg * D, rc = (curve / th) * (1 - Math.cos(th));
    return [{ s: Math.max(0, (h - rc) / Math.sin(th)) }, { c: curve, pitch: deg }];
  }

  // ---------- skate park ----------
  function skatePark() {
    const P = [];
    const IN = 100;            // half size of the riding area
    const QP_ARC = 28, QP_VERT = 3;
    const qpH = QP_ARC / (Math.PI / 2) + QP_VERT;        // height of the bowl walls
    const qpOut = QP_ARC / (Math.PI / 2) + 2;           // how far the wall reaches outward (+ slab)
    const OUT = 140;
    P.push({ block: [0, -1, 0], size: [OUT * 2, 2, OUT * 2] });   // floor, top at y = 0
    // bowl walls: quarter pipes going vertical, with a deck behind them
    for (const h of [0, 90, 180, 270]) {
      const f = [-Math.sin(h * D), 0, Math.cos(h * D)];
      P.push({ at: [f[0] * IN, 0, f[2] * IN], heading: h, w: IN * 2 }, { c: QP_ARC, pitch: 90 }, { s: QP_VERT });
      const deckIn = IN + qpOut, deckLen = OUT - deckIn;
      P.push({ block: [f[0] * (deckIn + deckLen / 2), qpH / 2, f[2] * (deckIn + deckLen / 2)], size: [IN * 2, qpH, deckLen], heading: h });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = (IN + OUT) / 2;
      P.push({ block: [sx * c, qpH / 2, sz * c], size: [OUT - IN, qpH, OUT - IN] });
    }
    // central funbox with ramps on all four sides
    const FB = 15, FH = 3;
    P.push({ block: [0, FH / 2, 0], size: [FB * 2, FH, FB * 2] });
    const upLen = (() => { const th = 18 * D, curve = 5, rc = (curve / th) * (1 - Math.cos(th)); const mid = (FH - 2 * rc) / Math.sin(th); return 2 * (curve / th) * Math.sin(th) + mid * Math.cos(th); })();
    for (const h of [0, 90, 180, 270]) {
      const f = [-Math.sin(h * D), 0, Math.cos(h * D)];
      const d = FB + upLen;
      P.push({ at: [-f[0] * d, 0.02, -f[2] * d], heading: h, w: 14 }, ...ramp(FH, 18));
    }
    // rollers: a rhythm section of bumps
    P.push({ at: [-30, 0.02, -75], heading: 90, w: 16 }, { s: 4 });
    for (let i = 0; i < 4; i++) P.push({ c: 5, pitch: 9 }, { c: 6, pitch: -18 }, { c: 5, pitch: 9 });
    P.push({ s: 4 });
    // gap jump: kicker, 22 m gap, landing ramp
    const gH = kickerHeight(20, 6, 8);
    P.push({ at: [62, 0.02, -78], heading: 0, w: 14 }, ...kicker(20, 6, 8), { gap: 22, dy: 0, land: -20 }, ...landing(gH, 20));
    // big launch ramp toward the north wall
    P.push({ at: [-62, 0.02, -85], heading: 0, w: 16 }, { s: 6 }, ...kicker(30, 10, 10));
    // loop
    P.push({ at: [-62, 0.02, 25], heading: 0, w: 14 }, { s: 12 }, { loop: 14, shift: 15 }, { s: 12 });
    // step-up to a high table and a drop back down
    P.push({ at: [60, 0.02, 10], heading: 0, w: 14 }, ...ramp(6, 22));
    P.push({ block: [60, 3.01, 54], size: [14, 6.02, 20] });
    // spawn
    P.push({ at: [0, 0, -88], heading: 0 }, { spawn: 1 });
    return P;
  }

  JC.levels = [
    {
      name: 'Sky Strip',
      width: 12,
      pieces: [
        { s: 70 },
        { c: 16, pitch: 16 },              // ramp
        { gap: 42, dy: -4, land: -8 },     // jump 1
        { c: 14, pitch: 8 },
        { s: 50 },
        { cp: 1 },
        { c: 16, bank: 22 },
        { c: 63, turn: 90 },               // banked right-hander
        { c: 16, bank: 0 },
        { s: 40 },
        { loop: 18, shift: 14 },
        { s: 50 },
        { cp: 1 },
        { c: 14, pitch: 12 },
        { gap: 70, dy: -26, land: -22 },   // big drop
        { c: 30, pitch: 22 },
        { s: 70 },                         // long runout: fast arrivals still land
        { c: 16, bank: -20 },
        { c: 47, turn: -90 },              // banked left-hander
        { c: 16, bank: 0 },
        { cp: 1 },
        { c: 12, w: 6 },                   // narrow section
        { s: 60 },
        { c: 12, w: 12 },
        { c: 10, pitch: 14 },              // kicker: clears the gap from ~25 m/s, still lands at ~50 m/s
        { gap: 30, dy: 0, land: 0 },
        { s: 50 },
        { finish: 1 },
        { s: 70 },
      ],
    },
    { name: 'Skate Park', mode: 'free', pieces: skatePark() },
  ];
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
