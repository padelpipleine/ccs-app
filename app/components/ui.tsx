import { Link } from "react-router";
import { formatMoney, initials, levelLabel } from "~/lib/format";

export function Avatar({ name, url, size = 40, className = "" }: { name: string; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  if (url)
    return <img src={url} alt={name} style={style} className={`rounded-full object-cover ${className}`} />;
  return (
    <div style={style} className={`flex shrink-0 items-center justify-center rounded-full bg-ink font-display font-semibold text-bone ${className}`}>
      {initials(name || "?") || "?"}
    </div>
  );
}

export function LevelPill({ level }: { level: number | null | undefined }) {
  return <span className={`pill ${level == null ? "pill-bone" : "pill-indigo"}`}>Padel {levelLabel(level)}</span>;
}

export function GroupPill({ group }: { group: string }) {
  if (group === "female") return <span className="pill pill-pink">Ladies</span>;
  if (group === "mixed") return <span className="pill pill-teal">Mixed</span>;
  return <span className="pill pill-bone">Everyone</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    booked: "pill-green",
    attended: "pill-green",
    invited: "pill-indigo",
    waitlist: "pill-bone",
    cancelled: "pill-outline",
    late_cancelled: "pill-red",
    no_show: "pill-red",
    registered: "pill-green",
    open: "pill-green",
    draft: "pill-bone",
    completed: "pill-outline",
    active: "pill-green",
    pending: "pill-bone",
    paused: "pill-outline",
    archived: "pill-red",
    paid: "pill-green",
    included: "pill-teal",
    free: "pill-teal",
    waived: "pill-bone",
  };
  return <span className={`pill ${map[status] ?? "pill-bone"}`}>{status.replace("_", " ")}</span>;
}

export function PriceTag({ cents }: { cents: number | null | undefined }) {
  return <span className={`pill ${cents ? "pill-ink" : "pill-teal"}`}>{formatMoney(cents)}</span>;
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-50">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card-bone px-6 py-10 text-center">
      <img src="/brand/monogram-ink.png" alt="" className="mx-auto mb-4 h-10 opacity-30" />
      <p className="font-display font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-50">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: React.ReactNode }) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function BackLink({ to, children = "Back" }: { to: string; children?: React.ReactNode }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-50 hover:text-ink">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </Link>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="serif-num mt-1 text-3xl text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-50">{sub}</p>}
    </div>
  );
}
