# Capabilities

Each subdirectory is one OpenClaw capability with its own docs, plugin, skill, and tests.

Use this layout for new features:

```text
capabilities/<name>/
  README.md
  docs/spec.md
  plugin/README.md
  skill/SKILL.md
  tests/README.md
```

Keep capability boundaries narrow. Shared deployment or config belongs in the root `deploy` and `config` folders.

