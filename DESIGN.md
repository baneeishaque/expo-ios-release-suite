# Design Decisions

<!-- markdownlint-configure-file { "MD013": { "line_length": 120, "tables": false } } -->

## Established Patterns

This suite follows the maintainer's existing automation structure:

- [`mise-setup-verification-action`](https://github.com/Baneeishaque/mise-setup-verification-action/tree/bca6635be4dd23f8b7d4a408b8f4ee33fbfb1343)
  demonstrates a script-backed composite action with explicit inputs, failure checks, and self-tests.
- [`adaptive-artifacts-suite`](https://github.com/Baneeishaque/adaptive-artifacts-suite/tree/d32251a42fe2381b7dcd0f9e4a295d0ff6171bbc)
  demonstrates multiple independently consumable actions in one repository.
- [`NestJS/React common workflows`](https://github.com/Baneeishaque/nestjs-react-web-app-automation-github-actions/tree/e014fd8593a3597c84f350aa885880a891a577b9)
  demonstrate `workflow_call` orchestration and caller-configurable project directories.

Their recorded maintenance lessons are reflected here: validate interfaces against the wrapped action,
fail on invalid configuration, preserve command exit status, resolve paths deliberately, and test the public entry point.

## Responsibilities

| Layer | Owns |
| --- | --- |
| Consumer | Events, app identity, credential mapping, concurrency, app-specific post-submit behavior |
| Reusable workflow | macOS/Ubuntu jobs, dependency gate, secrets forwarding, public outputs |
| Composite actions | Tool setup, caching, step wiring, artifact uploads |
| Shared scripts | Policy, app/Apple validation, compilation, monitoring, configuration preservation |

## Important Boundaries

- Simulator success is a compile gate, not proof of runtime correctness or device signing.
- A composite action stays on its caller's runner. Cross-runner sequencing belongs in the reusable workflow.
- App source paths and action installation paths are separate. Local relative action references inside a
  remotely downloaded action would resolve against the caller checkout and are deliberately avoided.
- Workflow pinning is transitive: generated internal action references use an immutable core SHA.
- Public environment values are explicitly forwarded; private credentials are not converted into client configuration.
- SDK/Xcode, EAS CLI versions, and profile names are configurable instead of being tied to a particular CRM app.
