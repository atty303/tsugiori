import { MINIMUM_DENO_VERSION } from "./deno.ts";

function quote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** POSIX delivery bridge; task bodies remain separate native Actions steps. */
export function preparationScript(
  entrypoint: string,
  expectedLayout: string,
  sourceKey: string,
): string {
  const minimum = MINIMUM_DENO_VERSION.split(".");
  const args = `--expect-layout ${quote(expectedLayout)} --expected-key ${
    quote(sourceKey)
  } --cache-directory "$TSUGIORI_ARTIFACT_CACHE" --target "$target"`;
  return `set -euo pipefail
export TSUGIORI_DIAGNOSTIC_PARENT="bootstrap-$$"
record() {
  if [ "\${TSUGIORI_DIAGNOSTICS:-1}" != "0" ]; then
    local directory="$RUNNER_TEMP/tsugiori-diagnostics"
    mkdir -p "$directory" 2>/dev/null || { echo "warning: Tsugiori bootstrap recording unavailable." >&2; return 0; }
    chmod 700 "$directory" 2>/dev/null || true
    printf '{"stage":"%s","status":"%s","elapsedSeconds":%s}\\n' "$1" "$2" "$SECONDS" >> "$directory/bootstrap-$$.jsonl" 2>/dev/null || true
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
rebuild=""
record cache.restore started
if [ -x "$TSUGIORI_ARTIFACT_CACHE/task-runtime" ]; then
  if "$TSUGIORI_ARTIFACT_CACHE/task-runtime" github-actions task restore ${args}; then
    record cache.restore success
    exit 0
  else
    restore_status=$?
  fi
  if [ "$restore_status" = 2 ]; then record cache.restore validation_failed; else record cache.restore startup_failed; rebuild="--rebuild"; fi
elif [ -e "$TSUGIORI_ARTIFACT_CACHE/task-runtime" ]; then
  record cache.restore startup_failed
  rebuild="--rebuild"
else
  record cache.restore miss
fi
supported() {
  local version major minor patch
  local pattern='^deno ([0-9]+)[.]([0-9]+)[.]([0-9]+)([[:space:]]|$)'
  version=$("$1" --version 2>/dev/null) || return 1
  if [[ ! "$version" =~ $pattern ]]; then return 1; fi
  major=\${BASH_REMATCH[1]}; minor=\${BASH_REMATCH[2]}; patch=\${BASH_REMATCH[3]}
  (( major > ${minimum[0]} || (major == ${minimum[0]} && minor > ${
    minimum[1]
  }) || (major == ${minimum[0]} && minor == ${minimum[1]} && patch >= ${
    minimum[2]
  }) ))
}
deno_binary=$(command -v deno || true)
if [ -n "$deno_binary" ] && supported "$deno_binary"; then
  deno_binary="$(cd "$(dirname "$deno_binary")" && pwd)/$(basename "$deno_binary")"
  record deno.select existing
else
  record deno.download started
  install_dir=$(mktemp -d "$RUNNER_TEMP/tsugiori-deno.XXXXXX")
  trap 'rm -rf "$install_dir"' EXIT
  if ! curl -fsSL --connect-timeout 15 --max-time 120 "https://github.com/denoland/deno/releases/latest/download/deno-$target.zip" -o "$install_dir/deno.zip" || ! unzip -q "$install_dir/deno.zip" -d "$install_dir"; then
    record deno.download failed; echo "Failed to download Tsugiori's fallback Deno." >&2; exit 1
  fi
  deno_binary="$install_dir/deno"
  chmod +x "$deno_binary"
  if ! supported "$deno_binary"; then
    record deno.download unsupported; echo "Tsugiori requires Deno >= ${MINIMUM_DENO_VERSION}." >&2; exit 1
  fi
  record deno.download success
fi
export TSUGIORI_DENO="$deno_binary"
record artifact.prepare started
if "$deno_binary" run --frozen=true -A ${
    quote(entrypoint)
  } github-actions task prepare ${args} $rebuild; then
  record artifact.prepare success
else
  record artifact.prepare failed
  exit 1
fi`;
}
