import { createRequestHandler } from "react-router";
import { runScheduledJobs } from "../app/lib/jobs.server";
import { handleStripeWebhook } from "../app/lib/payments.server";
import { ensureMigrated } from "../app/lib/migrate.server";
import { handleSiteSignup } from "../app/lib/site-sync.server";
import { servePhoto } from "../app/lib/photos.server";

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
    if (url.pathname === "/webhooks/site-signup" && request.method === "POST") {
      return handleSiteSignup(request, env);
    }
    if (url.pathname.startsWith("/photos/") && request.method === "GET") {
      return servePhoto(url.pathname.slice("/photos/".length), env);
    }
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ensureMigrated(env).then(() => runScheduledJobs(env)));
  },
} satisfies ExportedHandler<Env>;
