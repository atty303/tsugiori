#!/bin/bash
set -euo pipefail
cd "$TSUGIORI_PROJECT_DIRECTORY"
export TSUGIORI_DIAGNOSTIC_PARENT="bootstrap-$$"
record() {
  if [ "${TSUGIORI_DIAGNOSTICS:-1}" != "0" ]; then
    local directory="$RUNNER_TEMP/tsugiori-diagnostics"
    mkdir -p "$directory" 2>/dev/null || { echo "warning: Tsugiori bootstrap recording unavailable." >&2; return 0; }
    chmod 700 "$directory" 2>/dev/null || true
    printf '{"stage":"%s","status":"%s","elapsedSeconds":%s}\n' "$1" "$2" "$SECONDS" >> "$directory/bootstrap-$$.jsonl" 2>/dev/null || true
    chmod 600 "$directory/bootstrap-$$.jsonl" 2>/dev/null || true
    ls -1t "$directory"/bootstrap-*.jsonl 2>/dev/null | tail -n +33 | while IFS= read -r file; do rm -f "$file" 2>/dev/null || true; done || true
  fi
}
case "$TSUGIORI_RUNNER_OS-$TSUGIORI_RUNNER_ARCH" in
  Linux-X64) target=x86_64-unknown-linux-gnu ;;
  Linux-ARM64) target=aarch64-unknown-linux-gnu ;;
  macOS-X64) target=x86_64-apple-darwin ;;
  macOS-ARM64) target=aarch64-apple-darwin ;;
  *) record platform unsupported; echo "Unsupported task artifact platform." >&2; exit 1 ;;
esac
args=(--expected-key "$TSUGIORI_SOURCE_KEY" --cache-directory "$TSUGIORI_ARTIFACT_CACHE" --target "$target")
rebuild=""
record cache.restore started
if [ -x "$TSUGIORI_ARTIFACT_CACHE/task-runtime" ]; then
  if "$TSUGIORI_ARTIFACT_CACHE/task-runtime" github-actions task restore "${args[@]}"; then
    record cache.restore success
    exit 0
  else
    restore_status=$?
  fi
  if [ "$restore_status" = 3 ]; then
    record cache.restore source_drift
    exit 1
  fi
  if [ "$restore_status" = 2 ]; then record cache.restore validation_failed; else record cache.restore startup_failed; rebuild="--rebuild"; fi
elif [ -e "$TSUGIORI_ARTIFACT_CACHE/task-runtime" ]; then
  record cache.restore startup_failed
  rebuild="--rebuild"
else
  record cache.restore miss
fi
deno_binary=$(command -v deno || true)
if [ -n "$deno_binary" ]; then
  deno_binary="$(cd "$(dirname "$deno_binary")" && pwd)/$(basename "$deno_binary")"
  record deno.select existing
else
  record deno.download started
  install_dir=$(mktemp -d "$RUNNER_TEMP/tsugiori-deno.XXXXXX")
  trap 'rm -rf "$install_dir"' EXIT
  if ! curl -fsSL --connect-timeout 15 --max-time 120 "https://github.com/denoland/deno/releases/download/v$TSUGIORI_INSTALL_DENO_VERSION/deno-$target.zip" -o "$install_dir/deno.zip" || ! unzip -q "$install_dir/deno.zip" -d "$install_dir"; then
    record deno.download failed; echo "Failed to download Tsugiori's fallback Deno." >&2; exit 1
  fi
  deno_binary="$install_dir/deno"
  chmod +x "$deno_binary"
  record deno.download success
fi
export TSUGIORI_DENO="$deno_binary"
record artifact.prepare started
if "$deno_binary" run --frozen=true -A "$TSUGIORI_ENTRYPOINT" github-actions task prepare "${args[@]}" $rebuild; then
  record artifact.prepare success
else
  record artifact.prepare failed
  exit 1
fi
