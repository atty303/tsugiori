import type { Job } from "../compiler/github_actions/ast.ts";
import type { ContainerRuntime } from "./mod.ts";
import { ScenarioError } from "./mod.ts";
import { MissingContextError } from "./expression.ts";

type Scalar = (value: string, field: string) => string;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function validateContainerRuntime(
  job: Job,
  fixture: ContainerRuntime | undefined,
  location: string,
): void {
  if (fixture === undefined) return;
  const invalid = () => {
    throw new ScenarioError(
      "fixture_invalid",
      `${location}.containerRuntime`,
      "Runtime fixture must contain only declared container/service context fields with string values.",
    );
  };
  if (
    !record(fixture) ||
    Object.keys(fixture).some((k) => !["container", "services"].includes(k))
  ) return invalid();
  if (
    fixture.container !== undefined && job.container === undefined &&
    (Object.keys(job.services ?? {}).length === 0 ||
      fixture.container.id !== undefined)
  ) {
    return invalid();
  }
  const entry = (v: unknown, service: boolean) => {
    if (
      !record(v) ||
      Object.entries(v).some(([k, x]) =>
        !["id", "network", ...(service ? ["ports"] : [])].includes(k) ||
        k !== "ports" && typeof x !== "string"
      )
    ) return invalid();
    if (
      v.ports !== undefined &&
      (!record(v.ports) ||
        Object.values(v.ports).some((x) => typeof x !== "string"))
    ) invalid();
  };
  if (fixture.container !== undefined) entry(fixture.container, false);
  if (fixture.services !== undefined) {
    if (!record(fixture.services)) return invalid();
    for (const [id, v] of Object.entries(fixture.services)) {
      if (!Object.hasOwn(job.services ?? {}, id)) return invalid();
      entry(v, true);
    }
  }
}

function runtimeObject(
  value: Record<string, unknown> | undefined,
  required: readonly string[],
  path: string,
  absent: readonly string[] = [],
): Record<string, unknown> {
  const target = { ...value };
  const property = (t: Record<string, unknown>, key: string) =>
    Object.keys(t).find((name) => name.toLowerCase() === key.toLowerCase()) ??
      key.toLowerCase();
  return new Proxy(target, {
    has(t, key) {
      if (typeof key === "string") key = property(t, key);
      if (typeof key === "string" && absent.includes(key)) return false;
      if (typeof key === "string" && !Object.hasOwn(t, key)) {
        throw new MissingContextError(`${path}.${key}`);
      }
      return Reflect.has(t, key);
    },
    getOwnPropertyDescriptor(t, key) {
      if (typeof key !== "string") {
        return Reflect.getOwnPropertyDescriptor(t, key);
      }
      const actual = property(t, key);
      if (absent.includes(actual)) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(t, actual);
      if (descriptor) return descriptor;
      // Direct access must check only the requested fixture field. Whole-object
      // enumeration still verifies all required fields in ownKeys.
      return required.includes(actual) || path.endsWith(".ports")
        ? { configurable: true, enumerable: false }
        : undefined;
    },
    get(t, key) {
      if (typeof key === "string") key = property(t, key);
      if (key === "tojson" || typeof key === "symbol" || absent.includes(key)) {
        return undefined;
      }
      if (!Object.hasOwn(t, key)) {
        throw new MissingContextError(`${path}.${key}`);
      }
      return Reflect.get(t, key);
    },
    ownKeys(t) {
      for (const key of required) {
        if (!Object.hasOwn(t, key)) {
          throw new MissingContextError(`${path}.${key}`);
        }
      }
      return Reflect.ownKeys(t);
    },
  });
}

export function containerContext(
  job: Job,
  fixture: ContainerRuntime | undefined,
  scalar: Scalar,
): Record<string, unknown> {
  const serviceValues = new Map<string, unknown>();
  const service = (id: string): unknown => {
    id =
      Object.keys(job.services ?? {}).find((name) =>
        name.toLowerCase() === id.toLowerCase()
      ) ?? id;
    if (serviceValues.has(id)) return serviceValues.get(id);
    const definition = job.services?.[id];
    if (!definition) return null;
    const image = scalar(definition.image, `services.${id}.image`);
    if (image === "") {
      if (fixture?.services?.[id] !== undefined) {
        throw new ScenarioError(
          "fixture_invalid",
          `services.${id}`,
          "Disabled service cannot have a runtime fixture.",
        );
      }
      serviceValues.set(id, null);
      return null;
    }
    const provided = fixture?.services?.[id];
    const value = runtimeObject(
      provided === undefined ? undefined : {
        ...provided,
        ...(provided.ports === undefined ? {} : {
          ports: runtimeObject(
            provided.ports,
            [],
            `job.services.${id}.ports`,
          ),
        }),
      },
      ["id", "network", "ports"],
      `job.services.${id}`,
    );
    serviceValues.set(id, value);
    return value;
  };
  let container: unknown;
  let containerRead = false;
  return {
    get container() {
      if (!containerRead) {
        containerRead = true;
        const image = job.container === undefined ? "" : scalar(
          typeof job.container === "string"
            ? job.container
            : job.container.image,
          "container.image",
        );
        const networkOnly = image === "" &&
          Object.keys(job.services ?? {}).some((id) =>
            scalar(job.services![id].image, `services.${id}.image`) !== ""
          );
        container = image === "" && !networkOnly ? null : runtimeObject(
          fixture?.container,
          networkOnly ? ["network"] : ["id", "network"],
          "job.container",
          networkOnly ? ["id"] : [],
        );
        if (image === "" && !networkOnly && fixture?.container) {
          throw new ScenarioError(
            "fixture_invalid",
            "container",
            "Absent job container cannot have a runtime fixture.",
          );
        }
      }
      return container;
    },
    services: new Proxy({}, {
      has(_t, key) {
        return typeof key === "string" && service(key) !== null;
      },
      get(_t, key) {
        return typeof key === "symbol" || key === "toJSON"
          ? undefined
          : service(key);
      },
      ownKeys() {
        return Object.keys(job.services ?? {}).filter((id) =>
          service(id) !== null
        );
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
      },
    }),
  };
}
