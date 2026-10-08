# Zombie LitRPG

Zombie LitRPG is a top-down / isometric zombie roguelite-survival project with an in-world LitRPG Interface, skill-by-use progression, co-op, crafting and fortification.

## Orchestrator v0.1

Workflow:

```
USER
  ↓
DIRECTOR
  ↓
CHECK CANON
  ↓
PLAN
  ↓
DELEGATE
  ↓
VERIFY
  ↓
DRAFT
  ↓
APPROVE
  ↓
CANON
```

### Core rules
- The user talks to one primary Director.
- `docs/` and CANON entities are the source of truth.
- New content starts as DRAFT.
- AI must not hardcode world content when it belongs in `project_data/`.
- Co-op, crafting, fortification and future CGI asset reuse are architectural constraints from day one.

See `docs/ORCHESTRATOR_SPEC.md` and `tasks/backlog/TASK-0001.json`.
