# Gym Assistant

OpenClaw capability for querying and updating a Google Sheets workout journal from chat.

## Pieces

- `docs/spec.md`: feature behavior, sheet parser rules, and tool contract.
- `plugin/`: future OpenClaw tool plugin for Google Sheets reads and writes.
- `skill/`: OpenClaw skill instructions for routing gym questions to the plugin tools.
- `tests/`: future fixtures and tests for parser and write behavior.

## First Slice

1. Implement plugin tools:
   - `gym_log_latest`
   - `gym_log_search`
   - `gym_log_append`
2. Add Google Sheets credentials via deployment config, not source control.
3. Install or enable the skill in OpenClaw.
4. Smoke test from WebChat or the preferred chat channel.

## Local Verification

Run parser tests from `capabilities/gym-assistant/plugin`:

```powershell
& 'C:\Users\ThanhDV\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test .\tests\*.test.ts
```
