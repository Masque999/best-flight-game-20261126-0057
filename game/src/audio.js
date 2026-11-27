// Sound, synthesized: no audio files. An engine drone whose pitch follows
// the throttle, wind noise that grows with speed, a chime for a ring, a thud
// for a landing and a crunch for a crash. Everything is guarded: a browser
// without audio, or a headless one, simply stays silent.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      // Engine: a sawtooth through a low-pass, pitch and loudness by throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      // Wind: looped white noise through a band-pass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 480;
      band.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(band).connect(windGain).connect(ctx.destination);
      noise.start();
    } catch {
      ctx = null;
    }
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Continuous engine and wind, called once a frame with live numbers. */
  function update(throttle, speed, onGround) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(52 + throttle * 95 + speed * 0.4, t, 0.08);
    engineGain.gain.setTargetAtTime(onGround ? 0.015 + throttle * 0.05 : 0.03 + throttle * 0.075, t, 0.1);
    engineFilter.frequency.setTargetAtTime(260 + throttle * 700, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.12, Math.max(0, (speed - 18) * 0.0022)), t, 0.15);
  }

  function blip(freq, dur, gainValue, when = 0) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = ctx.currentTime + when;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gainValue, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    } catch {
      // Silence is acceptable.
    }
  }

  function chime() {
    blip(880, 0.35, 0.16);
    blip(1318, 0.5, 0.12, 0.09);
  }

  function thud() {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Silence is acceptable.
    }
  }

  function toggleMute() {
    muted = !muted;
    if (ctx && engineGain) {
      engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
    }
    return muted;
  }

  return { resume, update, chime, thud, toggleMute };
}
