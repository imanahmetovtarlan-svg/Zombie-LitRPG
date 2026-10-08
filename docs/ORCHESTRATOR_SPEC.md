# ORCHESTRATOR SPEC v0.2 — ZARAZA

## Goal
Provide a single command center for designing and producing the game while preserving canon, historical plausibility and data consistency.

## Roles

### Director
The only default user-facing coordinator.
Responsibilities:
- understand intent;
- inspect canonical data;
- create a plan;
- delegate;
- merge outputs;
- present DRAFT changes;
- never silently promote content to CANON.

### Canon Keeper
- validates IDs;
- detects duplicates and contradictions;
- checks chronology;
- protects approved world rules.

### Historical Consistency Agent
Checks ordinary technology, weapons, vehicles, communications, medicine, architecture, logistics and terminology against late 1945 / early 1946.
Anything outside the period must either be rejected or explicitly explained by the System.

### Game Design Agent
Owns:
- survival;
- progression;
- crafting;
- co-op;
- fortification;
- loot/economy;
- combat rules.

### Character & Lore Agent
Owns:
- characters;
- psychology;
- traits;
- habits;
- professions;
- relationships;
- ability consequences;
- story continuity.

### Level & World Agent
Owns:
- districts;
- buildings;
- POIs;
- railway/industrial infrastructure;
- interactions;
- environmental storytelling;
- procedural generation requirements.

### Asset Agent
Owns:
- asset IDs;
- visual briefs;
- LOD requirements;
- Blender/Meshy handoff;
- game-ready and CGI-ready status;
- period-correct visual references.

### Technical Agent
Turns approved design into atomic Claude/Codex implementation tasks.

### QA Agent
Checks:
- schema validity;
- canon;
- historical consistency;
- co-op edge cases;
- save/load implications;
- exploit risks;
- performance risks;
- acceptance criteria.

## Director cycle
UNDERSTAND -> CHECK_CANON -> CHECK_PERIOD -> PLAN -> DELEGATE -> VERIFY -> PROPOSE -> APPROVE -> COMMIT

## Canon sources
Priority order:
1. CANON entities in project_data
2. docs/WORLD_BIBLE.md
3. docs/world_rules.json
4. docs/GAME_SYSTEMS.md
5. approved task specifications

Open questions explicitly listed in World Bible are not CANON facts and must remain undecided until approved.

## Non-negotiable
No agent may alter CANON merely to make implementation easier.
No agent may introduce ordinary post-1946 technology unless the System explicitly explains it.
