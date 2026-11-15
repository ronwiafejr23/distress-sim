# distress-sim

**Crew Health Distress Simulator.** Health monitoring software for astronauts on long missions. It catches a health emergency early by comparing each reading with that astronaut's own normal, then guides the crew through what to do when Earth is too far away to help in time.

Built for the **NASA Space Apps Challenge 2026**, challenge: *Create Health Monitoring Software for Astronauts on Space Missions*.

**Live demo:** https://ronwiafejr23.github.io/distress-sim/

> All vital-sign data in this app is **simulated**. It is a hackathon prototype, not a medical device.

---

## Objectives

The challenge asks for software that gathers health indicators and lets astronauts evaluate and act on the status of their health. Our app does all three:

| Objective | How the app does it |
|---|---|
| **Gather** health indicators | Streams heart rate, breathing rate, blood oxygen, skin temperature and a stress score every second |
| **Evaluate** health status | Scores every reading against that crew member's *own* normal and sets an alert level: Normal, Watch, Caution or Emergency |
| **Act** on it | Unlocks an action guide at the first alert, simulates the delay in reaching Mission Control, and scores the crew's response in a debrief |

## Motivation

On the way to Mars, a crew cannot call a doctor and get an answer right away. NASA's Human Research Program lists **distance from Earth** as one of the five hazards of human spaceflight: the farther crews travel, the harder it is to get instructions and medical care from Earth, so self-sufficiency becomes essential.

Most health monitors use one fixed alarm line for everyone. But a heart rate of 70 is ordinary for one astronaut and a warning sign for an athlete whose resting rate is 50. A **personal baseline** catches problems that a fixed line would miss, and avoids false alarms for people whose normal is simply different.

A simulator is how a crew can practice these emergencies before launch, and how the detector can be tested safely without real astronaut sensor data, which is protected for privacy.

## Features

- **Kanban-style board**: every vital sign, the crew member, Mission Control, the alert, the action guide and the debrief is a card. Click a card to open its detail page.
- **Personal-baseline detector**: alerts are based on how far a reading is from that person's normal, not a single fixed number.
- **Three emergency scenarios**, each tied to a NASA Human Research Program risk:

  | Scenario | NASA hazard or risk |
  |---|---|
  | Panic during a spacewalk | Isolation and confinement; behavioral changes |
  | Cabin CO2 buildup | Hostile and closed environments |
  | Low blood oxygen | Hypoxia |

- **Earth-delay switch**: with it on, Mission Control's answer takes 30 seconds, so the crew has to act on the guide first.
- **Onboard health assistant**: answers basic health and distress questions such as "How am I doing?" or "What are signs of low oxygen?". It works offline, so it still answers when Earth is out of reach. It matches keywords to answers stored in the app; it is not an AI model.
- **Debrief**: time to detect, time to the first correct step, wrong steps taken and right steps missed.

## How to run

### Online

Open https://ronwiafejr23.github.io/distress-sim/ in Chrome, Edge or Firefox.

### On your computer

No install, server or build step is needed.

```
git clone https://github.com/ronwiafejr23/distress-sim.git
cd distress-sim
```

Then double-click `index.html` to open it in your browser.

### Try a run

1. Pick a **crew member** and a **scenario** at the top. Leave **Earth delay** on.
2. Press **Start run**. For about 8 seconds every card reads normal.
3. Watch the readings drift and the banner change to WATCH, CAUTION, then EMERGENCY.
4. When the **Action guide** card says ACT NOW, open it and choose the steps you think are right.
5. Try the **Health assistant** card and tap "How am I doing?".
6. When the run ends, the **Debrief** page shows how the crew did.

**Tip:** add `?speed=5` to the end of the address to run five times faster, for example `index.html?speed=5`.

### Test pages

| Page | What it checks |
|---|---|
| `check-data.html` | Validates the crew and scenario data. The first line should say ALL CHECKS PASSED. |
| `test-engine.html` | Runs the engine alone and prints a reading every second. |
| `test-detector.html` | Type a heart rate and blood oxygen by hand and see the alert level. |

Press **F12** and open the **Console** tab to see any errors.

## How it works

`index.html` loads the files in this order. Each one adds its part to the page under an agreed name, and the next files use it.

| File | Owner | What it does |
|---|---|---|
| `data.js` | Abby | The crew members, the five vital signs and the scenarios. Pure data, so a new scenario needs no new code. |
| `engine.js` | Ron | Back end. Makes a new reading every second, runs the scenario through onset, escalation and peak, reacts to the crew's steps and handles the Earth delay. |
| `detector.js` | Ade | Scores each reading as (value - that person's average) / their usual spread, smooths out noise, and sets the alert level. |
| `assistant.js` | Abby | The onboard health assistant. |
| `ui.js`, `style.css` | Kenya | Front end. The board, detail pages, live charts, and the wiring that connects every part. |

Every second: the engine sends a reading, the detector scores it, and the screen updates.

## Team

- **Ron Wiafe Jr.**: engine (back end and simulation)
- **Ade**: detector (data science and algorithms)
- **Kenya**: interface (front end and data visualization)
- **Abby**: scenarios, health assistant, testing and pitch

## Data and sources

Real astronaut vital-sign data is protected for privacy, so all readings and crew baselines in this app are simulated. The scenarios and assistant answers are built around named risks from NASA's Human Research Program:

- [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/), NASA Human Research Program
- [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), NASA Human Research Program
