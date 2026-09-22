import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter+Tight:ital,wght@0,400;0,500;0,600;1,400&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap",
  },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/icons/favicon-32.png" },
  { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export const meta: Route.MetaFunction = () => [
  { title: "Crosscourt Social" },
  { name: "description", content: "Mallorca's members' padel club. Padel, properly hosted." },
  { name: "theme-color", content: "#0E1020" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
  { name: "apple-mobile-web-app-title", content: "Crosscourt" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}`,
          }}
        />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "Please try again in a moment.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    details = error.status === 404 ? "That page doesn't exist." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <img src="/brand/monogram-ink.png" alt="" className="mx-auto mb-6 h-16" />
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-ink-50">{details}</p>
      <a href="/" className="btn btn-ink mt-6">
        Back home
      </a>
      {stack && (
        <pre className="mt-8 overflow-x-auto rounded-lg bg-white p-4 text-left text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
