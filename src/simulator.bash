#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
shopt -s nullglob
cd "${PROJECT_DIRECTORY:?}"

case "${1:?Expected toolchain, resolve, build, package, or summary}" in
  toolchain)
    node --version
    xcodebuild -version
    xcrun swift --version
    pod --version
    xcbeautify --version
    ;;
  resolve)
    containers=(ios/*.xcworkspace)
    flag=-workspace
    if [[ ${#containers[@]} -eq 0 ]]; then containers=(ios/*.xcodeproj); flag=-project; fi
    if [[ ${#containers[@]} -eq 0 ]]; then echo '::error::No Xcode container found under ios/.'; exit 1; fi
    container="${containers[0]}"
    scheme="${XCODE_SCHEME:-}"
    if [[ -z "$scheme" ]]; then scheme="${container##*/}"; scheme="${scheme%.*}"; fi
    # Generated native paths are one line; avoid injecting additional step outputs.
    if [[ "$container$scheme" == *$'\n'* || "$container$scheme" == *$'\r'* ]]; then exit 1; fi
    printf 'flag=%s\ncontainer=%s\nscheme=%s\n' "$flag" "$container" "$scheme" >> "${GITHUB_OUTPUT:?}"
    ;;
  build)
    xcodebuild "${XCODE_FLAG:?}" "${XCODE_CONTAINER:?}" -scheme "${XCODE_SCHEME:?}" \
      -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$ARTIFACT_DIR/DerivedData" -resultBundlePath "$ARTIFACT_DIR/simulator.xcresult" \
      CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' ONLY_ACTIVE_ARCH=NO \
      build 2>&1 | tee "$ARTIFACT_DIR/xcodebuild.log" | xcbeautify --renderer github-actions
    ;;
  package)
    apps=("${ARTIFACT_DIR:?}"/DerivedData/Build/Products/Release-iphonesimulator/*.app)
    if [[ ${#apps[@]} -ne 1 ]]; then echo '::error::Expected exactly one simulator .app.'; exit 1; fi
    app="${apps[0]}"
    tar -czf "$ARTIFACT_DIR/ios-simulator.tar.gz" -C "${app%/*}" "${app##*/}"
    ;;
  summary)
    {
      printf '### iOS simulator: %s\n\n' "${JOB_STATUS:-unknown}"
      printf -- '- Compilation: %s\n- App artifact: %s\n' "${BUILD_OUTCOME:-skipped}" "${UPLOAD_OUTCOME:-skipped}"
      if [[ -n "${ARTIFACT_URL:-}" ]]; then printf -- '- Download: %s\n' "$ARTIFACT_URL"; fi
      printf '\nFull compilation is required before EAS. Runtime behavior and signing require separate verification.\n'
    } >> "${GITHUB_STEP_SUMMARY:?}"
    ;;
  *) echo '::error::Unknown simulator operation.'; exit 1 ;;
esac
