import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { removeIfPresent } from "../src/task-runtime/cache.ts";
import { actionPayload } from "../src/compiler/action_payload.ts";
import { writeGeneratedFiles } from "../src/compiler/write.ts";
import { computeSourceIdentity } from "../src/task-runtime/source.ts";

Deno.test("payload relocates outside-project imports and JSONC maps and custom locks", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-payload-" });
  try {
    const source = resolve(root, "author");
    const project = resolve(source, "project");
    const target = resolve(root, "target");
    await Deno.mkdir(project, { recursive: true });
    await Deno.writeTextFile(
      resolve(source, "helper.ts"),
      'export const value = "portable";\n',
    );
    await Deno.writeTextFile(
      resolve(project, "deno.jsonc"),
      '{\n// preserved comment\n"importMap":"./maps/imports.json", "lock":"./locks/frozen.lock"\n}\n',
    );
    await Deno.mkdir(resolve(project, "maps"));
    await Deno.mkdir(resolve(project, "locks"));
    await Deno.writeTextFile(
      resolve(project, "maps/imports.json"),
      JSON.stringify({
        imports: { helper: pathToFileURL(resolve(source, "helper.ts")).href },
      }),
    );
    await Deno.writeTextFile(
      resolve(project, "locks/frozen.lock"),
      '{"version":"5","specifiers":{}}\n',
    );
    await Deno.writeTextFile(
      resolve(project, "main.ts"),
      'import { value } from "helper"; console.log(value);\n',
    );
    const payload = await actionPayload(project, "./main.ts", 3);
    await writeGeneratedFiles(target, payload.files);
    assert(
      payload.files.some((file) => file.path.endsWith("maps/imports.json")),
    );
    assert(
      payload.files.some((file) => file.path.endsWith("locks/frozen.lock")),
    );
    for (const file of payload.files) {
      assert(
        !new TextDecoder().decode(file.content as Uint8Array).includes(source),
      );
    }
    await Deno.remove(source, { recursive: true });
    const cwd = await Deno.realPath(resolve(target, payload.projectPath));
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--frozen=true", payload.entrypoint],
      cwd,
    }).output();
    assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
    assertStringIncludes(new TextDecoder().decode(result.stdout), "portable");
    const identity = await computeSourceIdentity({
      projectDirectory: cwd,
      entrypointPath: resolve(cwd, payload.entrypoint),
      cacheVersion: 3,
    });
    assertEquals(identity.sourceKey, payload.sourceKey);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

for (const kind of ["prefix", "symlink"] as const) {
  Deno.test(`payload preserves ${kind} module resolution after author deletion`, async () => {
    const root = await Deno.makeTempDir({ prefix: "tsugiori-alias-" });
    try {
      const author = resolve(root, "author");
      const project = resolve(author, "project");
      const target = resolve(root, "target");
      await Deno.mkdir(project, { recursive: true });
      if (kind === "prefix") {
        const library = resolve(author, "lib");
        await Deno.mkdir(library);
        await Deno.writeTextFile(
          resolve(library, "value.ts"),
          'export const value = "prefix";\n',
        );
        await Deno.writeTextFile(
          resolve(project, "deno.json"),
          JSON.stringify({
            imports: { "helper/": pathToFileURL(library + "/").href },
            lock: false,
          }),
        );
        await Deno.writeTextFile(
          resolve(project, "main.ts"),
          'import { value } from "helper/value.ts"; console.log(value);\n',
        );
      } else {
        await Deno.writeTextFile(
          resolve(author, "real.ts"),
          'export const value = "symlink";\n',
        );
        await Deno.symlink("../real.ts", resolve(project, "link.ts"));
        await Deno.writeTextFile(
          resolve(project, "deno.json"),
          '{"lock":false}\n',
        );
        await Deno.writeTextFile(
          resolve(project, "main.ts"),
          'import { value } from "./link.ts"; console.log(value);\n',
        );
      }
      const payload = await actionPayload(project, "./main.ts", 3);
      await writeGeneratedFiles(target, payload.files);
      await Deno.remove(author, { recursive: true });
      const cwd = await Deno.realPath(resolve(target, payload.projectPath));
      const output = await new Deno.Command(Deno.execPath(), {
        args: ["run", "--frozen=true", payload.entrypoint],
        cwd,
      }).output();
      assertEquals(output.code, 0, new TextDecoder().decode(output.stderr));
      assertStringIncludes(new TextDecoder().decode(output.stdout), kind);
      const identity = await computeSourceIdentity({
        projectDirectory: cwd,
        entrypointPath: resolve(cwd, payload.entrypoint),
        cacheVersion: 3,
      });
      assertEquals(identity.sourceKey, payload.sourceKey);
      if (kind === "symlink") {
        assert(payload.files.some((file) => file.path.endsWith("link.ts")));
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  });
}

Deno.test("payload terminates across separate filesystem ancestor aliases", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-ancestor-" });
  const external = await Deno.makeTempDir({
    dir: "/tmp",
    prefix: "tsugiori-external-",
  });
  try {
    const author = resolve(root, "author");
    const target = resolve(root, "target");
    await Deno.mkdir(author);
    const helper = resolve(external, "helper.ts");
    await Deno.writeTextFile(helper, 'export const value = "external";\n');
    await Deno.writeTextFile(resolve(author, "deno.json"), '{"lock":false}\n');
    await Deno.writeTextFile(
      resolve(author, "main.ts"),
      `import { value } from ${
        JSON.stringify(pathToFileURL(helper).href)
      }; console.log(value);\n`,
    );
    const payload = await actionPayload(author, "./main.ts", 3);
    await writeGeneratedFiles(target, payload.files);
    await Deno.remove(author, { recursive: true });
    await Deno.remove(external, { recursive: true });
    const cwd = await Deno.realPath(resolve(target, payload.projectPath));
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--frozen=true", payload.entrypoint],
      cwd,
    }).output();
    assertEquals(output.code, 0, new TextDecoder().decode(output.stderr));
    assertStringIncludes(new TextDecoder().decode(output.stdout), "external");
    const identity = await computeSourceIdentity({
      projectDirectory: cwd,
      entrypointPath: resolve(cwd, payload.entrypoint),
      cacheVersion: 3,
    });
    assertEquals(identity.sourceKey, payload.sourceKey);
  } finally {
    await Deno.remove(root, { recursive: true });
    await removeIfPresent(external);
  }
});
