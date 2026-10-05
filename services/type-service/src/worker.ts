import { Diagnostics } from "./diagnostics.ts";
import { createService } from "./service.ts";
import { GitHubClient } from "./github/client.ts";

export type Bindings = {
  DIAGNOSTICS?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
};

const diagnostics = new Diagnostics();
export default {
  fetch(request: Request, env: Bindings): Promise<Response> {
    const runtimeCache = (caches as CacheStorage & { default?: Cache }).default;
    return createService({
      cache: runtimeCache,
      diagnostics,
      github: new GitHubClient({
        clientId: env.GITHUB_OAUTH_CLIENT_ID ?? "",
        clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET ?? "",
      }),
    }).fetch(
      request,
      env.DIAGNOSTICS !== "off",
    );
  },
};
