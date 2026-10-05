import { Diagnostics, type Recording } from "./diagnostics.ts";
import { ServiceError } from "./errors.ts";
import { GitHubClient } from "./github/client.ts";
import { encodeUses, metadataUrl, parseUses } from "./github/reference.ts";
import { generateG1 } from "./github/actions/g1.ts";

export type ServiceCache = Pick<Cache, "match" | "put">;
const REF_TTL = 300;
const IMMUTABLE_TTL = 31_536_000;
const PREFIX = "/github/actions/";

export function createService(
  options: {
    github?: GitHubClient;
    cache?: ServiceCache;
    diagnostics?: Diagnostics;
  } = {},
) {
  const github = options.github ?? new GitHubClient();
  const diagnostics = options.diagnostics ?? new Diagnostics();
  async function cached(
    request: Request,
    recording: Recording,
  ): Promise<Response | undefined> {
    try {
      return await recording.operation(
        "cache_read",
        () => options.cache?.match(request),
      );
    } catch {
      return undefined;
    }
  }
  async function save(
    request: Request,
    response: Response,
    recording: Recording,
  ): Promise<void> {
    try {
      await recording.operation("cache_write", async () => {
        await options.cache?.put(request, response.clone());
      });
    } catch { /* A failed best-effort cache does not discard the result. */ }
  }
  return {
    diagnostics,
    async fetch(request: Request, enabled = true): Promise<Response> {
      const recording = diagnostics.begin(enabled);
      let status: "ok" | "error" = "ok";
      try {
        return await recording.operation("request", async () => {
          if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method not allowed", {
              status: 405,
              headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
            });
          }
          const url = new URL(request.url);
          if (url.search) throw new ServiceError("invalid_request", 400);
          const resolved = url.pathname.match(
            /^\/_resolved\/(g\d+)\/([a-f0-9]{40})\/github\/actions\/(.+)$/,
          );
          if (!resolved && !url.pathname.startsWith(PREFIX)) {
            throw new ServiceError("not_found", 404);
          }
          if (resolved && resolved[1] !== "g1") {
            throw new ServiceError("not_found", 404);
          }
          let uses: string;
          try {
            uses = decodeURIComponent(
              resolved ? resolved[3] : url.pathname.slice(PREFIX.length),
            );
          } catch (cause) {
            throw new ServiceError("invalid_request", 400, { cause });
          }
          const source = parseUses(uses);
          const canonical = resolved
            ? `/_resolved/g1/${resolved[2]}${PREFIX}${encodeUses(source)}`
            : `${PREFIX}${encodeUses(source)}`;
          // Canonicalize encoding before selecting cache identity; no caller headers are forwarded.
          const key = new Request(new URL(canonical, url.origin));
          const hit = await cached(key, recording);
          if (hit) {
            return request.method === "HEAD" ? new Response(null, hit) : hit;
          }
          let result: Response;
          if (!resolved) {
            const sha = await github.resolve(source, recording);
            result = new Response(null, {
              status: 302,
              headers: {
                Location: `/_resolved/g1/${sha}${PREFIX}${encodeUses(source)}`,
                "Cache-Control": `public, max-age=${REF_TTL}`,
              },
            });
          } else {
            const { yaml, filename } = await github.metadata(
              source,
              resolved[2],
              recording,
            );
            const body = await recording.operation(
              "generate",
              () =>
                generateG1(
                  yaml,
                  source.uses,
                  metadataUrl(source, resolved[2], filename),
                ),
            );
            result = new Response(body, {
              headers: {
                "Content-Type": "application/typescript; charset=utf-8",
                "Cache-Control": `public, max-age=${IMMUTABLE_TTL}, immutable`,
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
          await save(key, result, recording);
          return request.method === "HEAD"
            ? new Response(null, result)
            : result;
        });
      } catch (error) {
        status = "error";
        const failure = error instanceof ServiceError
          ? error
          : new ServiceError("upstream_failure", 502, { cause: error });
        return new Response(request.method === "HEAD" ? null : failure.code, {
          status: failure.status,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } finally {
        recording.finish(status);
      }
    },
  };
}
