// MERAPI SKY RUN — tuning constants and mission layout.
// One file, one job: every number the flight model, the missions and the
// renderer agree on lives here, so a balance change is a one-line edit.

export const CFG = {
  // Canvas the game draws into (screenshots are taken at this size).
  viewWidth: 1280,
  viewHeight: 720,

  // Flight model.
  minSpeed: 40, // m/s at throttle 0 (glide floor)
  maxSpeed: 125, // m/s at throttle 1
  speedResponse: 0.55, // 1/s, how fast speed chases its throttle target
  climbBleed: 6, // m/s of speed lost per radian of positive pitch
  maxPitch: 0.42, // rad (~24 deg) of stick pitch
  pitchResponse: 2.2, // 1/s
  maxBank: 1.05, // rad (~60 deg) of stick bank
  bankResponse: 2.6, // 1/s
  gravityTurn: 9.81, // coordinated turn: heading rate = g * tan(bank) / speed
  turnFactor: 3.0, // arcade factor on the coordinated turn rate: the ring
  // line is laid out for a pilot who can turn, not for a glider

  // Fuel and hull.
  fuelStart: 100,
  fuelBurnFull: 0.8, // fuel units per second at throttle 1 (scales linearly)
  fuelRingBonus: 30,
  hullStart: 100,
  balloonDamage: 34,
  scrapeDamage: 50, // brushing terrain without a full crash (rare, steep angle)
  invulnSeconds: 1.5, // after a hit, brief grace so one balloon cannot double-hit

  // Rings.
  ringRadius: 34, // m, generous so a clean line through the centre counts
  ringScore: 100,
  comboStep: 0.25, // each consecutive ring adds this to the multiplier
  comboCap: 3,
  fuelRingScore: 50,

  // Landing (runway centreline x = 0, threshold z = 11500, end z = 12300).
  runwayElev: 12, // m above sea level
  runwayHalfWidth: 45,
  runwayZ0: 11500,
  runwayZ1: 12300,
  landMaxSink: 4.5, // m/s of vertical speed allowed at touchdown
  landMinSpeed: 50,
  landMaxSpeed: 95,
  landMaxHeading: 0.26, // rad off the runway heading
  landBonus: 500,
  fuelBonusPerUnit: 5,
  timeBonusPar: 300, // seconds; each second under par pays timeBonusPerSec
  timeBonusPerSec: 2,

  // World.
  startX: 0,
  startY: 130, // m, take-off altitude over the valley
  startZ: 200,
  startSpeed: 80,
  startThrottle: 0.62,
  cameraBack: 16, // m behind the aircraft
  cameraUp: 5, // m above the aircraft
  focal: 540, // px, perspective focal length at 1280x720
  groundFar: 2400, // m of terrain strips drawn ahead
  gustStartZ: 5200, // crosswind gusts begin in phase 2

  // Scoring display.
  parSeconds: 300,
};

// The three sorties of one flight. Rings are laid out by terrain.js from
// these anchors; the numbers here are the mission text the HUD shows.
export const MISSIONS = [
  {
    name: 'SORTIE 1 — RING RUN',
    brief: 'Thread 8 gold rings over the Merapi valley.',
    z0: 0,
    z1: 5200,
    rings: 8,
  },
  {
    name: 'SORTIE 2 — STORM PASS',
    brief: '8 more rings past the Gate Peak. Mind the balloons and the gusts.',
    z0: 5200,
    z1: 10100,
    rings: 8,
  },
  {
    name: 'SORTIE 3 — HOMECOMING',
    brief: '4 rings, then bring her home: land on runway 27.',
    z0: 10100,
    z1: 12300,
    rings: 4,
  },
];

export const RING_TOTAL = MISSIONS.reduce((n, m) => n + m.rings, 0);
