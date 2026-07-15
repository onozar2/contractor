# Scope-of-work eval — 2026-07-14-1840

Base: http://localhost:4373

**6/10 cases passing** | avg required-coverage **86.7%** | forbidden hits total: **0**

| Case | Coverage | Req hits | Forbidden | Lines | Band | Structure | Pass |
|---|---|---|---|---|---|---|---|
| 01-bathroom-tub-to-shower | 54.5% | 6/11 | 0 | 37 | 18-45 | ok | fail |
| 02-kitchen-full-remodel-wall-opening | 100% | 17/17 | 0 | 40 | 22-55 | ok | PASS |
| 03-kitchen-refacing-countertops | 100% | 14/14 | 0 | 19 | 10-30 | ok | PASS |
| 04-composition-shingle-reroof | 77.8% | 7/9 | 0 | 12 | 8-25 | ok | fail |
| 05-exterior-paint-stucco-repair | 100% | 10/10 | 0 | 24 | 12-35 | ok | PASS |
| 06-garage-to-adu-conversion | 82.4% | 14/17 | 0 | 68 | 20-60 | ok | fail |
| 07-whole-house-repipe | 77.8% | 7/9 | 0 | 17 | 8-25 | ok | fail |
| 08-popcorn-ceiling-interior-paint | 100% | 8/8 | 0 | 24 | 10-28 | ok | PASS |
| 09-vinyl-retrofit-windows | 85.7% | 6/7 | 0 | 6 | 6-20 | ok | PASS |
| 10-concrete-driveway-replacement | 88.9% | 8/9 | 0 | 12 | 8-22 | ok | PASS |

## Misses by case

### 01-bathroom-tub-to-shower (Hall Bathroom Remodel)
Missing required elements:
- permit: Pull city permit
- wax_ring: Toilet wax ring
- tile_to_ceiling: Tile floor-to-ceiling in shower
- prime_two_coats: Prime + 2 coats paint
- haul_away: Clean up / haul away debris

### 04-composition-shingle-reroof (Composition Shingle Reroof)
Missing required elements:
- permit: Roofing permit
- ridge: Ridge (cap/vent)

### 06-garage-to-adu-conversion (Garage-to-ADU Conversion)
Missing required elements:
- permit: Permit / plan-check
- asbestos_lead: Asbestos/lead test before demo
- address_utility_setup: Separate address/utility setup
Length out of band: 68 lines (band 20-60).

### 07-whole-house-repipe (Whole-House Repipe)
Missing required elements:
- permit: Plumbing permit
- pressure_test: Pressure/water test before closing walls

### 09-vinyl-retrofit-windows (Vinyl Retrofit Windows (8))
Missing required elements:
- permit: Permit

### 10-concrete-driveway-replacement (Concrete Driveway Replacement)
Missing required elements:
- control_joints: Control/expansion joints
