import { Diagnostics } from "./diagnostics.ts";
import { createService } from "./service.ts";

const diagnostics = new Diagnostics();
export default {
  fetch(request: Request, env: { DIAGNOSTICS?: string }): Promise<Response> {
    const runtimeCache = (caches as CacheStorage & { default?: Cache }).default;
    return createService({ cache: runtimeCache, diagnostics }).fetch(
      request,
      env.DIAGNOSTICS !== "off",
    );
  },
};
