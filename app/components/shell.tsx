import { Form, Link, NavLink } from "react-router";
import { Icons } from "./icons";
import { Avatar } from "./ui";

type ShellUser = { id: string; name: string; avatarUrl: string | null; role: string };

const memberNav = [
  { to: "/", label: "Home", icon: Icons.home, end: true },
  { to: "/matches", label: "Play", icon: Icons.play },
  { to: "/events", label: "Events", icon: Icons.star },
  { to: "/perks", label: "Perks", icon: Icons.tag },
  { to: "/profile", label: "You", icon: Icons.user },
];

const sideNav = [
  { to: "/", label: "Home", icon: Icons.home, end: true },
  { to: "/matches", label: "Sessions", icon: Icons.play },
  { to: "/events", label: "Events", icon: Icons.star },
  { to: "/perks", label: "Member perks", icon: Icons.tag },
  { to: "/members", label: "Members", icon: Icons.users },
  { to: "/leaderboard", label: "Club ranking", icon: Icons.trophy },
  { to: "/inbox", label: "Inbox", icon: Icons.bell },
  { to: "/profile", label: "Profile", icon: Icons.user },
];

export function AppShell({ user, unread, children, admin = false }: { user: ShellUser; unread: number; children: React.ReactNode; admin?: boolean }) {
  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="card-ink hidden w-64 shrink-0 flex-col rounded-none p-5 lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <img src="/brand/monogram-bone.png" alt="" className="h-9" />
          <span className="wordmark text-[11px] leading-tight text-bone">
            Crosscourt
            <br />
            Social
          </span>
        </Link>
        <nav className="flex flex-col gap-1">
          {(admin ? adminNav : sideNav).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `side-item ${isActive ? "active" : ""}`}>
              <n.icon />
              {n.label}
              {n.to === "/inbox" && unread > 0 && <span className="ml-auto rounded-full bg-pink px-1.5 text-[10px] font-bold text-ink">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
          {user.role === "admin" && (
            <NavLink to={admin ? "/" : "/admin"} className="side-item">
              {admin ? <Icons.home /> : <Icons.settings />}
              {admin ? "Member view" : "Admin"}
            </NavLink>
          )}
          <div className="flex items-center gap-3 px-2 pt-2">
            <Avatar name={user.name} url={user.avatarUrl} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-bone">{user.name}</p>
              <Form method="post" action="/logout">
                <button className="text-xs text-on-ink-muted hover:text-bone">Sign out</button>
              </Form>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bone/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/monogram-ink.png" alt="" className="h-7" />
            <span className="wordmark text-[10px] text-ink">Crosscourt Social</span>
          </Link>
          <div className="flex items-center gap-3">
            {user.role === "admin" && (
              <Link to={admin ? "/" : "/admin"} className="pill pill-outline">
                {admin ? "Member view" : "Admin"}
              </Link>
            )}
            <Link to="/inbox" className="relative text-ink-70" aria-label="Inbox">
              <Icons.bell className="h-6 w-6" />
              {unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-pink" />}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bone-warm/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {(admin ? adminMobileNav : memberNav).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <n.icon />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

const adminNav = [
  { to: "/admin", label: "Dashboard", icon: Icons.grid, end: true },
  { to: "/admin/matches", label: "Sessions", icon: Icons.play },
  { to: "/admin/events", label: "Events", icon: Icons.star },
  { to: "/admin/members", label: "Members", icon: Icons.users },
  { to: "/admin/perks", label: "Perks & partners", icon: Icons.tag },
  { to: "/admin/venues", label: "Venues", icon: Icons.pin },
  { to: "/admin/notify", label: "Notify members", icon: Icons.megaphone },
  { to: "/admin/settings", label: "Club settings", icon: Icons.settings },
];

const adminMobileNav = [
  { to: "/admin", label: "Admin", icon: Icons.grid, end: true },
  { to: "/admin/matches", label: "Sessions", icon: Icons.play },
  { to: "/admin/events", label: "Events", icon: Icons.star },
  { to: "/admin/members", label: "Members", icon: Icons.users },
  { to: "/admin/notify", label: "Notify", icon: Icons.megaphone },
];
