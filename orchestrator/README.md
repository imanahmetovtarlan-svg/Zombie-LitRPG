# Orchestrator

v0.1 is provider-agnostic.

Recommended MVP:
- local web Command Center;
- small backend API;
- filesystem or SQLite registry;
- provider adapters for Claude and Codex;
- task board;
- DRAFT / REVIEW / CANON controls.

Never commit API keys. Use local `.env` and CI secrets.

## Command Center
The MVP lives in `orchestrator/command-center/` — see its README. Quick start:
`cd orchestrator/command-center && npm install && npm start` → http://127.0.0.1:4317
