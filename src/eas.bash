#!/usr/bin/env bash
set -euo pipefail
cd "${PROJECT_DIRECTORY:?}"

case "${1:?Expected build, submit, or summary}" in
  build)
    IFS=, read -r -a profiles <<< "${PROFILES:?}"
    deadline=$((SECONDS + ${WAIT_SECONDS:?}))
    for logical in "${profiles[@]}"; do
      case "$logical" in device) profile="${DEVICE_PROFILE:?}" ;; production) profile="${PRODUCTION_PROFILE:?}" ;; *) exit 1 ;; esac
      if (( SECONDS >= deadline )); then echo '::error::Build wait budget exhausted.'; exit 1; fi
      started=$SECONDS
      printf '::group::EAS %s\nQueueing at %s\n' "$profile" "$(date -u +%FT%TZ)"
      # This enqueue is deliberately never retried; status checks use the returned ID.
      timeout 900 eas build --platform ios --profile "$profile" --non-interactive --no-wait --json \
        > "$ARTIFACT_DIR/eas-$logical-request.json"
      id="$(jq -er '(if type == "array" then .[0] else . end).id | select(type == "string" and length > 0)' \
        "$ARTIFACT_DIR/eas-$logical-request.json")"
      printf 'Build page: https://expo.dev/builds/%s\n' "$id"
      failures=0
      while :; do
        if (( SECONDS >= deadline )); then printf '::error::Timed out waiting for %s; inspect it before retrying.\n' "$id"; exit 1; fi
        if timeout 90 eas build:view "$id" --json > "$ARTIFACT_DIR/eas-$logical-poll.json" \
          2>> "$ARTIFACT_DIR/eas-$logical-poll.log"; then
          jq -e --arg id "$id" '.id == $id and (.status | type == "string")' "$ARTIFACT_DIR/eas-$logical-poll.json" > /dev/null
          cp "$ARTIFACT_DIR/eas-$logical-poll.json" "$ARTIFACT_DIR/eas-$logical.json"
          failures=0
        else
          failures=$((failures + 1))
          printf '::warning::Status check failed for %s (%s/3).\n' "$id" "$failures"
          (( failures < 3 )) || exit 1
          sleep "${POLL_SECONDS:?}"
          continue
        fi
        elapsed=$((SECONDS - started))
        printf '%s\n' "$elapsed" > "$ARTIFACT_DIR/duration-$logical.txt"
        status="$(jq -r '.status' "$ARTIFACT_DIR/eas-$logical.json")"
        printf '%s profile=%s status=%s elapsed=%ss\n' "$(date -u +%FT%TZ)" "$profile" "$status" "$elapsed"
        case "$status" in
          FINISHED) break ;;
          ERRORED|CANCELED) printf '::error::Build %s ended with %s.\n' "$id" "$status"; exit 1 ;;
        esac
        sleep "${POLL_SECONDS:?}"
      done
      url="$(jq -er '.artifacts.applicationArchiveUrl // .artifacts.buildUrl // empty' "$ARTIFACT_DIR/eas-$logical.json")"
      curl --fail --show-error --location --connect-timeout 10 --max-time 300 --retry 2 "$url" -o "$ARTIFACT_DIR/app-$logical.ipa"
      unzip -tq "$ARTIFACT_DIR/app-$logical.ipa"
      printf '%s-build-id=%s\n' "$logical" "$id" >> "${GITHUB_OUTPUT:?}"
      if [[ "$logical" == production ]]; then
        number="$(jq -er '.appBuildVersion | select(type == "string" and length > 0)' "$ARTIFACT_DIR/eas-production.json")"
        version="$(jq -er '.appVersion | select(type == "string" and length > 0)' "$ARTIFACT_DIR/eas-production.json")"
        if [[ "$number$version" == *$'\n'* || "$number$version" == *$'\r'* ]]; then exit 1; fi
        printf 'production-build-number=%s\nproduction-app-version=%s\n' "$number" "$version" >> "$GITHUB_OUTPUT"
      fi
      printf '::endgroup::\n'
    done
    ;;
  submit)
    if [[ ! -s "$ARTIFACT_DIR/app-production.ipa" ]]; then echo '::error::Production IPA missing.'; exit 1; fi
    eas submit --platform ios --profile expo-ios-release-suite --path "$ARTIFACT_DIR/app-production.ipa" --non-interactive --wait
    ;;
  summary)
    {
      printf '### EAS release: %s\n\n- Submission: %s\n\n' "${JOB_STATUS:-unknown}" "${SUBMIT_OUTCOME:-skipped}"
      printf '| Profile | Status | Elapsed seconds | Build |\n| --- | --- | --- | --- |\n'
      IFS=, read -r -a profiles <<< "${PROFILES:-}"
      for profile in "${profiles[@]}"; do
        file="$ARTIFACT_DIR/eas-$profile.json"
        [[ -f "$file" ]] || file="$ARTIFACT_DIR/eas-$profile-request.json"
        status=not-started; page='—'; elapsed='—'
        if [[ -s "$file" ]]; then
          status="$(jq -r '(if type == "array" then .[0] else . end).status // "unknown"' "$file")"
          id="$(jq -r '(if type == "array" then .[0] else . end).id // empty' "$file")"
          [[ -z "$id" ]] || page="https://expo.dev/builds/$id"
        fi
        if [[ -s "$ARTIFACT_DIR/duration-$profile.txt" ]]; then read -r elapsed < "$ARTIFACT_DIR/duration-$profile.txt"; fi
        printf '| %s | %s | %s | %s |\n' "$profile" "$status" "$elapsed" "$page"
      done
    } >> "${GITHUB_STEP_SUMMARY:?}"
    ;;
  *) exit 1 ;;
esac
