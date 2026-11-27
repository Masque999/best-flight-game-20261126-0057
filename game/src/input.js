// Keyboard and pointer input. Held keys give a steering direction; one-shot
// presses (start, pause, camera, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
// The mouse steers while its button is held: drag up to climb, sideways to
// bank — the pointer's distance from the press point is the stick.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let pointerDown = false;
  let pointerStart = { x: 0, y: 0 };
  let pointerNow = { x: 0, y: 0 };

  function onKeyDown(event) {
    if (
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) ||
      ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)
    ) {
      keys.add(event.code);
      event.preventDefault();
      return;
    }
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (CAMERA.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CAMERA;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function hasAny(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }
  function onPointerDown(event) {
    pointerDown = true;
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerNow = { x: event.clientX, y: event.clientY };
    if (event.target === target) event.preventDefault();
  }
  function onPointerMove(event) {
    if (pointerDown) pointerNow = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp() {
    pointerDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  target.addEventListener('click', (event) => {
    // A click on the canvas is a confirm on the title and end screens.
    if (event.target === target) actions |= ACTION_CONFIRM;
  });

  /** Analog steering for this frame: pitch, roll and throttle, each -1..1. */
  function steering() {
    let pitch = 0;
    let roll = 0;
    if (hasAny(PITCH_UP)) pitch += 1;
    if (hasAny(PITCH_DOWN)) pitch -= 1;
    if (hasAny(ROLL_LEFT)) roll -= 1;
    if (hasAny(ROLL_RIGHT)) roll += 1;
    let throttle = 0;
    if (hasAny(THROTTLE_UP)) throttle += 1;
    if (hasAny(THROTTLE_DOWN)) throttle -= 1;
    if (pointerDown) {
      const dx = (pointerNow.x - pointerStart.x) / 160;
      const dy = (pointerNow.y - pointerStart.y) / 160;
      roll += Math.max(-1, Math.min(1, dx));
      pitch -= Math.max(-1, Math.min(1, dy));
    }
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle: Math.max(-1, Math.min(1, throttle)),
    };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { steering, takeActions };
}
