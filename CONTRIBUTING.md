# Contributing

<!-- markdownlint-configure-file { "MD013": { "line_length": 120, "code_blocks": false } } -->

Use Node 22 or newer. Runtime action logic uses Node built-ins and shell tools; npm dependencies are for tests/validation.

## Checks

```bash
npm ci
npm run lint:actions
npm test
shellcheck src/*.bash scripts/*.bash
bash scripts/check-workflows.bash
```

Set `TEST_ARTIFACT_DIR` and `VALIDATION_DIR` to task-owned paths inside this checkout's ignored `scratch/` directory.
Set `ACTIONLINT_BIN` when actionlint is not installed under the default Go binary directory.
CI also runs a real macOS simulator build from `tests/fixture`.

## Release Procedure

1. Update/test the action implementation, interfaces, and documentation; commit the core changes.
2. Generate the reusable workflow with `npm run render:workflow -- <full-core-commit-sha>`.
3. Review and commit the generated workflow. The generator requires the implementation to match that core commit.
4. Run CI, including the reusable workflow integration test, before publishing a version tag.
5. Publish an immutable version such as `v1.0.0`; recommend its full commit SHA to consumers.

This two-commit procedure avoids circular self-references: the workflow revision points to an existing immutable
action implementation. Edit `templates/ios-build.yml.tmpl`, never the generated workflow directly.

Keep tests offline for EAS/Apple failure paths. Do not use repository secrets or queue paid builds in suite CI.
