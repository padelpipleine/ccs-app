import { Link } from "react-router";
import { formatDate, formatMoney, levelLabel } from "~/lib/format";
import { GroupPill, StatusPill } from "./ui";
import { Icons } from "./icons";
import type { ClubEvent, MatchDay } from "~/db/schema";

export type MatchCardData = MatchDay & {
  venueName?: string | null;
  spotsLeft: number;
  myStatus?: string | null;
  eligible?: boolean;
  reason?: string;
};

export function MatchCard({ m }: { m: MatchCardData }) {
  const full = m.spotsLeft <= 0;
  return (
    <Link to={`/matches/${m.id}`} className={`card block p-4 transition hover:shadow-md ${m.eligible === false ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">
            {formatDate(m.date)} · {m.startTime}–{m.endTime}
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold">{m.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-50">
            <Icons.pin className="h-3.5 w-3.5" /> {m.venueName ?? "Venue TBC"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <GroupPill group={m.group} />
          {(m.levelMin != null || m.levelMax != null) && (
            <span className="pill pill-indigo">
              Padel {m.levelMin != null ? levelLabel(m.levelMin) : "any"}–{m.levelMax != null ? levelLabel(m.levelMax) : "any"}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {m.myStatus ? (
          <StatusPill status={m.myStatus} />
        ) : m.status !== "open" ? (
          <StatusPill status={m.status} />
        ) : full ? (
          <span className="pill pill-bone">Full · waitlist open</span>
        ) : (
          <span className="pill pill-green">{m.spotsLeft} spots left</span>
        )}
        {m.socialAfter && <span className="pill pill-pink">🍸 Social after</span>}
        {m.prize && <span className="pill pill-teal">🏆 Prize</span>}
        {!m.hosted && <span className="pill pill-outline">{m.extraPriceCents ? formatMoney(m.extraPriceCents) : "Extra"}</span>}
        {m.eligible === false && m.reason && <span className="text-ink-50">{m.reason}</span>}
      </div>
    </Link>
  );
}

export type EventCardData = ClubEvent & { going: number; myStatus?: string | null };

export function EventCard({ e }: { e: EventCardData }) {
  return (
    <Link to={`/events/${e.id}`} className="card block overflow-hidden transition hover:shadow-md">
      {e.imageUrl ? (
        <img src={e.imageUrl} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="card-ink flex h-24 items-end rounded-none px-4 pb-3">
          <span className="eyebrow text-on-ink-muted">{e.category}</span>
        </div>
      )}
      <div className="p-4">
        <p className="eyebrow">
          {formatDate(e.date)} · {e.startTime}
        </p>
        <h3 className="mt-1 text-lg font-semibold">{e.title}</h3>
        {e.location && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-50">
            <Icons.pin className="h-3.5 w-3.5" /> {e.location}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`pill ${e.priceCents ? "pill-ink" : "pill-teal"}`}>{e.priceCents ? formatMoney(e.priceCents) : "Free for members"}</span>
          <GroupPill group={e.group} />
          {e.myStatus ? <StatusPill status={e.myStatus} /> : <span className="text-xs text-ink-50">{e.going} going</span>}
        </div>
      </div>
    </Link>
  );
}
