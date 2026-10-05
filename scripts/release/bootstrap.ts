import { join } from "node:path";
import { digest } from "./archive.ts";
import { main, type Recording } from "./diagnostics.ts";
import { archiveName, readSource } from "./package.ts";

const version = "0.1.0";
const tag = `v${version}`;
const modeMarker =
  "<!-- repository-template-release-owner:tsugiori-bootstrap versioning:semver -->";
type Asset = {
  name: string;
  size: number;
  digest: string | null;
  state: string;
};
type Release = {
  id: number;
  body: string;
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
};

export class Github {
  constructor(readonly sha: string, readonly token: string) {}
  async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<Response> {
    const response = await fetch(
      `https://api.github.com/repos/atty303/tsugiori/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      },
    );
    if (!response.ok && response.status !== 404) {
      await response.body?.cancel();
      throw new Error(
        `GitHub ${method} failed (${response.status}); inspect tag/Release before retry`,
      );
    }
    return response;
  }
  async get<T>(path: string): Promise<T | undefined> {
    const response = await this.request(path);
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    return await response.json();
  }
  async reserve(): Promise<void> {
    const repo = await this.get<{ default_branch: string }>("");
    if (repo?.default_branch !== "main") {
      throw new Error("Bootstrap requires main as default branch");
    }
    for (let page = 1;; page++) {
      const tags = await this.get<{ name: string }[]>(
        `tags?per_page=100&page=${page}`,
      );
      if (!tags) throw new Error("Cannot inspect tags");
      if (
        tags.some((entry) =>
          /^v\d+\.\d+\.\d+$/.test(entry.name) && entry.name !== tag
        )
      ) {
        throw new Error(
          "Bootstrap is unavailable after another version tag exists",
        );
      }
      if (tags.length < 100) break;
    }
    const existing = await this.get<{ object: { type: string; sha: string } }>(
      `git/ref/tags/${tag}`,
    );
    if (existing) {
      if (
        existing.object.type !== "commit" || existing.object.sha !== this.sha
      ) {
        throw new Error(
          "Existing bootstrap tag differs; rerun the original commit",
        );
      }
      return;
    }
    const response = await this.request("git/refs", "POST", {
      ref: `refs/tags/${tag}`,
      sha: this.sha,
    });
    if (response.status === 404) throw new Error("Cannot create bootstrap tag");
    await response.body?.cancel();
  }
  async release(): Promise<Release | undefined> {
    const found: Release[] = [];
    for (let page = 1;; page++) {
      const batch = await this.get<Release[]>(
        `releases?per_page=100&page=${page}`,
      );
      if (!batch) throw new Error("Cannot inspect releases");
      found.push(...batch.filter((release) => release.tag_name === tag));
      if (batch.length < 100) break;
    }
    if (found.length > 1) {
      throw new Error(
        "Multiple bootstrap Releases exist; inspect without overwriting",
      );
    }
    return found[0];
  }
  async assets(id: number): Promise<Asset[]> {
    const assets: Asset[] = [];
    for (let page = 1;; page++) {
      const batch = await this.get<Asset[]>(
        `releases/${id}/assets?per_page=100&page=${page}`,
      );
      if (!batch) throw new Error("Cannot inspect release assets");
      assets.push(...batch);
      if (batch.length < 100) return assets;
    }
  }
  async upload(id: number, name: string, bytes: Uint8Array): Promise<void> {
    const response = await fetch(
      `https://uploads.github.com/repos/atty303/tsugiori/releases/${id}/assets?name=${
        encodeURIComponent(name)
      }`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/gzip",
          Accept: "application/vnd.github+json",
        },
        body: Uint8Array.from(bytes),
        signal: AbortSignal.timeout(60_000),
        redirect: "error",
      },
    );
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(
        `Asset upload failed (${response.status}); retry the same commit`,
      );
    }
  }
}

export function assertRelease(release: Release, body: string): void {
  if (release.tag_name !== tag || release.body !== body || release.prerelease) {
    throw new Error("Existing bootstrap Release differs; do not overwrite it");
  }
}
export function assertAsset(
  assets: readonly Asset[],
  name: string,
  size: number,
  checksum: string,
  complete: boolean,
): boolean {
  if (assets.some((asset) => asset.name !== name) || assets.length > 1) {
    throw new Error("Bootstrap release has unexpected assets");
  }
  const asset = assets[0];
  if (!asset) {
    if (complete) throw new Error("Bootstrap release asset is missing");
    return false;
  }
  if (
    asset.size !== size ||
    asset.digest !== checksum.replace("sha256-", "sha256:") ||
    asset.state !== "uploaded"
  ) throw new Error("Existing bootstrap asset differs; do not replace it");
  return true;
}

export async function finish(
  github: Github,
  directory: string,
  record: Recording,
): Promise<void> {
  await record.operation("archive_read", () => readSource(version, directory));
  const bytes = await Deno.readFile(join(directory, archiveName(version)));
  const checksum = await digest(bytes);
  const body =
    `Initial JSR release of @atty303/tsugiori at 0.1.0.\n\n<!-- tsugiori-bootstrap:${github.sha} archive:${checksum} -->\n${modeMarker}`;
  let release = await record.operation("release_create", async () => {
    const existing = await github.release();
    if (existing) {
      assertRelease(existing, body);
      return existing;
    }
    const response = await github.request("releases", "POST", {
      tag_name: tag,
      target_commitish: github.sha,
      name: tag,
      body,
      draft: true,
      prerelease: false,
    });
    if (response.status === 404) {
      throw new Error("Cannot create bootstrap Release");
    }
    return await response.json() as Release;
  });
  const name = archiveName(version);
  const existingAssets = await github.assets(release.id);
  if (
    !assertAsset(existingAssets, name, bytes.length, checksum, !release.draft)
  ) {
    await record.operation(
      "asset_upload",
      () => github.upload(release.id, name, bytes),
    );
  }
  await record.operation("release_verify", async () => {
    assertAsset(
      await github.assets(release.id),
      name,
      bytes.length,
      checksum,
      true,
    );
    if (release.draft) {
      const response = await github.request(`releases/${release.id}`, "PATCH", {
        draft: false,
      });
      if (response.status === 404) {
        throw new Error("Cannot publish bootstrap Release");
      }
      release = await response.json();
    }
    const confirmed = await github.get<Release>(`releases/${release.id}`);
    if (!confirmed) throw new Error("Bootstrap Release is not visible");
    assertRelease(confirmed, body);
    if (confirmed.draft) throw new Error("Bootstrap Release is still a draft");
    assertAsset(
      await github.assets(confirmed.id),
      name,
      bytes.length,
      checksum,
      true,
    );
  });
}

if (import.meta.main) {
  await main(async (record) => {
    const sha = Deno.env.get("GITHUB_SHA") ?? "";
    const token = Deno.env.get("GH_TOKEN") ?? "";
    if (
      Deno.env.get("GITHUB_REPOSITORY") !== "atty303/tsugiori" ||
      Deno.env.get("GITHUB_REF") !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha) || !token
    ) {
      throw new Error(
        "Bootstrap requires the repository's main branch and GitHub token",
      );
    }
    const github = new Github(sha, token);
    if (Deno.args[0] === "reserve" && Deno.args.length === 1) {
      await record.operation("tag_reserve", () => github.reserve());
    } else if (Deno.args[0] === "finish" && Deno.args.length === 2) {
      await record.operation("tag_reserve", () => github.reserve());
      await finish(github, Deno.args[1], record);
    } else {throw new Error(
        "Expected reserve or finish with an artifact directory",
      );}
  });
}
