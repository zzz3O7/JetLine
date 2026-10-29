// Jetline sim - every tunable number, grouped by the layer that reads it.
// The flat JC.defaultTuning (same keys) is what the car and the tuning panel use.
(function (JC) {
  'use strict';
  JC.tuningGroups = {
    chassis: {
      gravity: 9.81,
      mass: 1000,
    },
    engine: {
      engineForce: 14000,     // N at the rear wheels, fades out at engineTopSpeed
      engineTopSpeed: 75,     // m/s
      brakeForce: 16000,      // N, wheel brakes
      reverseForce: 5000,     // N
      rollRes: 4,             // rolling resistance per wheel, N per m/s
    },
    jet: {
      jetThrust: 17000,       // N, the main toy
      jetUnlimited: 1,        // 1 = infinite jet (testing), 0 = fuel that recharges on the ground
      jetCapacity: 5,         // seconds of jet on a full tank
      jetRecharge: 10,        // seconds to refill an empty tank while driving
    },
    suspension: {
      springK: 15000,         // N/m per wheel
      damperC: 3200,          // N per m/s, compression
      reboundDamping: 1.8,    // extension damping multiplier (higher = less bounce after landings)
      suspTravel: 0.5,        // m
      wheelRadius: 0.36,      // m
      antiRoll: 22000,        // N per m of left/right compression difference
    },
    tires: {
      grip: 1.8,              // friction coefficient
      rearGrip: 1.12,         // rear tires grip a bit more, so the car straightens instead of spinning
      slipPeak: 0.12,         // slip angle (rad) where a tire reaches full grip
      steerMax: 0.55,         // steering angle (rad) at standstill
      steerFalloff: 0.045,    // steering reduces with speed
    },
    aero: {
      dragCoef: 1.6,          // F = k * v^2
      downforce: 2.5,         // ground effect, F = k * vf^2, fades out a few meters above the road
      airbrakeDrag: 3.0,      // extra drag at the air brake flaps
      airbrakeHeight: 0,      // flap height above the center of mass (higher = air brakes pitch the nose up by themselves)
      airbrakeArm: 0.5,       // flap distance behind the center of mass (longer = air brakes resist rotation more)
      airbrakeDownforce: 3.0, // extra ground grip while the flaps are open
      bodyLift: 0.8,          // flat-plate lift of the body
      wingLift: 12,           // extra lift while the air brakes (wings) are open: glide / fly
      wingCenter: 0,          // where lift acts along the car; behind the center = self-stabilizing pitch that fights flips at speed
      finStability: 0.1,      // tail fin, aligns the nose with the travel direction (fights flips more the faster you go)
    },
    airControl: {
      airPitch: 5.5,          // rad/s^2
      airYaw: 0,              // rad/s^2 (0: steering rolls instead)
      airRoll: 4.5,           // rad/s^2
      airDamping: 0.8,        // angular damping in the air (1/s)
      airControlBase: 0,      // share of air control WITHOUT the air brakes open (0 = brakes needed)
    },
    drift: {
      driftGrip: 0.5,         // rear grip multiplier while drifting
      driftAngle: 0.6,        // slide angle (rad) at full steering
      driftCarve: 1.6,        // how fast the slide turns into forward motion
      driftKeep: 0.75,        // share of tire scrub ignored while drifting (keeps speed)
      driftPower: 0.7,        // share of engine force that still pushes during a drift
      driftMinSpeed: 14,      // m/s needed to start a drift
      autoDrift: 0,           // 1 = drifts also start by themselves (already sliding, or landing sideways)
      autoDriftAngle: 0.14,   // sideways slide (rad) that starts an auto drift
    },
    assists: {
      stability: 1.0,         // roll assist: keeps the car flat through bank changes
      spinAssist: 0,          // turns the nose toward the direction of travel on flat ground
      loopAssist: 0,          // steers the car along the sideways shift of loops
    },
  };
  JC.defaultTuning = Object.assign({}, ...Object.values(JC.tuningGroups));
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
