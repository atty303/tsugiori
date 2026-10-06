/**
 * Bootstrap a separate GitHub Actions workflow project in the current directory.
 *
 * Run `deno run --no-config --no-lock -A jsr:@atty303/tsugiori@<version>/init`
 * from the intended project directory, normally `.github`. This executable
 * entrypoint creates `deno.json` and `workflows.ts`; it exposes no library API.
 * Existing deno.json, deno.jsonc, deno.lock or workflows.ts entries stop creation
 * without changes. No dependencies are installed and no YAML is generated.
 * Run the printed `deno install -P` and `deno task tsugiori generate` commands
 * afterwards. The sample uses `.github` as its checkout-relative project path;
 * edit its workingDirectory if you place the project elsewhere.
 *
 * `--no-config --no-lock` keeps bootstrap separate from application settings and
 * prevents the bootstrap invocation from creating a lockfile. `-A` permits
 * file creation and the existing local diagnostic recorder. Diagnostics retain
 * up to 32 runs under the platform cache's tsugiori/diagnostics directory, with
 * failures preferred. Set TSUGIORI_DIAGNOSTICS=0 to disable recording; delete
 * that directory to clear records. No diagnostic data is exported remotely.
 *
 * Exit status is 0 on success and 1 on invalid arguments, conflicts or I/O
 * failure. Failed writes clean up only files created by this invocation;
 * cleanup failures are reported. Importing this module performs no initialization.
 * @module
 */
import { initialize } from "./init/project.ts";

if (import.meta.main) Deno.exitCode = await initialize(Deno.args);
