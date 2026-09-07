import { MARCAJ_START, MARCAJ_STOP } from "./db";
import { escapeHtml } from "./markdown";

// Textul utilizatorului -> interogare FTS5 sigura: doar cuvinte (litere si cifre),
// fiecare intre ghilimele si cu prefix (*), ca "etich" sa gaseasca "eticheta".
// Operatorii FTS (AND, NOT, paranteze, ghilimele) devin cuvinte obisnuite.
export function pregatesteInterogare(q: string): string | null {
  const cuvinte = q.match(/[\p{L}\p{N}]+/gu);
  if (!cuvinte || cuvinte.length === 0) return null;
  return cuvinte.map((c) => `"${c}"*`).join(" ");
}

// Fragmentul din snippet(): escapam tot, apoi transformam markerele in <mark>.
export function fragmentHtml(fragment: string): string {
  return escapeHtml(fragment).split(MARCAJ_START).join("<mark>").split(MARCAJ_STOP).join("</mark>");
}
