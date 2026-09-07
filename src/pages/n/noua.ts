// POST /n/noua (formularul din lista laterala): creeaza o nota goala si trimite la ea.
// Sec-Fetch-Site protejeaza de formulare de pe alte site-uri (pe langa verificarea
// de Origin a lui Astro).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { creeazaNota } from "../../lib/db";

const text = (s: string, status: number, extra: Record<string, string> = {}) =>
  new Response(`${s}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8", ...extra } });

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sursa = request.headers.get("sec-fetch-site");
  if (sursa !== "same-origin" && sursa !== "none") return text("Acces interzis.", 403);
  const nota = await creeazaNota(env.DB, locals.email, null);
  return redirect(`/n/${nota.id}`, 303);
};

export const ALL: APIRoute = () => text("Doar POST.", 405, { allow: "POST" });
