// Editorul pe client: CodeMirror cu previzualizare vie (vezi scripts/vizual.ts), peste
// aceeasi salvare automata ca inainte — masina de stari, ciorna in localStorage ca plasa
// de siguranta, reincercare cu backoff, Ctrl/Cmd+S.
//
// Stari: curat (salvat) -> murdar (input) -> se-salveaza (timer/blur/ascundere/Ctrl+S)
//   -> curat (200) | conflict (409, autosave oprit) | offline / eroare (retea, 5xx; reincearca).
// Ciorna { titlu, corp, baza, la } se scrie la fiecare input si se sterge dupa 200.
//
// Documentul din CodeMirror *este* textul Markdown, deci salvarea trimite acelasi lucru ca
// pana acum: D1, cautarea si API-ul raman neatinse.

import { history, historyKeymap, standardKeymap } from "@codemirror/commands";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { fmtZi } from "../lib/data";
import { inBlocDeCod, laEnter } from "../lib/sarcini";
import { deschideMutare } from "./mutare";
import { limbaNotite, previzualizareVie, tema } from "./vizual";

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
// Marcajul cu care porneste orice rand nou.
const MARCAJ_SARCINA = "- [ ] ";

function porneste(el: HTMLElement) {
  const id = el.dataset.id ?? "";
  // Ziua notitei (lipseste la notele durabile): calendarul de mutare o blocheaza.
  const ziNotei = el.dataset.zi ?? null;
  let baza = el.dataset.actualizat ?? "";
  const CHEIE = `notite:ciorna:${id}`;

  const camp = el.querySelector<HTMLTextAreaElement>("textarea.corp");
  const titlu = el.querySelector<HTMLInputElement>("input.titlu");
  const stareEl = el.querySelector<HTMLElement>("#stare");
  const banner = el.querySelector<HTMLElement>("#banner");
  const butoaneFmt = Array.from(el.querySelectorAll<HTMLButtonElement>("button.fmt"));
  const sterge = el.querySelector<HTMLButtonElement>("button.sterge");
  if (!camp || !stareEl || !banner) return;

  let stare: Stare = "curat";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reincercare: ReturnType<typeof setTimeout> | undefined;
  let dinNou = false;
  let incercari = 0;

  // --- editorul ----------------------------------------------------------------------

  // Textarea ramane in pagina ca temelie fara JavaScript; CodeMirror ii ia locul aici.
  const gazda = document.createElement("div");
  gazda.className = "scriitor";
  camp.parentNode?.insertBefore(gazda, camp);
  camp.hidden = true;

  const vedere = new EditorView({
    doc: camp.value,
    parent: gazda,
    extensions: [
      history(),
      keymap.of([
        { key: "Mod-b", preventDefault: true, run: () => (incadreaza("**"), true) },
        { key: "Mod-i", preventDefault: true, run: () => (incadreaza("*"), true) },
        { key: "Enter", run: randNou },
        ...standardKeymap,
        ...historyKeymap,
      ]),
      // Prima tasta intr-o notita goala deschide direct o sarcina.
      EditorView.inputHandler.of((v, _de, _la, tastat) => {
        if (v.state.doc.length !== 0 || tastat === "" || tastat.includes("\n")) return false;
        const insert = MARCAJ_SARCINA + tastat;
        v.dispatch({ changes: { from: 0, insert }, selection: { anchor: insert.length }, userEvent: "input.type" });
        return true;
      }),
      EditorView.lineWrapping,
      limbaNotite,
      previzualizareVie,
      tema,
      placeholder("Scrie aici…"),
      EditorView.contentAttributes.of({ "aria-label": "Textul notiței", spellcheck: "true", autocapitalize: "sentences" }),
      // Schimbarile venite de la o mutare sunt deja salvate pe server: nu le mai trimitem.
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((t) => t.isUserEvent("muta"))) laInput();
      }),
    ],
  });

  const text = () => vedere.state.doc.toString();

  // --- stare si banner ---------------------------------------------------------------

  function seteaza(s: Stare, mesaj?: string) {
    stare = s;
    stareEl!.textContent = mesaj ?? TEXTE[s];
    stareEl!.className = "stare" + (s === "offline" || s === "eroare" ? " atentie" : s === "conflict" ? " problema" : "");
  }

  function arataBanner(mesaj: string, actiuni: { text: string; fn: () => void }[]) {
    banner!.replaceChildren();
    const p = document.createElement("span");
    p.textContent = mesaj;
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
    const c: Ciorna = { corp: text(), baza, la: new Date().toISOString() };
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
    vedere.dispatch({ changes: { from: 0, to: vedere.state.doc.length, insert: c.corp } });
    if (titlu && typeof c.titlu === "string") titlu.value = c.titlu;
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

    const trimis: { corp: string; baza: string; titlu?: string } = { corp: text(), baza };
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

  // --- formatare ---------------------------------------------------------------------

  // Inlocuieste [start, sfarsit) si lasa cursorul intre selStart si selEnd. Tranzactia
  // intra in istoricul CodeMirror, deci Ctrl+Z desface exact acest pas.
  function inlocuieste(start: number, sfarsit: number, insert: string, selStart: number, selEnd: number) {
    vedere.dispatch({
      changes: { from: start, to: sfarsit, insert },
      selection: { anchor: selStart, head: selEnd },
      scrollIntoView: true,
    });
    vedere.focus();
  }

  // Cate stelute la rand sunt lipite de pozitia p (inapoi, spre stanga, sau inainte).
  function stelute(v: string, p: number, inapoi: boolean): number {
    let n = 0;
    while (inapoi ? v[p - 1 - n] === "*" : v[p + n] === "*") n++;
    return n;
  }

  // Bold / italic: incadreaza selectia, sau scoate marcajele daca sunt deja acolo.
  function incadreaza(marca: string) {
    const v = text();
    const n = marca.length;
    let s = vedere.state.selection.main.from;
    let e = vedere.state.selection.main.to;

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

  // Enter: randul urmator porneste ca sarcina, iar un element gol se goleste in loc sa se
  // inmulteasca. Regula e in lib/sarcini.ts, ca sa poata fi testata fara editor.
  function randNou(): boolean {
    const sel = vedere.state.selection.main;
    const linie = vedere.state.doc.lineAt(sel.from);
    // Pozitia, nu inceputul liniei: gardul de ``` chiar tastat trebuie sa se numere.
    const r = laEnter(linie.text, inBlocDeCod(text(), sel.from));
    // Golirea elementului are sens doar cand nu e nimic selectat; altfel Enter inlocuieste
    // selectia, ca in orice editor, dar tot cu un rand de sarcina.
    if (r.fel === "iesi" && sel.empty) {
      inlocuieste(linie.from, linie.from + r.taie, "", linie.from, linie.from);
      return true;
    }
    const insert = "\n" + (r.fel === "continua" ? r.marcaj : "");
    const capat = sel.from + insert.length;
    inlocuieste(sel.from, sel.to, insert, capat, capat);
    return true;
  }

  // --- mutarea unei sarcini pe alta zi ----------------------------------------------

  // Butonul discret de la capatul sarcinii (vizual.ts) anunta pozitia; de aici deschidem
  // calendarul si, la alegere, cerem serverului sa mute randul. Serverul scrie ambele
  // notite; noi doar scoatem randul de pe ecran, fara alta salvare.
  gazda.addEventListener("notite:muta", (e) => {
    const { pozitie, ancora } = (e as CustomEvent<{ pozitie: number; ancora: HTMLElement }>).detail;
    const linie = vedere.state.doc.lineAt(pozitie);
    deschideMutare(ancora, ziNotei, (zi) => { void muta(linie.number - 1, linie.text, zi); });
  });

  // Serverul lucreaza pe textul salvat, deci intai golim ce e nesalvat.
  async function asteaptaSalvarea(): Promise<boolean> {
    if (stare === "murdar" || stare === "offline" || stare === "eroare") await salveaza();
    for (let i = 0; i < 30 && stare === "se-salveaza"; i++) await new Promise((r) => setTimeout(r, 100));
    return stare === "curat";
  }

  async function muta(index: number, textLinie: string, zi: string) {
    if (!(await asteaptaSalvarea())) {
      arataBanner("Nu am putut salva notița, așa că sarcina a rămas pe loc.", [{ text: "Închide", fn: () => {} }]);
      return;
    }
    let res: Response;
    try {
      res = await fetch(`/api/notite/${id}/muta`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linie: index, text: textLinie, zi, baza }),
      });
    } catch {
      arataBanner("Fără net: sarcina a rămas pe loc.", [{ text: "Închide", fn: () => {} }]);
      return;
    }
    if (res.status === 200) {
      const { nota } = (await res.json()) as { nota: NotaApi };
      // Scoatem randul exact, ca selectia sa ramana pe loc; daca totusi textul difera de al
      // serverului (n-ar trebui), luam versiunea lui.
      const l = vedere.state.doc.line(index + 1);
      const pana = l.to < vedere.state.doc.length ? l.to + 1 : l.to;
      const dela = l.to === vedere.state.doc.length && l.from > 0 ? l.from - 1 : l.from;
      vedere.dispatch({ changes: { from: dela, to: pana, insert: "" }, userEvent: "muta" });
      if (text() !== nota.corp) {
        vedere.dispatch({ changes: { from: 0, to: vedere.state.doc.length, insert: nota.corp }, userEvent: "muta" });
      }
      baza = nota.actualizat_la;
      el.dataset.actualizat = baza;
      stergeCiorna();
      seteaza("curat", `mutată pe ${fmtZi(zi)}`);
      setTimeout(() => { if (stare === "curat") seteaza("curat"); }, 2500);
      return;
    }
    if (res.status === 409) {
      seteaza("conflict");
      arataBanner("Notița s-a schimbat în altă parte. Reîncarcă, apoi mută din nou.", [
        { text: "Reîncarcă", fn: () => location.reload() },
      ]);
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { eroare?: string };
    arataBanner(`Nu am putut muta sarcina: ${j.eroare ?? res.status}.`, [{ text: "Închide", fn: () => {} }]);
  }

  // Titlu / lista / sarcina: pune marcajul pe fiecare linie atinsa de selectie. Daca toate
  // il au deja exact pe el, butonul il scoate; daca au altul din familie, il inlocuieste.
  function prefixeaza(marca: string, tipar: RegExp, are: RegExp) {
    const v = text();
    const start = v.lastIndexOf("\n", vedere.state.selection.main.from - 1) + 1;
    const capat = v.indexOf("\n", vedere.state.selection.main.to);
    const sfarsit = capat === -1 ? v.length : capat;

    const linii = v.slice(start, sfarsit).split("\n");
    const prefixe = linii.map((l) => l.match(tipar)?.[0] ?? "");
    const scoatem = prefixe.every((p) => are.test(p));
    const insert = linii
      .map((l, k) => {
        const rest = l.slice((prefixe[k] ?? "").length);
        return scoatem ? rest : marca + rest;
      })
      .join("\n");
    inlocuieste(start, sfarsit, insert, start, start + insert.length);
  }

  const ACTIUNI: Record<string, () => void> = {
    titlu: () => prefixeaza("## ", /^#{1,3}\s+/, /^## $/),
    bold: () => incadreaza("**"),
    italic: () => incadreaza("*"),
    lista: () => prefixeaza("- ", INCEPUT_ELEMENT, ARE_LISTA),
    sarcina: () => prefixeaza("- [ ] ", INCEPUT_ELEMENT, ARE_SARCINA),
  };

  // --- evenimente --------------------------------------------------------------------

  vedere.contentDOM.addEventListener("blur", () => { if (stare === "murdar") void salveaza(); });
  titlu?.addEventListener("input", laInput);
  titlu?.addEventListener("blur", () => { if (stare === "murdar") void salveaza(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && stare === "murdar") void salveaza({ keepalive: true });
  });
  window.addEventListener("pagehide", () => { if (stare === "murdar") void salveaza({ keepalive: true }); });
  window.addEventListener("online", () => {
    if (stare === "offline" || stare === "eroare") { clearTimeout(reincercare); void salveaza(); }
  });
  // Ctrl/Cmd+S la nivel de document, ca sa mearga si din campul de titlu.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (stare === "se-salveaza") dinNou = true;
      else void salveaza();
    }
  });

  for (const b of butoaneFmt) {
    // mousedown: fara asta, apasarea butonului scoate focusul din editor si pierde selectia.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => ACTIUNI[b.dataset.fmt ?? ""]?.());
  }

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
      void salveaza();
    } else {
      arataBanner(`Ai o ciornă nesalvată de la ${fmtMoment(ciorna.la)}.`, [
        { text: "Folosește ciorna", fn: () => { aplicaCiorna(ciorna); void salveaza(); } },
        { text: "Renunță", fn: stergeCiorna },
      ]);
    }
  }

  if (el.dataset.focus === "1") {
    if (titlu && !titlu.value) {
      // Nota noua: incepem cu titlul.
      titlu.focus({ preventScroll: true });
    } else {
      const n = vedere.state.doc.length;
      vedere.dispatch({ selection: { anchor: n } });
      vedere.focus();
    }
  }
}

const editor = document.querySelector<HTMLElement>("section.editor");
if (editor) porneste(editor);
