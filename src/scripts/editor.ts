// Editorul pe client: salvare automata cu masina de stari, ciorna in localStorage ca plasa
// de siguranta, reincercare cu backoff, Ctrl/Cmd+S, previzualizare Markdown si crestere.
//
// Stari: curat (salvat) -> murdar (input) -> se-salveaza (timer/blur/ascundere/Ctrl+S)
//   -> curat (200) | conflict (409, autosave oprit) | offline / eroare (retea, 5xx; reincearca).
// Ciorna { titlu, corp, baza, la } se scrie la fiecare input si se sterge dupa 200.

import { randeazaMarkdown } from "../lib/markdown";

type Stare = "curat" | "murdar" | "se-salveaza" | "offline" | "eroare" | "conflict";

interface Ciorna { titlu?: string; corp: string; baza: string; la: string }
interface NotaApi { id: string; actualizat_la: string; corp: string; titlu: string | null }

const TEXTE: Record<Stare, string> = {
  curat: "salvat",
  murdar: "modificat…",
  "se-salveaza": "se salvează…",
  offline: "nesalvat, offline",
  eroare: "nesalvat, reîncerc…",
  conflict: "notița s-a schimbat în altă parte — reîncarcă",
};
const INTARZIERE = 800;
const BACKOFF = [5_000, 10_000, 20_000, 60_000];
const LIMITA_KEEPALIVE = 60_000;

function porneste(el: HTMLElement) {
  const id = el.dataset.id ?? "";
  let baza = el.dataset.actualizat ?? "";
  const CHEIE = `notite:ciorna:${id}`;

  const corp = el.querySelector<HTMLTextAreaElement>("textarea.corp");
  const titlu = el.querySelector<HTMLInputElement>("input.titlu");
  const stareEl = el.querySelector<HTMLElement>("#stare");
  const banner = el.querySelector<HTMLElement>("#banner");
  const previzualizare = el.querySelector<HTMLElement>("#previzualizare");
  const moduri = Array.from(el.querySelectorAll<HTMLButtonElement>("button.mod"));
  const sterge = el.querySelector<HTMLButtonElement>("button.sterge");
  if (!corp || !stareEl || !banner || !previzualizare) return;

  let stare: Stare = "curat";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reincercare: ReturnType<typeof setTimeout> | undefined;
  let dinNou = false;
  let incercari = 0;

  // --- stare si banner ---------------------------------------------------------------

  function seteaza(s: Stare, text?: string) {
    stare = s;
    stareEl!.textContent = text ?? TEXTE[s];
    stareEl!.className = "stare" + (s === "offline" || s === "eroare" ? " atentie" : s === "conflict" ? " problema" : "");
  }

  function arataBanner(text: string, actiuni: { text: string; fn: () => void }[]) {
    banner!.replaceChildren();
    const p = document.createElement("span");
    p.textContent = text;
    banner!.appendChild(p);
    for (const a of actiuni) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "buton";
      b.textContent = a.text;
      b.addEventListener("click", () => { ascundeBanner(); a.fn(); });
      banner!.appendChild(b);
    }
    banner!.hidden = false;
  }
  function ascundeBanner() { banner!.hidden = true; banner!.replaceChildren(); }

  // --- ciorna ------------------------------------------------------------------------

  function scrieCiorna() {
    const c: Ciorna = { corp: corp!.value, baza, la: new Date().toISOString() };
    if (titlu) c.titlu = titlu.value;
    try { localStorage.setItem(CHEIE, JSON.stringify(c)); } catch { /* spatiu plin sau blocat */ }
  }
  function citesteCiorna(): Ciorna | null {
    try {
      const brut = localStorage.getItem(CHEIE);
      if (!brut) return null;
      const c = JSON.parse(brut) as Ciorna;
      return typeof c?.corp === "string" && typeof c?.baza === "string" ? c : null;
    } catch { return null; }
  }
  function stergeCiorna() { try { localStorage.removeItem(CHEIE); } catch { /* ignorat */ } }
  function aplicaCiorna(c: Ciorna) {
    corp!.value = c.corp;
    if (titlu && typeof c.titlu === "string") titlu.value = c.titlu;
    creste();
  }
  function fmtMoment(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "mai devreme";
    return d.toLocaleString("ro-RO", { timeZone: "Europe/Chisinau", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  }

  // --- salvare -----------------------------------------------------------------------

  function programeaza() {
    clearTimeout(timer);
    timer = setTimeout(() => { void salveaza(); }, INTARZIERE);
  }

  function laInput() {
    if (stare === "conflict") return;
    scrieCiorna();
    if (stare === "se-salveaza") { dinNou = true; return; }
    seteaza("murdar");
    programeaza();
  }

  async function salveaza(opt: { keepalive?: boolean } = {}) {
    if (stare !== "murdar" && stare !== "offline" && stare !== "eroare") return;
    clearTimeout(timer);
    clearTimeout(reincercare);
    seteaza("se-salveaza");
    dinNou = false;

    const trimis: { corp: string; baza: string; titlu?: string } = { corp: corp!.value, baza };
    if (titlu) trimis.titlu = titlu.value;

    let res: Response;
    try {
      res = await fetch(`/api/notite/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trimis),
        keepalive: Boolean(opt.keepalive) && trimis.corp.length < LIMITA_KEEPALIVE,
      });
    } catch {
      seteaza(navigator.onLine === false ? "offline" : "eroare");
      planificaReincercare();
      return;
    }

    if (res.status === 200) {
      const { nota } = (await res.json()) as { nota: NotaApi };
      baza = nota.actualizat_la;
      el.dataset.actualizat = baza;
      incercari = 0;
      if (dinNou) { seteaza("murdar"); scrieCiorna(); programeaza(); }
      else { stergeCiorna(); seteaza("curat"); }
      return;
    }
    if (res.status === 409) {
      seteaza("conflict");
      arataBanner("Notița s-a schimbat în altă parte. Textul tău rămâne salvat local până reîncarci.", [
        { text: "Reîncarcă", fn: () => location.reload() },
      ]);
      return;
    }
    if (res.status >= 500) {
      seteaza("eroare");
      planificaReincercare();
      return;
    }
    // 4xx: problema in ce am trimis (ex. text prea lung). Nu reincercam automat.
    const j = (await res.json().catch(() => ({}))) as { eroare?: string };
    seteaza("murdar", `nesalvat: ${j.eroare ?? res.status}`);
    stareEl!.classList.add("problema");
  }

  function planificaReincercare() {
    const asteapta = BACKOFF[Math.min(incercari, BACKOFF.length - 1)] ?? 60_000;
    incercari++;
    clearTimeout(reincercare);
    reincercare = setTimeout(() => { void salveaza(); }, asteapta);
  }

  // --- previzualizare si crestere ----------------------------------------------------

  const areFieldSizing = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
  function creste() {
    if (areFieldSizing) return;
    corp!.style.height = "auto";
    corp!.style.height = `${corp!.scrollHeight}px`;
  }

  function comuta(mod: string) {
    const citeste = mod === "citeste";
    if (citeste) previzualizare!.innerHTML = randeazaMarkdown(corp!.value);
    previzualizare!.hidden = !citeste;
    corp!.hidden = citeste;
    for (const b of moduri) {
      const activ = b.dataset.mod === mod;
      b.classList.toggle("activ", activ);
      b.setAttribute("aria-pressed", String(activ));
    }
    if (!citeste) corp!.focus();
  }

  // --- evenimente --------------------------------------------------------------------

  corp.addEventListener("input", () => { laInput(); creste(); });
  titlu?.addEventListener("input", laInput);
  corp.addEventListener("blur", () => { if (stare === "murdar") void salveaza(); });
  titlu?.addEventListener("blur", () => { if (stare === "murdar") void salveaza(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && stare === "murdar") void salveaza({ keepalive: true });
  });
  window.addEventListener("pagehide", () => { if (stare === "murdar") void salveaza({ keepalive: true }); });
  window.addEventListener("online", () => {
    if (stare === "offline" || stare === "eroare") { clearTimeout(reincercare); void salveaza(); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (stare === "se-salveaza") dinNou = true;
      else void salveaza();
    }
  });
  for (const b of moduri) b.addEventListener("click", () => comuta(b.dataset.mod ?? "scrie"));

  sterge?.addEventListener("click", async () => {
    if (!confirm("Ștergi notița definitiv?")) return;
    const res = await fetch(`/api/notite/${id}`, { method: "DELETE" });
    if (res.status === 204 || res.status === 404) { stergeCiorna(); location.assign("/"); }
    else arataBanner("Nu am putut șterge notița.", [{ text: "Închide", fn: () => {} }]);
  });

  // --- la incarcare ------------------------------------------------------------------

  const ciorna = citesteCiorna();
  if (ciorna) {
    if (ciorna.baza === baza) {
      // Pagina nu s-a schimbat de cand am scris ciorna (ex. offline -> reload): o aplicam si salvam.
      aplicaCiorna(ciorna);
      seteaza("murdar");
      scrieCiorna();
      void salveaza();
    } else {
      arataBanner(`Ai o ciornă nesalvată de la ${fmtMoment(ciorna.la)}.`, [
        { text: "Folosește ciorna", fn: () => { aplicaCiorna(ciorna); seteaza("murdar"); scrieCiorna(); void salveaza(); } },
        { text: "Renunță", fn: stergeCiorna },
      ]);
    }
  }

  creste();
  if (el.dataset.focus === "1") {
    if (titlu && !titlu.value) {
      // Nota noua: incepem cu titlul.
      titlu.focus({ preventScroll: true });
    } else {
      const n = corp.value.length;
      corp.focus({ preventScroll: true });
      corp.setSelectionRange(n, n);
    }
  }
}

const editor = document.querySelector<HTMLElement>("section.editor");
if (editor) porneste(editor);
