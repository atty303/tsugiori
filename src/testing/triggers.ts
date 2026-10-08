import type {
  WorkflowEvent,
  WorkflowTriggers,
} from "../github_actions/events.ts";
import { activities } from "../github_actions/events.ts";
import {
  acceptsFilter,
  matchesPatterns,
} from "../github_actions/trigger_filters.ts";
import { type Program, ScenarioError } from "./mod.ts";

export function triggered(
  on: WorkflowTriggers,
  program: Program,
  path: string,
): boolean {
  const github = program.external.github as Record<string, unknown> | undefined;
  const missing = (field: string): never => {
    throw new ScenarioError(
      "fixture_missing",
      `${path}.on.${String(github?.event_name ?? "event")}`,
      `${field} fixture is required.`,
    );
  };
  const text = (value: unknown, field: string): string =>
    typeof value === "string" ? value : missing(field);
  if (!github) missing("github");
  const eventName = text(github!.event_name, "github.event_name");
  if (!Object.hasOwn(on, eventName)) return false;
  const event = eventName as WorkflowEvent;
  const payload = (github!.event ?? {}) as Record<string, unknown>;
  const settings = on[event] as Readonly<Record<string, unknown>>;
  const known: readonly string[] = activities[event];
  if (known.length || event === "repository_dispatch") {
    const action = text(payload.action, "github.event.action");
    const selected = settings.types as readonly string[] | undefined;
    const allowed = selected ??
      (event === "pull_request" || event === "pull_request_target"
        ? ["opened", "synchronize", "reopened"]
        : known);
    if (
      (event !== "repository_dispatch" || selected) && !allowed.includes(action)
    ) return false;
  }
  if (event === "deployment_status") {
    const status = payload.deployment_status as
      | Record<string, unknown>
      | undefined;
    if (
      text(status?.state, "github.event.deployment_status.state") === "inactive"
    ) return false;
  }
  if (event === "schedule") {
    const cron = text(payload.schedule, "github.event.schedule");
    return on.schedule!.some((entry) => entry.cron === cron);
  }
  if (event === "image_version") {
    if (!on.image_version?.names && !on.image_version?.versions) return true;
    const image = program.imageVersion;
    if (!image) missing("imageVersion");
    return (!on.image_version?.names ||
      matchesPatterns(
        text(image!.name, "imageVersion.name"),
        on.image_version.names,
      )) &&
      (!on.image_version?.versions ||
        matchesPatterns(
          text(image!.version, "imageVersion.version"),
          on.image_version.versions,
        ));
  }
  if (event === "workflow_run") {
    const run = payload.workflow_run as Record<string, unknown> | undefined;
    const workflow = payload.workflow as Record<string, unknown> | undefined;
    const name = text(
      run?.name ?? workflow?.name,
      "github.event.workflow_run.name or github.event.workflow.name",
    );
    if (!on.workflow_run!.workflows.includes(name)) return false;
    if (settings.branches || settings["branches-ignore"]) {
      if (
        !acceptsFilter(
          text(run?.head_branch, "github.event.workflow_run.head_branch"),
          settings,
          "branches",
        )
      ) return false;
    }
  }
  let tag = false;
  if (event === "push") {
    if (
      settings.branches || settings["branches-ignore"] || settings.tags ||
      settings["tags-ignore"] || settings.paths || settings["paths-ignore"]
    ) {
      const ref = text(github!.ref, "github.ref");
      if (!/^refs\/(heads|tags)\//.test(ref)) {
        throw new ScenarioError(
          "fixture_invalid",
          `${path}.on.push`,
          "Expected a branch or tag ref.",
        );
      }
      tag = ref.startsWith("refs/tags/");
      const key = tag ? "tags" : "branches";
      const other = tag ? "branches" : "tags";
      if (
        !(settings[key] || settings[`${key}-ignore`]) &&
        (settings[other] || settings[`${other}-ignore`])
      ) return false;
      if (
        !acceptsFilter(ref.replace(/^refs\/(heads|tags)\//, ""), settings, key)
      ) return false;
    }
  }
  if (
    event === "pull_request" || event === "pull_request_target" ||
    event === "merge_group"
  ) {
    if (settings.branches || settings["branches-ignore"]) {
      let branch: string;
      if (event === "merge_group") {
        const group = payload.merge_group as
          | Record<string, unknown>
          | undefined;
        branch = text(group?.base_ref, "github.event.merge_group.base_ref")
          .replace(/^refs\/heads\//, "");
      } else {
        const pr = payload.pull_request as Record<string, unknown> | undefined;
        const base = pr?.base as Record<string, unknown> | undefined;
        branch = text(
          base?.ref ?? github!.base_ref,
          "github.event.pull_request.base.ref or github.base_ref",
        );
      }
      if (!acceptsFilter(branch, settings, "branches")) return false;
    }
  }
  if (!tag && (settings.paths || settings["paths-ignore"])) {
    const files = program.changedFiles;
    if (files === undefined) missing("changedFiles");
    if (Array.isArray(files)) {
      if (!files.every((f) => typeof f === "string")) {
        throw new ScenarioError(
          "fixture_invalid",
          `${path}.on.${event}`,
          "changedFiles must contain file paths.",
        );
      }
      const considered = files.slice(0, 300);
      const include = settings.paths as readonly string[] | undefined;
      const ignore = settings["paths-ignore"] as readonly string[] | undefined;
      if (
        !considered.some((f) =>
          include ? matchesPatterns(f, include) : !matchesPatterns(f, ignore!)
        )
      ) return false;
    } else if (files !== "timeout" && files !== "over-1000-commits") {
      throw new ScenarioError(
        "fixture_invalid",
        `${path}.on.${event}`,
        "Unknown GitHub diff bypass reason.",
      );
    }
  }
  if (event === "workflow_dispatch") {
    const definitions = on.workflow_dispatch?.inputs ?? {};
    const supplied = (program.external.inputs ?? {}) as Record<string, unknown>;
    if (
      Object.keys(supplied).some((name) => !Object.hasOwn(definitions, name))
    ) {
      throw new ScenarioError(
        "fixture_invalid",
        `${path}.on.workflow_dispatch.inputs`,
        "Unknown dispatch input.",
      );
    }
    const native: Record<string, unknown> = {};
    const wire: Record<string, string> = {};
    const payloadInputs = payload.inputs as Record<string, unknown> | undefined;
    for (const [name, d] of Object.entries(definitions)) {
      let value = supplied[name];
      if (value === undefined && payloadInputs?.[name] !== undefined) {
        const raw = payloadInputs[name];
        if (typeof raw !== "string") {
          throw new ScenarioError(
            "fixture_invalid",
            `${path}.github.event.inputs.${name}`,
            "github.event.inputs values are strings.",
          );
        }
        if (d.type === "boolean") {
          if (raw !== "true" && raw !== "false") {
            throw new ScenarioError(
              "fixture_invalid",
              `${path}.github.event.inputs.${name}`,
              "Expected a string boolean.",
            );
          }
          value = raw === "true";
        } else if (d.type === "number") {
          value = Number(raw);
          if (!raw.trim()) value = NaN;
        } else value = raw;
      }
      if (value === undefined) {
        if (d.default !== undefined) value = d.default;
        else if (d.required) missing(`inputs.${name}`);
        else {value = d.type === "boolean"
            ? false
            : d.type === "number"
            ? 0
            : "";}
      }
      const expected = d.type === "boolean" || d.type === "number"
        ? d.type
        : "string";
      if (
        typeof value !== expected ||
        typeof value === "number" && !Number.isFinite(value) ||
        d.type === "choice" && value !== "" &&
          !d.options.includes(String(value))
      ) {
        throw new ScenarioError(
          "fixture_invalid",
          `${path}.inputs.${name}`,
          "Dispatch input value does not match its declaration.",
        );
      }
      if (
        payloadInputs?.[name] !== undefined &&
        payloadInputs[name] !== String(value)
      ) {
        throw new ScenarioError(
          "fixture_invalid",
          `${path}.github.event.inputs.${name}`,
          "Payload and native input fixture disagree.",
        );
      }
      native[name] = value;
      wire[name] = String(value);
    }
    if (JSON.stringify(wire).length > 65535) {
      throw new ScenarioError(
        "fixture_invalid",
        `${path}.inputs`,
        "Dispatch inputs exceed the GitHub payload limit.",
      );
    }
    program.external.inputs = native;
    program.external.github = {
      ...github,
      event: { ...payload, inputs: wire },
    };
  }
  return true;
}
