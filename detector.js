// detector.js  (Ade) - the brain. Compares every reading with that person's
// own normal, decides the alert level, and keeps the numbers for the debrief.
(function () {
  const Detector = {};
  window.Detector = Detector;

  // The numbers you tune on Sunday. "Spread" means standard deviation (sd).
  const LIMITS = {
    watch: 2,        // a signal this many spreads from normal counts as "off"
    emergency: 3,    // a signal this many spreads from normal is an emergency
    smooth: 3,       // judge the average of the last 3 readings, not one blip
    spo2Drop: 2,     // blood oxygen falling this many points...
    spo2Window: 5    // ...within this many seconds is an emergency by itself
  };
  const RANK = { normal: 0, watch: 1, caution: 2, emergency: 3 };

  let crew = null;       // the crew member being monitored
  let scenario = null;   // used only for the debrief, never to "cheat"
  let history = [];      // every reading so far
  let log = null;        // the facts the debrief is built from

  // Called once at the start of every run.
  Detector.reset = function (crewMember, scenarioObject) {
    crew = crewMember;
    scenario = scenarioObject;
    history = [];
    log = {
      onsetT: null,        // second the emergency really began
      detectT: null,       // second of the first alert after that
      firstRightT: null,   // second of the first correct action
      peakLevel: 'normal',
      actions: [],
      outcome: null,
      endT: null
    };
  };

  // ---- STEP 2: the score ----
  // How many spreads is this value away from this person's normal?
  // 0 = exactly normal, +2 = clearly high, -2 = clearly low.
  Detector.score = function (key, value) {
    const base = crew.baseline[key];
    return (value - base.mean) / base.sd;
  };

  function average(list) {
    let sum = 0;
    list.forEach(function (x) { sum += x; });
    return sum / list.length;
  }

  // ---- STEP 3: the alert level ----
  // Called once per reading. Returns the alert for that moment.
  Detector.update = function (reading) {
    history.push(reading);
    const recent = history.slice(-LIMITS.smooth);

    const scores = {};
    const drivers = [];     // the signals that are off right now
    let past2 = 0;
    let past3 = 0;
    Object.keys(crew.baseline).forEach(function (key) {
      const smoothed = average(recent.map(function (r) { return r.values[key]; }));
      const z = Detector.score(key, smoothed);
      scores[key] = Math.round(z * 10) / 10;
      if (Math.abs(z) >= LIMITS.watch) { past2 += 1; drivers.push(key); }
      if (Math.abs(z) >= LIMITS.emergency) { past3 += 1; }
    });

    // A fast blood-oxygen drop is an emergency even before the score is large.
    // Compare the smoothed value now with the smoothed value a few seconds ago.
    let fastDrop = false;
    if (history.length >= LIMITS.spo2Window + LIMITS.smooth) {
      const older = history.slice(-(LIMITS.spo2Window + LIMITS.smooth), -LIMITS.spo2Window);
      const before = average(older.map(function (r) { return r.values.spo2; }));
      const now = average(recent.map(function (r) { return r.values.spo2; }));
      fastDrop = (before - now) >= LIMITS.spo2Drop;
    }

    let level = 'normal';
    if (past2 >= 1) { level = 'watch'; }
    if (past2 >= 2) { level = 'caution'; }
    if (past3 >= 1 || fastDrop) { level = 'emergency'; }

    // Facts for the debrief.
    if (log.onsetT === null && reading.phase !== 'baseline') { log.onsetT = reading.t; }
    if (log.detectT === null && log.onsetT !== null && level !== 'normal') {
      log.detectT = reading.t;
    }
    if (RANK[level] > RANK[log.peakLevel]) { log.peakLevel = level; }

    return { t: reading.t, level: level, scores: scores, drivers: drivers };
  };

  // ---- STEP 4: the debrief numbers ----
  // The interface passes in the record that Engine.applyAction() returned.
  Detector.noteAction = function (record) {
    log.actions.push(record);
    if (record.effect === 'right' && log.firstRightT === null) {
      log.firstRightT = record.t;
    }
  };

  // The interface passes in the info object from the engine's 'end' event.
  Detector.finish = function (info) {
    log.outcome = info.outcome;
    log.endT = info.t;
  };

  function labelsOf(list) { return list.map(function (a) { return a.label; }); }

  Detector.getDebrief = function () {
    const takenIds = log.actions.map(function (a) { return a.id; });
    const missed = scenario.actions.filter(function (a) {
      return a.effect === 'right' && takenIds.indexOf(a.id) === -1;
    });
    const wrong = log.actions.filter(function (a) { return a.effect === 'wrong'; });
    return {
      crewName: crew.name,
      scenarioName: scenario.name,
      outcome: log.outcome,
      peakLevel: log.peakLevel,
      timeToDetect: log.detectT === null ? null : log.detectT - log.onsetT,
      timeToAct: log.firstRightT === null ? null
        : Math.max(0, log.firstRightT - log.detectT),
      wrongSteps: labelsOf(wrong),
      missedSteps: labelsOf(missed),
      totalSeconds: log.endT
    };
  };
})();
