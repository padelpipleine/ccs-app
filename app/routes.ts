import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("login/verify", "routes/login-verify.tsx"),
  route("login/link", "routes/login-link.tsx"),
  route("logout", "routes/logout.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("api/push", "routes/api.push.tsx"),
  route("api/photo", "routes/api.photo.tsx"),
  route("pay/:type/:id", "routes/pay.tsx"),

  layout("routes/app-layout.tsx", [
    index("routes/home.tsx"),
    route("matches", "routes/matches.tsx"),
    route("matches/:id", "routes/match.tsx"),
    route("events", "routes/events.tsx"),
    route("events/:id", "routes/event.tsx"),
    route("perks", "routes/perks.tsx"),
    route("members", "routes/members.tsx"),
    route("leaderboard", "routes/leaderboard.tsx"),
    route("inbox", "routes/inbox.tsx"),
    route("profile", "routes/profile.tsx"),
    route("profile/edit", "routes/profile-edit.tsx"),
  ]),

  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/index.tsx"),
      route("members", "routes/admin/members.tsx"),
      route("members/:id", "routes/admin/member.tsx"),
      route("venues", "routes/admin/venues.tsx"),
      route("matches", "routes/admin/matches.tsx"),
      route("matches/new", "routes/admin/match-form.tsx", { id: "admin-match-new" }),
      route("matches/:id", "routes/admin/match.tsx"),
      route("matches/:id/edit", "routes/admin/match-form.tsx", { id: "admin-match-edit" }),
      route("events", "routes/admin/events.tsx"),
      route("events/new", "routes/admin/event-form.tsx", { id: "admin-event-new" }),
      route("events/:id", "routes/admin/event.tsx"),
      route("events/:id/edit", "routes/admin/event-form.tsx", { id: "admin-event-edit" }),
      route("perks", "routes/admin/perks.tsx"),
      route("notify", "routes/admin/notify.tsx"),
      route("settings", "routes/admin/settings.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
