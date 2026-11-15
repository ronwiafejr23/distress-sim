// ui.js  (Kenya) - the front end. Draws the board and every detail page, AND
// is the file that plugs the data, the engine and the detector together.
(function () {
  const LEVEL_TEXT = {
    normal: 'NORMAL', watch: 'WATCH', caution: 'CAUTION', emergency: 'EMERGENCY'
  };
  const MAX_POINTS = 60;   // how many seconds each chart shows
  // Add ?speed=10 to the page address to run 10x faster while testing.
  const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

  const pages = {};        // every screen lives here: pages.board, pages.crew, ...
  let current = 'board';   // the screen being shown
  let state = null;        // everything the screens show
  const chat = [];         // the health assistant conversation

  function el(id) { return document.getElementById(id); }
  function set(id, text) { const node = el(id); if (node) { node.textContent = text; } }
  function setClass(id, name) { const node = el(id); if (node) { node.className = name; } }

  // A fresh, empty run for the crew member picked in the dropdown.
  function newState() {
    const s = {
      crew: window.CREW.find(function (c) { return c.id === el('crewSelect').value; }),
      scenario: null, running: false, delayOn: true,
      t: 0, reading: null, result: null,
      series: {}, low: {}, high: {},       // chart history and extremes per signal
      levelLog: [],                        // every change of alert level
      guideOpen: false, order: [], taken: [],
      mission: { status: 'idle', dueAt: null, text: '' },
      debrief: null, ended: null
    };
    window.SIGNALS.forEach(function (sig) { s.series[sig.key] = []; });
    return s;
  }

  // Fill the two dropdowns from the shared data.
  function fillSetup() {
    window.CREW.forEach(function (c) {
      el('crewSelect').add(new Option(c.name + ' - ' + c.role, c.id));
    });
    el('scenarioSelect').add(new Option('Surprise me', 'random'));
    window.SCENARIOS.forEach(function (s) {
      el('scenarioSelect').add(new Option(s.name, s.id));
    });
  }
  fillSetup();
  state = newState();

  // Small helpers every screen uses.
  function valueOf(key) {
    return state.reading ? state.reading.values[key] : state.crew.baseline[key].mean;
  }
  function scoreOf(key) { return state.result ? state.result.scores[key] : 0; }
  function statusOf(key) {
    const z = Math.abs(scoreOf(key));
    return z >= 3 ? 'emergency' : (z >= 2 ? 'watch' : 'normal');
  }
  function chipText(key) {
    if (statusOf(key) === 'normal') { return 'IN RANGE'; }
    return scoreOf(key) > 0 ? 'HIGH' : 'LOW';
  }
  function signed(z) { return (z > 0 ? '+' : '') + z; }
  function bandText(key) {
    const b = state.crew.baseline[key];
    return (b.mean - 2 * b.sd).toFixed(1) + ' to ' + (b.mean + 2 * b.sd).toFixed(1);
  }
  function level() { return state.result ? state.result.level : 'normal'; }
  function whyText() {
    if (!state.result || state.result.level === 'normal') {
      return 'All readings are inside this person\'s normal band.';
    }
    const names = state.result.drivers.map(function (key) {
      const sig = window.SIGNALS.find(function (s) { return s.key === key; });
      return sig.label + ' ' + (scoreOf(key) > 0 ? 'high' : 'low');
    });
    return names.length ? names.join(', ') : 'Blood oxygen is falling fast';
  }

  // ---- STEP 5: the chart ----
  // Returns one line chart as SVG text. The shaded band is this person's own
  // normal range (mean plus and minus 2 spreads). Small = card, detailed = page.
  function chartSvg(key, width, height, detailed) {
    const base = state.crew.baseline[key];
    const data = state.series[key];
    const bandLow = base.mean - 2 * base.sd;
    const bandHigh = base.mean + 2 * base.sd;
    let min = bandLow - base.sd;
    let max = bandHigh + base.sd;
    data.forEach(function (v) {
      min = Math.min(min, v - base.sd / 2);
      max = Math.max(max, v + base.sd / 2);
    });
    const left = detailed ? 46 : 2, right = 8, top = 8, bottom = detailed ? 22 : 6;
    function x(i) { return left + (width - left - right) * (i / (MAX_POINTS - 1)); }
    function y(v) { return top + (height - top - bottom) * (1 - (v - min) / (max - min)); }

    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" ' +
      'aria-label="chart">';
    svg += '<rect x="' + left + '" y="' + y(bandHigh) + '" width="' + (width - left - right) +
      '" height="' + (y(bandLow) - y(bandHigh)) + '" fill="#33d17a" opacity="0.12"/>';
    if (detailed) {
      [bandHigh, base.mean, bandLow].forEach(function (v) {
        svg += '<line x1="' + left + '" x2="' + (width - right) + '" y1="' + y(v) +
          '" y2="' + y(v) + '" stroke="#1d2638" stroke-dasharray="4 4"/>' +
          '<text x="' + (left - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" ' +
          'font-size="11" fill="#8a96ad">' + v.toFixed(1) + '</text>';
      });
      svg += '<text x="' + left + '" y="' + (height - 5) + '" font-size="11" fill="#8a96ad">T+' +
        Math.max(0, state.t - data.length + 1) + 's</text>' +
        '<text x="' + (width - right) + '" y="' + (height - 5) + '" text-anchor="end" ' +
        'font-size="11" fill="#8a96ad">shaded band = this person\'s normal</text>';
    }
    if (data.length > 0) {
      const points = data.map(function (v, i) {
        return x(i).toFixed(1) + ',' + y(v).toFixed(1);
      });
      const lastX = x(data.length - 1), lastY = y(data[data.length - 1]);
      const floor = height - bottom;
      svg += '<polygon points="' + x(0) + ',' + floor + ' ' + points.join(' ') + ' ' +
        lastX + ',' + floor + '" fill="#46d3ff" opacity="0.10"/>' +
        '<polyline points="' + points.join(' ') + '" fill="none" stroke="#46d3ff" ' +
        'stroke-width="2"/>' +
        '<circle cx="' + lastX + '" cy="' + lastY + '" r="3.5" fill="#46d3ff"/>';
    }
    return svg + '</svg>';
  }

  // ---- STEP 6: the board (home page) ----
  // card() makes one kanban card. Every card is a link to its own detail page.
  function card(page, id, title, extra) {
    return '<a class="card" id="card-' + id + '" href="#' + page + '">' +
      '<div class="card-top"><span class="card-title">' + title + '</span>' +
      '<span class="chip" id="chip-' + id + '"></span></div>' + (extra || '') +
      '<div class="card-main" id="main-' + id + '"></div>' +
      '<div class="card-sub" id="sub-' + id + '"></div>' +
      '<div class="card-open">OPEN DETAILS &gt;</div></a>';
  }
  function column(title, count, cards) {
    return '<section class="column"><div class="col-head"><span class="col-title">' + title +
      '</span><span class="col-count">' + count + '</span></div><div class="cards">' + cards +
      '</div></section>';
  }

  pages.board = {
    build: function () {
      let vitals = '';
      window.SIGNALS.forEach(function (sig) {
        vitals += card('vital-' + sig.key, sig.key, sig.label,
          '<div class="big"><span id="val-' + sig.key + '"></span> <small>' + sig.unit +
          '</small></div><div class="spark" id="spark-' + sig.key + '"></div>');
      });
      return '<div class="board">' +
        column('CREW AND COMMS', 3, card('crew', 'crew', 'Crew member') +
          card('mission', 'mission', 'Mission Control') +
          card('assistant', 'assistant', 'Health assistant')) +
        column('MED BAY: VITAL SIGNS', window.SIGNALS.length, vitals) +
        column('FLIGHT DECK: RESPONSE', 3, card('alert', 'alert', 'Alert status') +
          card('actions', 'actions', 'Action guide') + card('debrief', 'debrief', 'Debrief')) +
        '</div>';
    },
    update: function () {
      const lvl = level();
      // Crew card
      set('main-crew', state.crew.name);
      set('sub-crew', state.crew.role);
      set('chip-crew', state.running ? 'MONITORING' : 'STANDBY');
      // Mission Control card
      set('main-mission', missionText());
      set('sub-mission', 'Earth delay is ' + (el('delayToggle').checked ? 'ON' : 'OFF'));
      set('chip-mission', state.mission.status.toUpperCase());
      // Health assistant card
      const last = chat.length ? chat[chat.length - 1] : null;
      set('main-assistant', 'Ask a health question');
      set('sub-assistant', last ? last.text.slice(0, 90) + (last.text.length > 90 ? '...' : '')
        : 'Basic health and distress facts, onboard and offline');
      set('chip-assistant', 'ONBOARD');
      // One card per vital sign
      window.SIGNALS.forEach(function (sig) {
        const key = sig.key;
        set('val-' + key, valueOf(key));
        set('chip-' + key, chipText(key));
        setClass('chip-' + key, 'chip is-' + statusOf(key));
        setClass('card-' + key, 'card is-' + statusOf(key));
        set('sub-' + key, 'Normal ' + bandText(key) + ' ' + sig.unit);
        // Draw the small chart at the card's real width so a wide card keeps
        // the same height as the others.
        const spark = el('spark-' + key);
        spark.innerHTML = chartSvg(key, Math.max(200, spark.clientWidth || 260), 54, false);
      });
      // Response cards
      set('main-alert', state.running || state.reading ? LEVEL_TEXT[lvl] : 'STANDBY');
      set('sub-alert', whyText());
      setClass('card-alert', 'card is-' + lvl);
      set('chip-alert', state.levelLog.length + ' CHANGES');
      set('main-actions', state.guideOpen ? 'Guide is open' : 'Locked until the first alert');
      set('sub-actions', state.taken.length + ' steps used');
      set('chip-actions', state.guideOpen ? 'ACT NOW' : 'LOCKED');
      setClass('chip-actions', 'chip' + (state.guideOpen && state.running ? ' is-caution' : ''));
      set('main-debrief', state.debrief
        ? (state.debrief.outcome === 'stabilized' ? 'Crew member stabilized' : 'Not stabilized')
        : 'Ready when the run ends');
      set('sub-debrief', state.debrief ? 'Run length ' + state.debrief.totalSeconds + ' s' : '');
      set('chip-debrief', state.debrief ? 'READY' : 'WAITING');
    }
  };

  function missionText() {
    if (state.mission.status === 'waiting') {
      return 'Answer arrives in ' + Math.max(0, state.mission.dueAt - state.t) + ' s';
    }
    if (state.mission.status === 'answered') { return 'Answer received'; }
    return 'No question sent';
  }

  // ---- STEP 7: the detail pages for vital signs, crew and alert ----
  const BACK = '<a class="back" href="#board">&lt; BACK TO BOARD</a>';
  function fact(label, id) {
    return '<div class="fact"><span>' + label + '</span><b id="' + id + '"></b></div>';
  }

  // One page per vital sign: pages['vital-hr'], pages['vital-br'], ...
  window.SIGNALS.forEach(function (sig) {
    const key = sig.key;
    pages['vital-' + key] = {
      build: function () {
        return '<div class="page">' + BACK +
          '<div class="page-head"><h2>' + sig.label + '</h2>' +
          '<span class="chip" id="pg-chip"></span></div>' +
          '<div class="hero" id="pg-hero"><span id="pg-value"></span> <small>' + sig.unit +
          '</small></div><div id="pg-chart"></div>' +
          '<div class="facts">' + fact('Their normal', 'pg-mean') + fact('Normal band', 'pg-band') +
          fact('Spreads from normal', 'pg-score') + fact('Lowest this run', 'pg-low') +
          fact('Highest this run', 'pg-high') + '</div>' +
          '<p>The shaded band is ' + state.crew.name + '\'s own normal range for ' +
          sig.label.toLowerCase() + '. The detector counts a signal as off when it is 2 or ' +
          'more spreads outside that range, and as an emergency at 3 or more.</p></div>';
      },
      update: function () {
        const b = state.crew.baseline[key];
        set('pg-value', valueOf(key));
        set('pg-chip', chipText(key));
        setClass('pg-chip', 'chip is-' + statusOf(key));
        setClass('pg-hero', 'hero is-' + statusOf(key));
        el('pg-chart').innerHTML = chartSvg(key, 720, 260, true);
        set('pg-mean', b.mean + ' ' + sig.unit);
        set('pg-band', bandText(key));
        set('pg-score', signed(scoreOf(key)));
        set('pg-low', state.low[key] === undefined ? '-' : state.low[key]);
        set('pg-high', state.high[key] === undefined ? '-' : state.high[key]);
      }
    };
  });

  pages.crew = {
    build: function () {
      let rows = '';
      window.SIGNALS.forEach(function (sig) {
        const b = state.crew.baseline[sig.key];
        rows += '<tr><td>' + sig.label + '</td><td id="cw-val-' + sig.key + '"></td>' +
          '<td>' + b.mean + ' ' + sig.unit + '</td><td>' + bandText(sig.key) + '</td>' +
          '<td id="cw-score-' + sig.key + '"></td></tr>';
      });
      let compare = '';
      window.CREW.forEach(function (c) {
        compare += '<tr' + (c.id === state.crew.id ? ' class="me"' : '') + '><td>' + c.name +
          '</td>';
        window.SIGNALS.forEach(function (sig) {
          compare += '<td>' + c.baseline[sig.key].mean + '</td>';
        });
        compare += '</tr>';
      });
      let heads = '';
      window.SIGNALS.forEach(function (sig) { heads += '<th>' + sig.label + '</th>'; });
      return '<div class="page">' + BACK + '<h2>' + state.crew.name + '</h2>' +
        '<p>' + state.crew.role + '</p><h3>LIVE READINGS</h3><div class="table-wrap"><table>' +
        '<tr><th>Signal</th><th>Now</th><th>Their normal</th><th>Normal band</th>' +
        '<th>Spreads from normal</th></tr>' + rows + '</table></div>' +
        '<h3>WHY EACH PERSON HAS THEIR OWN NORMAL</h3><p>The same reading can be fine for one ' +
        'crew member and a warning for another, so every alert is judged against the ' +
        'person\'s own baseline.</p><div class="table-wrap"><table><tr><th>Crew member</th>' +
        heads + '</tr>' + compare + '</table></div></div>';
    },
    update: function () {
      window.SIGNALS.forEach(function (sig) {
        set('cw-val-' + sig.key, valueOf(sig.key) + ' ' + sig.unit);
        set('cw-score-' + sig.key, signed(scoreOf(sig.key)));
        setClass('cw-score-' + sig.key, statusOf(sig.key) === 'normal' ? '' : 'off');
      });
    }
  };

  pages.alert = {
    build: function () {
      return '<div class="page">' + BACK + '<h2>Alert status</h2>' +
        '<div class="hero" id="al-level"></div><p id="al-why"></p>' +
        '<h3>HOW THE LEVEL IS DECIDED</h3>' +
        '<ul><li>WATCH: one signal is 2 or more spreads from this person\'s normal.</li>' +
        '<li>CAUTION: two or more signals are.</li>' +
        '<li>EMERGENCY: any signal is 3 or more spreads away, or blood oxygen is ' +
        'falling fast.</li></ul>' +
        '<h3>TIMELINE</h3><ol class="log" id="al-log"></ol></div>';
    },
    update: function () {
      const lvl = level();
      set('al-level', state.running || state.reading ? LEVEL_TEXT[lvl] : 'STANDBY');
      setClass('al-level', 'hero is-' + lvl);
      set('al-why', whyText());
      let items = '';
      state.levelLog.forEach(function (entry) {
        items += '<li>T+' + entry.t + 's - ' + LEVEL_TEXT[entry.level] + ' - ' + entry.why +
          '</li>';
      });
      el('al-log').innerHTML = items || '<li>No level changes yet.</li>';
    }
  };

  // ---- STEP 8: the action guide and Mission Control pages ----
  pages.actions = {
    build: function () {
      if (!state.guideOpen) {
        return '<div class="page">' + BACK + '<h2>Action guide</h2><div class="locked">' +
          'The guide unlocks at the first alert. Keep watching the board.</div></div>';
      }
      let buttons = '';
      state.order.forEach(function (action) {
        const used = state.taken.some(function (a) { return a.id === action.id; });
        buttons += '<button data-id="' + action.id + '"' +
          (used ? ' class="done" disabled' : '') + '>' + action.label + '</button>';
      });
      return '<div class="page">' + BACK + '<h2>Action guide</h2>' +
        '<p>Choose the steps the crew should take. Each step can be used once. ' +
        'You find out which were right in the debrief.</p>' +
        '<div class="steps" id="stepList">' + buttons + '</div>' +
        '<p id="stepCount"></p><a class="back" href="#mission">ASK MISSION CONTROL &gt;</a></div>';
    },
    bind: function () {
      const list = el('stepList');
      if (!list) { return; }
      list.addEventListener('click', function (event) {
        const button = event.target.closest('button');
        if (!button || button.disabled) { return; }
        const record = window.Engine.applyAction(button.dataset.id);
        if (!record) { return; }
        window.Detector.noteAction(record);
        state.taken.push(record);
        button.disabled = true;
        button.className = 'done';
        pages.actions.update();
      });
    },
    update: function () {
      set('stepCount', state.taken.length + ' of ' + state.order.length + ' steps used.');
    }
  };

  pages.mission = {
    build: function () {
      return '<div class="page">' + BACK + '<h2>Mission Control</h2>' +
        '<p>Far from Earth, a question and its answer each take a long time to travel. ' +
        'With the Earth delay on, the crew has to act on the action guide before any ' +
        'answer can arrive.</p>' +
        '<button id="askBtn" class="primary">Ask Mission Control</button>' +
        '<div class="hero" id="ms-status"></div><p id="ms-text"></p></div>';
    },
    bind: function () {
      el('askBtn').addEventListener('click', function () {
        const wait = window.Engine.askMissionControl();
        if (wait === null) { return; }
        state.mission = { status: 'waiting', dueAt: state.t + wait, text: '' };
        pages.mission.update();
      });
    },
    update: function () {
      el('askBtn').disabled = !state.running || state.mission.status !== 'idle';
      set('ms-status', missionText());
      let text = 'Earth delay is ' + (state.delayOn ? 'ON: an answer takes 30 seconds.'
        : 'OFF: an answer takes 2 seconds.');
      if (state.mission.status === 'waiting') {
        text = 'Question sent. Do not wait for the answer: act on the action guide now.';
      }
      if (state.mission.status === 'answered') { text = state.mission.text; }
      set('ms-text', text);
    }
  };

  // ---- The health assistant page ----
  // Builds what the assistant needs to know about this moment.
  function assistantContext() {
    return { crew: state.crew, reading: state.reading, result: state.result,
             delayOn: el('delayToggle').checked };
  }

  function ask(question) {
    question = question.trim();
    if (!question) { return; }
    let reply = 'The health assistant is not loaded. Check that assistant.js is in index.html.';
    if (window.Assistant) { reply = window.Assistant.answer(question, assistantContext()).text; }
    chat.push({ who: 'you', text: question });
    chat.push({ who: 'assistant', text: reply });
    if (chat.length > 40) { chat.splice(0, 2); }
    if (current === 'assistant') { pages.assistant.update(); }
  }

  pages.assistant = {
    build: function () {
      let chips = '';
      const list = window.Assistant ? window.Assistant.suggestions : [];
      list.forEach(function (q) {
        chips += '<button type="button" data-q="' + q + '">' + q + '</button>';
      });
      return '<div class="page">' + BACK + '<h2>Health assistant</h2>' +
        '<p>Ask basic health and distress questions. It runs onboard with no internet, so it ' +
        'still answers when Earth is out of reach. General information for a simulator, not ' +
        'medical advice.</p><div class="chips" id="chips">' + chips + '</div>' +
        '<div class="chat" id="chatLog"></div>' +
        '<form class="ask-row" id="askForm"><label class="sr" for="askInput">Your question</label>' +
        '<input id="askInput" autocomplete="off" placeholder="Type a question, for example: ' +
        'is my heart rate okay?"><button class="primary" type="submit">Ask</button></form></div>';
    },
    bind: function () {
      el('chips').addEventListener('click', function (event) {
        const button = event.target.closest('button');
        if (button) { ask(button.dataset.q); }
      });
      el('askForm').addEventListener('submit', function (event) {
        event.preventDefault();
        ask(el('askInput').value);
        el('askInput').value = '';
        el('askInput').focus();
      });
    },
    update: function () {
      const log = el('chatLog');
      if (log.childElementCount === chat.length && chat.length > 0) { return; }
      let html = '';
      chat.forEach(function (m) {
        const safe = m.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        html += '<div class="msg ' + m.who + '"><b>' + (m.who === 'you' ? 'You' : 'Assistant') +
          '</b><span>' + safe + '</span></div>';
      });
      log.innerHTML = html || '<div class="msg assistant"><b>Assistant</b><span>Ask me about ' +
        'heart rate, breathing, oxygen, CO2, panic, heat, sleep, or how you are doing right ' +
        'now.</span></div>';
      log.scrollTop = log.scrollHeight;
    }
  };

  // ---- STEP 9: the debrief page ----
  function seconds(value) { return value === null ? 'never' : value + ' s'; }
  function listOrNone(list) { return list.length ? list.join('; ') : 'none'; }

  pages.debrief = {
    build: function () {
      const d = state.debrief;
      if (!d) {
        return '<div class="page">' + BACK + '<h2>Debrief</h2><div class="locked">' +
          'The debrief appears here when a run ends.</div></div>';
      }
      const good = d.outcome === 'stabilized';
      let taken = '';
      state.ended.actions.forEach(function (a) {
        taken += '<tr><td>T+' + a.t + 's</td><td>' + a.label + '</td>' +
          '<td><span class="tag ' + a.effect + '">' + a.effect + '</span></td></tr>';
      });
      return '<div class="page">' + BACK +
        '<h2>Debrief: ' + d.scenarioName + '</h2><p>' + d.crewName + '</p>' +
        '<p class="outcome ' + (good ? 'good' : 'bad') + '">' +
        (good ? 'Crew member stabilized' : 'Not stabilized in time') + '</p>' +
        '<div class="table-wrap"><table>' +
        '<tr><td>Time to detect</td><td>' + seconds(d.timeToDetect) + '</td></tr>' +
        '<tr><td>Alert to first correct step</td><td>' + seconds(d.timeToAct) + '</td></tr>' +
        '<tr><td>Highest alert level</td><td>' + LEVEL_TEXT[d.peakLevel] + '</td></tr>' +
        '<tr><td>Wrong steps</td><td>' + listOrNone(d.wrongSteps) + '</td></tr>' +
        '<tr><td>Right steps missed</td><td>' + listOrNone(d.missedSteps) + '</td></tr>' +
        '<tr><td>Run length</td><td>' + d.totalSeconds + ' s</td></tr>' +
        '</table></div>' +
        (taken ? '<h3>STEPS TAKEN</h3><div class="table-wrap"><table>' + taken +
          '</table></div>' : '') + '</div>';
    },
    update: function () {}
  };

  // ---- STEP 10: moving between pages, and the banner ----
  // show() swaps what is inside <main id="view">. The run keeps going because
  // the browser never leaves index.html.
  function show(name) {
    if (!pages[name]) { name = 'board'; }
    current = name;
    el('view').innerHTML = pages[name].build();
    if (pages[name].bind) { pages[name].bind(); }
    pages[name].update();
    window.scrollTo(0, 0);
  }

  function go(name) {
    show(name);
    try {
      if (location.hash !== '#' + name) { location.hash = name; }
    } catch (e) { /* the page still works without the address changing */ }
  }

  // Any link like <a href="#crew"> opens that page.
  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link) { return; }
    event.preventDefault();
    go(link.getAttribute('href').slice(1));
  });
  // The browser's own Back button works too.
  window.addEventListener('hashchange', function () {
    const name = location.hash.slice(1) || 'board';
    if (name !== current) { show(name); }
  });

  function updateBanner() {
    const lvl = level();
    let name = 'idle', word = 'STANDBY';
    let detail = 'Pick a crew member and a scenario, then press Start run.';
    if (state.debrief) {
      word = 'RUN ENDED';
      detail = 'Open the debrief to see how the crew did.';
    } else if (state.running) {
      name = lvl; word = LEVEL_TEXT[lvl]; detail = whyText();
    }
    el('alertBanner').className = 'banner level-' + name;
    set('alertLevel', word);
    set('alertDetail', detail);
    set('clock', 'T+' + state.t + 's');
    set('linkLabel', 'EARTH LINK: ' + (el('delayToggle').checked ? 'DELAYED' : 'LIVE'));
  }

  function setButtons() {
    el('startBtn').disabled = state.running;
    el('stopBtn').disabled = !state.running;
    el('crewSelect').disabled = state.running;
    el('scenarioSelect').disabled = state.running;
    el('delayToggle').disabled = state.running;
  }

  // ---- STEP 11: THE WIRING - this is where the four parts become one app ----
  function startRun() {
    state = newState();
    let scenarioId = el('scenarioSelect').value;
    if (scenarioId === 'random') {
      scenarioId = window.SCENARIOS[Math.floor(Math.random() * window.SCENARIOS.length)].id;
    }
    state.scenario = window.SCENARIOS.find(function (s) { return s.id === scenarioId; });
    // Shuffle a copy so the right steps are not always listed first.
    state.order = state.scenario.actions.slice().sort(function () {
      return Math.random() - 0.5;
    });
    state.running = true;
    state.delayOn = el('delayToggle').checked;

    window.Detector.reset(state.crew, state.scenario);
    window.Engine.start({
      crewId: state.crew.id,
      scenarioId: state.scenario.id,
      earthDelay: state.delayOn,
      delaySeconds: 30,
      speed: SPEED
    });
    setButtons();
    updateBanner();
    go(current === 'debrief' ? 'board' : current);
  }

  function stopRun() {
    window.Engine.stop();
    state.running = false;
    setButtons();
    updateBanner();
    pages[current].update();
  }

  // Every second: engine -> detector -> screen.
  window.Engine.on('tick', function (reading) {
    const before = level();
    const result = window.Detector.update(reading);
    state.t = reading.t;
    state.reading = reading;
    state.result = result;
    window.SIGNALS.forEach(function (sig) {
      const key = sig.key, v = reading.values[key];
      state.series[key].push(v);
      if (state.series[key].length > MAX_POINTS) { state.series[key].shift(); }
      state.low[key] = state.low[key] === undefined ? v : Math.min(state.low[key], v);
      state.high[key] = state.high[key] === undefined ? v : Math.max(state.high[key], v);
    });
    if (result.level !== before) {
      state.levelLog.push({ t: reading.t, level: result.level, why: whyText() });
    }
    updateBanner();
    if (result.level !== 'normal' && !state.guideOpen) {
      state.guideOpen = true;                       // the guide opens at the first alert
      if (current === 'actions') { show('actions'); return; }
    }
    pages[current].update();
  });

  // Mission Control's delayed answer has arrived.
  window.Engine.on('reply', function (reply) {
    state.mission = { status: 'answered', dueAt: null, text: reply.text };
    pages[current].update();
  });

  // The run is over: engine -> detector -> debrief page.
  window.Engine.on('end', function (info) {
    window.Detector.finish(info);
    state.debrief = window.Detector.getDebrief();
    state.ended = info;
    state.running = false;
    setButtons();
    updateBanner();
    go('debrief');
  });

  el('startBtn').addEventListener('click', startRun);
  el('stopBtn').addEventListener('click', stopRun);
  el('crewSelect').addEventListener('change', function () {
    state = newState();
    show(current);
  });
  el('delayToggle').addEventListener('change', function () {
    updateBanner();
    pages[current].update();
  });
  show(location.hash.slice(1) || 'board');
  updateBanner();
})();
