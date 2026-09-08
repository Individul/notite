// Comutatorul de tema. Implicit urmam sistemul (fara `data-tema` pe <html>); la primul
// clic fixam o tema si o tinem minte. Aplicarea la incarcare o face scriptul inline din
// Base.astro, inainte de prima pictura.

type Tema = "luminos" | "intunecat";

const CHEIE = "notite:tema";
const FUNDAL: Record<Tema, string> = { luminos: "#FBFAFD", intunecat: "#16121D" };

function temaEfectiva(): Tema {
  const aleasa = document.documentElement.dataset.tema;
  if (aleasa === "luminos" || aleasa === "intunecat") return aleasa;
  return matchMedia("(prefers-color-scheme: light)").matches ? "luminos" : "intunecat";
}

function aplica(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", FUNDAL[tema]);
  try { localStorage.setItem(CHEIE, tema); } catch { /* stocare plina sau blocata */ }
}

document.querySelector<HTMLButtonElement>("#comuta-tema")?.addEventListener("click", () => {
  aplica(temaEfectiva() === "luminos" ? "intunecat" : "luminos");
});
