import { eq } from "drizzle-orm";
import type { Route } from "./+types/perks";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { Empty, PageHeader } from "~/components/ui";
import { formatDate } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Member perks · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const perks = await getDb(env).select().from(schema.perks).where(eq(schema.perks.active, true)).orderBy(schema.perks.featured, schema.perks.sponsorName);
  return { perks: perks.sort((a, b) => Number(b.featured) - Number(a.featured)), active: user.status === "active", name: user.name };
}

export default function Perks({ loaderData: d }: Route.ComponentProps) {
  const cats = Array.from(new Set(d.perks.map((p) => p.category)));
  return (
    <div>
      <PageHeader eyebrow="Sponsors & partners" title="Member perks" subtitle="Show this page (or your code) when you pay. Deals are for active members only." />
      {!d.active && <p className="alert alert-warn mb-4">Perks unlock once your membership is approved.</p>}
      {d.perks.length === 0 ? (
        <Empty title="Partners are being signed up" body="Wine from island bodegas, spa treatments, clothing and more. Each new one lands here." />
      ) : (
        cats.map((cat) => (
          <section key={cat} className="mb-6">
            <p className="eyebrow mb-2">{cat}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {d.perks
                .filter((p) => p.category === cat)
                .map((p) => (
                  <div key={p.id} className={`card p-4 ${p.featured ? "border-indigo" : ""}`}>
                    <div className="flex items-start gap-3">
                      {p.logoUrl ? (
                        <img src={p.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bone-deep font-display font-semibold text-ink">{p.sponsorName[0]}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-semibold text-ink">{p.sponsorName}</p>
                        <p className="text-sm font-semibold text-indigo">{p.title}</p>
                        {p.description && <p className="mt-1 text-sm text-ink-70">{p.description}</p>}
                      </div>
                    </div>
                    {d.active && (p.code || p.howToRedeem) && (
                      <div className="card-bone mt-3 p-3 text-sm">
                        {p.code && (
                          <p>
                            Code: <span className="font-display font-semibold tracking-widest text-ink">{p.code}</span>
                          </p>
                        )}
                        {p.howToRedeem && <p className="text-ink-70">{p.howToRedeem}</p>}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-50">
                      {p.address && <span>{p.address}</span>}
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-indigo">
                          Website
                        </a>
                      )}
                      {p.instagram && (
                        <a href={`https://instagram.com/${p.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="text-indigo">
                          Instagram
                        </a>
                      )}
                      {p.validUntil && <span>Until {formatDate(p.validUntil)}</span>}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
