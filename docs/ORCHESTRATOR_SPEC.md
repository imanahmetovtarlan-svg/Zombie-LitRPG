# ORCHESTRATOR SPEC v0.1

## Goal
Provide a single convenient command center for designing and producing the game without losing canon consistency.

## Roles

### Director
The only default user-facing coordinator.
Responsibilities:
- understand intent;
- inspect canonical data;
- create a plan;
- delegate to specialists;
- merge outputs;
- present DRAFT changes;
- never silently promote content to CANON.

### Canon Keeper
- validates IDs;
- checks duplicates;
- detects contradictions;
- checks chronology;
- rejects unauthorized canonical changes.

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
- relationships;
- ability consequences;
- story continuity.

### Level & World Agent
Owns:
- districts;
- buildings;
- POIs;
- interactions;
- environmental storytelling;
- procedural generation requirements.

### Asset Agent
Owns:
- asset IDs;
- visual briefs;
- LOD requirements;
- Blender/Meshy handoff;
- game-ready and CGI-ready status.

### Technical Agent
Turns approved design into atomic Claude/Codex implementation tasks.

### QA Agent
Checks:
- schema validity;
- canon;
- co-op edge cases;
- save/load implications;
- exploit risks;
- performance risks;
- acceptance criteria.

## Director cycle
`UNDERSTAND -> CHECK_CANON -> PLAN -> DELEGATE -> VERIFY -> PROPOSE -> APPROVE -> COMMIT`

## Canon rule
No agent may alter CANON merely to make implementation easier.
