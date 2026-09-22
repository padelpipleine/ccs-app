import { desc, eq } from "drizzle-orm";
import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/member";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { awardBadge, awardPoints } from "~/lib/points.server";
import { notifyUsers } from "~/lib/push.server";
import { Alert, Avatar, BackLink, Field, PageHeader, StatusPill } from "~/components/ui";
import { formatDate, formatDateTime, levelOptions } from "~/lib/format";

export const meta: Route.MetaFunction = ({ data }) => [{ title: `${data?.member.name || "Member"} · Admin` }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const member = await db.select().from(schema.users).where(eq(schema.users.id, params.id)).get();
  if (!member) throw new Response("Not found", { status: 404 });
  const history = await db.select().from(schema.levelHistory).where(eq(schema.levelHistory.userId, member.id)).orderBy(desc(schema.levelHistory.createdAt));
  const bookings = await db
    .select({ b: schema.bookings, m: schema.matchDays })
    .from(schema.bookings)
    .innerJoin(schema.matchDays, eq(schema.matchDays.id, schema.bookings.matchDayId))
    .where(eq(schema.bookings.userId, member.id))
    .orderBy(desc(schema.matchDays.date))
    .limit(15);
  const ledger = await db.select().from(schema.pointsLedger).where(eq(schema.pointsLedger.userId, member.id)).orderBy(desc(schema.pointsLedger.createdAt)).limit(10);
  return { member, history, bookings, ledger };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const db = getDb(env);
  const member = await db.select().from(schema.users).where(eq(schema.users.id, params.id)).get();
  if (!member) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "save") {
    const status = String(form.get("status")) as typeof member.status;
    const memberType = String(form.get("memberType")) as typeof member.memberType;
    const role = String(form.get("role")) as typeof member.role;
    const levelRaw = String(form.get("level") ?? "");
    const level = levelRaw === "" ? null : Number(levelRaw);
    const notes = String(form.get("levelNotes") ?? "");
    const wasPending = member.status === "pending";
    await db
      .update(schema.users)
      .set({
        status,
        memberType: member.gender === "male" ? "mixed" : memberType,
        role: member.id === admin.id ? "admin" : role,
        adminNotes: String(form.get("adminNotes") ?? "") || null,
        membershipPlan: String(form.get("membershipPlan") ?? "") || null,
        membershipExpiresAt: String(form.get("membershipExpiresAt") ?? "") || null,
        ...(level !== member.level ? { level, levelAssessedAt: level == null ? null : new Date().toISOString() } : {}),
      })
      .where(eq(schema.users.id, member.id));
    if (level != null && level !== member.level) {
      await db.insert(schema.levelHistory).values({ id: newId("lh"), userId: member.id, level, assessedBy: admin.name || admin.email, notes: notes || null });
      await notifyUsers(env, [member.id], { title: `Your padel level is now ${level.toFixed(1)}`, body: notes || "Set by the coach on level day. Fixed until the next assessment.", url: "/profile", kind: "level" });
      await awardBadge(db, env, member.id, "level_day");
    }
    if (wasPending && status === "active") {
      await notifyUsers(env, [member.id], { title: "You're approved 🎾", body: "Welcome to Crosscourt Social. Book your first hosted session.", url: "/matches", kind: "membership" });
    }
    return { success: "Saved." };
  }
  if (intent === "points") {
    const pts = Number(form.get("points"));
    const reason = String(form.get("reason") ?? "Adjustment by club");
    if (!Number.isFinite(pts) || pts === 0) return { error: "Enter a non-zero number of points." };
    await awardPoints(db, member.id, pts, reason, "admin", admin.id);
    return { success: `${pts > 0 ? "+" : ""}${pts} points applied.` };
  }
  if (intent === "delete") {
    await db.delete(schema.users).where(eq(schema.users.id, member.id));
    throw redirect("/admin/members");
  }
  return { error: "Unknown action" };
}

export default function AdminMember({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const m = d.member;
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink to="/admin/members">Members</BackLink>
      <PageHeader title={m.name || m.email} subtitle={m.email} action={<StatusPill status={m.status} />} />
      {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
      {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}
      <div className="grid gap-6 lg:grid-cols-5">
        <Form method="post" className="card space-y-4 p-5 lg:col-span-3">
          <div className="flex items-center gap-3">
            <Avatar name={m.name || m.email} url={m.avatarUrl} size={48} />
            <div className="text-sm text-ink-70">
              {m.gender ?? "gender not set"} · {m.handedness ?? "hand ?"} · {m.preferredSide ?? "side ?"} · {m.playStyle ?? "style ?"}
              <br />
              {m.phone && <span>{m.phone} · </span>}
              {m.instagram}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select name="status" defaultValue={m.status} className="select">
                <option value="pending">Pending approval</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived (can't sign in)</option>
              </select>
            </Field>
            <Field label="Group" hint={m.gender === "male" ? "Men are always mixed." : undefined}>
              <select name="memberType" defaultValue={m.memberType} className="select" disabled={m.gender === "male"}>
                <option value="mixed">Mixed (ladies & mixed sessions)</option>
                <option value="female">Ladies only</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Padel level" hint="Set on level day by the coach.">
              <select name="level" defaultValue={m.level ?? ""} className="select">
                <option value="">Not assessed</option>
                {levelOptions().map((l) => (
                  <option key={l} value={l}>
                    {l.toFixed(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Level notes" hint="Sent to the member with the new level.">
              <input name="levelNotes" className="input" placeholder="Great volleys, work on the lob." />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Membership plan">
              <input name="membershipPlan" defaultValue={m.membershipPlan ?? ""} className="input" placeholder="founding-yearly" />
            </Field>
            <Field label="Membership expires">
              <input name="membershipExpiresAt" type="date" defaultValue={m.membershipExpiresAt ?? ""} className="input" />
            </Field>
          </div>
          <Field label="Role">
            <select name="role" defaultValue={m.role} className="select">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Admin notes (private)">
            <textarea name="adminNotes" rows={2} defaultValue={m.adminNotes ?? ""} className="textarea" />
          </Field>
          <button name="intent" value="save" className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
            Save
          </button>
        </Form>

        <div className="space-y-4 lg:col-span-2">
          <Form method="post" className="card space-y-3 p-4">
            <p className="font-display font-semibold text-ink">Club points · {m.socialPoints}</p>
            <div className="grid grid-cols-3 gap-2">
              <input name="points" type="number" className="input" placeholder="+10" />
              <input name="reason" className="input col-span-2" placeholder="Helped host the social" />
            </div>
            <button name="intent" value="points" className="btn btn-outline btn-sm">
              Apply
            </button>
          </Form>
          <div className="card p-4">
            <p className="font-display font-semibold text-ink">Level history</p>
            {d.history.length === 0 ? (
              <p className="text-sm text-ink-50">Never assessed.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {d.history.map((h) => (
                  <li key={h.id}>
                    <strong>{h.level.toFixed(1)}</strong> · {formatDateTime(h.createdAt)} {h.assessedBy && `· ${h.assessedBy}`}
                    {h.notes && <span className="block text-xs text-ink-50">{h.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <p className="font-display font-semibold text-ink">Recent bookings</p>
            {d.bookings.length === 0 ? (
              <p className="text-sm text-ink-50">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {d.bookings.map(({ b, m: md }) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatDate(md.date)} · {md.title}
                    </span>
                    <StatusPill status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Form method="post" onSubmit={(e) => !confirm("Delete this member and all their bookings? This cannot be undone.") && e.preventDefault()}>
            <button name="intent" value="delete" className="btn btn-danger btn-sm">
              Delete member
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
