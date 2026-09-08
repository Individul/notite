// Previzualizare vie pentru CodeMirror: textul din editor ramane Markdown curat, dar
// marcajele se ascund si textul se stilizeaza, ca notita sa arate citita in timp ce o scrii.
// Pe linia unde sta cursorul marcajele reapar, ca sa le poti edita.
//
// Decoram doar ce stie aplicatia: titluri #, ## si ###, ingrosat, cursiv, cod, linkuri,
// liste si sarcini. Ce nu e in aceasta lista (citate, tabele, #### si mai jos) ramane text
// simplu, ca editorul sa nu promita ce notita nu randeaza.

import { defineLanguageFacet, Language, languageDataProp, syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { parser as parserMd, TaskList } from "@lezer/markdown";

// Limbajul e construit direct pe parserul din @lezer/markdown, nu pe @codemirror/lang-markdown:
// acela aduce dupa el parserele de HTML, CSS si JavaScript, pentru evidentierea blocurilor de
// cod, de care notitele n-au nevoie. Din GFM luam doar sarcinile — restul (tabele, taiat,
// autolink) nu e in ce randeaza aplicatia.
const dateMarkdown = defineLanguageFacet({});
export const limbaNotite = new Language(
  dateMarkdown,
  parserMd.configure([TaskList, { props: [languageDataProp.add(() => dateMarkdown)] }]),
  [],
  "markdown"
);

const TITLURI: Record<string, string> = {
  ATXHeading1: "cm-titlu1",
  ATXHeading2: "cm-titlu2",
  ATXHeading3: "cm-titlu3",
};

const ascunde = Decoration.replace({});
const semnSters = Decoration.mark({ class: "cm-semn" });

// Casuta unei sarcini: inlocuieste `[ ]` / `[x]` din text. Clicul scrie inapoi in document,
// deci se salveaza pe drumul obisnuit, ca orice tastare.
class Casuta extends WidgetType {
  constructor(readonly bifat: boolean) {
    super();
  }

  eq(alta: Casuta): boolean {
    return alta.bifat === this.bifat;
  }

  toDOM(vedere: EditorView): HTMLElement {
    const c = document.createElement("input");
    c.type = "checkbox";
    c.className = "cm-casuta";
    c.checked = this.bifat;
    c.setAttribute("aria-label", this.bifat ? "Sarcină făcută" : "Sarcină de făcut");
    c.addEventListener("mousedown", (ev) => ev.preventDefault());
    c.addEventListener("click", (ev) => {
      ev.preventDefault();
      // Pozitia se citeste din DOM, ca sa fie cea de acum, nu cea de la crearea widgetului.
      const poz = vedere.posAtDOM(c);
      const semn = vedere.state.doc.sliceString(poz + 1, poz + 2);
      vedere.dispatch({ changes: { from: poz + 1, to: poz + 2, insert: semn === " " ? "x" : " " } });
    });
    return c;
  }
}

// Bulina care ia locul lui `-` la listele neordonate.
class Bulina extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const s = document.createElement("span");
    s.className = "cm-bulina";
    s.textContent = "•";
    return s;
  }
}

const bulina = Decoration.replace({ widget: new Bulina() });

// Liniile atinse de cursor sau de selectie: acolo marcajele raman vizibile.
function liniiCuCursor(stare: EditorState): Set<number> {
  const linii = new Set<number>();
  for (const r of stare.selection.ranges) {
    const prima = stare.doc.lineAt(r.from).number;
    const ultima = stare.doc.lineAt(r.to).number;
    for (let i = prima; i <= ultima; i++) linii.add(i);
  }
  return linii;
}

function decoratii(vedere: EditorView): DecorationSet {
  const bucati: Range<Decoration>[] = [];
  const stare = vedere.state;
  const doc = stare.doc;
  const active = liniiCuCursor(stare);
  const liber = (poz: number) => !active.has(doc.lineAt(poz).number);
  const inceputLinie = (poz: number) => doc.lineAt(poz).from;

  for (const vizibil of vedere.visibleRanges) {
    syntaxTree(stare).iterate({
      from: vizibil.from,
      to: vizibil.to,
      enter: (n) => {
        const clasaTitlu = TITLURI[n.name];
        if (clasaTitlu) {
          bucati.push(Decoration.line({ class: clasaTitlu }).range(inceputLinie(n.from)));
          return;
        }

        switch (n.name) {
          case "StrongEmphasis":
            bucati.push(Decoration.mark({ class: "cm-tare" }).range(n.from, n.to));
            break;
          case "Emphasis":
            bucati.push(Decoration.mark({ class: "cm-aplecat" }).range(n.from, n.to));
            break;
          case "InlineCode":
            bucati.push(Decoration.mark({ class: "cm-cod" }).range(n.from, n.to));
            break;
          case "Link":
            bucati.push(Decoration.mark({ class: "cm-link" }).range(n.from, n.to));
            break;

          case "HeaderMark": {
            // Doar la titlurile pe care notita le randeaza; `#### x` ramane text simplu.
            if (!TITLURI[n.node.parent?.name ?? ""]) break;
            if (!liber(n.from)) break;
            // Inghitim si spatiul de dupa, altfel titlul incepe cu un gol.
            const pana = doc.sliceString(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
            bucati.push(ascunde.range(n.from, pana));
            break;
          }

          case "CodeMark":
            // Gardurile unui bloc ``` nu se ascund: fara ele blocul n-ar avea inceput si sfarsit.
            if (n.node.parent?.name === "FencedCode") bucati.push(semnSters.range(n.from, n.to));
            else if (liber(n.from)) bucati.push(ascunde.range(n.from, n.to));
            break;

          case "EmphasisMark":
          case "LinkMark":
          case "URL":
            if (liber(n.from)) bucati.push(ascunde.range(n.from, n.to));
            break;

          case "FencedCode":
            for (let p = n.from; p <= n.to; ) {
              const linie = doc.lineAt(p);
              bucati.push(Decoration.line({ class: "cm-bloc" }).range(linie.from));
              p = linie.to + 1;
            }
            break;

          case "TaskMarker": {
            const bifat = doc.sliceString(n.from + 1, n.from + 2) !== " ";
            bucati.push(Decoration.replace({ widget: new Casuta(bifat) }).range(n.from, n.to));
            if (bifat) {
              // Taierea merge pe text, nu pe toata linia: altfel linia trece si peste casuta.
              const linie = doc.lineAt(n.from);
              const de = doc.sliceString(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
              if (de < linie.to) bucati.push(Decoration.mark({ class: "cm-gata" }).range(de, linie.to));
            }
            break;
          }

          case "ListMark": {
            if (n.node.parent?.parent?.name !== "BulletList") break;
            // Spre deosebire de celelalte marcaje, asta ramane randat si pe linia cu
            // cursorul. Pe `##` sau `**` dezvaluirea e utila, fiindca altfel n-ai cum sa
            // vezi ori sa schimbi sintaxa; aici bulina — sau casuta, la o sarcina — spune
            // deja tot ce spune si `-`, asa ca aparitia lui doar sare in ochi.
            const eSarcina = /^\s\[[ xX]\]/.test(doc.sliceString(n.to, n.to + 4));
            bucati.push((eSarcina ? ascunde : bulina).range(n.from, n.to));
            break;
          }
        }
      },
    });
  }

  return Decoration.set(bucati, true);
}

// Aspectul editorului si al decoratiilor. Foloseste aceiasi tokeni ca restul aplicatiei,
// deci ce vezi cand scrii arata ca textul randat.
export const tema = EditorView.theme(
  {
    "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "17px" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--body)", lineHeight: "1.6" },
    ".cm-content": { padding: "4px 0", minHeight: "50vh", caretColor: "var(--text)" },
    ".cm-line": { padding: "0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)", borderLeftWidth: "2px" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(179, 147, 242, 0.32)",
    },
    ".cm-placeholder": { color: "var(--faint)" },

    ".cm-titlu1, .cm-titlu2, .cm-titlu3": {
      fontFamily: "var(--display)",
      fontWeight: "600",
      letterSpacing: "-0.01em",
      lineHeight: "1.25",
    },
    ".cm-titlu1": { fontSize: "28px" },
    ".cm-titlu2": { fontSize: "22px" },
    ".cm-titlu3": { fontSize: "18px" },

    ".cm-tare": { fontWeight: "700", color: "var(--text)" },
    ".cm-aplecat": { fontStyle: "italic" },
    ".cm-cod": {
      fontFamily: "var(--mono)",
      fontSize: "0.9em",
      background: "var(--line)",
      padding: "1px 5px",
      borderRadius: "5px",
    },
    ".cm-link": { color: "var(--teal)", textDecoration: "underline", textUnderlineOffset: "3px" },
    ".cm-semn": { color: "var(--faint)" },
    ".cm-bulina": { color: "var(--violet)", paddingRight: "2px" },
    ".cm-bloc": { fontFamily: "var(--mono)", fontSize: "14px", background: "var(--bg-2)" },
    ".cm-gata": { color: "var(--faint)", textDecoration: "line-through", textDecorationThickness: "1px" },

    ".cm-casuta": {
      WebkitAppearance: "none",
      appearance: "none",
      position: "relative",
      display: "inline-block",
      width: "15px",
      height: "15px",
      margin: "0 7px 0 0",
      padding: "0",
      verticalAlign: "-2px",
      border: "1.5px solid var(--faint)",
      borderRadius: "5px",
      background: "transparent",
      cursor: "pointer",
    },
    ".cm-casuta:hover": { borderColor: "var(--violet)" },
    ".cm-casuta:checked": { background: "var(--violet)", borderColor: "var(--violet)" },
    ".cm-casuta:checked::before": {
      content: '""',
      position: "absolute",
      left: "3.8px",
      top: "1.4px",
      width: "3.2px",
      height: "7px",
      border: "solid var(--bg)",
      borderWidth: "0 2px 2px 0",
      transform: "rotate(45deg)",
    },
  },
  { dark: true }
);

export const previzualizareVie = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(vedere: EditorView) {
      this.decorations = decoratii(vedere);
    }

    update(u: ViewUpdate) {
      // Si la mutarea cursorului (marcajele de pe linia lui trebuie sa reapara), si cand
      // analiza sintactica de fundal mai inainteaza: la prima randare arborele poate fi
      // inca incomplet spre coada documentului.
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.decorations = decoratii(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
