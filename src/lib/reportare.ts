// Reportarea sarcinilor: ce n-ai bifat intr-o zi trecuta trece in ziua de azi.
//
// Mutarea se face cand deschizi ziua de azi, nu la miezul noptii dintr-un cron. Asa merge
// si daca n-ai deschis aplicatia trei zile: sarcinile nu se plimba din zi in zi prin zile
// pe care nu le-ai folosit, ci ajung direct unde te uiti. Si nu depinde de ora exacta,
// care in Moldova se muta de doua ori pe an.
//
// Aici sta doar partea pura, pe siruri; scrierea in baza e in db.ts.

// O sarcina nebifata, cu text dupa ea: `- [ ] ceva`, `* [ ] ceva`, `1. [ ] ceva`.
// `- [ ]` gol nu se muta — n-are ce cara mai departe.
const NEBIFATA = /^(?:[-*]|\d+\.)\s+\[ \]\s+\S/;
// Orice element de sarcina, bifat sau nu: marcheaza sfarsitul blocului „Reportate".
const SARCINA = /^(?:[-*]|\d+\.)\s+\[[ xX]\]\s/;

export const TITLU_REPORTATE = "## Reportate";

export interface Desparte {
  ramase: string;
  mutate: string[];
}

// Scoate sarcinile nebifate dintr-o zi. Randurile dintr-un bloc ``` raman pe loc: acolo
// `- [ ]` e text, nu sarcina, exact ca la randare.
export function desparteSarcini(corp: string): Desparte {
  const randuri = corp.replace(/\r\n?/g, "\n").split("\n");
  const ramase: string[] = [];
  const mutate: string[] = [];
  let inBloc = false;

  for (const rand of randuri) {
    if (/^```/.test(rand)) inBloc = !inBloc;
    if (!inBloc && NEBIFATA.test(rand)) mutate.push(rand.trim());
    else ramase.push(rand);
  }

  return { ramase: curata(ramase.join("\n")), mutate };
}

// Dupa ce scoatem randuri raman gauri: le stangem, fara sa umblam la restul textului.
function curata(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}

// Pune sarcinile sub titlul „Reportate", in capul zilei. Daca titlul exista deja de la o
// mutare de mai devreme, randurile noi intra in acelasi bloc, nu intr-al doilea titlu.
// Randurile care sunt deja acolo se sar, ca o a doua rulare sa nu dubleze nimic.
export function adaugaReportate(corp: string, linii: string[]): string {
  if (!linii.length) return corp;
  const randuri = corp.replace(/\r\n?/g, "\n").split("\n");

  let i = 0;
  while (i < randuri.length && (randuri[i] ?? "").trim() === "") i++;

  if ((randuri[i] ?? "").trim() === TITLU_REPORTATE) {
    let sfarsit = i + 1;
    while (sfarsit < randuri.length && SARCINA.test(randuri[sfarsit] ?? "")) sfarsit++;
    const deja = new Set(randuri.slice(i + 1, sfarsit).map((l) => l.trim()));
    const noi = linii.filter((l) => !deja.has(l.trim()));
    if (!noi.length) return corp;
    randuri.splice(sfarsit, 0, ...noi);
    return randuri.join("\n");
  }

  const rest = corp.trim();
  const cap = [TITLU_REPORTATE, ...linii];
  return rest ? `${cap.join("\n")}\n\n${rest}` : cap.join("\n");
}
