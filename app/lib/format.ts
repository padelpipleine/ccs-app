// Shared helpers (safe on server and client).

export const JOIN_URL = "https://club.crosscourt.social/";

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 7;
export const LEVEL_STEP = 0.5;

export function levelOptions(): number[] {
  const out: number[] = [];
  for (let l = LEVEL_MIN; l <= LEVEL_MAX + 1e-9; l += LEVEL_STEP) out.push(Math.round(l * 100) / 100);
  return out;
}

export function levelLabel(level: number | null | undefined): string {
  if (level == null) return "Not assessed";
  return level.toFixed(1);
}

export function levelBand(level: number | null | undefined): string {
  if (level == null) return "Unassessed";
  if (level < 2.5) return "Beginner";
  if (level < 4) return "Intermediate";
  if (level < 5.5) return "Advanced";
  return "Pro";
}

export function formatMoney(cents: number | null | undefined): string {
  if (!cents) return "Free";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** Always formats as euros, including €0.00 (for totals and stats). */
export function formatEuro(cents: number | null | undefined): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = {}): string {
  // date is YYYY-MM-DD; parse as UTC noon to avoid TZ shifts
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC", ...opts }).format(d);
}

export function formatDateLong(date: string): string {
  return formatDate(date, { weekday: "long", day: "numeric", month: "long" });
}

export function formatTime(t: string): string {
  return t;
}

export function formatDateTime(iso: string, tz = "Europe/Madrid"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(tz = "Europe/Madrid", from = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(from);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO week key, e.g. 2026-W39 (weeks run Monday–Sunday). */
export function isoWeekKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday and Sunday (YYYY-MM-DD) of the ISO week containing `date`. */
export function weekBounds(date: string): { start: string; end: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  const start = addDays(date, 1 - day);
  return { start, end: addDays(start, 6) };
}

/** Combine a local date + time (Europe/Madrid) into an epoch ms value. */
export function localDateTimeToEpoch(date: string, time: string, tz = "Europe/Madrid"): number {
  // Find the UTC offset at that wall-clock moment by probing.
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  const asIfUtc = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:00Z`);
  const offset = asIfUtc - guess;
  return guess - offset;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

export function groupLabel(group: string): string {
  return group === "female" ? "Ladies" : group === "mixed" ? "Mixed" : "Everyone";
}

export const SOCIAL_LEVELS = [
  { name: "Rookie", min: 0 },
  { name: "Regular", min: 50 },
  { name: "Local", min: 150 },
  { name: "Socialite", min: 300 },
  { name: "Legend", min: 600 },
  { name: "Icon", min: 1000 },
] as const;

export function socialLevel(points: number) {
  type Level = (typeof SOCIAL_LEVELS)[number];
  let current: Level = SOCIAL_LEVELS[0];
  let next: Level | null = null;
  for (let i = 0; i < SOCIAL_LEVELS.length; i++) {
    if (points >= SOCIAL_LEVELS[i]!.min) current = SOCIAL_LEVELS[i]!;
    else {
      next = SOCIAL_LEVELS[i]!;
      break;
    }
  }
  const progress = next ? (points - current.min) / (next.min - current.min) : 1;
  return { current, next, progress };
}

export const BADGES: Record<string, { name: string; description: string; icon: string }> = {
  first_match: { name: "First rally", description: "Played your first hosted session", icon: "🎾" },
  five_matches: { name: "Regular", description: "Played 5 sessions", icon: "🔥" },
  twenty_matches: { name: "Court fixture", description: "Played 20 sessions", icon: "🏆" },
  first_event: { name: "Out & about", description: "Attended your first club event", icon: "🥂" },
  three_events: { name: "Social butterfly", description: "Attended 3 club events", icon: "🦋" },
  partner_bringer: { name: "Connector", description: "Brought a partner to a session", icon: "🤝" },
  early_bird: { name: "Early bird", description: "Booked more than a week ahead", icon: "🐦" },
  streak_4: { name: "On a roll", description: "Played 4 weeks in a row", icon: "🎯" },
  level_day: { name: "Level day", description: "Assessed by the coach on level day", icon: "📏" },
};

export const PERK_CATEGORIES = ["restaurant", "bar", "cafe", "spa", "wellness", "shop", "fashion", "wine", "fitness", "other"] as const;
export const EVENT_CATEGORIES = ["social", "party", "fashion", "retreat", "dinner", "workshop", "tournament", "other"] as const;
