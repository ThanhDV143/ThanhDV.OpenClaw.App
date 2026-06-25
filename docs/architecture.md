# Architecture

This workspace separates reusable OpenClaw capabilities by feature.

## Capability Pattern

Each capability should have:

- A spec in `docs/spec.md`.
- A tool plugin when OpenClaw needs to call external systems or mutate data.
- A skill when the agent needs workflow instructions.
- Tests or fixtures for parsing and side-effect behavior.

## Boundary

Use a tool plugin for actions:

- Read a Google Sheet.
- Update a Google Sheet.
- Search a local index.
- Fetch or mutate data through an API.

Use a skill for instructions:

- When to call a tool.
- How to interpret user phrasing.
- How to format the answer.
- What safety rules apply.

This keeps prompt instructions small and moves deterministic behavior into code.

