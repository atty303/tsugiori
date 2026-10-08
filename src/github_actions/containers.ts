import {
  emitExpression,
  Expression,
  type ExpressionInput,
  type Scope,
  scope,
} from "./expression.ts";
import type { GitHubExpressionScopeKey } from "./expression_scope.ts";

type Value<
  T,
  S extends GitHubExpressionScopeKey,
  N extends Record<string, readonly string[]>,
  M extends object,
  V extends string,
  K extends string,
  I extends object,
> =
  | T
  | ExpressionInput<T>
  | ((
    context: Scope<S, N, Record<never, never>, M, V, K, I>,
  ) => T | ExpressionInput<T>);
type MapValue<
  T,
  S extends GitHubExpressionScopeKey,
  N extends Record<string, readonly string[]>,
  M extends object,
  V extends string,
  K extends string,
  I extends object,
> = T | ((context: Scope<S, N, Record<never, never>, M, V, K, I>) => T);

/** Native container settings after authoring callbacks have been rendered.
 * Expressions remain GitHub strings; scenario results contain resolved values.
 * Docker startup, image compatibility and effective registry access belong to the runner.
 * @see https://github.com/github/docs/blob/0b8c768bf0d5a13560ec82fd3daa414137e2e436/content/actions/reference/workflows-and-actions/workflow-syntax.md#jobsjob_idcontainer
 */
export type ContainerSettings = Readonly<{
  /** Registry image name. An empty service image disables that service. */
  image: string;
  /** Registry login values; never included in scenario observation events. */
  credentials?: Readonly<{
    /** Registry username. */ username: string;
    /** Registry password supplied by a secret expression or explicit fixture. */ password:
      string;
  }>;
  /** Container environment, separate from workflow/job/step env. */
  env?: Readonly<Record<string, string>>;
  /** Exposed ports or host:container mappings; Docker owns dynamic assignment. */
  ports?: readonly (string | number)[];
  /** Named volumes, anonymous volumes or host bind mounts. */
  volumes?: readonly string[];
  /** Additional Docker create options. --network is unsupported; job containers also forbid --entrypoint. */
  options?: string;
}>;
/** Native service settings. See {@link ContainerSettings} for shared fields. */
export type ServiceSettings =
  & ContainerSettings
  & Readonly<{
    /** Replacement CMD arguments passed after the image name. */ command?:
      string;
    /** Replacement ENTRYPOINT executable. */ entrypoint?: string;
  }>;

/** Job container declaration. Callbacks run once during authoring; expressions
 * resolve on GitHub. Configure matrix before matrix-dependent fields. Credentials
 * have a separate secrets-enabled scope; env has the container-env scope.
 * Job containers require an Ubuntu hosted runner or a self-hosted Linux runner
 * with Docker. The default run shell inside a container is sh.
 * @example In a job callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").container({
 *   image: ({ vars }) => vars.IMAGE,
 *   credentials: ({ github, secrets }) => ({ username: github.actor, password: secrets.TOKEN }),
 *   env: ({ github }) => ({ SHA: github.sha }),
 *   ports: [8080], volumes: ["cache:/cache"], options: "--cpus 1",
 * }).run({ name: "Test", run: "test -d /cache" });
 * ```
 */
export interface ContainerDefinition<
  N extends Record<string, readonly string[]> = Record<never, never>,
  M extends object = Record<never, never>,
  V extends string = string,
  K extends string = string,
  I extends object = Readonly<Record<string, string>>,
> {
  /** Image literal or image-scoped expression callback.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").container({ image: ({ vars }) => vars.IMAGE });
   * ```
   */
  readonly image: Value<string, "jobs.<job_id>.container.image", N, M, V, K, I>;
  /** Static registry login or one credentials-scoped callback, including secrets.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").container({ image: "ghcr.io/org/build", credentials: ({ github, secrets }) => ({ username: github.actor, password: secrets.TOKEN }) });
   * ```
   */
  readonly credentials?: MapValue<
    Readonly<
      {
        /** Registry username literal or expression. */ username:
          | string
          | ExpressionInput;
        /** Registry password literal or secret expression.
         * @example In a job callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").container({ image: "ghcr.io/org/build", credentials: ({ secrets }) => ({ username: "fixture", password: secrets.TOKEN }) });
         * ```
         */
        password: string | ExpressionInput;
      }
    >,
    "jobs.<job_id>.container.credentials",
    N,
    M,
    V,
    K,
    I
  >;
  /** Static environment map or one container-env callback. Values cannot refer to siblings in the same map. Secrets are available in this frozen env scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").container({ image: "node:22", env: ({ github }) => ({ SHA: github.sha }) });
   * ```
   */
  readonly env?: MapValue<
    Readonly<Record<string, string | ExpressionInput>>,
    "jobs.<job_id>.container.env.<env_id>",
    N,
    M,
    V,
    K,
    I
  >;
  /** Exposed ports or mappings; a callback uses the container scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").container({ image: "node:22", ports: [8080, "9000:9000"] });
   * ```
   */
  readonly ports?: MapValue<
    readonly (string | number | ExpressionInput)[],
    "jobs.<job_id>.container",
    N,
    M,
    V,
    K,
    I
  >;
  /** Volume mounts, using Docker source:destination syntax; no filesystem checks.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").container({ image: "node:22", volumes: ["cache:/cache"] });
   * ```
   */
  readonly volumes?: MapValue<
    readonly (string | ExpressionInput)[],
    "jobs.<job_id>.container",
    N,
    M,
    V,
    K,
    I
  >;
  /** Docker create options or container-scoped callback. --network and --entrypoint are unsupported.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").container({ image: "node:22", options: "--cpus 1" });
   * ```
   */
  readonly options?: Value<string, "jobs.<job_id>.container", N, M, V, K, I>;
}

/** Service declaration, with service-specific expression scopes. An image
 * resolving to an empty string disables startup and contributes no runtime context.
 * When the job runs in a container, services are reachable by their service names;
 * host jobs use localhost and published ports. Runtime ports/IDs require scenario
 * fixtures, not guesses from the declaration.
 * @example In a job callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").services({ postgres: {
 *   image: "postgres:17", env: { POSTGRES_PASSWORD: "test" },
 *   ports: [5432], command: "-c max_connections=100", entrypoint: "docker-entrypoint.sh",
 * } }).run({ name: "Test", run: "true" });
 * ```
 */
export interface ServiceDefinition<
  N extends Record<string, readonly string[]> = Record<never, never>,
  M extends object = Record<never, never>,
  V extends string = string,
  K extends string = string,
  I extends object = Readonly<Record<string, string>>,
> {
  /** Service image or services-scoped callback; empty string disables it.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: ({ vars }) => vars.DB_IMAGE } });
   * ```
   */
  readonly image: Value<string, "jobs.<job_id>.services", N, M, V, K, I>;
  /** Registry login in the service credentials scope, including secrets.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "ghcr.io/org/db", credentials: ({ github, secrets }) => ({ username: github.actor, password: secrets.TOKEN }) } });
   * ```
   */
  readonly credentials?: MapValue<
    Readonly<
      {
        /** Registry username. */ username:
          | string
          | ExpressionInput;
        /** Registry password literal or secret expression.
         * @example In a job callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").services({ db: { image: "ghcr.io/org/db", credentials: ({ secrets }) => ({ username: "fixture", password: secrets.TOKEN }) } });
         * ```
         */
        password: string | ExpressionInput;
      }
    >,
    "jobs.<job_id>.services.<service_id>.credentials",
    N,
    M,
    V,
    K,
    I
  >;
  /** Service-only env map or callback in the service-env scope, including secrets.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", env: ({ vars }) => ({ POSTGRES_DB: vars.DB_NAME }) } });
   * ```
   */
  readonly env?: MapValue<
    Readonly<Record<string, string | ExpressionInput>>,
    "jobs.<job_id>.services.<service_id>.env.<env_id>",
    N,
    M,
    V,
    K,
    I
  >;
  /** Exposed ports or host:container mappings. A callback uses the services scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", ports: [5432] } });
   * ```
   */
  readonly ports?: MapValue<
    readonly (string | number | ExpressionInput)[],
    "jobs.<job_id>.services",
    N,
    M,
    V,
    K,
    I
  >;
  /** Named/anonymous volumes or host bind mounts; callback uses services scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", volumes: ["data:/var/lib/postgresql/data"] } });
   * ```
   */
  readonly volumes?: MapValue<
    readonly (string | ExpressionInput)[],
    "jobs.<job_id>.services",
    N,
    M,
    V,
    K,
    I
  >;
  /** Docker create options; --network is unsupported. Callback uses services scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", options: "--health-cmd pg_isready" } });
   * ```
   */
  readonly options?: Value<string, "jobs.<job_id>.services", N, M, V, K, I>;
  /** Replacement image CMD arguments; callback uses services scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", command: "-c max_connections=100" } });
   * ```
   */
  readonly command?: Value<string, "jobs.<job_id>.services", N, M, V, K, I>;
  /** Replacement ENTRYPOINT executable; command supplies its arguments. Callback uses services scope.
   * @example In a job callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", entrypoint: "docker-entrypoint.sh" } });
   * ```
   */
  readonly entrypoint?: Value<string, "jobs.<job_id>.services", N, M, V, K, I>;
}

function resolve(value: unknown, key: GitHubExpressionScopeKey): unknown {
  return typeof value === "function" ? value(scope(key)) : value;
}
function scalar(value: unknown): unknown {
  return value instanceof Expression ? emitExpression(value) : value;
}
export function renderContainer(
  value: unknown,
  service = false,
): string | ServiceSettings {
  const root = service ? "jobs.<job_id>.services" : "jobs.<job_id>.container";
  const raw = resolve(value, root);
  if (typeof raw === "string" || raw instanceof Expression) {
    return scalar(raw) as string;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(
      "Container declaration requires an image or settings object.",
    );
  }
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(raw)) {
    if (field === undefined) continue;
    const scopeKey = key === "image" && !service
      ? `${root}.image`
      : key === "credentials"
      ? `${root}${service ? ".<service_id>" : ""}.credentials`
      : key === "env"
      ? `${root}${service ? ".<service_id>" : ""}.env.<env_id>`
      : root;
    const resolved = resolve(field, scopeKey as GitHubExpressionScopeKey);
    result[key] = key === "credentials" || key === "env"
      ? resolved && typeof resolved === "object" && !Array.isArray(resolved)
        ? Object.freeze(
          Object.fromEntries(
            Object.entries(resolved).map(([k, v]) => [k, scalar(v)]),
          ),
        )
        : resolved
      : Array.isArray(resolved)
      ? Object.freeze(resolved.map(scalar))
      : scalar(resolved);
  }
  return Object.freeze(result) as ServiceSettings;
}

export function containerProblems(
  value: unknown,
  service = false,
): readonly string[] {
  if (typeof value === "string" && !service) {
    return value.trim() ? [] : ["image"];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["settings"];
  }
  const v = value as Record<string, unknown>;
  const problems: string[] = [];
  const allowed = [
    "image",
    "credentials",
    "env",
    "ports",
    "volumes",
    "options",
    ...(service ? ["command", "entrypoint"] : []),
  ];
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) problems.push(key);
  }
  if (typeof v.image !== "string" || (!service && !v.image.trim())) {
    problems.push("image");
  }
  for (const key of ["options", "command", "entrypoint"]) {
    if (v[key] !== undefined && typeof v[key] !== "string") problems.push(key);
  }
  for (const key of ["credentials", "env"]) {
    const map = v[key];
    if (map === undefined) continue;
    if (
      !map || typeof map !== "object" || Array.isArray(map) ||
      Object.entries(map).some(([k, x]) =>
        !k.trim() || typeof x !== "string"
      ) || key === "credentials" && (Object.keys(map).some((k) =>
          !["username", "password"].includes(k)
        ) || !Object.hasOwn(map, "username") || !Object.hasOwn(map, "password"))
    ) {
      problems.push(key);
    }
  }
  if (
    v.ports !== undefined &&
    (!Array.isArray(v.ports) ||
      v.ports.some((x) =>
        !(typeof x === "string" && x.trim()) &&
        !(typeof x === "number" && Number.isInteger(x) && x > 0 && x <= 65535)
      ))
  ) problems.push("ports");
  if (
    v.volumes !== undefined &&
    (!Array.isArray(v.volumes) ||
      v.volumes.some((x) => typeof x !== "string" || !x.trim()))
  ) problems.push("volumes");
  // Expressions are GitHub assertions; don't parse Docker's option language locally.
  if (
    typeof v.options === "string" && !v.options.includes("${{") &&
    new RegExp(
      `(?:^|\\s)--(?:network${service ? "" : "|entrypoint"})(?:=|\\s|$)`,
    ).test(v.options)
  ) problems.push("options");
  return [...new Set(problems)];
}
