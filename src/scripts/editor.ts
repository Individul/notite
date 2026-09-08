// Editorul pe client: salvare automata cu masina de stari, ciorna in localStorage ca plasa
// de siguranta, reincercare cu backoff, Ctrl/Cmd+S, previzualizare Markdown si crestere.
//
// Stari: curat (salvat) -> murdar (input) -> se-salveaza (timer/blur/ascundere/Ctrl+S)
//   -> curat (200) | conflict (409, autosave oprit) | offline / eroare (retea, 5xx; reincearca).
// Ciorna { titlu, corp, baza, la } se scrie la fiecare input si se sterge dupa 200.

import { comutaSarcina, randeazaMarkdown } from "../lib/markdown";

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

// Inceputul unui element de lista, cu bifa optionala: ce inlocuiesc butoanele „Listă” si „Sarcină”.
const INCEPUT_ELEMENT = /^(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?/;
// Acelasi lucru plus titlurile: marcajele de inceput de linie peste care bold/italic nu trec.
const INCEPUT_LINIE = /^(?:#{1,3}\s+|(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?)/;
// Ce inseamna, pentru fiecare buton, ca prefixul gasit e chiar al lui si deci se scoate.
const ARE_LISTA = /^(?:[-*]|\d+\.)\s+$/;
const ARE_SARCINA = /^(?:[-*]|\d+\.)\s+\[[ xX]\]\s+$/;

function porneste(el: HTMLElement) {
  const id = el.dataset.id ?? "";
  let baza = el.dataset.actualizat ?? "";
  const CHEIE = `notite:ciorna:${id}`;

  const corp = el.querySelector<HTMLTextAreaElement>("textarea.corp");
  const titlu = el.querySelector<HTMLInputElement>("input.titlu");
  const stareEl = el.querySelector<HTMLElement>("#stare");
  const banner = el.querySelector<HTMLElement>("#banner");
  const previzualizare = el.querySelector<HTMLElement>("#previzualizare");
  const comutator = el.querySelector<HTMLButtonElement>("button.comutator");
  const formatare = el.querySelector<HTMLElement>(".formatare");
  const butoaneFmt = Array.from(el.querySelectorAll<HTMLButtonElement>("button.fmt"));
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
    if (citeste) {
      previzualizare!.innerHTML = randeazaMarkdown(corp!.value);
      // Randarea le da `disabled`; aici, unde bifa se poate scrie inapoi in text, le activam.
      for (const c of previzualizare!.querySelectorAll<HTMLInputElement>("input[data-linie]")) c.disabled = false;
    }
    previzualizare!.hidden = !citeste;
    corp!.hidden = citeste;
    if (formatare) formatare.hidden = citeste;
    if (comutator) {
      comutator.dataset.mod = citeste ? "scrie" : "citeste";
      comutator.classList.toggle("citind", citeste);
      const text = comutator.querySelector(".text");
      if (text) text.textContent = citeste ? "Scrie" : "Citește";
    }
    if (!citeste) corp!.focus();
  }

  // --- sarcini si formatare ----------------------------------------------------------

  // Schimba o singura linie (bifarea unei sarcini din previzualizare, cu textarea ascunsa).
  function schimbaLinie(nr: number, transforma: (l: string) => string) {
    const linii = corp!.value.split("\n");
    const veche = linii[nr];
    if (veche === undefined) return;
    const noua = transforma(veche);
    if (noua === veche) return;
    linii[nr] = noua;
    corp!.value = linii.join("\n");
    laInput();
    creste();
  }

  // Inlocuieste [start, sfarsit) si lasa cursorul intre selStart si selEnd. execCommand
  // pastreaza istoricul de undo si declanseaza singur `input`; setRangeText e plasa de rezerva.
  function inlocuieste(start: number, sfarsit: number, text: string, selStart: number, selEnd: number) {
    corp!.focus({ preventScroll: true });
    corp!.setSelectionRange(start, sfarsit);
    let prinComanda = false;
    try { prinComanda = document.execCommand("insertText", false, text); } catch { prinComanda = false; }
    if (!prinComanda) {
      corp!.setRangeText(text, start, sfarsit, "end");
      laInput();
      creste();
    }
    corp!.setSelectionRange(selStart, selEnd);
  }

  // Cate stelute la rand sunt lipite de pozitia p (inapoi, spre stanga, sau inainte).
  function stelute(v: string, p: number, inapoi: boolean): number {
    let n = 0;
    while (inapoi ? v[p - 1 - n] === "*" : v[p + n] === "*") n++;
    return n;
  }

  // Bold / italic: incadreaza selectia, sau scoate marcajele daca sunt deja acolo.
  function incadreaza(marca: string) {
    const v = corp!.value;
    const n = marca.length;
    let s = corp!.selectionStart;
    let e = corp!.selectionEnd;

    // Marcajul de inceput de linie ramane pe dinafara: `**- [ ] x**` n-ar mai fi sarcina,
    // iar `**## x**` n-ar mai fi titlu. La fel, nu inghitim spatiile de la capete, fiindca
    // `** x **` nu se randeaza ca ingrosat.
    const inceputLinie = v.lastIndexOf("\n", s - 1) + 1;
    const prefix = v.slice(inceputLinie).match(INCEPUT_LINIE)?.[0] ?? "";
    if (s < inceputLinie + prefix.length) s = Math.min(inceputLinie + prefix.length, e);
    while (s < e && /\s/.test(v[s] ?? "")) s++;
    while (e > s && /\s/.test(v[e - 1] ?? "")) e--;

    const selectat = v.slice(s, e);

    // Marcajele sunt in selectie (s-a selectat `**text**` cu tot cu stelute).
    if (selectat.length >= 2 * n && selectat.startsWith(marca) && selectat.endsWith(marca)) {
      const interior = selectat.slice(n, -n);
      inlocuieste(s, e, interior, s, s + interior.length);
      return;
    }

    // Marcajele sunt in jurul selectiei. Numaram sirul de stelute de-o parte si de alta,
    // ca italicul sa nu ciupeasca o steluta din `**`: pe text ingrosat trebuie sa adauge,
    // si sa iasa `***text***`.
    const inainte = stelute(v, s, true);
    const dupa = stelute(v, e, false);
    const desface = marca === "*" ? inainte % 2 === 1 && dupa % 2 === 1 : inainte >= 2 && dupa >= 2;
    if (desface) {
      inlocuieste(s - n, e + n, selectat, s - n, s - n + selectat.length);
      return;
    }

    inlocuieste(s, e, marca + selectat + marca, s + n, s + n + selectat.length);
  }

  // Titlu / lista / sarcina: pune marcajul pe fiecare linie atinsa de selectie. Daca toate
  // il au deja exact pe el, butonul il scoate; daca au altul din familie, il inlocuieste.
  function prefixeaza(marca: string, tipar: RegExp, are: RegExp) {
    const v = corp!.value;
    const start = v.lastIndexOf("\n", corp!.selectionStart - 1) + 1;
    const capat = v.indexOf("\n", corp!.selectionEnd);
    const sfarsit = capat === -1 ? v.length : capat;

    const linii = v.slice(start, sfarsit).split("\n");
    const prefixe = linii.map((l) => l.match(tipar)?.[0] ?? "");
    const scoatem = prefixe.every((p) => are.test(p));
    const text = linii
      .map((l, k) => {
        const rest = l.slice((prefixe[k] ?? "").length);
        return scoatem ? rest : marca + rest;
      })
      .join("\n");
    inlocuieste(start, sfarsit, text, start, start + text.length);
  }

  const ACTIUNI: Record<string, () => void> = {
    titlu: () => prefixeaza("## ", /^#{1,3}\s+/, /^## $/),
    bold: () => incadreaza("**"),
    italic: () => incadreaza("*"),
    lista: () => prefixeaza("- ", INCEPUT_ELEMENT, ARE_LISTA),
    sarcina: () => prefixeaza("- [ ] ", INCEPUT_ELEMENT, ARE_SARCINA),
  };

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
    if (!e.ctrlKey && !e.metaKey) return;
    const tasta = e.key.toLowerCase();
    if (tasta === "s") {
      e.preventDefault();
      if (stare === "se-salveaza") dinNou = true;
      else void salveaza();
    } else if ((tasta === "b" || tasta === "i") && document.activeElement === corp) {
      e.preventDefault();
      incadreaza(tasta === "b" ? "**" : "*");
    }
  });
  comutator?.addEventListener("click", () => comuta(comutator.dataset.mod ?? "scrie"));

  for (const b of butoaneFmt) {
    // mousedown: fara asta, apasarea butonului scoate focusul din textarea si pierde selectia.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => ACTIUNI[b.dataset.fmt ?? ""]?.());
  }

  // Bifarea unei sarcini din previzualizare scrie inapoi in linia din text.
  previzualizare.addEventListener("change", (e) => {
    const casuta = e.target;
    if (!(casuta instanceof HTMLInputElement)) return;
    const nr = Number(casuta.dataset.linie);
    if (!Number.isInteger(nr)) return;
    schimbaLinie(nr, comutaSarcina);
    casuta.closest("li")?.classList.toggle("gata", casuta.checked);
  });

  sterge?.addEventListener("click", async () => {
    if (!confirm("Ștergi notița definitiv?")) return;
    const res = await fetch(`/api/notite/${id}`, { method: "DELETE" });
    if (res.status === 204 || res.status === 404) { stergeCiorna(); location.assign("/"); }
    else arataBanner("Nu am putut șterge notița.", [{ text: "Închide", fn: () => {} }]);
  });

  // --- la incarcare ------------------------------------------------------------------

  // Abia acum indicatorul poate spune „salvat”: pana aici serverul a randat „se încarcă…”,
  // ca o notita pe care nimeni n-o salveaza sa nu para salvata. `pornit` opreste si paznicul
  // din pagina, care altfel anunta ca editorul n-a ajuns.
  el.dataset.pornit = "1";
  seteaza("curat");

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
