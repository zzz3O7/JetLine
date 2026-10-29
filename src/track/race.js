// Jetline track - race rules: gates passed in order, timing, splits, respawn point, falling off.
(function (JC) {
  'use strict';
  const M = JC.M;

  class Race {
    constructor(track) { this.track = track; this.reset(); }
    reset() {
      this.next = 0; this.time = 0; this.started = false; this.finished = false;
      this.splits = []; this.respawn = { gate: this.track.start, speed: 0 }; this.prevS = null;
    }
    // Call once per physics step. Returns events: {type: 'cp' | 'finish' | 'fell', ...}.
    update(car, dt) {
      const ev = [];
      if (this.started && !this.finished) this.time += dt;
      const g = this.track.gates[this.next];
      if (g && !this.finished) {
        // a gate counts when the car crosses its plane forward, within its width and up to 14 m above
        const d = M.sub(car.pos, g.p);
        const s = M.dot(d, g.f), lat = Math.abs(M.dot(d, g.r)), ht = M.dot(d, g.u);
        if (this.prevS !== null && this.prevS < 0 && s >= 0 && lat < g.w / 2 + 4 && ht > -4 && ht < 14) {
          this.splits.push(this.time);
          if (g.finish) { this.finished = true; ev.push({ type: 'finish', time: this.time }); }
          else { this.respawn = { gate: g, speed: car.speed }; ev.push({ type: 'cp', index: this.next, time: this.time }); }
          this.next++;
          this.prevS = null;
        } else this.prevS = s;
      }
      if (car.pos[1] < this.track.killY) ev.push({ type: 'fell' });
      return ev;
    }
    // back to the last checkpoint (or the start), with 85% of the speed it was passed at
    respawnCar(car) {
      const sp = JC.spawnPose(this.respawn.gate);
      car.reset(sp.pos, sp.q, this.respawn.speed * 0.85);
      this.prevS = null;
    }
  }
  JC.Race = Race;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
