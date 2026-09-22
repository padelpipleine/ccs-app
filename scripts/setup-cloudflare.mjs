#!/usr/bin/env node
// One-time Cloudflare setup. Run locally after `npx wrangler login`:
//   npm run setup:cloudflare
//
// It will:
//   1. create the D1 database (or reuse it) and write its id into wrangler.jsonc
//   2. apply database migrations to the remote D1
//   3. set SESSION_SECRET and VAPID push keys as Worker secrets (if not skipped)
//   4. deploy the Worker
//
// Flags: --no-secrets  --no-deploy
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, webcrypto } from "node:crypto";

const args = new Set(process.argv.slice(2));
const DB_NAME = "ccs-db";
const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", ...opts });
};

// 1. D1 database
let dbId = null;
try {
  const list = JSON.parse(run("npx wrangler d1 list --json", { capture: true }));
  dbId = list.find((d) => d.name === DB_NAME)?.uuid ?? null;
} catch {}
if (!dbId) {
  const out = run(`npx wrangler d1 create ${DB_NAME}`, { capture: true });
  process.stdout.write(out);
  dbId = out.match(/"?database_id"?\s*[:=]\s*"?([0-9a-f-]{36})/i)?.[1] ?? null;
  if (!dbId) throw new Error("Could not read the database id from wrangler output. Paste it into wrangler.jsonc manually.");
}
const cfgPath = "wrangler.jsonc";
const cfg = readFileSync(cfgPath, "utf8");
if (cfg.includes("REPLACE_WITH_YOUR_D1_DATABASE_ID")) {
  writeFileSync(cfgPath, cfg.replace("REPLACE_WITH_YOUR_D1_DATABASE_ID", dbId));
  console.log(`\n✔ wrangler.jsonc updated with database_id ${dbId} — commit this change.`);
} else {
  console.log(`\n✔ wrangler.jsonc already has a database_id (${dbId} exists on your account).`);
}

// 2. Migrations
run(`npx wrangler d1 migrations apply ${DB_NAME} --remote`);

// 3. Secrets
if (!args.has("--no-secrets")) {
  const putSecret = (name, value) => {
    console.log(`\n$ wrangler secret put ${name}`);
    const r = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value, stdio: ["pipe", "inherit", "inherit"] });
    if (r.status !== 0) console.warn(`  (could not set ${name}; you can set it in the Cloudflare dashboard → Worker → Settings → Variables)`);
  };
  putSecret("SESSION_SECRET", randomBytes(32).toString("hex"));
  const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  putSecret("VAPID_PUBLIC_KEY", b64url(await webcrypto.subtle.exportKey("raw", pair.publicKey)));
  putSecret("VAPID_PRIVATE_KEY", (await webcrypto.subtle.exportKey("jwk", pair.privateKey)).d);
  putSecret("VAPID_SUBJECT", "mailto:contact@crosscourt.social");
  console.log("\nℹ Still to set by hand (see DEPLOY.md): RESEND_API_KEY, EMAIL_FROM, and optionally STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET.");
}

// 4. Deploy
if (!args.has("--no-deploy")) {
  run("npm run build");
  run("npx wrangler deploy");
}
console.log("\n✔ Done. Sign in with an email listed in ADMIN_EMAILS (wrangler.jsonc) to reach /admin.");
