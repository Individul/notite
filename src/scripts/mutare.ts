// Panoul mic de sub butonul „mută" al unei sarcini: alegi ziua tinta. Doua scurtaturi
// (Azi, Maine) si un calendar desenat pe loc, din aceeasi grila ca cel din antet
// (lib/calendar.ts), ca sa arate la fel. Nu stie nimic despre notite: primeste ancora,
// ziua de pe care pleci (ca s-o blocheze) si ce sa faca la alegere.

import { grilaLunii, lunaZilei, ZILE_SAPTAMANA } from "../lib/calendar";
import { aziChisinau, ziVecina } from "../lib/data";

let deschis: HTMLElement | null = null;

function laClicAfara(e: MouseEvent) {
  if (deschis && !(e.target instanceof Node && deschis.contains(e.target))) inchideMutare();
}
function laTasta(e: KeyboardEvent) {
  if (e.key === "Escape") inchideMutare();
}

export function inchideMutare() {
  deschis?.remove();
  deschis = null;
  document.removeEventListener("mousedown", laClicAfara, true);
  document.removeEventListener("keydown", laTasta, true);
}

function buton(text: string, clasa: string, laClic: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = clasa;
  b.textContent = text;
  b.addEventListener("click", laClic);
  return b;
}

export function deschideMutare(ancora: HTMLElement, ziCurenta: string | null, laAlegere: (zi: string) => void): void {
  inchideMutare();
  const azi = aziChisinau();
  const alege = (zi: string) => { inchideMutare(); laAlegere(zi); };

  const panou = document.createElement("div");
  panou.className = "muta-panou";
  panou.setAttribute("role", "dialog");
  panou.setAttribute("aria-label", "Mută pe altă zi");

  const scurt = document.createElement("div");
  scurt.className = "scurt";
  for (const [eticheta, zi] of [["Azi", azi], ["Mâine", ziVecina(azi, 1)]] as const) {
    if (zi !== ziCurenta) scurt.appendChild(buton(eticheta, "scurtatura", () => alege(zi)));
  }

  const cap = document.createElement("div");
  cap.className = "cap";
  const grila = document.createElement("div");
  grila.className = "grila";
  // appendChild, nu append: tipurile Workers (HTMLRewriter) suprascriu `Element.append`.
  panou.appendChild(scurt);
  panou.appendChild(cap);
  panou.appendChild(grila);

  let luna = lunaZilei(ziCurenta ?? azi);
  const randeaza = () => {
    const g = grilaLunii(luna);
    const titlu = document.createElement("strong");
    titlu.textContent = g.eticheta;
    const inapoi = buton("←", "luna", () => { luna = g.anterioara; randeaza(); });
    inapoi.setAttribute("aria-label", "Luna anterioară");
    const inainte = buton("→", "luna", () => { luna = g.urmatoare; randeaza(); });
    inainte.setAttribute("aria-label", "Luna următoare");
    cap.replaceChildren(inapoi, titlu, inainte);

    grila.replaceChildren();
    for (const z of ZILE_SAPTAMANA) {
      const s = document.createElement("span");
      s.className = "cap-zi";
      s.textContent = z;
      grila.appendChild(s);
    }
    for (const z of g.zile) {
      const b = buton(String(z.numar), "zi", () => alege(z.data));
      if (!z.inLuna) b.classList.add("alta-luna");
      if (z.data === azi) b.classList.add("azi");
      if (z.data === ziCurenta) {
        b.classList.add("blocata");
        b.disabled = true;
        b.title = "Ziua de pe care pleci";
      }
      grila.appendChild(b);
    }
  };
  randeaza();

  // Sub ancora, dar niciodata iesit din fereastra pe dreapta.
  document.body.appendChild(panou);
  const r = ancora.getBoundingClientRect();
  const stanga = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - panou.offsetWidth - 8));
  panou.style.top = `${r.bottom + window.scrollY + 6}px`;
  panou.style.left = `${stanga}px`;

  deschis = panou;
  document.addEventListener("mousedown", laClicAfara, true);
  document.addEventListener("keydown", laTasta, true);
  (scurt.querySelector("button") ?? grila.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
}
