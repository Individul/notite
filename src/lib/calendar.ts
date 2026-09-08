// Grila unei luni, pentru selectorul de zi din antet.
//
// Calendarul nativ al browserului nu poate fi nici stilizat, nici tradus — isi ia limba
// din sistem, deci pe un Mac cu interfata in rusa iese un calendar rusesc peste o aplicatie
// romaneasca. Asa ca il desenam noi.
//
// Totul aici e pur si calculat pe UTC: zilele din URL nu au fus, ca in data.ts.
// Saptamana incepe luni.

import { ziValida } from "./data";

export const ZILE_SAPTAMANA = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

export interface ZiGrila {
  data: string; // AAAA-LL-ZZ
  numar: number; // ziua din luna, pentru afisare
  inLuna: boolean; // fals pentru zilele imprumutate din lunile vecine
}

export interface Grila {
  luna: string; // "2026-09"
  eticheta: string; // "septembrie 2026"
  anterioara: string;
  urmatoare: string;
  zile: ZiGrila[]; // multiplu de 7, in ordine
}

export function lunaValida(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s) && ziValida(`${s}-01`);
}

export function lunaZilei(data: string): string {
  return data.slice(0, 7);
}

export function lunaVecina(luna: string, delta: number): string {
  const [an, l] = luna.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(an, l - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function grilaLunii(luna: string): Grila {
  const [an, l] = luna.split("-").map(Number) as [number, number];
  // getUTCDay da 0 pentru duminica; noi vrem luni pe pozitia 0.
  const decalaj = (new Date(Date.UTC(an, l - 1, 1)).getUTCDay() + 6) % 7;

  const toate: ZiGrila[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(an, l - 1, 1 - decalaj + i));
    toate.push({
      data: d.toISOString().slice(0, 10),
      numar: d.getUTCDate(),
      inLuna: d.getUTCMonth() === l - 1 && d.getUTCFullYear() === an,
    });
  }
  // A sasea saptamana e goala la majoritatea lunilor; o taiem ca sa nu ramana un rand orb.
  const zile = toate.slice(35).every((z) => !z.inLuna) ? toate.slice(0, 35) : toate;

  const eticheta = new Date(`${luna}-01T12:00:00Z`).toLocaleDateString("ro-RO", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

  return {
    luna,
    eticheta,
    anterioara: lunaVecina(luna, -1),
    urmatoare: lunaVecina(luna, 1),
    zile,
  };
}
