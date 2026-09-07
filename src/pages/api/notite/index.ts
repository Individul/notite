// POST /api/notite -> creeaza o nota durabila (mereu tip `nota`). Corp: { titlu? }.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { citesteJson, eroare, json } from "../../../lib/api";
import { creeazaNota } from "../../../lib/db";

export const POST: APIRoute = async ({ request, locals }) => {
  const c = await citesteJson<{ titlu?: unknown } | null>(request);
  if (!c.ok) return c.raspuns;
  const date = c.date && typeof c.date === "object" ? c.date : {};
  const titlu = date.titlu;
  if (titlu !== undefined && titlu !== null && typeof titlu !== "string") {
    return eroare(400, "Titlul trebuie să fie text.");
  }
  if (typeof titlu === "string" && titlu.length > 200) {
    return eroare(400, "Titlul are cel mult 200 de caractere.");
  }
  const nota = await creeazaNota(env.DB, locals.email, typeof titlu === "string" ? titlu.trim() || null : null);
  return json({ nota }, 201);
};
