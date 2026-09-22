import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ vapidPublicKey, compact = false }: { vapidPublicKey: string | null; compact?: boolean }) {
  const fetcher = useFetcher();
  const [state, setState] = useState<"unsupported" | "denied" | "off" | "on" | "loading">("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidPublicKey) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    });
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setState("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      fetcher.submit({ intent: "subscribe", subscription: JSON.stringify(sub.toJSON()) }, { method: "post", action: "/api/push" });
      setState("on");
    } catch (e) {
      console.error(e);
      setState("off");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      fetcher.submit({ intent: "unsubscribe", endpoint: sub.endpoint }, { method: "post", action: "/api/push" });
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (state === "unsupported") {
    if (compact || !vapidPublicKey) return null;
    return <p className="text-xs text-ink-50">Push isn't available in this browser. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).</p>;
  }
  if (state === "denied") return <p className="text-xs text-ink-50">Notifications are blocked in your browser settings.</p>;
  if (state === "on")
    return (
      <div className="flex items-center justify-between gap-3">
        {!compact && <span className="text-sm text-ink-70">Push notifications are on for this device.</span>}
        <button onClick={disable} className="btn btn-ghost btn-sm">
          Turn off
        </button>
      </div>
    );
  if (state === "loading") return <span className="text-xs text-ink-50">…</span>;
  return (
    <div className={compact ? "" : "card-bone flex items-center justify-between gap-3 p-4"}>
      {!compact && (
        <div>
          <p className="text-sm font-semibold text-ink">Get notified</p>
          <p className="text-xs text-ink-50">Session reminders, partner invites and new events.</p>
        </div>
      )}
      <button onClick={enable} className="btn btn-primary btn-sm">
        Enable notifications
      </button>
    </div>
  );
}
