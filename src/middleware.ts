import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { identitate } from "./lib/identitate";
import { eroare } from "./lib/api";

// Identitatea pe fiecare cerere. Singurul loc care citeste env.ACCESS_* / DEV_EMAIL.
//
// `dev` e adevarat doar in `astro dev` (import.meta.env.DEV, fals static la build) sau
// cand hostname-ul e localhost (`wrangler dev` pe build). In productie cererile vin pe
// domeniul custom, iar DEV_EMAIL traieste doar in .dev.vars, deci calea de dev nu se
// poate deschide accidental.
export const onRequest = defineMiddleware(async (context, next) => {
  const { hostname, pathname } = context.url;
  const dev = import.meta.env.DEV || hostname === "localhost" || hostname === "127.0.0.1";
  const r = await identitate(context.request, {
    teamDomain: env.ACCESS_TEAM_DOMAIN || undefined,
    aud: env.ACCESS_AUD || undefined,
    devEmail: env.DEV_EMAIL || undefined,
    dev,
  });
  if (!r.ok) {
    if (pathname.startsWith("/api/")) return eroare(r.status, r.mesaj);
    return new Response(`${r.mesaj}\n`, {
      status: r.status,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  context.locals.email = r.email;
  return next();
});
