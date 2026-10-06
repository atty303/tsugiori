/**
 * Metadata contract accepted by uses(contract, options?). Tsugiori uses this
 * declaration to infer string inputs and outputs; it does not inspect or execute
 * the selected Action while generating. Keep literal metadata with as const
 * satisfies ActionContract. An override may select a fork/local implementation;
 * matching that implementation to this contract remains the caller's responsibility.
 *
 * See {@link UsesStepOptions} for with callbacks and overrides.
 *
 * The official type service is
 * [tsugiori.atty303.workers.dev](https://tsugiori.atty303.workers.dev). Map an
 * Action reference with the same `owner/repo[/path]@ref` used by GitHub Actions.
 * Run these steps from your workflow's Deno project directory:
 *
 * 1. Add the mapping before adding its import to `workflows.ts`:
 *
 *    ```sh
 *    deno task tsugiori actions add actions/checkout@v4
 *    ```
 *
 * 2. Fetch and lock the mapped dependency with Deno:
 *
 *    ```sh
 *    deno install
 *    ```
 *
 * 3. Write `import checkout from "#actions/actions/checkout";` in `workflows.ts`
 *    and pass the contract to `job.uses()` with a with object or callback.
 * 4. Generate the workflows:
 *
 *    ```sh
 *    deno task tsugiori generate
 *    ```
 *
 * 5. Check committed workflow freshness:
 *
 *    ```sh
 *    deno task tsugiori generate --check
 *    ```
 *
 * The task loads `workflows.ts` and its existing imports before processing the
 * command, so its dependencies must already be installed. `actions add` edits only
 * inline `imports` in the task project directory's `deno.json` or `deno.jsonc`. It
 * preserves comments and unrelated settings, and never fetches metadata, updates
 * the lockfile, or writes source imports. An identical mapping succeeds without a
 * write; a conflicting alias fails without changing the file. Missing or ambiguous
 * configuration, external `importMap`, malformed JSONC, and duplicate root/import
 * keys fail explicitly. Other manually chosen aliases remain supported.
 *
 * The example command adds this entry to your existing configuration:
 *
 * ```json
 * {
 *   "imports": {
 *     "#actions/actions/checkout": "https://tsugiori.atty303.workers.dev/github/actions/v1/actions/checkout@v4"
 *   }
 * }
 * ```
 *
 * Pass imported contracts directly to `job.uses(contract, options?)`.
 *
 * Contracts infer input names, requiredness, and output names. All action inputs
 * accept strings and `Expression<string>` values, including when no contract is
 * provided. Convert boolean or number expressions explicitly with `toJSON()` or
 * `format()`; static values use strings such as `"false"` or `"0"`. Reusable
 * workflow and dispatch inputs retain their declared primitive types.
 *
 * Only `required: true` inputs without a default must be supplied. These require
 * the second argument, `with`, and the named input. Otherwise both options and
 * `with` may be omitted. `with` accepts an object or a callback receiving the step
 * input expression scope. Tsugiori leaves defaults to the action and emits no
 * `with` when it is omitted. Descriptions, default information, and deprecation
 * messages are available in editor documentation. Outputs remain strings even when
 * an action serializes JSON; a step `id` exposes declared outputs to later steps.
 * A string reference checks input values but has no input-name contract or
 * declared output names, and cannot specify `uses` again in options.
 *
 * Handwritten contracts use the metadata shape in the example below.
 *
 * Contracts are caller declarations; Tsugiori does not inspect the selected action
 * during workflow generation. Type checks enforce string expressions. Runtime
 * validation also rejects invalid primitive values and provably non-string
 * expression nodes. Raw expressions and `.as<T>()` remain caller assertions
 * without runtime value-type validation.
 *
 * Service contracts supply a SHA-pinned default `uses`, including when the
 * import URL selects a tag such as `@v4`. An
 * explicit `uses` replaces the entire reference, including local actions or forks.
 * Tsugiori does not verify that the selected implementation matches the contract.
 * An override that changes the execution target omits the original-ref
 * comment; the imported contract lock does not pin that override.
 *
 * The recommended import alias is `#actions/<owner>/<repo>[/path]`; this is a
 * convention, not a requirement. Other aliases and direct URL imports also work.
 *
 * The service accepts public GitHub.com repositories, including subdirectory
 * actions. The URL is `/github/actions/v1/<owner>/<repo>[/path]@<ref>` without a
 * `.ts` suffix. Encode each location segment individually and the whole ref with
 * `encodeURIComponent`; `acme/tools/publish@release%2Fv3` selects `release/v3`.
 * Local actions, private repositories, GHES and Docker references cannot be
 * sources.
 *
 * Full 40-digit commit SHAs return a module directly, without ref resolution or
 * redirect. Tags, branches and abbreviated SHAs redirect to the resolved SHA:
 * `/github/actions/v1/actions/checkout@<SHA>?ref=v4`. The query retains the
 * original ref only as annotation. Metadata and the contract's `uses` refer to the
 * SHA; `originalRef` becomes a comment such as
 * `uses: actions/checkout@<SHA> # v4`. Direct SHA imports without this query have
 * no original-ref comment.
 *
 * `v1` fixes the generator output and parser dependency. Future changes to those
 * bytes require another version. The module contains metadata except `runs`, a
 * SHA-pinned `uses` and optional `originalRef`, without a Tsugiori import. Scalar
 * defaults retain their data types without changing the string input type. Ref
 * redirects are cached for five minutes and SHA modules for up to one year. GitHub
 * availability and rate limits still apply; cache is not durable storage. A cold
 * miss regenerates from GitHub, so deleted upstream data can make imports
 * unavailable. Errors never return widened contracts or expired ref resolutions.
 * The unversioned and `/_resolved/g1/` routes are not supported by this contract.
 *
 * Commit your Deno lockfile. Deno 2.9.5 records both the redirect and the resolved
 * module checksum; a cold fetch with `--frozen=true` uses that fixed URL. To
 * refresh a mutable ref deliberately, remove **that entry URL's mapping** from
 * `redirects` in the lockfile, then rerun your entrypoint with `--reload` and
 * `--frozen=false`, and review the resulting lockfile change. `--reload` alone
 * retains the locked redirect. An import ref change creates a new entry URL.
 *
 * @example
 * ```ts
 * const checkout = {
 *   uses: "actions/checkout@v4", name: "Checkout", description: "Checkout the repository",
 *   inputs: { ref: { description: "Ref to checkout" } },
 *   outputs: { commit: { description: "Checked out commit SHA" } },
 * } as const satisfies ActionContract;
 * ```
 */
export type ActionContract = Readonly<{
  /** GitHub Action implementation reference. A contract supplies the default; a uses override selects a different implementation without proving that it matches the declared metadata.
   */
  uses: string;
  /** Annotation for the pinned action reference; never used to resolve or execute it. */
  originalRef?: string;
  /** Human-readable display name; references use IDs or output keys rather than this text.
   */
  name: string;
  /** Public description of the input, output or Action for its consumers.
   */
  description: string;
  /** Optional Action author attribution.
   */
  author?: string;
  /** Optional Marketplace icon and color metadata; it does not affect execution.
   */
  branding?: Readonly<{
    /** Marketplace icon name.
     */
    icon?: string;
    /** Marketplace icon color.
     */
    color?: string;
  }>;
  /** Named input values or contracts for this representation. See the owning type for authoring references versus native fixture values.
   */
  inputs?: Readonly<Record<string, ActionContractInput>>;
  /** Named outputs or output contracts for this representation. See the owning type and its output mapping method; declaration alone does not write a value.
   */
  outputs?: Readonly<Record<string, ActionContractOutput>>;
}>;

/** Metadata for one string Action input. Only required: true without a default requires with to supply the name. Defaults describe the Action implementation and are not emitted by Tsugiori. See {@link ActionContract}.
 */
export type ActionContractInput = Readonly<{
  /** Public description of the input, output or Action for its consumers.
   */
  description: string;
  /** Requires a value/write when the corresponding operation executes. Input defaults satisfy required Action inputs; skipped task steps do not write outputs.
   */
  required?: boolean;
  /** Value used by the Action when the caller omits this input. Composite input defaults must be strings.
   */
  default?: string | number | boolean | null;
  /** Message describing why this input is deprecated and what callers should use instead.
   */
  deprecationMessage?: string;
}>;

/** Metadata for one public string Action output. Give the uses step an id to reference it from later steps. A contract declares a name, not a guarantee that the selected implementation writes it. See {@link ActionContract}.
 */
export type ActionContractOutput = Readonly<{
  /** Public description of the input, output or Action for its consumers.
   */
  description: string;
  /** Metadata output expression, if present. Imported contracts expose string output names; they do not execute or evaluate this expression.
   */
  value?: string;
}>;
