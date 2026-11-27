// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over. Three missions are picked on the title screen.
//
// ?seed=N fixes the valley and the rings. ?shot=start|play|cockpit|end (with
// &seed=N and &view=chase|cockpit) stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.
import { STEP, MISSIONS, BEST_KEY_PREFIX } from './config.js';
import { createFlight, EVENT_LANDED, EVENT_TOOK_OFF, EVENT_FUEL_EMPTY, EVENT_DAMAGE } from './flight.js';
import { createMission, EVENT_RING, EVENT_FINISH, EVENT_FAIL } from './missions.js';
import { createRenderer, CAMERA_CHASE, CAMERA_COCKPIT, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_CAMERA, ACTION_MUTE, ACTION_RESTART } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const viewParam = params.get('view') === 'cockpit' ? CAMERA_COCKPIT : CAMERA_CHASE;
const missionParam = params.get('mission') || MISSIONS[0].id;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const panelEl = document.getElementById('panel');
const shotInfoEl = document.getElementById('shot-info');

const hud = createHud(document);
const audio = createAudio();
const renderer = createRenderer(canvas, false);

let missionIndex = Math.max(0, MISSIONS.findIndex((m) => m.id === missionParam));
let mission = createMission(MISSIONS[missionIndex], seed + missionIndex);
let flight = createFlight(MISSIONS[missionIndex]);
let cameraMode = viewParam;

function readBest(id) {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY_PREFIX + id) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(id, value) {
  try {
    window.localStorage.setItem(BEST_KEY_PREFIX + id, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function selectMission(index, start) {
  missionIndex = index;
  const def = MISSIONS[missionIndex];
  mission = createMission(def, seed + missionIndex);
  flight = createFlight(def);
  renderer.setDusk(def.dusk);
  renderer.buildRings(mission);
  renderer.snapCamera(flight, cameraMode);
  if (start) return true;
  return false;
}

function missionButtons() {
  return MISSIONS.map((m, i) => {
    const best = readBest(m.id);
    return `<button class="mission${i === missionIndex ? ' selected' : ''}" data-mission="${i}">
      <span class="mission-name">${m.name}</span>
      <span class="mission-blurb">${m.blurb}</span>
      <span class="mission-meta">${m.rings} rings · ${m.fuel} fuel · ${Math.floor(m.timeLimit / 60)}:${String(m.timeLimit % 60).padStart(2, '0')} · Best ${best}</span>
    </button>`;
  }).join('');
}

function showTitle() {
  panelEl.innerHTML = `<h1>Ridgeline Courier</h1>
    <p class="tag">A bush-plane courier over a mountain valley. Fly the rings, mind the fuel, bring her home.</p>
    <div class="missions">${missionButtons()}</div>
    <p class="controls">Fly: ← → ↑ ↓ or W A S D · Throttle: Shift / Ctrl · Mouse: hold and drag to steer · C: camera · M: sound · P: pause</p>
    <p class="hint">Click a mission to fly it, or press Space</p>`;
  panelEl.classList.remove('hidden');
  panelEl.querySelectorAll('button.mission').forEach((button) => {
    button.addEventListener('click', () => {
      audio.resume();
      selectMission(Number(button.dataset.mission), true);
      startGame();
    });
  });
}

function showPaused() {
  panelEl.innerHTML = `<h1>Paused</h1><p class="tag">The valley will wait. Press P to keep flying.</p>`;
  panelEl.classList.remove('hidden');
}

function showOver(title, lines) {
  const def = MISSIONS[missionIndex];
  const best = readBest(def.id);
  const rows = lines.map((l) => `<p class="score-line">${l}</p>`).join('');
  panelEl.innerHTML = `<h1>${title}</h1>${rows}<p class="score-line">Best on ${def.name}: ${best}</p>
    <p class="hint">Press Space or click to fly again · R restarts · 1/2/3 picks a mission</p>`;
  panelEl.classList.remove('hidden');
}

function hidePanel() {
  panelEl.classList.add('hidden');
}

function announce(message) {
  statusEl.textContent = message;
}

function runShot(name) {
  selectMission(missionIndex, false);
  const scene = stageShot(name, flight, mission);
  renderer.snapCamera(flight, name === 'cockpit' ? CAMERA_COCKPIT : viewParam);
  const mode = name === 'cockpit' ? CAMERA_COCKPIT : viewParam;
  let painted = 0;
  function paint() {
    renderer.draw(flight, mission, STEP, flight.state.elapsed, mode);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      const f = flight.state;
      const m = mission.state;
      shotInfoEl.textContent = JSON.stringify({
        shot: name, screen: scene.screen, score: m.score, rings: m.ringsPassed,
        finished: m.finished, failed: m.failed, reason: m.failReason || f.crashReason || '',
        fuel: Math.round(f.fuel), speed: Math.round(f.speed), altitude: Math.round(f.pos.y),
        pos: { x: Math.round(f.pos.x), y: Math.round(f.pos.y), z: Math.round(f.pos.z) },
      });
      window.__shotReady = true;
    }
  }
  if (scene.screen === SCREEN_TITLE) showTitle();
  else if (scene.screen === SCREEN_OVER) {
    const m = mission.state;
    showOver(
      m.finished ? 'Mission complete' : 'Flight over',
      m.finished
        ? [`Score ${m.score} — rings ${m.ringsPassed}, landing bonus banked.`]
        : [`Score ${m.score} — ${m.failReason || flight.state.crashReason || 'the flight ended.'}`],
    );
  } else {
    hidePanel();
  }
  hud.setVisible(scene.screen === SCREEN_PLAY);
  if (scene.screen === SCREEN_PLAY) hud.update(flight, mission, 0);
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(MISSIONS[missionIndex].id);
  let accumulator = 0;
  let last = performance.now();

  selectMission(missionIndex, false);
  showTitle();
  hud.setVisible(false);
  announce('Ridgeline Courier. Pick a mission, then press Space to fly.');

  function startGame() {
    flight.reset();
    const m = mission.state;
    m.nextRing = 0;
    m.score = 0;
    m.timeLeft = m.def.timeLimit;
    m.finished = false;
    m.failed = false;
    m.ringsPassed = 0;
    m.landedHome = false;
    for (const ring of m.rings) ring.passed = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    hidePanel();
    hud.setVisible(true);
    audio.resume();
    renderer.snapCamera(flight, cameraMode);
    announce(`Flying ${MISSIONS[missionIndex].name}. ${mission.state.rings.length} rings.`);
  }

  function endGame(title, lines) {
    screen = SCREEN_OVER;
    const m = mission.state;
    if (m.score > best) {
      best = m.score;
      saveBest(MISSIONS[missionIndex].id, best);
    }
    hud.setVisible(false);
    showOver(title, lines);
    announce(`${title}. Score ${m.score}. Best ${best}.`);
  }

  function finishMission() {
    const m = mission.state;
    endGame('Mission complete', [
      `Score ${m.score} — all ${m.rings.length} rings, landed on the strip.`,
      `Time left ${Math.max(0, Math.ceil(m.timeLeft))} s, fuel ${Math.round(flight.state.fuel)} left.`,
    ]);
  }

  function failMission(reason) {
    const m = mission.state;
    endGame('Flight over', [`Score ${m.score} — ${reason}`]);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      hud.showMessage(muted ? 'Sound off' : 'Sound on', 1.5);
    }
    if (actions & ACTION_CAMERA) {
      cameraMode = cameraMode === CAMERA_CHASE ? CAMERA_COCKPIT : CAMERA_CHASE;
      hud.showMessage(cameraMode === CAMERA_COCKPIT ? 'Cockpit camera' : 'Chase camera', 1.5);
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) {
        selectMission(missionIndex, false);
        startGame();
      }
      return;
    }
    if (actions & ACTION_RESTART) {
      selectMission(missionIndex, false);
      startGame();
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      showPaused();
      announce('Paused.');
    } else if (actions & ACTION_CONFIRM) {
      audio.resume();
    }
    if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      hidePanel();
      announce('Flying.');
    }
  }

  function handleMissionKeys(event) {
    if (screen !== SCREEN_TITLE && screen !== SCREEN_OVER) return;
    if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      const index = Number(event.code.slice(-1)) - 1;
      if (index < MISSIONS.length) {
        selectMission(index, false);
        best = readBest(MISSIONS[missionIndex].id);
        if (screen === SCREEN_TITLE) showTitle();
        announce(`${MISSIONS[missionIndex].name} selected.`);
      }
    }
  }
  window.addEventListener('keydown', handleMissionKeys);

  function step() {
    const steering = input.steering();
    const events = flight.step(STEP, steering, mission.state.def.wind);
    const missionEvents = mission.step(STEP, flight.state, events);
    if (events & EVENT_LANDED) {
      audio.thud();
      hud.showMessage(mission.state.nextRing >= mission.state.rings.length
        ? 'Down safe on the strip.'
        : 'Touchdown — throttle up to go again.', 3);
    }
    if (events & EVENT_TOOK_OFF) hud.showMessage('Airborne.', 2);
    if (events & EVENT_FUEL_EMPTY) hud.showMessage('Fuel empty — glide her down.', 4);
    if (events & EVENT_DAMAGE) {
      audio.thud();
      hud.showMessage(`Rough landing — hull ${flight.state.damage} of 3.`, 3);
    }
    if (missionEvents & EVENT_RING) {
      audio.chime();
      const left = mission.state.rings.length - mission.state.nextRing;
      hud.showMessage(left > 0 ? `Ring ${mission.state.ringsPassed} — ${left} to go.` : 'All rings flown — land on the runway!', 2.5);
    }
    if (missionEvents & EVENT_FINISH) finishMission();
    else if (missionEvents & EVENT_FAIL) failMission(mission.state.failReason);
    else if (flight.state.crashed) failMission(flight.state.crashReason);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
      const f = flight.state;
      audio.update(f.throttle, f.speed, f.onGround);
      hud.update(flight, mission, STEP);
    } else {
      accumulator = 0;
    }
    if (screen === SCREEN_TITLE) {
      // The title orbits the parked plane slowly: the valley does the talking.
      flight.state.elapsed += STEP;
    }
    renderer.draw(flight, mission, STEP, flight.state.elapsed, cameraMode);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showPaused();
      announce('Paused.');
    }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
