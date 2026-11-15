(function () {
  const Assistant = {};
  window.Assistant = Assistant;

  // Short advice used by several topics.
  const ADVICE = {
    oxygen: 'Stop activity, give supplemental oxygen, and check suit or cabin pressure.',
    air: 'Check the CO2 scrubber, raise ventilation, and move the crew to another module.',
    calm: 'Pause the task and breathe slowly: in for 4 seconds, hold 4, out for 4. Get a ' +
          'crewmate to check in.',
    heat: 'Stop exercising, drink fluids, cool down, and recheck in 10 minutes.'
  };

  // Turns a signal key into "Heart rate 92 bpm (their normal 52.0 to 72.0)".
  function describe(key, ctx) {
    const sig = window.SIGNALS.find(function (s) { return s.key === key; });
    const base = ctx.crew.baseline[key];
    const now = ctx.reading ? ctx.reading.values[key] : base.mean;
    return sig.label + ' ' + now + ' ' + sig.unit + ' (their normal ' +
      (base.mean - 2 * base.sd).toFixed(1) + ' to ' +
      (base.mean + 2 * base.sd).toFixed(1) + ')';
  }

  function liveLine(key, ctx) {
    return ctx.reading ? 'Right now: ' + describe(key, ctx) + '.' : '';
  }

  // ---- The facts. Each topic has the words that point to it and an answer.
  // An answer can be text, or a function that also uses the live readings.
  const TOPICS = [
    {
      id: 'status',
      words: ['status', 'how am i', 'what is wrong', "what's wrong", 'why', 'alert',
              'readings', 'how is'],
      answer: function (ctx) {
        if (!ctx.result) { return 'No run is active yet. Press Start run to begin monitoring.'; }
        const level = ctx.result.level.toUpperCase();
        if (ctx.result.level === 'normal') {
          return 'Status NORMAL. Every reading is inside ' + ctx.crew.name +
                 '\'s own normal band.';
        }
        const off = ctx.result.drivers.map(function (k) { return describe(k, ctx); });
        return 'Status ' + level + '. Outside ' + ctx.crew.name + '\'s normal: ' +
          (off.length ? off.join('; ') : 'blood oxygen is falling fast') +
          '. Ask "what should I do" for next steps, and open the action guide.';
      }
    },
    {
      id: 'todo',
      words: ['what should i do', 'what do i do', 'help', 'next step', 'advice', 'emergency'],
      answer: function (ctx) {
        const drivers = ctx.result ? ctx.result.drivers : [];
        const tips = ['Stop any hard activity and stay with a crewmate.'];
        function has(key) { return drivers.indexOf(key) !== -1; }
        if (has('spo2')) { tips.push(ADVICE.oxygen); }
        if (has('stress') || has('hr')) { tips.push(ADVICE.calm); }
        if (has('br')) {
          tips.push('If other crew members are breathing fast too, suspect the cabin air: ' +
            ADVICE.air.charAt(0).toLowerCase() + ADVICE.air.slice(1));
        }
        if (has('temp')) { tips.push(ADVICE.heat); }
        tips.push('Use the action guide now. With the Earth delay on, do not wait for ' +
                  'Mission Control.');
        return tips.join(' ');
      }
    },
    {
      id: 'heart',
      words: ['heart', 'pulse', 'bpm', 'hr'],
      answer: function (ctx) {
        return 'A typical adult resting heart rate is about 60 to 100 beats per minute, and ' +
          'fit people often sit lower. Stress, exercise, heat, fever and low oxygen all push ' +
          'it up. This app judges it against each person\'s own normal. ' + liveLine('hr', ctx);
      }
    },
    {
      id: 'breathing',
      words: ['breath', 'breathing', 'respiratory', 'short of breath'],
      answer: function (ctx) {
        return 'A typical adult breathes about 12 to 20 times a minute at rest. Fast ' +
          'breathing can come from panic, exercise, too much carbon dioxide in the air, or ' +
          'low oxygen. ' + liveLine('br', ctx);
      }
    },
    {
      id: 'oxygen',
      words: ['oxygen', 'spo2', 'o2', 'hypoxia', 'lips', 'dizzy'],
      answer: function (ctx) {
        return 'Blood oxygen is normally about 95 to 100 percent. Low oxygen (hypoxia) can ' +
          'cause shortness of breath, a fast heart rate, confusion, dizziness and bluish ' +
          'lips. NASA lists hypoxia as a spaceflight risk, especially around spacewalks. ' +
          ADVICE.oxygen + ' ' + liveLine('spo2', ctx);
      }
    },
    {
      id: 'co2',
      words: ['co2', 'carbon dioxide', 'scrubber', 'air', 'headache', 'stuffy', 'drowsy'],
      answer: 'Carbon dioxide builds up in a closed cabin if it is not removed. Early signs ' +
        'are headache, faster breathing, drowsiness and trouble concentrating. If everyone ' +
        'feels it at once, suspect the air, not one person. ' + ADVICE.air
    },
    {
      id: 'panic',
      words: ['panic', 'anxiety', 'anxious', 'stress', 'scared', 'calm', 'afraid'],
      answer: function (ctx) {
        return 'Panic raises heart rate, breathing and stress quickly, and can feel like you ' +
          'cannot get enough air. ' + ADVICE.calm + ' Isolation and confinement are one of ' +
          'NASA\'s five hazards of spaceflight, so stress reactions are expected and worth ' +
          'treating early. ' + liveLine('stress', ctx);
      }
    },
    {
      id: 'heat',
      words: ['hot', 'heat', 'temperature', 'overheat', 'sweat', 'dehydrat', 'thirst', 'water'],
      answer: function (ctx) {
        return 'Overheating and dehydration show as a high heart rate that stays high after ' +
          'stopping, warm skin, thirst, headache and tiredness. ' + ADVICE.heat + ' ' +
          liveLine('temp', ctx);
      }
    },
    {
      id: 'sleep',
      words: ['sleep', 'tired', 'fatigue', 'exhausted', 'insomnia'],
      answer: 'Losing sleep slowly raises resting heart rate, slows reactions and lowers ' +
        'mood. NASA lists inadequate sleep and irregular schedules as a spaceflight risk. ' +
        'Protect sleep time, lighten duties for a few days and recheck readings each morning.'
    },
    {
      id: 'baseline',
      words: ['baseline', 'normal', 'band', 'spread', 'score', 'personal'],
      answer: 'Every crew member has their own normal for each signal: an average and a ' +
        'usual spread. A score of +2 means two spreads above that person\'s average. The ' +
        'same heart rate can be fine for one astronaut and a warning for another.'
    },
    {
      id: 'levels',
      words: ['watch', 'caution', 'level', 'levels'],
      answer: 'WATCH: one signal is 2 or more spreads from the person\'s normal. CAUTION: ' +
        'two or more signals are. EMERGENCY: any signal is 3 or more spreads away, or ' +
        'blood oxygen is falling fast.'
    },
    {
      id: 'earth',
      words: ['earth', 'mission control', 'delay', 'ground', 'doctor'],
      answer: function (ctx) {
        return 'Far from Earth, messages take a long time each way, so the crew must act ' +
          'first and confirm with Mission Control later. NASA lists distance from Earth as ' +
          'a hazard of spaceflight. The Earth delay is ' +
          (ctx.delayOn ? 'ON: an answer takes 30 seconds.' : 'OFF: an answer takes 2 seconds.');
      }
    }
  ];

  // Questions the screen offers as one-tap buttons.
  Assistant.suggestions = [
    'How am I doing?', 'What should I do?', 'What are signs of low oxygen?',
    'How do I calm a panic attack?', 'What does CO2 buildup feel like?',
    'What is my baseline?'
  ];

  // ---- The matcher: score every topic by how many of its words appear in
  // the question, and answer with the best one.
  Assistant.answer = function (question, ctx) {
    const q = ' ' + question.toLowerCase().replace(/[^a-z0-9' ]/g, ' ') + ' ';
    let best = null;
    let bestScore = 0;
    TOPICS.forEach(function (topic) {
      let score = 0;
      topic.words.forEach(function (word) {
        // Short words must match as whole words, so "hr" does not match "three".
        if (q.indexOf(word.length <= 3 ? ' ' + word + ' ' : word) !== -1) {
          score += word.indexOf(' ') !== -1 ? 2 : 1;   // phrases count double
        }
      });
      if (score > bestScore) { best = topic; bestScore = score; }
    });
    if (!best) {
      return { topic: 'unknown', text: 'I can answer basic questions about heart rate, ' +
        'breathing, blood oxygen, CO2, panic, heat, sleep, the alert levels, baselines and ' +
        'the Earth delay. Try "How am I doing?" or "What should I do?".' };
    }
    const text = typeof best.answer === 'function' ? best.answer(ctx) : best.answer;
    return { topic: best.id, text: text.trim() };
  };
})();