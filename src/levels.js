// Jetline - level definitions (see track/geometry.js for the piece format)
(function (JC) {
  'use strict';

  // ---------- helpers for building ramps ----------
  // Curves are eased (curvature ramps in and out, see track/geometry.js); JC.curveRise measures them, so
  // ramps still end exactly at the heights the layout needs.
  const D = Math.PI / 180;
  const PARK_EASE = 0.4;
  const rise = (curve, deg, ease) => JC.curveRise(curve, deg, ease).rise;
  const run = (curve, deg, ease) => JC.curveRise(curve, deg, ease).run;
  // a ramp that changes height by h (up if > 0) with slope `deg`, ending level again
  function ramp(h, deg, curve = 8, ease = PARK_EASE) {
    const th = deg * D, rc = rise(curve, deg, ease), sg = Math.sign(h);
    const mid = Math.max(0, (Math.abs(h) - 2 * rc) / Math.sin(th));
    return [{ c: curve, pitch: sg * deg, ease }, { s: mid }, { c: curve, pitch: -sg * deg, ease }];
  }
  const rampRun = (h, deg, curve = 8, ease = PARK_EASE) =>
    2 * run(curve, deg, ease) + Math.max(0, (h - 2 * rise(curve, deg, ease)) / Math.sin(deg * D)) * Math.cos(deg * D);
  // a kicker: curves up to `deg` and keeps going straight for `lip` meters (ends pitched up)
  const kicker = (deg, curve, lip, ease = PARK_EASE) => [{ c: curve, pitch: deg, ease }, { s: lip }];
  const kickerHeight = (deg, curve, lip, ease = PARK_EASE) => rise(curve, deg, ease) + lip * Math.sin(deg * D);
  // landing that starts pitched down at `deg` (after a gap) and drops h to level ground
  function landing(h, deg, curve = 10, ease = PARK_EASE) {
    const th = deg * D, rc = rise(curve, deg, ease);
    return [{ s: Math.max(0, (h - rc) / Math.sin(th)) }, { c: curve, pitch: deg, ease }];
  }

  // ---------- skate park ----------
  function skatePark() {
    const P = [];
    const IN = 100;            // half size of the riding area
    const QP_ARC = 36, QP_VERT = 3, QP_EASE = 0.3;   // eased: the tightest part is r ~ 16 m
    const qpH = rise(QP_ARC, 90, QP_EASE) + QP_VERT;   // height of the bowl walls
    const qpOut = run(QP_ARC, 90, QP_EASE) + 2;        // how far the wall reaches outward (+ slab)
    const OUT = 140;
    P.push({ block: [0, -1, 0], size: [OUT * 2, 2, OUT * 2] });   // floor, top at y = 0
    // bowl walls: quarter pipes going vertical, with a deck behind them
    for (const h of [0, 90, 180, 270]) {
      const f = [-Math.sin(h * D), 0, Math.cos(h * D)];
      P.push({ at: [f[0] * IN, 0, f[2] * IN], heading: h, w: IN * 2 }, { c: QP_ARC, pitch: 90, ease: QP_EASE }, { s: QP_VERT });
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
    const upLen = rampRun(FH, 18);
    for (const h of [0, 90, 180, 270]) {
      const f = [-Math.sin(h * D), 0, Math.cos(h * D)];
      const d = FB + upLen;
      P.push({ at: [-f[0] * d, 0.02, -f[2] * d], heading: h, w: 14 }, ...ramp(FH, 18));
    }
    // rollers: a rhythm section of bumps
    P.push({ at: [-30, 0.02, -75], heading: 90, w: 16 }, { s: 4 });
    for (let i = 0; i < 4; i++) P.push({ c: 5, pitch: 9, ease: 0.5 }, { c: 6, pitch: -18, ease: 0.5 }, { c: 5, pitch: 9, ease: 0.5 });
    P.push({ s: 4 });
    // gap jump: kicker, 22 m gap, landing ramp
    const gH = kickerHeight(20, 10, 8);
    P.push({ at: [62, 0.02, -78], heading: 0, w: 14 }, ...kicker(20, 10, 8), { gap: 22, dy: 0, land: -20 }, ...landing(gH, 20));
    // big launch ramp toward the north wall
    P.push({ at: [-62, 0.02, -85], heading: 0, w: 16 }, { s: 6 }, ...kicker(30, 16, 10));
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
      // Built for 130-200 km/h. Corners come in three kinds (radius at the tightest point):
      //   sweepers  r 100+  flat out on grip
      //   tight     r 32-40 grip only after braking, or hold the air brakes
      //   hairpin   r 24    brake hard / air brakes, or drift it
      name: 'Sky Strip',
      width: 13,
      ease: 0.35,
      pieces: [
        { s: 80 },
        { c: 26, pitch: 13 },                       // ramp
        { gap: 46, dy: -5, land: -9 },              // jump 1
        { c: 34, pitch: 9 },
        { s: 110 },                                 // long landing straight: lands on road up to ~220 km/h
        { cp: 1 },
        { corner: 55, r: 120, bank: 8 },            // fast right sweeper
        { s: 40 },
        { corner: -95, r: 36, bank: 12 },           // tight left: brake or air brakes
        { s: 60 },
        { loop: 18, shift: 15 },
        { s: 60 },
        { cp: 1 },
        { c: 22, pitch: 11 },
        { gap: 72, dy: -26, land: -22 },            // big drop
        { c: 46, pitch: 22 },
        { s: 125 },                                 // long runout: fast arrivals still land
        { corner: 65, r: 42, bank: 10 },            // chicane: right ...
        { corner: -65, r: 42, bank: 10 },           // ... left (flick drift)
        { s: 50 },
        { cp: 1 },
        { c: 20, w: 17 },                           // widens for the hairpin
        { corner: 165, r: 24, bank: 10 },           // hairpin right
        { c: 20, w: 13 },
        { s: 40 },
        { corner: -40, r: 110, bank: 6 },           // left sweeper onto the narrow section
        { c: 14, w: 7 },                            // narrow section
        { s: 60 },
        { c: 14, w: 13 },
        { c: 18, pitch: 13 },                       // kicker over the last gap
        { gap: 34, dy: -3, land: -7 },
        { c: 28, pitch: 7 },
        { s: 40 },
        { finish: 1 },
        { s: 110 },
      ],
    },
    { name: 'Skate Park', mode: 'free', pieces: skatePark() },
    {
      // Practice: the Sky Strip hairpin on its own. A run-up, the hairpin, then a long narrow exit straight:
      // a drift that isn't cleanly finished (or flicks into a new one) slides off the edge.
      name: 'Hairpin',
      width: 13,
      ease: 0.35,
      pieces: [
        { s: 150 },
        { c: 20, w: 17 },
        { corner: 165, r: 24, bank: 10 },
        { c: 16, w: 9 },
        { s: 180 },
        { finish: 1 },
        { s: 60 },
      ],
    },
  ];
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
