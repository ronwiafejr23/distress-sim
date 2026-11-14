// engine.js  (Ron) - the back end. Makes the vital signs, runs the scenario,
// reacts to the crew's actions and handles the Earth delay.
(function () {
  const Engine = {};
  window.Engine = Engine;

  const TICK_MS = 1000;  // one new reading per second
  const NOISE = 0.35;    // random wobble, as a fraction of each person's spread

  // Other files subscribe to these three events with Engine.on(...)
  const listeners = { tick: [], reply: [], end: [] };
  let run = null;    // everything about the current run (null = not running)
  let timer = null;

  Engine.on = function (eventName, fn) {
    listeners[eventName].push(fn);
  };

  function emit(eventName, payload) {
    listeners[eventName].forEach(function (fn) { fn(payload); });
  }

  // Random number that is usually near 0 and rarely past +/-2 (a bell curve).
  function gaussian() {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(x, low, high) { return Math.max(low, Math.min(high, x)); }
  function round1(x) { return Math.round(x * 10) / 10; }

  // These four are filled in by later steps. They start empty so the file
  // runs after every step.
  let updateScenario = function () {};
  let updateResponse = function () {};
  let checkReply = function () {};
  let checkEnd = function () {};
})();
