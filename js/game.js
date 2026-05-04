'use strict';
// ============================================================
// AxoLegacy – Gills & Generations
// A colony survival game where you ARE the Axolotl King
// ============================================================

// ---- CONSTANTS ----
const CANVAS_W = 800;
const CANVAS_H = 600;

// Day/Night cycle durations (seconds)
const PHASE_DAY      = 180;  // 3:00
const PHASE_SUNSET   =  30;  // 0:30
const PHASE_NIGHT    = 120;  // 2:00
const PHASE_SUNRISE  =  30;  // 0:30
const CYCLE_DURATION = PHASE_DAY + PHASE_SUNSET + PHASE_NIGHT + PHASE_SUNRISE; // 360s

// Temperature (°C)
const TEMP_DAY       = 25;
const TEMP_NIGHT     = 18;
const TEMP_SAFE_MIN  = 20;
const TEMP_SAFE_MAX  = 26;

// Oxygen
const OXY_MAX        = 100;
const OXY_BASE       = 85;
const OXY_REGEN_RATE = 3;    // per second (natural recovery)

// Colony
const COLONY_INITIAL   = 12;
const COLONY_MAX       = 20;
const REPRODUCE_HEALTH = 75; // minimum health to reproduce
const REPRODUCE_CHANCE = 0.0015; // per axolotl per second when healthy
const REPRODUCE_DIST   = 60;    // axolotls must be within this px of each other

// Player
const PLAYER_SPEED      = 200; // px/s
const CALL_RADIUS       = 220; // px – radius of "call" signal
const CALL_DURATION     = 6;   // seconds colony follows after a call

// Axolotl AI
const AXO_WANDER_SPEED  = 45;
const AXO_FOLLOW_SPEED  = 140;
const AXO_FLEE_SPEED    = 170;
const AXO_FOLLOW_RADIUS = 160; // auto-follow if player is this close
const AXO_HEALTH_MAX    = 100;
const AXO_SEPARATION    = 28;  // minimum distance between axolotls

// Predator
const PREDATOR_SPEED    = 90;
const PREDATOR_EAT_DIST = 32;
const PREDATOR_FLEE_DIST = 200;

// ---- COLORS ----
const AXOLOTL_COLORS = ['#FFB6C1', '#FFF5E6', '#E8D5FF', '#FFDAB9', '#B0E0E6', '#FFD1DC'];
const CROWN_COLOR    = '#FFD700';
const PLAYER_COLOR   = '#FF9EB5';

// ---- GAME STATE ----
let gameState = 'MENU'; // MENU | PLAYING | PAUSED | GAMEOVER

// ---- CANVAS SETUP ----
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ---- PERSISTENT SCENE (background decoration) ----
const BG = buildBackground();

// ---- INPUT ----
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (gameState === 'PLAYING') pauseGame();
    else if (gameState === 'PAUSED') resumeGame();
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (gameState === 'PLAYING') triggerCall();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ---- TIMING ----
let lastTime  = 0;
let gameTime  = 0; // total elapsed seconds while playing
let cycleTime = 0; // position within current day/night cycle (0..CYCLE_DURATION)
let dayCount  = 1;

// ---- ENVIRONMENT ----
const env = {
  oxygen:      OXY_BASE,
  temperature: TEMP_DAY,
  phase:       'day',      // day | sunset | night | sunrise
  phaseAlpha:  0,          // 0..1 for lerp within transition
  lightLevel:  1.0,        // 0 (dark) .. 1 (bright)
};

// ---- EVENTS ----
const activeEvents = [];
let nextEventIn    = randomBetween(30, 70); // seconds until next event
const eventQueue   = [];

// ---- PLAYER ----
const player = {
  x: CANVAS_W / 2,
  y: CANVAS_H / 2,
  vx: 0, vy: 0,
  dir: 1,         // 1 = right, -1 = left
  size: 24,
  health: 100,
  callTimer: 0,   // > 0 when actively calling
  callRingAnim: 0,// animation counter for call ring
  dead: false,
};

// ---- COLONY ----
let colony = [];
let deadParticles = [];
let birthParticles = [];
let bubbles = [];
let callRingVisible = false;

// ---- STATS (for game-over screen) ----
let stats = { cyclesSurvived: 0, maxColony: 0, axolotlsLost: 0 };

// ============================================================
// BACKGROUND BUILDER
// ============================================================
function buildBackground() {
  const rocks   = [];
  const plants  = [];
  const pebbles = [];

  // Rocks
  for (let i = 0; i < 14; i++) {
    rocks.push({
      x: Math.random() * CANVAS_W,
      y: CANVAS_H - 20 - Math.random() * 60,
      rx: 15 + Math.random() * 30,
      ry: 10 + Math.random() * 20,
      color: `hsl(220,${10 + Math.random()*20}%,${25 + Math.random()*15}%)`,
    });
  }
  // Plants / seaweed
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * CANVAS_W;
    plants.push({
      x,
      segments: Math.floor(4 + Math.random() * 5),
      height:   40 + Math.random() * 70,
      phase:    Math.random() * Math.PI * 2,
      color:    Math.random() > 0.5 ? '#2d7a2d' : '#1a5c1a',
    });
  }
  // Pebbles
  for (let i = 0; i < 40; i++) {
    pebbles.push({
      x: Math.random() * CANVAS_W,
      y: CANVAS_H - 5 - Math.random() * 30,
      r: 2 + Math.random() * 5,
      color: `hsl(220,${5 + Math.random()*15}%,${30 + Math.random()*20}%)`,
    });
  }
  return { rocks, plants, pebbles };
}

// ============================================================
// COLONY INITIALISATION
// ============================================================
function spawnAxolotl(x, y, isBaby) {
  return {
    x: x ?? randomBetween(80, CANVAS_W - 80),
    y: y ?? randomBetween(80, CANVAS_H - 120),
    vx: 0, vy: 0,
    dir: Math.random() > 0.5 ? 1 : -1,
    size: isBaby ? 14 : 20,
    health: isBaby ? 60 : AXO_HEALTH_MAX,
    state: 'WANDER',       // WANDER | FOLLOW | FLEE | IDLE
    followTimer: 0,        // how long to keep following after call ends
    wanderTimer: randomBetween(1, 4),
    wanderAngle: Math.random() * Math.PI * 2,
    idleTimer: 0,
    colorIdx: Math.floor(Math.random() * AXOLOTL_COLORS.length),
    reproduceCooldown: isBaby ? 60 : randomBetween(20, 50),
    growTimer: isBaby ? 15 : 0, // babies grow up over 15 seconds
    alpha: isBaby ? 0.2 : 1.0,  // fade in
  };
}

function initColony() {
  colony = [];
  for (let i = 0; i < COLONY_INITIAL; i++) colony.push(spawnAxolotl());
}

// ============================================================
// GAME FLOW
// ============================================================
function startGame() {
  gameState  = 'PLAYING';
  gameTime   = 0;
  cycleTime  = 0;
  dayCount   = 1;

  env.oxygen      = OXY_BASE;
  env.temperature = TEMP_DAY;
  env.phase       = 'day';
  env.lightLevel  = 1.0;

  player.x       = CANVAS_W / 2;
  player.y       = CANVAS_H / 2;
  player.health  = 100;
  player.callTimer = 0;
  player.dead    = false;

  activeEvents.length = 0;
  eventQueue.length   = 0;
  nextEventIn         = randomBetween(30, 70);
  deadParticles       = [];
  birthParticles      = [];
  bubbles             = [];

  stats = { cyclesSurvived: 0, maxColony: COLONY_INITIAL, axolotlsLost: 0 };

  initColony();
  hideOverlay();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function pauseGame() {
  gameState = 'PAUSED';
  showScreen('pauseScreen');
}

function resumeGame() {
  gameState = 'PLAYING';
  hideOverlay();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function gameOver(reason) {
  gameState = 'GAMEOVER';
  document.getElementById('goReason').textContent   = reason;
  document.getElementById('goCycles').textContent   = stats.cyclesSurvived;
  document.getElementById('goMaxColony').textContent = stats.maxColony;
  document.getElementById('goLost').textContent     = stats.axolotlsLost;
  showScreen('gameOverScreen');
}

// ============================================================
// OVERLAY HELPERS
// ============================================================
function showScreen(id) {
  const overlay = document.getElementById('overlay');
  overlay.classList.add('visible');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('visible');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
}

// ============================================================
// EVENT TOAST
// ============================================================
function showToast(msg, color) {
  const toast = document.getElementById('eventToast');
  toast.textContent = msg;
  toast.style.borderColor  = color || '#ffa500';
  toast.style.color        = color || '#ffd700';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ============================================================
// CALL MECHANIC
// ============================================================
function triggerCall() {
  player.callTimer    = CALL_DURATION;
  player.callRingAnim = 0;
  // Signal all nearby axolotls to follow
  colony.forEach(a => {
    const d = dist(a.x, a.y, player.x, player.y);
    if (d < CALL_RADIUS) {
      a.state       = 'FOLLOW';
      a.followTimer = CALL_DURATION + 2;
    }
  });
}

// ============================================================
// EVENTS SYSTEM
// ============================================================
const EVENT_DEFINITIONS = [
  {
    id: 'drought',
    name: '🌵 Drought!',
    desc: 'Oxygen levels are dropping…',
    color: '#FF8C00',
    duration: 40,
    onStart(ev) { ev.oxyDrain = 18; },
    onTick(ev, dt) { env.oxygen = Math.max(0, env.oxygen - ev.oxyDrain * dt); },
    onEnd() {},
  },
  {
    id: 'heatwave',
    name: '🔥 Heatwave!',
    desc: 'Temperature is spiking!',
    color: '#FF4500',
    duration: 45,
    tempBonus: 7,
    onStart(ev) { ev.tempBonus = 7; },
    onTick(ev, dt) {},
    onEnd() {},
  },
  {
    id: 'predator',
    name: '🐟 Predator!',
    desc: 'A large fish is hunting your colony!',
    color: '#8B0000',
    duration: 30,
    onStart(ev) {
      // Spawn predator on a random edge
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { ev.px = -60; ev.py = randomBetween(80, CANVAS_H - 100); ev.pvx =  PREDATOR_SPEED; ev.pvy = 0; }
      else if (edge === 1) { ev.px = CANVAS_W + 60; ev.py = randomBetween(80, CANVAS_H - 100); ev.pvx = -PREDATOR_SPEED; ev.pvy = 0; }
      else if (edge === 2) { ev.px = randomBetween(80, CANVAS_W - 80); ev.py = -60; ev.pvx = 0; ev.pvy =  PREDATOR_SPEED; }
      else { ev.px = randomBetween(80, CANVAS_W - 80); ev.py = CANVAS_H + 60; ev.pvx = 0; ev.pvy = -PREDATOR_SPEED; }
      ev.eatCooldown = 0;
    },
    onTick(ev, dt) {
      ev.px += ev.pvx * dt;
      ev.py += ev.pvy * dt;
      ev.eatCooldown -= dt;

      // Steer toward nearest axolotl if close
      let nearest = null;
      let nearDist = Infinity;
      colony.forEach(a => {
        const d = dist(a.x, a.y, ev.px, ev.py);
        if (d < nearDist) { nearDist = d; nearest = a; }
      });
      if (nearest && nearDist < 220) {
        const angle = Math.atan2(nearest.y - ev.py, nearest.x - ev.px);
        ev.pvx += Math.cos(angle) * PREDATOR_SPEED * dt * 2;
        ev.pvy += Math.sin(angle) * PREDATOR_SPEED * dt * 2;
        // Clamp speed
        const spd = Math.hypot(ev.pvx, ev.pvy);
        if (spd > PREDATOR_SPEED * 1.4) { ev.pvx = (ev.pvx/spd)*PREDATOR_SPEED*1.4; ev.pvy = (ev.pvy/spd)*PREDATOR_SPEED*1.4; }
      }

      // Axolotls flee from predator
      colony.forEach(a => {
        if (dist(a.x, a.y, ev.px, ev.py) < PREDATOR_FLEE_DIST) {
          a.state       = 'FLEE';
          a.fleeFromX   = ev.px;
          a.fleeFromY   = ev.py;
          a.followTimer = 0;
        }
      });

      // Eat a nearby axolotl
      if (ev.eatCooldown <= 0) {
        const eaten = colony.find(a => dist(a.x, a.y, ev.px, ev.py) < PREDATOR_EAT_DIST);
        if (eaten) {
          killAxolotl(eaten, 'eaten by predator');
          ev.eatCooldown = 5;
        }
      }
    },
    onEnd() {},
  },
  {
    id: 'algae',
    name: '🌿 Algae Bloom!',
    desc: 'A bloom of algae! Oxygen rises… for now.',
    color: '#7CFC00',
    duration: 60,
    onStart(ev) { ev.phase = 'boost'; ev.phaseTimer = 20; ev.algaeX = randomBetween(100, CANVAS_W - 100); ev.algaeY = randomBetween(100, CANVAS_H - 150); },
    onTick(ev, dt) {
      ev.phaseTimer -= dt;
      if (ev.phase === 'boost') {
        env.oxygen = Math.min(OXY_MAX, env.oxygen + 12 * dt);
        if (ev.phaseTimer <= 0) { ev.phase = 'drop'; ev.phaseTimer = 40; }
      } else {
        env.oxygen = Math.max(0, env.oxygen - 8 * dt);
      }
    },
    onEnd() {},
  },
];

function triggerRandomEvent() {
  // Don't stack more than 2 events
  if (activeEvents.length >= 2) return;
  // Exclude events already active
  const activeIds = new Set(activeEvents.map(e => e.id));
  const pool = EVENT_DEFINITIONS.filter(e => !activeIds.has(e.id));
  if (pool.length === 0) return;
  const def = pool[Math.floor(Math.random() * pool.length)];
  const ev  = { ...def, timer: def.duration };
  def.onStart(ev);
  activeEvents.push(ev);
  showToast(`${def.name}  ${def.desc}`, def.color);
}

// ============================================================
// COLONY HELPERS
// ============================================================
function killAxolotl(axo, reason) {
  const idx = colony.indexOf(axo);
  if (idx === -1) return;
  colony.splice(idx, 1);
  stats.axolotlsLost++;
  // Spawn death particles
  for (let i = 0; i < 10; i++) {
    deadParticles.push({
      x: axo.x, y: axo.y,
      vx: randomBetween(-60, 60), vy: randomBetween(-60, 60),
      life: 1.0, color: AXOLOTL_COLORS[axo.colorIdx],
    });
  }
}

function tryReproduce(dt) {
  if (colony.length >= COLONY_MAX) return;
  colony.forEach(a => {
    if (a.health < REPRODUCE_HEALTH || a.reproduceCooldown > 0 || a.growTimer > 0) return;
    // Find a nearby healthy partner
    const partner = colony.find(b =>
      b !== a &&
      b.health >= REPRODUCE_HEALTH &&
      b.reproduceCooldown <= 0 &&
      b.growTimer <= 0 &&
      dist(a.x, a.y, b.x, b.y) < REPRODUCE_DIST
    );
    if (!partner) return;
    if (Math.random() < REPRODUCE_CHANCE * dt) {
      const baby = spawnAxolotl(
        (a.x + partner.x) / 2 + randomBetween(-20, 20),
        (a.y + partner.y) / 2 + randomBetween(-20, 20),
        true
      );
      colony.push(baby);
      a.reproduceCooldown       = 60;
      partner.reproduceCooldown = 60;
      // Birth particles
      for (let i = 0; i < 8; i++) {
        birthParticles.push({
          x: baby.x, y: baby.y,
          vx: randomBetween(-40, 40), vy: randomBetween(-80, -20),
          life: 1.0,
        });
      }
      stats.maxColony = Math.max(stats.maxColony, colony.length + 1);
    }
  });
}

// ============================================================
// UPDATE – ENVIRONMENT
// ============================================================
function updateEnvironment(dt) {
  // Advance cycle time
  cycleTime += dt;
  if (cycleTime >= CYCLE_DURATION) {
    cycleTime -= CYCLE_DURATION;
    dayCount++;
    stats.cyclesSurvived++;
  }

  // Determine phase & light level
  let baseTemp;
  if (cycleTime < PHASE_DAY) {
    env.phase      = 'day';
    env.lightLevel = 1.0;
    baseTemp       = TEMP_DAY;
  } else if (cycleTime < PHASE_DAY + PHASE_SUNSET) {
    const t        = (cycleTime - PHASE_DAY) / PHASE_SUNSET;
    env.phase      = 'sunset';
    env.lightLevel = 1.0 - t * 0.6;
    baseTemp       = lerp(TEMP_DAY, TEMP_NIGHT, t);
  } else if (cycleTime < PHASE_DAY + PHASE_SUNSET + PHASE_NIGHT) {
    env.phase      = 'night';
    env.lightLevel = 0.4;
    baseTemp       = TEMP_NIGHT;
  } else {
    const t        = (cycleTime - (PHASE_DAY + PHASE_SUNSET + PHASE_NIGHT)) / PHASE_SUNRISE;
    env.phase      = 'sunrise';
    env.lightLevel = 0.4 + t * 0.6;
    baseTemp       = lerp(TEMP_NIGHT, TEMP_DAY, t);
  }
  env.temperature = baseTemp;

  // Apply heatwave bonus
  activeEvents.forEach(ev => {
    if (ev.id === 'heatwave') env.temperature += ev.tempBonus;
  });

  // Natural oxygen recovery (slower at night)
  const regenRate = env.phase === 'night' ? OXY_REGEN_RATE * 0.4 : OXY_REGEN_RATE;
  env.oxygen = Math.min(OXY_MAX, env.oxygen + regenRate * dt);

  // Tick active events
  for (let i = activeEvents.length - 1; i >= 0; i--) {
    const ev = activeEvents[i];
    ev.timer -= dt;
    ev.onTick(ev, dt);
    if (ev.timer <= 0) {
      ev.onEnd(ev);
      activeEvents.splice(i, 1);
    }
  }

  // Schedule next event
  nextEventIn -= dt;
  if (nextEventIn <= 0) {
    triggerRandomEvent();
    nextEventIn = randomBetween(40, 90);
  }
}

// ============================================================
// UPDATE – PLAYER
// ============================================================
function updatePlayer(dt) {
  if (player.dead) return;

  let dx = 0, dy = 0;
  if (keys['ArrowLeft']  || keys['KeyA']) dx = -1;
  if (keys['ArrowRight'] || keys['KeyD']) dx =  1;
  if (keys['ArrowUp']    || keys['KeyW']) dy = -1;
  if (keys['ArrowDown']  || keys['KeyS']) dy =  1;

  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  if (dx !== 0) player.dir = dx > 0 ? 1 : -1;

  player.vx = dx * PLAYER_SPEED;
  player.vy = dy * PLAYER_SPEED;
  player.x  = clamp(player.x + player.vx * dt, 20, CANVAS_W - 20);
  player.y  = clamp(player.y + player.vy * dt, 20, CANVAS_H - 80);

  // Tick call timer
  if (player.callTimer > 0) {
    player.callTimer    -= dt;
    player.callRingAnim += dt * 3;
  }

  // Health drain from environment
  const tempDamage = calcTempDamage(env.temperature);
  const oxyDamage  = calcOxyDamage(env.oxygen);
  player.health -= (tempDamage + oxyDamage) * dt;
  // Slow natural regen
  player.health  = Math.min(100, player.health + 1.5 * dt);
  player.health  = Math.max(0, player.health);

  if (player.health <= 0) {
    player.dead = true;
    gameOver('The King has perished…');
  }
}

// ============================================================
// UPDATE – COLONY AI
// ============================================================
function updateColony(dt) {
  const toKill = [];

  colony.forEach(axo => {
    // Baby growth
    if (axo.growTimer > 0) {
      axo.growTimer -= dt;
      axo.alpha = Math.min(1, axo.alpha + dt * 0.8);
      if (axo.growTimer <= 0) {
        axo.size = 20;
        axo.growTimer = 0;
      }
    }

    // Cooldowns
    if (axo.reproduceCooldown > 0) axo.reproduceCooldown -= dt;

    // Health drain
    const tempDmg = calcTempDamage(env.temperature) * 0.8;
    const oxyDmg  = calcOxyDamage(env.oxygen) * 0.8;
    axo.health -= (tempDmg + oxyDmg) * dt;
    axo.health  = Math.min(AXO_HEALTH_MAX, axo.health + 2.5 * dt); // regen
    axo.health  = Math.max(0, axo.health);

    if (axo.health <= 0) { toKill.push(axo); return; }

    // State transitions
    const dPlayer = dist(axo.x, axo.y, player.x, player.y);

    if (axo.state === 'FLEE') {
      axo.followTimer -= dt;
      if (axo.followTimer <= 0) axo.state = 'WANDER';
    } else if (axo.state === 'FOLLOW') {
      axo.followTimer -= dt;
      if (axo.followTimer <= 0 || dPlayer < 30) axo.state = 'WANDER';
    } else {
      // Auto-follow if player is very close
      if (dPlayer < AXO_FOLLOW_RADIUS && player.callTimer > 0) {
        axo.state       = 'FOLLOW';
        axo.followTimer = player.callTimer + 1;
      } else if (axo.wanderTimer <= 0) {
        axo.wanderAngle += randomBetween(-0.8, 0.8);
        axo.wanderTimer  = randomBetween(1.5, 4.0);
        // Occasionally go idle
        if (Math.random() < 0.2) { axo.state = 'IDLE'; axo.idleTimer = randomBetween(1, 3); }
        else axo.state = 'WANDER';
      }
    }

    // Move according to state
    let targetVx = 0, targetVy = 0;
    if (axo.state === 'WANDER') {
      targetVx = Math.cos(axo.wanderAngle) * AXO_WANDER_SPEED;
      targetVy = Math.sin(axo.wanderAngle) * AXO_WANDER_SPEED;
      axo.wanderTimer -= dt;
    } else if (axo.state === 'FOLLOW') {
      const angle = Math.atan2(player.y - axo.y, player.x - axo.x);
      const speed = dPlayer > 40 ? AXO_FOLLOW_SPEED : AXO_FOLLOW_SPEED * (dPlayer / 40);
      targetVx = Math.cos(angle) * speed;
      targetVy = Math.sin(angle) * speed;
    } else if (axo.state === 'FLEE') {
      const angle = Math.atan2(axo.y - axo.fleeFromY, axo.x - axo.fleeFromX);
      targetVx = Math.cos(angle) * AXO_FLEE_SPEED;
      targetVy = Math.sin(angle) * AXO_FLEE_SPEED;
    } else { // IDLE
      targetVx = 0; targetVy = 0;
      axo.idleTimer -= dt;
      if (axo.idleTimer <= 0) { axo.state = 'WANDER'; axo.wanderTimer = randomBetween(1, 3); }
    }

    // Separation from other axolotls
    colony.forEach(other => {
      if (other === axo) return;
      const dx = axo.x - other.x, dy = axo.y - other.y;
      const d  = Math.hypot(dx, dy) || 1;
      if (d < AXO_SEPARATION) {
        const push = (AXO_SEPARATION - d) / AXO_SEPARATION * 60;
        targetVx += (dx / d) * push;
        targetVy += (dy / d) * push;
      }
    });

    // Apply velocity (smooth)
    axo.vx = lerp(axo.vx, targetVx, Math.min(1, dt * 5));
    axo.vy = lerp(axo.vy, targetVy, Math.min(1, dt * 5));
    axo.x  = clamp(axo.x + axo.vx * dt, 20, CANVAS_W - 20);
    axo.y  = clamp(axo.y + axo.vy * dt, 20, CANVAS_H - 80);

    // Direction
    if (Math.abs(axo.vx) > 5) axo.dir = axo.vx > 0 ? 1 : -1;
  });

  toKill.forEach(a => killAxolotl(a, 'environment'));

  // Check extinction
  if (colony.length === 0) {
    gameOver('Your colony has perished…');
    return;
  }

  // Reproduction
  tryReproduce(dt);
}

// ============================================================
// UPDATE – PARTICLES & BUBBLES
// ============================================================
function updateParticles(dt) {
  deadParticles  = deadParticles .filter(p => (p.life -= dt * 1.5) > 0);
  birthParticles = birthParticles.filter(p => (p.life -= dt)       > 0);
  bubbles        = bubbles        .filter(b => (b.y -= b.speed * dt) > -10);

  // Emit new bubbles occasionally
  if (Math.random() < dt * 8) {
    bubbles.push({
      x: randomBetween(20, CANVAS_W - 20),
      y: CANVAS_H - 10,
      r: randomBetween(2, 5),
      speed: randomBetween(25, 60),
      alpha: randomBetween(0.3, 0.7),
    });
  }
}

// ============================================================
// DAMAGE HELPERS
// ============================================================
function calcTempDamage(temp) {
  if (temp >= TEMP_SAFE_MIN && temp <= TEMP_SAFE_MAX) return 0;
  if (temp > TEMP_SAFE_MAX) return (temp - TEMP_SAFE_MAX) * 2.5;
  return (TEMP_SAFE_MIN - temp) * 1.5;
}

function calcOxyDamage(oxy) {
  if (oxy > 50) return 0;
  if (oxy > 30) return (50 - oxy) * 0.3;
  return (50 - oxy) * 0.8;
}

// ============================================================
// RENDERING – BACKGROUND
// ============================================================
function drawBackground(t) {
  // Sky/water gradient tinted by time of day
  const nightBlend = env.lightLevel < 1.0 ? 1.0 - env.lightLevel : 0;
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  const topDay  = [29,  90, 174];
  const topNight= [4,  15,  40];
  const botDay  = [10,  45, 100];
  const botNight= [2,   8,  22];
  const top = blendRGB(topDay, topNight, nightBlend);
  const bot = blendRGB(botDay, botNight, nightBlend);
  grad.addColorStop(0, `rgb(${top})`);
  grad.addColorStop(1, `rgb(${bot})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Light rays (only during day / sunrise)
  if (env.lightLevel > 0.6) {
    const alpha = (env.lightLevel - 0.6) / 0.4 * 0.07;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 5; i++) {
      const rx = 80 + i * 160 + Math.sin(t * 0.3 + i) * 20;
      ctx.fillStyle = '#a0d0ff';
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx - 40, CANVAS_H);
      ctx.lineTo(rx + 40, CANVAS_H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Surface shimmer
  ctx.save();
  ctx.globalAlpha = 0.12 * env.lightLevel;
  ctx.fillStyle = '#8bc8ff';
  for (let i = 0; i < 6; i++) {
    const sx = ((t * 30 + i * 130) % (CANVAS_W + 100)) - 50;
    ctx.beginPath();
    ctx.ellipse(sx, 8, 60, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Sandy bottom
  ctx.fillStyle = `rgb(${blendRGB([100, 85, 50], [30, 25, 15], nightBlend)})`;
  ctx.fillRect(0, CANVAS_H - 25, CANVAS_W, 25);

  // Pebbles
  BG.pebbles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Rocks
  BG.rocks.forEach(r => {
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Plants (seaweed sway)
  BG.plants.forEach(p => {
    drawPlant(p, t, nightBlend);
  });

  // Algae bloom decorations
  activeEvents.forEach(ev => {
    if (ev.id === 'algae') drawAlgaeBloom(ev, t);
  });
}

function drawPlant(p, t, nightBlend) {
  const sw  = Math.sin(t * 0.8 + p.phase);
  const day  = [44, 120, 44];
  const ngt  = [10,  40, 10];
  ctx.strokeStyle = `rgb(${blendRGB(day, ngt, nightBlend)})`;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';

  let cx = p.x, cy = CANVAS_H - 15;
  const segH = p.height / p.segments;

  for (let i = 0; i < p.segments; i++) {
    const bend = sw * (i / p.segments) * 12;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    cx += bend;
    cy -= segH;
    ctx.quadraticCurveTo(cx + bend * 0.5, cy + segH * 0.5, cx, cy);
    ctx.stroke();
  }
}

function drawAlgaeBloom(ev, t) {
  ctx.save();
  ctx.globalAlpha = 0.25 + Math.sin(t * 2) * 0.08;
  ctx.fillStyle   = '#7CFC00';
  ctx.beginPath();
  ctx.arc(ev.algaeX, ev.algaeY, 70 + Math.sin(t) * 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.arc(ev.algaeX + 40, ev.algaeY + 20, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// RENDERING – BUBBLES
// ============================================================
function drawBubbles() {
  bubbles.forEach(b => {
    ctx.save();
    ctx.globalAlpha = b.alpha * b.y / CANVAS_H;
    ctx.strokeStyle = '#a0d8ff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

// ============================================================
// RENDERING – AXOLOTL (shared shape)
// ============================================================
function drawAxolotlShape(x, y, size, color, dir, isKing, health, t, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  ctx.translate(x, y);
  if (dir < 0) ctx.scale(-1, 1);

  const s = size / 20;
  // Health tint: healthy = color, hurt = red blend
  const healthRatio = Math.max(0, health / AXO_HEALTH_MAX);
  const bodyColor = blendColor(color, '#FF4444', 1 - healthRatio);

  // Tail
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-16 * s, 0);
  ctx.quadraticCurveTo(-30 * s, -10 * s, -28 * s, -18 * s);
  ctx.quadraticCurveTo(-20 * s, -8  * s, -16 * s, 0);
  ctx.fill();
  // Lower tail fin
  ctx.beginPath();
  ctx.moveTo(-16 * s, 0);
  ctx.quadraticCurveTo(-30 * s, 10 * s, -28 * s, 18 * s);
  ctx.quadraticCurveTo(-20 * s,  8 * s, -16 * s, 0);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 18 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (front pair)
  ctx.fillStyle = bodyColor;
  [[-5 * s, 11 * s], [6 * s, 11 * s]].forEach(([lx, ly]) => {
    ctx.beginPath();
    ctx.ellipse(lx, ly, 3.5 * s, 6 * s, 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Head
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(19 * s, 0, 12 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Gills (3 feathery branches)
  const gillBaseColor = '#FF69B4';
  for (let gi = 0; gi < 3; gi++) {
    const gx   = (11 + gi * 5) * s;
    const sway = Math.sin(t * 2 + gi * 1.2 + x * 0.01) * 3 * s;
    ctx.strokeStyle = gillBaseColor;
    ctx.lineWidth   = 2 * s;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, -9 * s);
    ctx.quadraticCurveTo(gx + sway - 2 * s, -17 * s, gx + sway, -23 * s);
    ctx.stroke();
    // Gill tuft
    ctx.fillStyle = '#FF1493';
    ctx.beginPath();
    ctx.arc(gx + sway, -23 * s, 3.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(25 * s, -2 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(26 * s, -3 * s, 1.4 * s, 0, Math.PI * 2);
  ctx.fill();

  // Crown for king
  if (isKing) {
    ctx.fillStyle = CROWN_COLOR;
    ctx.beginPath();
    ctx.moveTo(12 * s,  -11 * s);
    ctx.lineTo(11 * s,  -20 * s);
    ctx.lineTo(15 * s,  -14 * s);
    ctx.lineTo(20 * s,  -23 * s);
    ctx.lineTo(25 * s,  -14 * s);
    ctx.lineTo(29 * s,  -20 * s);
    ctx.lineTo(27 * s,  -11 * s);
    ctx.closePath();
    ctx.fill();
    // Crown gems
    ctx.fillStyle = '#FF0000';
    ctx.beginPath(); ctx.arc(20 * s, -19 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#00BFFF';
    ctx.beginPath(); ctx.arc(13.5 * s, -17 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(26.5 * s, -17 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// RENDERING – PREDATOR
// ============================================================
function drawPredator(ev, t) {
  ctx.save();
  ctx.translate(ev.px, ev.py);
  // Flip based on movement dir
  if (ev.pvx < 0) ctx.scale(-1, 1);
  ctx.globalAlpha = 0.85;

  const s = 2.5;
  ctx.fillStyle = '#5C2A0A';
  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 40 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail fin
  ctx.beginPath();
  ctx.moveTo(-38 * s, 0);
  ctx.lineTo(-55 * s, -18 * s);
  ctx.lineTo(-55 * s,  18 * s);
  ctx.closePath();
  ctx.fill();
  // Top fin
  ctx.beginPath();
  ctx.moveTo(-10 * s, -15 * s);
  ctx.lineTo(  5 * s, -26 * s);
  ctx.lineTo( 20 * s, -15 * s);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = '#FFAA00';
  ctx.beginPath();
  ctx.arc(33 * s, -4 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(34 * s, -4 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // Teeth
  ctx.fillStyle = '#FFF';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((22 + i * 5) * s, 14 * s);
    ctx.lineTo((24 + i * 5) * s, 20 * s);
    ctx.lineTo((26 + i * 5) * s, 14 * s);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// RENDERING – PARTICLES
// ============================================================
function drawParticles() {
  deadParticles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life * 0.8;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x + (1 - p.life) * p.vx * 0.5, p.y + (1 - p.life) * p.vy * 0.5, 5 * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  birthParticles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = '#FFD700';
    ctx.beginPath();
    const px = p.x + (1 - p.life) * p.vx * 0.6;
    const py = p.y + (1 - p.life) * p.vy * 0.8;
    ctx.arc(px, py, 4 * p.life, 0, Math.PI * 2);
    ctx.fill();
    // Star sparkle
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - 5 * p.life, py); ctx.lineTo(px + 5 * p.life, py);
    ctx.moveTo(px, py - 5 * p.life); ctx.lineTo(px, py + 5 * p.life);
    ctx.stroke();
    ctx.restore();
  });
}

// ============================================================
// RENDERING – CALL RING
// ============================================================
function drawCallRing(t) {
  if (player.callTimer <= 0) return;
  const rings = 3;
  for (let i = 0; i < rings; i++) {
    const progress = ((player.callRingAnim * 0.4 + i / rings) % 1);
    const r = progress * CALL_RADIUS;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.5;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ============================================================
// RENDERING – HUD
// ============================================================
function drawHUD() {
  const pad = 14;
  const barW = 160;
  const barH = 18;

  // Semi-transparent HUD background
  ctx.fillStyle = 'rgba(10, 26, 46, 0.72)';
  roundRect(ctx, pad, pad, barW + 36, 130, 10);
  ctx.fill();

  // --- Oxygen Bar ---
  drawBar(pad + 6, pad + 10, barW, barH, env.oxygen / OXY_MAX, '#4af', '#1a4a7a', '💧', `${Math.round(env.oxygen)}%`);

  // --- Temperature Bar ---
  const tempRange = 20; // display range 10..30
  const tempNorm  = Math.max(0, Math.min(1, (env.temperature - 10) / tempRange));
  const tempColor = env.temperature > TEMP_SAFE_MAX ? '#FF6B3D' : env.temperature < TEMP_SAFE_MIN ? '#4ae0ff' : '#44FFAA';
  drawBar(pad + 6, pad + 40, barW, barH, tempNorm, tempColor, '#1a4a7a', '🌡️', `${env.temperature.toFixed(1)}°C`);

  // --- Colony Count ---
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 14px Segoe UI';
  ctx.fillText(`🐟 Colony: ${colony.length} / ${COLONY_MAX}`, pad + 8, pad + 84);

  // --- Player Health ---
  drawBar(pad + 6, pad + 96, barW, barH, player.health / 100, '#ff7eb3', '#4a1a2a', '👑', `${Math.round(player.health)}%`);

  // --- Day counter & phase ---
  const phaseIcons = { day: '☀️', sunset: '🌅', night: '🌙', sunrise: '🌄' };
  const timeLeft  = CYCLE_DURATION - cycleTime;
  const mm        = Math.floor(timeLeft / 60);
  const ss        = Math.floor(timeLeft % 60);
  ctx.fillStyle   = '#e0f0ff';
  ctx.font        = 'bold 13px Segoe UI';
  ctx.fillText(`${phaseIcons[env.phase]}  Day ${dayCount}  –  ${mm}:${ss < 10 ? '0' : ''}${ss}`, pad + 8, pad + 134);

  // --- Active event banners (top-right) ---
  activeEvents.forEach((ev, i) => {
    const ex  = CANVAS_W - 210;
    const ey  = pad + i * 38;
    ctx.fillStyle = 'rgba(10, 26, 46, 0.8)';
    roundRect(ctx, ex, ey, 196, 32, 8);
    ctx.fill();
    ctx.strokeStyle = ev.color;
    ctx.lineWidth   = 2;
    roundRect(ctx, ex, ey, 196, 32, 8);
    ctx.stroke();
    ctx.fillStyle = ev.color;
    ctx.font      = 'bold 12px Segoe UI';
    ctx.fillText(`${ev.name}  ${Math.ceil(ev.timer)}s`, ex + 10, ey + 21);
  });

  // --- Controls reminder (bottom) ---
  ctx.fillStyle = 'rgba(10, 26, 46, 0.65)';
  roundRect(ctx, CANVAS_W / 2 - 200, CANVAS_H - 30, 400, 22, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 200, 230, 0.8)';
  ctx.font      = '11px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText('WASD / Arrows = Move   •   Space = Call Colony   •   Esc = Pause', CANVAS_W / 2, CANVAS_H - 14);
  ctx.textAlign = 'left';
}

function drawBar(x, y, w, h, ratio, fill, bg, icon, label) {
  // Background
  ctx.fillStyle = bg;
  roundRect(ctx, x + 24, y, w, h, 5);
  ctx.fill();
  // Fill
  ctx.fillStyle = fill;
  if (ratio > 0) {
    roundRect(ctx, x + 24, y, Math.max(4, w * ratio), h, 5);
    ctx.fill();
  }
  // Icon
  ctx.font      = '13px serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(icon, x, y + h - 2);
  // Label
  ctx.font      = '11px Segoe UI';
  ctx.fillStyle = '#e0f0ff';
  ctx.fillText(label, x + 24 + 4, y + h - 3);
}

// ============================================================
// OVERLAY – NIGHT DARKNESS
// ============================================================
function drawNightOverlay() {
  const darkness = 1.0 - env.lightLevel;
  if (darkness <= 0) return;
  ctx.save();
  ctx.globalAlpha = darkness * 0.55;
  ctx.fillStyle   = '#000820';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Moon
  if (env.phase === 'night' || env.phase === 'sunrise') {
    ctx.globalAlpha = darkness * 0.9;
    ctx.fillStyle   = '#FFF8DC';
    ctx.beginPath();
    ctx.arc(CANVAS_W - 80, 50, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(0, 8, 32, ${darkness * 0.55})`;
    ctx.beginPath();
    ctx.arc(CANVAS_W - 68, 44, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ============================================================
// MAIN LOOP
// ============================================================
function loop(timestamp) {
  if (gameState !== 'PLAYING') return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;

  gameTime += dt;

  updateEnvironment(dt);
  updatePlayer(dt);
  updateColony(dt);
  updateParticles(dt);
  updateParticlePositions(dt);

  // RENDER
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground(gameTime);
  drawBubbles();
  drawCallRing(gameTime);

  // Draw predator(s)
  activeEvents.filter(e => e.id === 'predator').forEach(ev => drawPredator(ev, gameTime));

  // Draw colony
  colony.forEach(a => {
    drawAxolotlShape(a.x, a.y, a.size, AXOLOTL_COLORS[a.colorIdx], a.dir, false, a.health, gameTime, a.alpha);
  });

  // Draw player on top
  drawAxolotlShape(player.x, player.y, player.size + 4, PLAYER_COLOR, player.dir, true, player.health, gameTime, 1);

  drawParticles();
  drawNightOverlay();
  drawHUD();

  requestAnimationFrame(loop);
}

function updateParticlePositions(dt) {
  deadParticles.forEach(p  => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 20 * dt; });
  birthParticles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; });
}

// ============================================================
// UTILITIES
// ============================================================
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function lerp(a, b, t)        { return a + (b - a) * t; }
function clamp(v, lo, hi)     { return Math.max(lo, Math.min(hi, v)); }
function randomBetween(a, b)  { return a + Math.random() * (b - a); }

function blendRGB(a, b, t) {
  return `${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))}`;
}

function blendColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRGB(hex1);
  const [r2, g2, b2] = hexToRGB(hex2);
  return `rgb(${Math.round(lerp(r1,r2,t))},${Math.round(lerp(g1,g2,t))},${Math.round(lerp(b1,b2,t))})`;
}

function hexToRGB(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ============================================================
// BUTTON WIRING  (called from HTML onclick)
// ============================================================
window.startGame  = startGame;
window.resumeGame = resumeGame;
window.startGame  = startGame;

// Show start screen on load
window.addEventListener('load', () => {
  showScreen('menuScreen');
  // Draw a still frame so canvas isn't empty behind the overlay
  ctx.fillStyle = '#0d2040';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground(0);
  drawBubbles();
  drawNightOverlay();
});
