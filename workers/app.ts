import { createRequestHandler } from "react-router";
import { runScheduledJobs } from "../app/lib/jobs.server";
import { handleStripeWebhook } from "../app/lib/payments.server";
import { ensureMigrated } from "../app/lib/migrate.server";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Static assets are served before this handler runs; everything here needs the database.
    await ensureMigrated(env);
    if (url.pathname === "/webhooks/stripe" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ensureMigrated(env).then(() => runScheduledJobs(env)));
  },
} satisfies ExportedHandler<Env>;
