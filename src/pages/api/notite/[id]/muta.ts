// POST /api/notite/:id/muta -> muta o sarcina nebifata din notita :id la capatul notitei
// altei zile. Corp: { linie, text, zi, baza }. `linie` e indexul (de la 0) al randului din
// textul pe care clientul il stie, `text` e continutul lui, ca sa nu mutam altceva daca
// notita s-a schimbat intre timp; `baza` e actualizat_la cunoscut de client (concurenta
// optimista, ca la PUT).
//
// Ordinea scrierilor: intai la tinta, apoi scoaterea din sursa. Daca pica intre ele,
// sarcina apare de doua ori — vizibil si usor de sters — dar nu se pierde.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { citesteJson, eroare, json } from "../../../../lib/api";
import { actualizeazaNota, citesteNota, notaZi } from "../../../../lib/db";
import { ziValida } from "../../../../lib/data";
import { adaugaLaCapat, sarcinaNebifata, scoateLinia } from "../../../../lib/sarcini";

export const POST: APIRoute = async ({ params, request, locals }) => {
  const id = params.id ?? "";
  const c = await citesteJson<{ linie?: unknown; text?: unknown; zi?: unknown; baza?: unknown } | null>(request);
  if (!c.ok) return c.raspuns;
  const d = c.date && typeof c.date === "object" ? c.date : {};

  if (typeof d.linie !== "number" || !Number.isInteger(d.linie) || d.linie < 0) return eroare(400, "Lipsește linia.");
  if (typeof d.text !== "string" || !sarcinaNebifata(d.text)) return eroare(400, "Linia nu e o sarcină nebifată.");
  if (typeof d.zi !== "string" || !ziValida(d.zi)) return eroare(400, "Zi invalidă.");
  if (typeof d.baza !== "string" || !d.baza) return eroare(400, "Lipsește baza (actualizat_la).");

  const sursa = await citesteNota(env.DB, locals.email, id);
  if (!sursa) return eroare(404, "Notița nu există.");
  if (sursa.data_zi === d.zi) return eroare(400, "Sarcina e deja în ziua asta.");
  if (sursa.actualizat_la !== d.baza) return eroare(409, "conflict", { nota: sursa });
  const ramas = scoateLinia(sursa.corp, d.linie, d.text);
  if (ramas === null) return eroare(409, "conflict", { nota: sursa });

  const tinta = await notaZi(env.DB, locals.email, d.zi);
  const t = await actualizeazaNota(env.DB, locals.email, tinta.id, {
    corp: adaugaLaCapat(tinta.corp, d.text), baza: tinta.actualizat_la,
  });
  if (!t.ok) return eroare(409, "conflict", { nota: sursa });

  const s = await actualizeazaNota(env.DB, locals.email, id, { corp: ramas, baza: d.baza });
  if (!s.ok) return s.motiv === "lipsa" ? eroare(404, "Notița nu există.") : eroare(409, "conflict", { nota: s.nota });
  return json({ nota: s.nota, zi: d.zi });
};
