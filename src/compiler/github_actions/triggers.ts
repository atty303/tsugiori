import { activities, type WorkflowEvent } from "../../github_actions/events.ts";
import {
  filterPattern,
  validCron,
} from "../../github_actions/trigger_filters.ts";

type Issue = Readonly<{ path: readonly string[]; message: string }>;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 &&
  value.every((v) => typeof v === "string" && v.trim().length > 0);
export function validateTriggers(on: unknown): Issue[] {
  const issues: Issue[] = [];
  const invalid = (path: string[], message: string) =>
    issues.push({ path: ["on", ...path], message });
  if (!record(on) || !Object.keys(on).length) {
    return [{
      path: ["on"],
      message: "Declare a nonempty native event settings object.",
    }];
  }
  for (const [event, settings] of Object.entries(on)) {
    if (!Object.hasOwn(activities, event)) {
      invalid([event], "Unknown GitHub.com event.");
      continue;
    }
    if (event === "schedule") {
      if (!Array.isArray(settings) || !settings.length) {
        invalid([event], "Schedule requires a nonempty array.");
        continue;
      }
      settings.forEach((entry, i) => {
        if (
          !record(entry) || Object.keys(entry).some((k) =>
            !["cron", "timezone"].includes(k)
          ) || typeof entry.cron !== "string" || !validCron(entry.cron)
        ) invalid([event, String(i)], "Invalid POSIX five-field cron entry.");
        if (record(entry) && entry.timezone !== undefined) {
          try {
            if (
              typeof entry.timezone !== "string" || !entry.timezone.trim() ||
              /^[+-]/.test(entry.timezone)
            ) throw new Error();
            new Intl.DateTimeFormat("en", { timeZone: entry.timezone });
          } catch {
            invalid(
              [event, String(i), "timezone"],
              "Expected an IANA timezone.",
            );
          }
        }
      });
      continue;
    }
    if (!record(settings)) {
      invalid([event], "Event settings must be an object.");
      continue;
    }
    const filters = event === "push"
      ? ["branches", "tags", "paths"]
      : ["pull_request", "pull_request_target"].includes(event)
      ? ["branches", "paths"]
      : ["merge_group", "workflow_run"].includes(event)
      ? ["branches"]
      : [];
    const allowed = [...filters.flatMap((f) => [f, `${f}-ignore`])];
    if (
      activities[event as WorkflowEvent].length ||
      event === "repository_dispatch"
    ) allowed.push("types");
    if (event === "workflow_run") allowed.push("workflows");
    if (event === "image_version") allowed.push("names", "versions");
    if (event === "workflow_dispatch") allowed.push("inputs");
    if (event === "workflow_call") allowed.push("inputs", "secrets", "outputs");
    for (const key of Object.keys(settings)) {
      if (!allowed.includes(key)) {
        invalid([event, key], "Unsupported setting for this event.");
      }
    }
    for (const key of filters) {
      if (
        settings[key] !== undefined && settings[`${key}-ignore`] !== undefined
      ) invalid([event, key], "Include and ignore forms cannot be combined.");
      for (const kind of [key, `${key}-ignore`]) {
        if (settings[kind] === undefined) continue;
        const patterns = settings[kind];
        if (!strings(patterns)) {
          invalid([event, kind], "Expected nonempty filter patterns.");
          continue;
        }
        if (kind === key && !patterns.some((p) => !p.startsWith("!"))) {
          invalid([event, kind], "An include filter needs a positive pattern.");
        }
        for (const pattern of patterns) {
          try {
            filterPattern(pattern.startsWith("!") ? pattern.slice(1) : pattern);
          } catch {
            invalid([event, kind], "Invalid filter pattern.");
          }
        }
      }
    }
    if (settings.types !== undefined) {
      const known: readonly string[] = activities[event as WorkflowEvent];
      if (
        !strings(settings.types) ||
        event !== "repository_dispatch" &&
          settings.types.some((t) => !known.includes(t))
      ) {
        invalid(
          [event, "types"],
          "Expected documented activity names for this event.",
        );
      }
      if (
        event === "repository_dispatch" && Array.isArray(settings.types) &&
        settings.types.some((t) => typeof t === "string" && t.length > 100)
      ) {
        invalid(
          [event, "types"],
          "Custom event_type names are limited to 100 characters.",
        );
      }
    }
    if (event === "workflow_run" && !strings(settings.workflows)) {
      invalid(
        [event, "workflows"],
        "workflow_run requires upstream workflow names.",
      );
    }
    for (const key of ["names", "versions"]) {
      if (event === "image_version" && settings[key] !== undefined) {
        if (!strings(settings[key])) {
          invalid([event, key], "Expected image glob alternatives.");
        } else {for (const pattern of settings[key]) {
            try {
              filterPattern(pattern);
            } catch {
              invalid([event, key], "Invalid image glob.");
            }
          }}
      }
    }
    if (event === "workflow_dispatch" || event === "workflow_call") {
      if (settings.inputs !== undefined && !record(settings.inputs)) {
        invalid([event, "inputs"], "Input declarations must be a map.");
      }
      if (record(settings.inputs)) {
        if (
          event === "workflow_dispatch" &&
          Object.keys(settings.inputs).length > 25
        ) {
          invalid(
            [event, "inputs"],
            "GitHub.com permits at most 25 dispatch inputs.",
          );
        }
        for (const [name, d] of Object.entries(settings.inputs)) {
          const path = [event, "inputs", name];
          if (!name.trim() || !record(d)) {
            invalid(path, "Invalid input declaration.");
            continue;
          }
          const types = event === "workflow_dispatch"
            ? ["string", "boolean", "number", "choice", "environment"]
            : ["string", "boolean", "number"];
          if (
            Object.keys(d).some((k) =>
              ![
                "type",
                "description",
                "required",
                "default",
                ...(event === "workflow_dispatch" && d.type === "choice"
                  ? ["options"]
                  : []),
              ].includes(k)
            ) || !types.includes(String(d.type))
          ) invalid(path, "Invalid input type or setting.");
          if (
            d.description !== undefined && typeof d.description !== "string" ||
            d.required !== undefined && typeof d.required !== "boolean"
          ) invalid(path, "Invalid input description or required flag.");
          const expected = ["choice", "environment"].includes(String(d.type))
            ? "string"
            : d.type;
          if (
            d.default !== undefined &&
            ((typeof d.default !== expected &&
              !(event === "workflow_call" && typeof d.default === "string" &&
                /^\$\{\{[\s\S]+\}\}$/.test(d.default))) ||
              typeof d.default === "number" && !Number.isFinite(d.default))
          ) invalid(path, "Default must match the input type.");
          if (
            d.type === "choice" &&
            (!strings(d.options) ||
              d.default !== undefined && !d.options.includes(String(d.default)))
          ) invalid(path, "Choice default must belong to nonempty options.");
        }
      }
      if (event === "workflow_call") {
        for (const kind of ["secrets", "outputs"]) {
          if (settings[kind] === undefined) {
            continue;
          }
          if (!record(settings[kind])) {
            invalid([event, kind], "Declarations must be a map.");
            continue;
          }
          for (const [name, d] of Object.entries(settings[kind])) {
            if (
              !name.trim() || !record(d) || Object.keys(d).some((k) =>
                !(kind === "secrets"
                  ? ["description", "required"]
                  : ["description", "value"]).includes(k)
              ) ||
              d.description !== undefined &&
                typeof d.description !== "string" ||
              kind === "secrets" && d.required !== undefined &&
                typeof d.required !== "boolean" ||
              kind === "outputs" && typeof d.value !== "string"
            ) {
              invalid([event, kind, name], "Invalid reusable declaration.");
            }
          }
        }
      }
    }
  }
  return issues;
}
