// The HUD: lit glass instruments over the 3D view. Airspeed, altitude and
// vertical speed on the left, a heading tape across the top, throttle and fuel
// on the right, an attitude indicator low on the left, and the mission line
// low in the centre. Text that holds a number is rebuilt only when the number
// changes, so a frame allocates nothing.
import { PLANE } from './config.js';

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

function cachedText(el) {
  let last = null;
  return function set(text) {
    if (text !== last) {
      last = text;
      el.textContent = text;
    }
  };
}

export function createHud(doc) {
  const hud = doc.getElementById('hud');
  const speedEl = doc.getElementById('hud-speed');
  const altEl = doc.getElementById('hud-alt');
  const vsiEl = doc.getElementById('hud-vsi');
  const headingEl = doc.getElementById('hud-heading');
  const tapeEl = doc.getElementById('hud-tape');
  const throttleFill = doc.getElementById('hud-throttle-fill');
  const fuelFill = doc.getElementById('hud-fuel-fill');
  const fuelValue = doc.getElementById('hud-fuel-value');
  const scoreEl = doc.getElementById('hud-score');
  const timeEl = doc.getElementById('hud-time');
  const objectiveEl = doc.getElementById('hud-objective');
  const ringsEl = doc.getElementById('hud-rings');
  const hullEl = doc.getElementById('hud-hull');
  const messageEl = doc.getElementById('hud-message');
  const attitude = doc.getElementById('hud-attitude');
  const actx = attitude.getContext('2d');

  const setSpeed = cachedText(speedEl);
  const setAlt = cachedText(altEl);
  const setVsi = cachedText(vsiEl);
  const setHeading = cachedText(headingEl);
  const setScore = cachedText(scoreEl);
  const setTime = cachedText(timeEl);
  const setObjective = cachedText(objectiveEl);
  const setRings = cachedText(ringsEl);
  const setHull = cachedText(hullEl);
  const setFuelValue = cachedText(fuelValue);

  // The heading tape: ticks every 10 degrees, cardinals labelled, sliding
  // under a fixed lubber line as the nose swings. Two copies of the 360
  // degree strip sit side by side so the tape never runs out at the wrap.
  for (let deg = 0; deg < 720; deg += 10) {
    const tick = doc.createElement('div');
    tick.className = 'tape-tick';
    const d = deg % 360;
    const label = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : d % 30 === 0 ? String(d / 10) : '';
    tick.textContent = label;
    tick.style.left = `${deg * 4}px`;
    tapeEl.appendChild(tick);
  }

  let messageTimer = 0;
  let lastTape = null;

  function compass(headingRad) {
    let deg = (headingRad * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  function drawAttitude(pitch, bank) {
    const w = attitude.width;
    const h = attitude.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;
    actx.save();
    actx.clearRect(0, 0, w, h);
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.clip();
    actx.translate(cx, cy);
    actx.rotate(-bank);
    const pitchPx = Math.max(-r, Math.min(r, -pitch * r * 1.4));
    actx.fillStyle = '#3f7fbf';
    actx.fillRect(-r * 2, -r * 2 + pitchPx, r * 4, r * 2);
    actx.fillStyle = '#7a5a34';
    actx.fillRect(-r * 2, pitchPx, r * 4, r * 2);
    actx.strokeStyle = '#e8f2f8';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.moveTo(-r, pitchPx);
    actx.lineTo(r, pitchPx);
    actx.stroke();
    actx.restore();
    // Fixed wings and nose mark: the aircraft stays put, the world turns.
    actx.strokeStyle = '#ffb02e';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 26, cy);
    actx.lineTo(cx - 8, cy);
    actx.moveTo(cx + 8, cy);
    actx.lineTo(cx + 26, cy);
    actx.stroke();
    actx.fillStyle = '#ffb02e';
    actx.beginPath();
    actx.arc(cx, cy, 3, 0, Math.PI * 2);
    actx.fill();
    actx.strokeStyle = 'rgba(232, 242, 248, 0.55)';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.stroke();
  }

  function showMessage(text, seconds = 3) {
    messageEl.textContent = text;
    messageEl.classList.add('visible');
    messageTimer = seconds;
  }

  function tickMessage(dt) {
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) messageEl.classList.remove('visible');
    }
  }

  /**
   * Refresh every instrument from the live flight and mission state. Called
   * once a frame; only changed text touches the DOM.
   */
  function update(flight, mission, dt) {
    const f = flight.state;
    const m = mission.state;
    tickMessage(dt);
    setSpeed(`${Math.round(f.speed * MS_TO_KT)}`);
    setAlt(`${Math.round(f.pos.y * M_TO_FT)}`);
    const vsi = Math.round(f.verticalSpeed * M_TO_FT * 60);
    setVsi(`${vsi >= 0 ? '+' : ''}${vsi}`);
    const deg = compass(f.heading);
    setHeading(`${String(Math.round(deg)).padStart(3, '0')}°`);
    // Slide the tape: 4 px per degree, wrapped into one strip's width so
    // the lubber line always sits over the current heading.
    const wrapW = tapeEl.parentElement.clientWidth || 360;
    const centre = wrapW / 2;
    let offset = centre - deg * 4;
    while (offset <= centre - 1440) offset += 1440;
    while (offset > centre) offset -= 1440;
    if (lastTape !== offset) {
      lastTape = offset;
      tapeEl.style.transform = `translateX(${offset}px)`;
    }
    throttleFill.style.width = `${Math.round(f.throttle * 100)}%`;
    const fuelPct = Math.round((f.fuel / mission.state.def.fuel) * 100);
    fuelFill.style.width = `${fuelPct}%`;
    fuelFill.classList.toggle('low', fuelPct < 25);
    setFuelValue(`${fuelPct}%`);
    setScore(`${m.score}`);
    const t = Math.max(0, Math.ceil(m.timeLeft));
    setTime(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    setObjective(mission.objective());
    const ringsLeft = m.rings.length - m.nextRing;
    const dist = ringsLeft > 0 ? Math.round(mission.distanceToNext(f.pos)) : 0;
    setRings(ringsLeft > 0 ? `◯ ${ringsLeft} ring${ringsLeft === 1 ? '' : 's'} left · next ${dist} m` : '◯ All rings flown');
    const hull = '▮'.repeat(Math.max(0, PLANE.maxDamage - f.damage)) + '▯'.repeat(f.damage);
    setHull(`HULL ${hull}`);
    hullEl.classList.toggle('bad', f.damage > 0);
    drawAttitude(f.pitch, f.bank);
    hud.classList.toggle('fuel-empty', f.fuelEmpty);
    hud.classList.toggle('stall', f.speed < 24 && !f.onGround);
  }

  function setVisible(visible) {
    hud.classList.toggle('hidden', !visible);
  }

  return { update, showMessage, setVisible };
}
