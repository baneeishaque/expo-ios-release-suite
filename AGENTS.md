# Expo iOS Release Suite

## Purpose

Public, reusable GitHub composite actions and a two-job workflow for Expo iOS
simulator builds, EAS device builds, and TestFlight submission.

## Ownership

- `simulator/action.yml` and `eas/action.yml` define the public action interfaces.
- `src/` owns shared executable behavior; action YAML only wires inputs and steps.
- `templates/` and `scripts/` own generation of the reusable workflow.
- `tests/` owns offline failure/contract tests and the simulator integration fixture.
- Root documentation owns usage, release procedure, and compatibility constraints.

## Local Contracts

- Preserve the full simulator success gate before EAS in the reusable workflow.
- Default manual dispatch to simulator-only with no paid profile selected.
- Only release-branch pushes or explicit manual device/both targets enable EAS.
- Reject device-only profiles with submission enabled before queuing a build.
- Validate caller-supplied app identities; never embed a consumer's IDs or secrets.
- Resolve implementation files relative to the action, and app files relative to
  the caller's working directory. Do not confuse these two locations.
- Enqueue each requested profile once, then monitor its exact build ID.
- Check Apple app identity and agreement access before a submission build.
- Keep signing material outside the app source and out of uploaded artifacts.
- Use full commit SHAs for third-party actions and released internal action calls.
- Reusable workflow action references are generated from an existing core commit.
  They must not float when a caller pins a workflow revision.
- Root owns all current directories; no additional local DOX files are required.

## Work Guidance

- Follow the established script-backed action, action-suite, and `workflow_call`
  patterns from the maintainer's existing automation repositories.
- Keep original research/session artifacts local-only; public docs are self-contained.
- Add meaningful tests for paid-build gating, failure propagation, action-path
  isolation, identity validation, and artifact preservation.

## Verification

- `npm run lint:actions` validates composite interfaces and wrapper input wiring.
- `npm test` runs offline tests; set `TEST_ARTIFACT_DIR` inside local `scratch/`.
- `shellcheck src/*.bash scripts/*.bash`
- `bash scripts/check-workflows.bash` with a task-owned `VALIDATION_DIR`.
- `markdownlint-cli2 AGENTS.md README.md DESIGN.md CONTRIBUTING.md SECURITY.md`
- Suite CI tests the simulator action against a real Expo fixture on macOS.

## Child DOX Index
