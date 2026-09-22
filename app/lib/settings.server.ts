import { eq } from "drizzle-orm";
import { schema, type Db } from "./db.server";

export const DEFAULT_SETTINGS = {
  weeklyAllowance: "1", // hosted sessions included per ISO week
  extraSessionPriceCents: "2500",
  partnerLevelGap: "0.5", // max level difference between partners (0 = must be identical)
  freeCancelHours: "24",
  bookingOpensDays: "14", // members can book sessions up to N days ahead
  paymentMode: "manual", // manual | stripe
  paymentInstructions: "Pay by Bizum to +34 600 000 000 with your name as reference. We confirm it within 24h.",
  pointsAttend: "10",
  pointsEvent: "15",
  pointsPartner: "5",
  pointsNoShow: "-10",
  pointsLateCancel: "-5",
  welcomeMessage: "Padel is better with people. Book your hosted session, bring a partner at your level, and come to the socials.",
  whatsappUrl: "",
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(schema.settings);
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function setSetting(db: Db, key: SettingKey, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date().toISOString() } });
}

export function num(s: Settings, key: SettingKey): number {
  const n = Number(s[key]);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key]);
}

export async function getSetting(db: Db, key: SettingKey): Promise<string> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? DEFAULT_SETTINGS[key];
}
