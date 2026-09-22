import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

declare global {
  interface Window {
    Airwallex?: {
      init: (o: { env: string; origin: string }) => void;
      createElement: (type: "dropIn", o: Record<string, unknown>) => { mount: (id: string) => void };
      destroyElement?: (type: "dropIn") => void;
    };
  }
}

const SCRIPT = "https://checkout.airwallex.com/assets/elements.bundle.min.js";

function loadScript(): Promise<void> {
  return new Promise((res, rej) => {
    if (window.Airwallex) return res();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => res());
      existing.addEventListener("error", () => rej(new Error("load")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("load"));
    document.head.appendChild(s);
  });
}

/** Airwallex card form. On success we ask the server to verify the intent and mark the item paid. */
export function AirwallexDropIn({ intentId, clientSecret, currency, env }: { intentId: string; clientSecret: string; currency: string; env: "prod" | "demo" }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [state, setState] = useState<"loading" | "ready" | "failed" | "confirming">("loading");
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.Airwallex) return;
        window.Airwallex.init({ env, origin: window.location.origin });
        const el = window.Airwallex.createElement("dropIn", { intent_id: intentId, client_secret: clientSecret, currency });
        el.mount("awxDrop");
        setState("ready");
      })
      .catch(() => setState("failed"));
    const onSuccess = () => {
      setState("confirming");
      fetcher.submit({ intent: "confirm" }, { method: "post" });
    };
    const onError = () => setState("ready");
    window.addEventListener("onSuccess", onSuccess);
    window.addEventListener("onError", onError);
    return () => {
      cancelled = true;
      window.removeEventListener("onSuccess", onSuccess);
      window.removeEventListener("onError", onError);
      try {
        window.Airwallex?.destroyElement?.("dropIn");
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentId]);

  return (
    <div>
      {state === "loading" && <p className="text-sm text-ink-50">Loading secure payment…</p>}
      {state === "failed" && <p className="alert alert-error">Couldn't load the card form. Check your connection and reload.</p>}
      {state === "confirming" && <p className="alert alert-info">Confirming your payment…</p>}
      <div id="awxDrop" className={state === "confirming" ? "hidden" : ""} />
      {fetcher.data?.error && <p className="alert alert-warn mt-3">{fetcher.data.error}</p>}
      <p className="hint mt-3">Secure card payment by Airwallex. Your card details go directly to Airwallex, never to our servers.</p>
    </div>
  );
}
