// Generates a VAPID key pair for web push. Run: node scripts/generate-vapid.mjs
import { webcrypto } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = await webcrypto.subtle.exportKey("raw", pair.publicKey);
const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

const out = { VAPID_PUBLIC_KEY: b64url(pub), VAPID_PRIVATE_KEY: jwk.d };
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out));
} else {
  console.log("Add these as Worker secrets (wrangler secret put NAME) or to .dev.vars:\n");
  console.log(`VAPID_PUBLIC_KEY=${out.VAPID_PUBLIC_KEY}`);
  console.log(`VAPID_PRIVATE_KEY=${out.VAPID_PRIVATE_KEY}`);
  console.log(`VAPID_SUBJECT=mailto:contact@crosscourt.social`);
}
