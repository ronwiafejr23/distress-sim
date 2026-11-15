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
  // ---- STEP 2: start, stop and the once-a-second tick ----
  Engine.start = function (options) {
    Engine.stop();
    const crew = window.CREW.find(function (c) { return c.id === options.crewId; });
    const scenario = window.SCENARIOS.find(function (s) {
      return s.id === options.scenarioId;
    });
    if (!crew || !scenario) {
      throw new Error('Engine.start: unknown crewId or scenarioId');
    }
    run = {
      crew: crew,
      scenario: scenario,
      t: 0,                 // seconds since the run started
      phase: 'baseline',    // baseline, onset, escalation, peak, holding, recovery
      offset: {},           // how far the scenario has pushed each signal
      mult: 1,              // response model: 1 = full effect, lower = helped
      late: 0,              // seconds spent at the worst point with no help
      taken: [],            // the actions the user has chosen so far
      recovery: null,
      earthDelay: !!options.earthDelay,
      delaySeconds: options.delaySeconds || 30,
      replyAt: null
    };
    if (!options.manual) {
      timer = setInterval(Engine.step, TICK_MS / (options.speed || 1));
    }
  };

  Engine.stop = function () {
    clearInterval(timer);
    timer = null;
    run = null;
  };

  Engine.isRunning = function () { return run !== null; };

  // One tick = one second of simulated time = one new reading.
  Engine.step = function () {
    if (!run) { return; }
    run.t += 1;
    updateScenario();
    updateResponse();

    const values = {};
    window.SIGNALS.forEach(function (sig) {
      const base = run.crew.baseline[sig.key];
      const shift = (run.offset[sig.key] || 0) * run.mult;
      const noise = gaussian() * base.sd * NOISE;
      values[sig.key] = round1(clamp(base.mean + shift + noise, sig.min, sig.max));
    });

    // THE READING - every other part of the app is built around this shape.
    emit('tick', { t: run.t, crewId: run.crew.id, phase: run.phase, values: values });
    checkReply();
    checkEnd();
  };
  // ---- STEP 3: the scenario engine ----
  // Works out which phase we are in and how far each signal has been pushed.
  updateScenario = function () {
    const sc = run.scenario;
    if (run.recovery) { return; }        // recovery is handled in step 4
    let elapsed = run.t - sc.calm;
    if (elapsed <= 0) { run.phase = 'baseline'; return; }

    let from = {};                       // the shift at the start of this phase
    for (let i = 0; i < sc.phases.length; i++) {
      const ph = sc.phases[i];
      if (elapsed <= ph.seconds) {
        run.phase = ph.name;
        setOffset(from, ph.shift, elapsed / ph.seconds);
        return;
      }
      elapsed -= ph.seconds;
      from = ph.shift;
    }
    run.phase = 'holding';               // past the last phase: stay at the worst point
    setOffset(from, from, 1);
  };

  // Slide every signal from one shift toward the next. fraction goes 0 -> 1.
  function setOffset(from, to, fraction) {
    window.SIGNALS.forEach(function (sig) {
      const a = from[sig.key] || 0;
      const b = to[sig.key] || 0;
      run.offset[sig.key] = a + (b - a) * fraction;
    });
  }
  // ---- STEP 4: the response model ----
  // The interface calls this when the user picks a step from the action guide.
  Engine.applyAction = function (actionId) {
    if (!run || run.phase === 'baseline') { return null; }
    const action = run.scenario.actions.find(function (a) {
      return a.id === actionId;
    });
    const already = run.taken.some(function (a) { return a.id === actionId; });
    if (!action || already) { return null; }
    const record = { t: run.t, id: action.id, label: action.label, effect: action.effect };
    run.taken.push(record);
    return record;
  };

  function countTaken(effect) {
    return run.taken.filter(function (a) { return a.effect === effect; }).length;
  }

  updateResponse = function () {
    const sc = run.scenario;
    const rightTotal = sc.actions.filter(function (a) {
      return a.effect === 'right';
    }).length;
    const right = countTaken('right');
    const wrong = countTaken('wrong');

    // Already recovering: fade every signal back to the person's baseline.
    if (run.recovery) {
      run.recovery.left -= 1;
      const fraction = Math.max(0, run.recovery.left / sc.recoverySeconds);
      window.SIGNALS.forEach(function (sig) {
        run.offset[sig.key] = run.recovery.from[sig.key] * fraction;
      });
      return;
    }

    // Every right step is done: start the recovery from where we are now.
    if (right === rightTotal && run.phase !== 'baseline') {
      run.phase = 'recovery';
      run.recovery = { left: sc.recoverySeconds, from: {} };
      window.SIGNALS.forEach(function (sig) {
        run.recovery.from[sig.key] = (run.offset[sig.key] || 0) * run.mult;
      });
      run.mult = 1;
      return;
    }

    // Otherwise: right steps ease the readings, wrong or late steps worsen them.
    if (run.phase === 'holding' && right === 0) { run.late += 1; }
    let target = 1 - 0.6 * (right / rightTotal) + 0.25 * wrong + 0.01 * run.late;
    target = clamp(target, 0, 1.6);
    run.mult += clamp(target - run.mult, -0.08, 0.08);   // move gradually, no jumps
  };

  // The run ends when the crew member has recovered or time has run out.
  checkEnd = function () {
    let outcome = null;
    if (run.recovery && run.recovery.left <= 0) {
      outcome = 'stabilized';
    } else if (!run.recovery && run.t >= run.scenario.timeLimit) {
      outcome = 'not stabilized';
    }
    if (outcome) {
      const info = { t: run.t, outcome: outcome, actions: run.taken };
      Engine.stop();
      emit('end', info);
    }
  };
  // ---- STEP 5: the Earth delay ----
  // Returns how many seconds until Mission Control's answer arrives.
  Engine.askMissionControl = function () {
    if (!run || run.replyAt !== null) { return null; }
    const wait = run.earthDelay ? run.delaySeconds : 2;
    run.replyAt = run.t + wait;
    return wait;
  };

  checkReply = function () {
    if (run.replyAt !== null && run.t >= run.replyAt) {
      run.replyAt = null;
      emit('reply', { t: run.t, text: run.scenario.hint });
    }
  };
