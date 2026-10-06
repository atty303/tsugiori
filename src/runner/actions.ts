import { join } from "node:path";
import {
  applyEdits,
  modify,
  type Node,
  type ParseError,
  parseTree,
} from "./deps.ts";
import { TaskRuntimeError } from "../task-runtime/artifact.ts";
import type { DiagnosticRecorder } from "../task-runtime/diagnostics.ts";

const service = "https://tsugiori.atty303.workers.dev/github/actions/v1/";

function invalid(message: string): never {
  throw new TaskRuntimeError("actions_config_invalid", message);
}

function mapping(uses: string): readonly [string, string] {
  const at = uses.indexOf("@");
  const components = uses.slice(0, at).split("/");
  const ref = uses.slice(at + 1);
  if (
    at < 0 || uses.length > 2048 || components.length < 2 ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(components[0]) ||
    !/^[A-Za-z0-9_.-]+$/.test(components[1]) ||
    components.some((part) => !part || part === "." || part === "..") ||
    [...uses].some((char) =>
      char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 ||
      "\\?#".includes(char)
    ) || !ref || ref.includes("@") ||
    ref.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new TaskRuntimeError(
      "usage_invalid",
      "Expected Action uses in owner/repo[/path]@ref form.",
    );
  }
  try {
    return [
      `#actions/${components.join("/")}`,
      `${service}${components.map(encodeURIComponent).join("/")}@${
        encodeURIComponent(ref)
      }`,
    ];
  } catch (cause) {
    throw new TaskRuntimeError(
      "usage_invalid",
      "Action uses contains invalid Unicode.",
      { cause },
    );
  }
}

function properties(node: Node): Map<string, Node> {
  if (node.type !== "object") {
    invalid("Deno configuration and imports must be objects.");
  }
  const result = new Map<string, Node>();
  for (const property of node.children ?? []) {
    const [key, value] = property.children!;
    if (result.has(key.value)) {
      invalid("Duplicate configuration keys are ambiguous.");
    }
    result.set(key.value, value);
  }
  return result;
}

/** Edits only the task project's inline imports; Deno owns fetching and locking. */
export async function addAction(
  uses: string,
  directory: string,
  recorder: DiagnosticRecorder,
): Promise<boolean> {
  const [alias, url] = mapping(uses);
  let phase = "read";
  try {
    const candidates: string[] = [];
    for (const name of ["deno.json", "deno.jsonc"]) {
      const path = join(directory, name);
      try {
        const stat = await Deno.lstat(path);
        if (!stat.isFile) invalid("Deno configuration must be a regular file.");
        candidates.push(path);
      } catch (cause) {
        if (!(cause instanceof Deno.errors.NotFound)) throw cause;
      }
    }
    if (candidates.length !== 1) {
      invalid(
        "Expected exactly one deno.json or deno.jsonc in the task project directory.",
      );
    }
    const path = candidates[0];
    const text = await Deno.readTextFile(path);
    recorder.operation({ name: "actions.config.read", status: "success" });
    const errors: ParseError[] = [];
    const tree = parseTree(text, errors, { allowTrailingComma: true });
    if (!tree || errors.length) {
      invalid("Deno configuration contains invalid JSONC.");
    }
    const root = properties(tree);
    if (root.has("importMap")) {
      invalid("External importMap is not supported by actions add.");
    }
    const imports = root.get("imports");
    const existing = imports ? properties(imports).get(alias) : undefined;
    if (existing) {
      if (existing.type === "string" && existing.value === url) return false;
      throw new TaskRuntimeError(
        "actions_alias_conflict",
        `Import alias ${
          JSON.stringify(alias)
        } already has a different mapping.`,
      );
    }
    const indentation = /\n([\t ]+)\S/.exec(text)?.[1] ?? "  ";
    const updated = applyEdits(
      text,
      modify(text, ["imports", alias], url, {
        formattingOptions: {
          insertSpaces: !indentation.includes("\t"),
          tabSize: indentation.length,
          eol: text.includes("\r\n") ? "\r\n" : "\n",
        },
      }),
    );
    recorder.operation({ name: "actions.config.edit", status: "success" });
    // Publish a complete file rather than truncating the user's configuration.
    phase = "write";
    const temporary = await Deno.makeTempFile({
      dir: directory,
      prefix: ".tsugiori-actions-",
    });
    try {
      await Deno.writeTextFile(temporary, updated);
      const mode = (await Deno.stat(path)).mode;
      if (mode !== null && Deno.build.os !== "windows") {
        await Deno.chmod(temporary, mode);
      }
      if (await Deno.readTextFile(path) !== text) {
        invalid(
          "Deno configuration changed during actions add; retry after the other edit finishes.",
        );
      }
      await Deno.rename(temporary, path);
      recorder.operation({ name: "actions.config.write", status: "success" });
    } finally {
      await removeTemporary(temporary);
    }
    return true;
  } catch (cause) {
    if (cause instanceof TaskRuntimeError) throw cause;
    throw new TaskRuntimeError(
      `actions_config_${phase}_failed`,
      `Failed to ${phase} the Deno configuration for actions add.`,
      { cause },
    );
  }
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch (cause) {
    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
  }
}
