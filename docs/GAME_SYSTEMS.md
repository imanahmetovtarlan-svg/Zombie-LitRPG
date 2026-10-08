# GAME SYSTEMS — ZARAZA v0.2

## Core identity
- top-down / isometric roguelite-survival
- alternative-history military post-apocalypse, late 1945 / early 1946
- in-world LitRPG Interface
- superhuman abilities
- systemic urban exploration
- extraction-style risk/reward sorties
- persistent safehouses and districts
- 2–4 player co-op architecture
- crafting and fortification

## Historical constraint
All ordinary technology, weapons, transport, medicine, communications and infrastructure must be plausible for the period unless explicitly explained by the System.

## Starting city
Working location: Старореченск, western Byelorussian SSR.
Key gameplay spaces:
- railway station;
- ruined town center;
- commandant office / post / market / hospital;
- machine-building plant;
- warehouses and rail depot;
- wooden residential outskirts;
- military hospital and morgue;
- former German bunkers and communications node;
- forest with partisan sites and minefields;
- strategic bridge across the river.

## Survival
- Health
- Stamina
- Hunger
- Cold
- Infection
- Injuries
- Stress / Panic
- Sleep / fatigue

## Character model
Seven base attributes:
- strength
- agility
- endurance
- perception
- intelligence
- resolve
- reaction

Human baseline: 1.00.
Humans gain +0.01 distributed attribute growth per level.
Infected gain +0.01 to all seven attributes per level plus a branch specialization bonus (TBD).

Separate:
- base attributes
- traits
- habits
- dynamic conditions
- learned skills
- profession / wartime experience
- supernatural abilities
- foreign fragments

## Skill-by-use progression
Skills improve through meaningful use.
Books, manuals and teachers may accelerate learning.
Exploit-like repetitive actions should have diminishing XP.

## Crafting
Crafting should fit the period and material reality.

Loop:
find -> dismantle -> repair -> combine -> improve

Examples:
- boards + nails + wire -> barricade
- cloth + alcohol -> dressing / incendiary material
- ammunition components -> period-correct ammunition work
- battery + wire + lamp -> emergency lighting
- vehicle parts + fuel + mechanic -> restored vehicle functionality

## Specialists
Survivors with useful professions can be more valuable than combat loot.

Examples:
- mechanic
- medic
- radio operator
- railway worker
- sapper
- gunsmith
- electrician

Specialists unlock or accelerate systems rather than acting as abstract stat buffs only.

## Fortification
Temporary shelter -> camp -> fortified safehouse.

Period-appropriate fortifications:
- boarded windows;
- sandbags;
- wire;
- reinforced doors;
- observation posts;
- searchlights;
- generators;
- machine-gun positions;
- mines where historically and mechanically appropriate;
- rail cars and heavy debris as barriers.

Stronger bases generate more light, noise and stored value, increasing threat.

## Co-op
Architecture targets 2–4 players.
Initial vertical slice may expose only 2-player functionality.

Co-op systems must account for:
- downed/revive state;
- shared or reserved loot policy;
- role emergence through skills, not hard classes;
- cooperative construction;
- specialist synergy;
- ability combinations.

## Infected
Infected are governed by docs/WORLD_BIBLE.md and docs/world_rules.json.

Hard invariants:
- no weapon/tool/vehicle use;
- no recovered human culture;
- specialized predatory logic can be high;
- stronger infected may consume weaker ones;
- independent hives compete;
- level does not directly equal size.

Detailed infected implementation is a separate system track.

## Data-driven rule
Characters, items, traits, locations, professions, vehicles, infected archetypes, hives and recipes should live in project_data where feasible rather than being hardcoded.
