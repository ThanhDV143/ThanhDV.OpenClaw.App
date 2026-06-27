# OpenClaw App Extensions

This repository is a workspace for building personal OpenClaw capabilities.

Initial capability:

- Gym assistant: query and update a Google Sheets workout journal from OpenClaw chat channels.
- Unity package catalog: search and safely manage Unity packages from Verdaccio and NAS-hosted `.unitypackage` files.

Planned capability types:

- Knowledge base search across personal files and documents.
- Personal data lookup and lightweight automations.
- OpenClaw skills and tool plugins that can be deployed to the self-hosted gateway.

## Directory Layout

```text
capabilities/
  <capability-name>/
    docs/
      spec.md
    plugin/
      README.md
    skill/
      SKILL.md
    tests/
      README.md

config/
  examples/

deploy/

docs/

scripts/
```

## Conventions

- Keep each feature under `capabilities/<name>`.
- Put product and technical notes in `capabilities/<name>/docs`.
- Put OpenClaw tool plugin source in `capabilities/<name>/plugin`.
- Put OpenClaw skill files in `capabilities/<name>/skill`.
- Put feature-specific fixtures and tests in `capabilities/<name>/tests`.
- Keep shared deployment notes under `deploy`.
- Keep shared config examples under `config/examples`.

Do not commit secrets, Google credentials, tokens, or exported personal data.

