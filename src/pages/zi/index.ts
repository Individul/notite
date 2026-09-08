// GET /zi?data=AAAA-LL-ZZ -> pagina zilei alese. Aici trimite selectorul de data din bara,
// ca saltul la o zi anume sa mearga si fara JavaScript (formular obisnuit, metoda GET).
// O data invalida sau lipsa duce inapoi la azi, nu la 404: e o navigare, nu o adresa gresita.
import type { APIRoute } from "astro";
import { aziChisinau, ziValida } from "../../lib/data";

export const GET: APIRoute = ({ url, redirect }) => {
  const data = (url.searchParams.get("data") ?? "").trim();
  if (!ziValida(data) || data === aziChisinau()) return redirect("/", 303);
  return redirect(`/zi/${data}`, 303);
};
