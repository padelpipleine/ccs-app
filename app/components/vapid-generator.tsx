import { useState } from "react";

function b64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates a VAPID key pair in the browser so admins can paste it into Cloudflare. Nothing leaves the page. */
export function VapidGenerator() {
  const [keys, setKeys] = useState<{ pub: string; priv: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    setKeys({ pub, priv: jwk.d! });
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!keys)
    return (
      <button type="button" onClick={generate} className="btn btn-outline btn-sm mt-2">
        Generate push keys
      </button>
    );

  const rows = [
    ["VAPID_PUBLIC_KEY", keys.pub],
    ["VAPID_PRIVATE_KEY", keys.priv],
    ["VAPID_SUBJECT", "mailto:contact@crosscourt.social"],
  ] as const;
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-white p-3 text-xs">
      <p className="text-ink-70">
        Add these three as secrets on the Worker (Cloudflare → Workers &amp; Pages → ccs-app → Settings → Variables and Secrets), then redeploy.
        They were generated in your browser and are not stored anywhere else, so copy them now.
      </p>
      {rows.map(([name, value]) => (
        <div key={name} className="flex items-center gap-2">
          <code className="w-40 shrink-0 font-semibold text-ink">{name}</code>
          <code className="min-w-0 flex-1 truncate text-ink-70">{value}</code>
          <button type="button" onClick={() => copy(name, value)} className="btn btn-ghost btn-sm">
            {copied === name ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
    </div>
  );
}
