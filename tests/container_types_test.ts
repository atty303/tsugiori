import { toJSON, workflow } from "../src/github_actions/mod.ts";

function containers() {
  workflow("ci.yml", { on: { push: {} } }).job("test", ({ job }) => {
    const exec = job.runsOn("ubuntu-latest").services({
      db: { image: "postgres:17", ports: [5432] },
      cache: { image: "redis:7" },
    }).container({
      image: ({ github }) => github.repository,
      credentials: ({ github, secrets }) => ({
        username: github.actor,
        password: secrets.TOKEN,
      }),
      env: ({ runner }) => ({ TEMP: runner.temp }),
    }).env({ CI: "true" }).strategy({ matrix: { stage: ["dev", "prd"] } });
    exec.container({
      // @ts-expect-error container image excludes secrets
      image: ({ secrets }) => secrets.TOKEN,
    });
    exec.services({
      db: {
        // @ts-expect-error service image excludes secrets
        image: ({ secrets }) => secrets.TOKEN,
      },
    });
    const run = exec.run({
      id: "test",
      name: "Test",
      run: "true",
      env: ({ job }) => {
        job.services.db.id;
        job.services.cache.network;
        // @ts-expect-error only declared service names are visible
        job.services.missing.id;
        return { PORT: job.services.db.ports["5432"] };
      },
    });
    return run.task({
      name: "Use runtime value",
      inputs: ({ job }) => {
        // @ts-expect-error service names survive subsequent task steps
        job.services.missing.id;
        return { port: { from: job.services.db.ports["5432"] } };
      },
      run: () => {},
    }).uses("actions/checkout@v4", {
      with: ({ job }) => {
        // @ts-expect-error service names survive uses callbacks
        job.services.missing.id;
        return { token: job.services.db.id };
      },
    }).outputs(({ job }) => ({ network: toJSON(job.services.cache.network) }));
  });
}
void containers;
