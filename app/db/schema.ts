import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    phone: text("phone"),
    role: text("role", { enum: ["member", "admin"] }).notNull().default("member"),
    // pending = signed in but not yet approved by an admin
    status: text("status", { enum: ["pending", "active", "paused", "archived"] }).notNull().default("pending"),
    gender: text("gender", { enum: ["female", "male", "other"] }),
    // mixed = ladies & mixed sessions; female = ladies-only group. Males are always "mixed".
    memberType: text("member_type", { enum: ["mixed", "female"] }).notNull().default("mixed"),
    // Playing level set by the coach on level day (1.0 – 7.0 in 0.5 steps). null = not assessed yet.
    level: real("level"),
    levelAssessedAt: text("level_assessed_at"),
    handedness: text("handedness", { enum: ["right", "left"] }),
    preferredSide: text("preferred_side", { enum: ["left", "right", "either"] }),
    playStyle: text("play_style", { enum: ["defensive", "attacking", "all_round", "social"] }),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    instagram: text("instagram"),
    showInDirectory: integer("show_in_directory", { mode: "boolean" }).notNull().default(true),
    membershipPlan: text("membership_plan"), // e.g. "founding-yearly"
    membershipExpiresAt: text("membership_expires_at"),
    socialPoints: integer("social_points").notNull().default(0),
    adminNotes: text("admin_notes"),
    // Link to the sign-up site's CRM record (club.crosscourt.social)
    siteMemberId: text("site_member_id"),
    siteStatus: text("site_status"), // prospect | contacted | started | paid | lapsed
    selfLevel: text("self_level"), // what the member said on the welcome form; the coach sets the real level
    siteSyncedAt: text("site_synced_at"),
    lastSeenAt: text("last_seen_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const levelHistory = sqliteTable("level_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  level: real("level").notNull(),
  assessedBy: text("assessed_by"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const loginCodes = sqliteTable("login_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------------
// Venues & match days
// ---------------------------------------------------------------------------
export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city").default("Palma"),
  mapUrl: text("map_url"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const matchDays = sqliteTable(
  "match_days",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    venueId: text("venue_id").references(() => venues.id),
    date: text("date").notNull(), // YYYY-MM-DD (Europe/Madrid)
    startTime: text("start_time").notNull(), // HH:MM
    endTime: text("end_time").notNull(), // HH:MM
    group: text("group_type", { enum: ["mixed", "female"] }).notNull().default("mixed"),
    levelMin: real("level_min"),
    levelMax: real("level_max"),
    courts: integer("courts").notNull().default(1), // capacity = courts * 4
    // Whether this session counts as the member's included weekly session.
    hosted: integer("hosted", { mode: "boolean" }).notNull().default(true),
    extraPriceCents: integer("extra_price_cents"), // null = club default
    description: text("description"),
    socialAfter: text("social_after"),
    prize: text("prize"),
    status: text("status", { enum: ["draft", "open", "cancelled", "completed"] }).notNull().default("open"),
    reminderSentAt: text("reminder_sent_at"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("match_days_date_idx").on(t.date)],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    matchDayId: text("match_day_id").notNull().references(() => matchDays.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    partnerUserId: text("partner_user_id").references(() => users.id),
    invitedBy: text("invited_by").references(() => users.id),
    status: text("status", {
      enum: ["booked", "invited", "waitlist", "cancelled", "late_cancelled", "attended", "no_show"],
    })
      .notNull()
      .default("booked"),
    // included = weekly allowance, pending/paid = extra session, waived = admin comp
    paymentStatus: text("payment_status", { enum: ["included", "pending", "paid", "waived"] })
      .notNull()
      .default("included"),
    priceCents: integer("price_cents").notNull().default(0),
    paymentRef: text("payment_ref"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("bookings_match_idx").on(t.matchDayId), index("bookings_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Events (non-padel: fashion show, retreats, drinks…)
// ---------------------------------------------------------------------------
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").default("social"), // social, retreat, party, fashion, workshop…
    location: text("location"),
    mapUrl: text("map_url"),
    imageUrl: text("image_url"),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time"),
    group: text("group_type", { enum: ["all", "mixed", "female"] }).notNull().default("all"),
    priceCents: integer("price_cents").notNull().default(0), // 0 = free for members
    guestPriceCents: integer("guest_price_cents"),
    capacity: integer("capacity"), // null = unlimited
    allowGuests: integer("allow_guests", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["draft", "open", "cancelled", "completed"] }).notNull().default("open"),
    reminderSentAt: text("reminder_sent_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("events_date_idx").on(t.date)],
);

export const eventRegistrations = sqliteTable(
  "event_registrations",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guests: integer("guests").notNull().default(0),
    status: text("status", { enum: ["registered", "waitlist", "cancelled", "attended", "no_show"] })
      .notNull()
      .default("registered"),
    paymentStatus: text("payment_status", { enum: ["free", "pending", "paid", "waived"] }).notNull().default("free"),
    priceCents: integer("price_cents").notNull().default(0),
    paymentRef: text("payment_ref"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("event_regs_event_idx").on(t.eventId), index("event_regs_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Sponsors / member perks
// ---------------------------------------------------------------------------
export const perks = sqliteTable("perks", {
  id: text("id").primaryKey(),
  sponsorName: text("sponsor_name").notNull(),
  category: text("category").notNull().default("other"), // restaurant, bar, spa, shop, wine, fitness, other
  title: text("title").notNull(), // e.g. "15% off dinner"
  description: text("description"),
  howToRedeem: text("how_to_redeem"),
  code: text("code"),
  address: text("address"),
  url: text("url"),
  instagram: text("instagram"),
  logoUrl: text("logo_url"),
  validUntil: text("valid_until"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint)],
);

// In-app inbox (also what gets pushed)
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }), // null = broadcast
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    kind: text("kind").notNull().default("general"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const announcements = sqliteTable("announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  audience: text("audience", { enum: ["all", "mixed", "female"] }).notNull().default("all"),
  pushed: integer("pushed", { mode: "boolean" }).notNull().default(false),
  pushCount: integer("push_count").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------------
// Gamification
// ---------------------------------------------------------------------------
export const pointsLedger = sqliteTable(
  "points_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    refType: text("ref_type"), // booking, event, admin
    refId: text("ref_id"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("points_user_idx").on(t.userId)],
);

export const badges = sqliteTable(
  "badges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // first_match, five_matches, social_butterfly…
    awardedAt: text("awarded_at").notNull().default(now),
  },
  (t) => [uniqueIndex("badges_user_key_idx").on(t.userId, t.key)],
);

// ---------------------------------------------------------------------------
// Club settings (single row per key)
// ---------------------------------------------------------------------------
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export type User = typeof users.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type MatchDay = typeof matchDays.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type ClubEvent = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type Perk = typeof perks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
