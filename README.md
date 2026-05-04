# AxoLegacy – Gills & Generations 🌊👑

A browser-based colony survival game where **you are the Axolotl King** — not a god watching from above, but a leader swimming *inside* your own colony.

## 🎮 Play

Open `index.html` in any modern browser. No server or build step required.

## 🧠 Gameplay Loop

1. **Swim** as the King using **WASD** or arrow keys.
2. **Call your colony** with **Space** — nearby axolotls follow you.
3. **Keep them alive** by guiding them away from danger and staying in safe conditions.
4. **Survive events** — droughts, heatwaves, predators, algae blooms.
5. **Grow the colony** — healthy axolotls reproduce over time.
6. **Repeat** — the cycle gets harder each day.

## ⚙️ Systems

| System | Details |
|---|---|
| **Day/Night Cycle** | 6-min loop: Day (3 min) → Sunset (0:30) → Night (2 min) → Sunrise (0:30) |
| **Temperature** | Day ~25 °C · Night ~18 °C · Safe range 20–26 °C |
| **Oxygen** | Starts at 85 %. Drops during Drought or algae die-off. |
| **Colony** | 10–20 axolotls. They wander, follow, flee, and reproduce. |
| **Events** | 🌵 Drought · 🔥 Heatwave · 🐟 Predator · 🌿 Algae Bloom |

## 👑 Controls

| Key | Action |
|---|---|
| `WASD` / Arrow Keys | Move the Axolotl King |
| `Space` | Call nearby colony members to follow |
| `Esc` | Pause / Resume |

## 📁 Structure

```
index.html      ← entry point
css/style.css   ← underwater theme styling
js/game.js      ← complete game logic (Canvas 2D)
```

## 🗺️ Roadmap

- **Phase 1 (current)** – Browser prototype: colony AI, day/night, temperature, events.
- **Phase 2** – GDevelop port: bigger world, mutations, trait inheritance, richer AI.
