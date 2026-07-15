# Scope-of-work eval — 2026-07-14-2240

Base: http://localhost:4373

**10/10 cases passing** | avg required-coverage **97%** | forbidden hits total: **0**

| Case | Coverage | Req hits | Forbidden | Lines | Band | Structure | Pass |
|---|---|---|---|---|---|---|---|
| 01-bathroom-tub-to-shower | 90.9% | 10/11 | 0 | 30 | 18-45 | ok | PASS |
| 02-kitchen-full-remodel-wall-opening | 100% | 17/17 | 0 | 28 | 22-55 | ok | PASS |
| 03-kitchen-refacing-countertops | 100% | 14/14 | 0 | 27 | 10-30 | ok | PASS |
| 04-composition-shingle-reroof | 100% | 9/9 | 0 | 17 | 8-25 | ok | PASS |
| 05-exterior-paint-stucco-repair | 90% | 9/10 | 0 | 20 | 12-35 | ok | PASS |
| 06-garage-to-adu-conversion | 100% | 17/17 | 0 | 37 | 20-60 | ok | PASS |
| 07-whole-house-repipe | 88.9% | 8/9 | 0 | 23 | 8-25 | ok | PASS |
| 08-popcorn-ceiling-interior-paint | 100% | 8/8 | 0 | 23 | 10-28 | ok | PASS |
| 09-vinyl-retrofit-windows | 100% | 7/7 | 0 | 13 | 6-20 | ok | PASS |
| 10-concrete-driveway-replacement | 100% | 9/9 | 0 | 17 | 8-22 | ok | PASS |

## Misses by case

### 01-bathroom-tub-to-shower (Hall Bathroom Remodel)
Missing required elements:
- tile_to_ceiling: Tile floor-to-ceiling in shower

### 05-exterior-paint-stucco-repair (Exterior Paint + Stucco Repair)
Missing required elements:
- customer_selects_color: Customer selects color

### 07-whole-house-repipe (Whole-House Repipe)
Missing required elements:
- pressure_test: Pressure/water test before closing walls
