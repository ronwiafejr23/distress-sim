// fake-parts.js  (Kenya) - TEMPORARY stand-ins for data.js, engine.js and
// detector.js so you can build the whole screen before your teammates finish.
// They use the SAME names and shapes as the real files, so when the real
// files arrive you only change the script tags in index.html.

window.SIGNALS = [
  { key: 'hr',     label: 'Heart rate',       unit: 'bpm',  min: 30, max: 220 },
  { key: 'br',     label: 'Breathing rate',   unit: '/min', min: 4,  max: 60 },
  { key: 'spo2',   label: 'Blood oxygen',     unit: '%',    min: 60, max: 100 },
  { key: 'temp',   label: 'Skin temperature', unit: 'C',    min: 28, max: 41 },
  { key: 'stress', label: 'Stress score',     unit: '/100', min: 0,  max: 100 }
];

window.CREW = [{
  id: 'test', name: 'Test Astronaut', role: 'Fake data',
  baseline: {
    hr: { mean: 62, sd: 5 }, br: { mean: 14, sd: 1.5 }, spo2: { mean: 98, sd: 0.8 },
    temp: { mean: 33.5, sd: 0.4 }, stress: { mean: 20, sd: 6 }
  }
}];

window.SCENARIOS = [{
  id: 'fake', name: 'Fake emergency',
  actions: [
    { id: 'good', label: 'Fake right step', effect: 'right' },
    { id: 'bad',  label: 'Fake wrong step', effect: 'wrong' }
  ],
  hint: 'Mission Control: this is a fake answer.'
}];

// Fake engine: heart rate and stress climb after 5 seconds. The run ends
// 5 seconds after the right step is chosen, or at 40 seconds.
window.Engine = (function () {
  const listeners = { tick: [], reply: [], end: [] };
  let timer = null, t = 0, taken = [], fixedAt = null, replyAt = null;
  function emit(name, payload) { listeners[name].forEach(function (fn) { fn(payload); }); }
  function step() {
    t += 1;
    const push = fixedAt ? 0 : Math.max(0, t - 5);
    emit('tick', {
      t: t, crewId: 'test', phase: t <= 5 ? 'baseline' : 'onset',
      values: {
        hr: 62 + push * 2 + Math.round(Math.random() * 2),
        br: 14 + Math.round(push / 3),
        spo2: 98,
        temp: 33.5,
        stress: Math.min(100, 20 + push * 3)
      }
    });
    if (replyAt !== null && t >= replyAt) {
      replyAt = null;
      emit('reply', { t: t, text: window.SCENARIOS[0].hint });
    }
    if ((fixedAt && t >= fixedAt + 5) || t >= 40) {
      const info = { t: t, outcome: fixedAt ? 'stabilized' : 'not stabilized',
                     actions: taken };
      clearInterval(timer); timer = null;
      emit('end', info);
    }
  }
  return {
    on: function (name, fn) { listeners[name].push(fn); },
    start: function (options) {
      clearInterval(timer);
      t = 0; taken = []; fixedAt = null; replyAt = null;
      timer = setInterval(step, 1000 / (options.speed || 1));
    },
    stop: function () { clearInterval(timer); timer = null; },
    applyAction: function (id) {
      const a = window.SCENARIOS[0].actions.find(function (x) { return x.id === id; });
      const record = { t: t, id: a.id, label: a.label, effect: a.effect };
      taken.push(record);
      if (a.effect === 'right') { fixedAt = t; }
      return record;
    },
    askMissionControl: function () { replyAt = t + 8; return 8; }
  };
})();

// Fake detector: the level simply follows the heart rate.
window.Detector = (function () {
  let actions = [], peak = 'normal', outcome = null, endT = 0;
  return {
    reset: function () { actions = []; peak = 'normal'; },
    update: function (reading) {
      const z = (reading.values.hr - 62) / 5;
      let level = 'normal';
      if (z >= 2) { level = 'watch'; }
      if (z >= 4) { level = 'caution'; }
      if (z >= 6) { level = 'emergency'; }
      if (level !== 'normal') { peak = level; }
      return {
        t: reading.t, level: level,
        scores: { hr: Math.round(z * 10) / 10, br: 0, spo2: 0, temp: 0, stress: 0 },
        drivers: level === 'normal' ? [] : ['hr']
      };
    },
    noteAction: function (record) { actions.push(record); },
    finish: function (info) { outcome = info.outcome; endT = info.t; },
    getDebrief: function () {
      return {
        crewName: 'Test Astronaut', scenarioName: 'Fake emergency',
        outcome: outcome, peakLevel: peak, timeToDetect: 3, timeToAct: 4,
        wrongSteps: actions.filter(function (a) { return a.effect === 'wrong'; })
          .map(function (a) { return a.label; }),
        missedSteps: [], totalSeconds: endT
      };
    }
  };
})();
