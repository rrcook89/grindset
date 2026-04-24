# 11 — Art & Asset Pipeline

## Style

**Modernized HD-pixel.** Hand-drawn 32×32 tiles upscaled to 64×64 with pixel-perfect shaders, warm paint feel, subtle ambient lighting. Think *Chucklefish / Moonlighter / modern Stardew*. Achievable with 1–2 artists.

## Characters

- 2×3 tile sprite size (64×96 px).
- 8-directional walk cycles, idle, attack (per weapon class), skill animations.
- Modular layers: base → hair → torso → legs → weapon → back. Enables cosmetic mixing.
- Silhouette-first design — readable at zoomed-out play distance.

## Environments

- 64×64 tiled 2D world.
- **5 launch biomes:** marsh (Mireholm), forest (Verdant Reach), volcanic (Ashspire), ruined battlefield (Ruinfields, red tint), coastal (Tidebreak).
- Parallax ambient layers (drifting fog, heat shimmer, rain) via shaders — huge perceived-quality lift cheap.
- Day/night cycle on 30-min real-time loop.

## UI

- **Parchment-on-obsidian** — dark chrome + warm gold accents.
- Bottom-center inventory + hotbar; right-side collapsible skill/quest/map panels.
- Chat dockable bottom-left.
- **$GRIND price ticker in HUD corner** — constant reminder the economy is live.
- Mobile: reflows to single bottom sheet + virtual joystick.

## Launch asset budget (Region 1 — Mireholm + Verdant)

| Category | Count | Hrs/unit | Total hrs |
|---|---|---|---|
| Tiles (biome, props) | 120 | 1.5 | 180 |
| Character sprite sheet (modular) | 1 base × 8-dir × 8 anims | 40 | 40 |
| NPCs | 20 | 4 | 80 |
| Mobs (5 species × 3 tiers) | 15 | 8 | 120 |
| Item icons | 150 | 0.5 | 75 |
| Item world sprites | 30 | 1 | 30 |
| UI kit | 1 | 60 | 60 |
| VFX (hit, heal, cast) | 20 | 2 | 40 |
| Logo + brand kit | 1 | 24 | 24 |
| **Total** | | | **~650 hrs** |

At 2 artists (combined ~280 productive hrs/month): **~2.5 months for MVP region 1**. Each seasonal region after: ~1.5 months.

## Tools

- **Aseprite** — sprites and tiles
- **Figma** — UI kit and branding
- **Blender** — turntable reference if needed
- **Custom Pixi shader** — consistent post-process (subtle bloom, vignette, color grade)

## Delivery

- PNG sheets + Aseprite JSON metadata.
- Packed into atlases at build time.
- Three atlas sizes: 0.5× (mobile), 1× (default), 2× (hi-dpi desktop).
- Asset manifest `apps/web/public/assets/manifest.json` lists atlases + checksums.

## Naming convention

```
<category>/<tier>/<name>-<variant>.png

e.g.
tiles/marsh/water-shallow-01.png
items/icons/sword-rune.png
chars/base/walk-n.png
vfx/combat/hit-slash.png
```

## Outsourced

- **Music:** licensed (Epidemic Sound) for MVP. Commission 2–3 hero themes post-launch.
- **SFX:** GameDev Market packs.
- **Voiceover:** none at MVP. Text-only narration.
