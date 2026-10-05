import { createService } from "./src/service.ts";

const service = createService();
Deno.serve(
  { hostname: "127.0.0.1", port: 8787 },
  (request) => service.fetch(request),
);
