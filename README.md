[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Masque999/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Masque999/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Ridgeline Courier

An original 3D bush-plane game: fly a little teal courier plane through
glowing rings over a mountain valley, mind the fuel, and land back on the
strip. Everything is procedural — the valley, the rings, the plane, the
sound — and the game runs offline from static files in a desktop browser.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080/ in desktop Chrome. No network request,
no build step.

## Controls

- **← → ↑ ↓ or W A S D** — bank and pitch
- **Shift / Ctrl** — throttle up / down
- **Mouse** — hold and drag to steer
- **C** — chase / cockpit camera
- **M** — sound on / off
- **P** — pause · **R** — restart · **1 / 2 / 3** — pick a mission

## Missions

1. **Ring Run** — 8 rings over the valley, full tank, daylight.
2. **Ridge Rescue** — 6 rings over the high ridge, thin fuel, gusty wind.
3. **Dusk Delivery** — 10 rings at dusk; land on the runway for the bonus.

Fly all the rings, then land on the strip: the landing bonus and the time
left on the clock are added to the score. A slow wing stalls, a hard
touchdown dents the hull (three dents and the airframe gives up), and an
empty tank glides.

## Files

```
main.ts            hand-in: copies game/ + screenshots/, writes dossier.json
vendor/            kit-provided makefun-game.ts (unchanged)
serve.ts           tiny static server for local play
game/
  index.html       page shell, HUD instruments, overlay panels
  vendor/
    three.min.js   vendored three.js r160 (minified build, not our source)
  src/
    config.js      tuning numbers, palette, mission definitions
    random.js      seeded RNG and value noise (the valley is repeatable)
    terrain.js     height function, terrain/lake/runway/trees/clouds
    aircraft.js    the bush plane, built from primitives
    flight.js      flight model: throttle, lift, stall, turns, landings
    missions.js    rings, clock, fuel, score, finish and fail
    hud.js         lit instruments: speed, altitude, compass, attitude
    audio.js       synthesized engine, wind, chimes (no audio files)
    input.js       keyboard and mouse steering
    render.js      three.js scene, chase and cockpit cameras, rings
    shots.js       autopilot that stages the screenshot scenes
    main.js        boot, fixed-step loop, screens, mission select
screenshots/      real renders of the game's own code (see shots.json)
shots.json         the four screenshot scenes and their URLs
LICENSE            MIT
```

## Screenshots

Taken in headless Chrome at 1280×800 from the game's own `?shot=` scenes
with a fixed seed, then converted to JPEG:

1. `1-flight.jpg` — mid-flight through a ring, HUD lit (cover)
2. `2-title.jpg` — the title screen over the airfield
3. `3-cockpit.jpg` — cockpit view on final approach
4. `4-landing.jpg` — mission complete on the strip
Built for the [make.fun bounty](https://make.fun/bounty/best-flight-game-20261126-0057).
