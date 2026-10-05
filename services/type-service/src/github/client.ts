import { ServiceError } from "../errors.ts";
import type { Recording } from "../diagnostics.ts";
import type { ActionSource } from "./reference.ts";

export type Fetcher = (request: Request) => Promise<Response>;
const MAX_BYTES = 1_048_576;

export class GitHubClient {
  constructor(readonly fetcher: Fetcher = fetch, readonly timeoutMs = 15_000) {}
  async resolve(source: ActionSource, recording: Recording): Promise<string> {
    return await recording.operation("resolve_ref", async () => {
      const response = await this.get(
        `/repos/${source.owner}/${source.repo}/commits/${
          encodeURIComponent(source.ref)
        }`,
      );
      let data: unknown;
      try {
        data = JSON.parse(response);
      } catch (cause) {
        throw new ServiceError("upstream_failure", 502, { cause });
      }
      if (
        typeof data !== "object" || data === null || !("sha" in data) ||
        typeof data.sha !== "string" || !/^[a-f0-9]{40}$/.test(data.sha)
      ) throw new ServiceError("upstream_failure", 502);
      return data.sha;
    });
  }
  async metadata(
    source: ActionSource,
    sha: string,
    recording: Recording,
  ): Promise<{ yaml: string; filename: string }> {
    return await recording.operation("fetch_metadata", async () => {
      for (const filename of ["action.yml", "action.yaml"]) {
        const path = [...source.path.split("/").filter(Boolean), filename].map(
          encodeURIComponent,
        ).join("/");
        try {
          return {
            yaml: await this.get(
              `/repos/${source.owner}/${source.repo}/contents/${path}?ref=${sha}`,
              true,
            ),
            filename,
          };
        } catch (error) {
          if (
            !(error instanceof ServiceError && error.code === "not_found" &&
              filename === "action.yml")
          ) throw error;
        }
      }
      throw new ServiceError("not_found", 404);
    });
  }
  private async get(path: string, raw = false): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(
        new Request(`https://api.github.com${path}`, {
          headers: {
            Accept: raw
              ? "application/vnd.github.raw+json"
              : "application/vnd.github+json",
            "User-Agent": "tsugiori-type-service",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: controller.signal,
          redirect: "error",
        }),
      );
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) throw new ServiceError("not_found", 404);
        if (
          response.status === 429 ||
          (response.status === 403 &&
            (response.headers.get("x-ratelimit-remaining") === "0" ||
              response.headers.has("retry-after")))
        ) throw new ServiceError("rate_limited", 503);
        throw new ServiceError("upstream_failure", 502);
      }
      if (!response.body) throw new ServiceError("upstream_failure", 502);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > MAX_BYTES) throw new ServiceError("upstream_failure", 502);
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause) {
      if (cause instanceof ServiceError) throw cause;
      throw new ServiceError(
        controller.signal.aborted ? "timeout" : "upstream_failure",
        controller.signal.aborted ? 504 : 502,
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
