// GET / PUT / DELETE /api/notite/:id. Ownerul vine din locals.email (middleware).
// PUT foloseste concurenta optimista: `baza` = actualizat_la cunoscut de client;
// daca randul s-a schimbat intre timp -> 409 cu nota curenta.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { citesteJson, eroare, json } from "../../../lib/api";
import { actualizeazaNota, citesteNota, stergeNota } from "../../../lib/db";

const LIMITA_CORP = 100_000;
const LIMITA_TITLU = 200;

export const GET: APIRoute = async ({ params, locals }) => {
  const nota = await citesteNota(env.DB, locals.email, params.id ?? "");
  return nota ? json({ nota }) : eroare(404, "Notița nu există.");
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const id = params.id ?? "";
  const c = await citesteJson<{ titlu?: unknown; corp?: unknown; baza?: unknown } | null>(request);
  if (!c.ok) return c.raspuns;
  const date = c.date && typeof c.date === "object" ? c.date : {};

  if (typeof date.corp !== "string") return eroare(400, "Lipsește textul (corp).");
  if (date.corp.length > LIMITA_CORP) return eroare(400, `Textul depășește ${LIMITA_CORP} de caractere.`);
  if (typeof date.baza !== "string" || !date.baza) return eroare(400, "Lipsește baza (actualizat_la).");

  let titlu: string | null | undefined;
  if (date.titlu !== undefined) {
    if (date.titlu !== null && typeof date.titlu !== "string") return eroare(400, "Titlul trebuie să fie text.");
    if (typeof date.titlu === "string" && date.titlu.length > LIMITA_TITLU) {
      return eroare(400, `Titlul are cel mult ${LIMITA_TITLU} de caractere.`);
    }
    titlu = typeof date.titlu === "string" ? date.titlu.trim() || null : null;
    const existenta = await citesteNota(env.DB, locals.email, id);
    if (!existenta) return eroare(404, "Notița nu există.");
    if (existenta.tip === "zi") return eroare(400, "Notița de zi nu are titlu.");
  }

  const r = await actualizeazaNota(env.DB, locals.email, id, { titlu, corp: date.corp, baza: date.baza });
  if (r.ok) return json({ nota: r.nota });
  if (r.motiv === "lipsa") return eroare(404, "Notița nu există.");
  return eroare(409, "conflict", { nota: r.nota });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const sters = await stergeNota(env.DB, locals.email, params.id ?? "");
  if (!sters) return eroare(404, "Notița nu există.");
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
};
