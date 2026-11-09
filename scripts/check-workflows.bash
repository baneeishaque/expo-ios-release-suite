#!/usr/bin/env bash
set -euo pipefail
validation="${VALIDATION_DIR:?Set a task-owned validation directory}"
node scripts/render-workflow.mjs --lint-fixture "$validation/template.yml"
"${ACTIONLINT_BIN:-$(go env GOPATH)/bin/actionlint}" .github/workflows/*.yml "$validation/template.yml"
