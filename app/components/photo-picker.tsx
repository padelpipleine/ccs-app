import { useRef, useState } from "react";
import { Avatar } from "./ui";

const MAX_SIDE = 640;

/** Resizes an image in the browser to a square-ish JPEG so uploads are small and fast. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("decode"));
      img.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, MAX_SIDE / side);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(side * scale);
    canvas.height = Math.round(side * scale);
    const ctx = canvas.getContext("2d")!;
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoPicker({ name, initialUrl, displayName }: { name: string; initialUrl: string | null; displayName: string }) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      try {
        blob = await shrink(file);
      } catch {
        blob = file; // browser couldn't decode it (e.g. HEIC on desktop): send as is, server validates
      }
      const fd = new FormData();
      fd.append("photo", blob, "photo.jpg");
      const res = await fetch("/api/photo", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok) throw new Error(data.error || "Upload failed");
      setUrl(data.url ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const fd = new FormData();
    fd.append("intent", "remove");
    await fetch("/api/photo", { method: "POST", body: fd });
    setUrl(null);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name={name} value={url ?? ""} />
      <Avatar name={displayName} url={url} size={64} />
      <div className="min-w-0 flex-1">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : url ? "Change photo" : "Add a photo"}
          </button>
          {url && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>
              Remove
            </button>
          )}
        </div>
        <p className="hint">Take one now or pick from your camera roll. Square-cropped, and only members see it.</p>
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}
