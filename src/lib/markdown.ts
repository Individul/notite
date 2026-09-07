// Randare Markdown minimala, scrisa de mana, fara biblioteca. Folosita si pe server
// (cautare, previzualizare initiala) si pe client (previzualizare live), deci fara DOM.
//
// Regula de siguranta: fiecare bucata de text trece prin escapeHtml INAINTE de
// regulile inline, iar URL-urile sunt acceptate doar cu https?://, mailto: sau /.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_SIGUR = /^(https?:\/\/|mailto:|\/)/i;
// Un caracter de URL in text deja escapat: fara spatii, `<`, `)` sau ghilimele (care apar
// ca entitati &quot; / &#39;). `&amp;` ramane, ca `?a=1&b=2` sa functioneze.
const CAR_URL = String.raw`(?:[^\s<&)]|&(?!quot;|#39;))`;
const LINK_EXPLICIT = new RegExp(String.raw`\[([^\]]+)\]\((${CAR_URL}+)\)`, "g");
const AUTOLINK = new RegExp(String.raw`(^|[\s(])(https?:\/\/${CAR_URL}+)`, "g");
// Delimitator pentru substituiri temporare; nu poate aparea in text (escapeHtml nu il produce,
// iar utilizatorul nu il tasteaza).
const SEP = String.fromCharCode(0);

function ancora(hrefEscapat: string, textEscapat: string): string {
  return `<a href="${hrefEscapat}" target="_blank" rel="noopener noreferrer">${textEscapat}</a>`;
}

// Text deja escapat -> HTML inline. Linkurile sunt scoase in substituiri ca autolinkul
// si bold/italic sa nu le atinga, apoi puse la loc.
function inlineText(t: string): string {
  const sub: string[] = [];
  const pastreaza = (html: string) => `${SEP}${sub.push(html) - 1}${SEP}`;

  t = t.replace(LINK_EXPLICIT, (tot, text: string, url: string) =>
    URL_SIGUR.test(url) ? pastreaza(ancora(url, text)) : tot
  );
  t = t.replace(AUTOLINK, (_tot, inainte: string, url: string) => {
    const coada = url.match(/[.,;:!?]+$/)?.[0] ?? "";
    const curat = url.slice(0, url.length - coada.length);
    return inainte + pastreaza(ancora(curat, curat)) + coada;
  });
  t = t.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(\S(?:.*?\S)?)\*/g, "<em>$1</em>");
  t = t.replace(/(^|[^\p{L}\p{N}_])_(\S(?:.*?\S)?)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");

  return t.replace(new RegExp(`${SEP}(\\d+)${SEP}`, "g"), (_tot, i: string) => sub[Number(i)] ?? "");
}

// Bucata bruta de text -> HTML inline. Codul inline se escapeaza si atat.
export function inline(brut: string): string {
  const parti = brut.split(/(`[^`]+`)/);
  return parti
    .map((p, i) =>
      i % 2 === 1 ? `<code>${escapeHtml(p.slice(1, -1))}</code>` : inlineText(escapeHtml(p))
    )
    .join("");
}

export function randeazaMarkdown(text: string): string {
  const linii = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let paragraf: string[] = [];
  let lista: { tag: "ul" | "ol"; elemente: string[] } | null = null;

  const inchideParagraf = () => {
    if (paragraf.length) out.push(`<p>${paragraf.map(inline).join("<br>")}</p>`);
    paragraf = [];
  };
  const inchideLista = () => {
    if (lista) out.push(`<${lista.tag}>${lista.elemente.map((e) => `<li>${inline(e)}</li>`).join("")}</${lista.tag}>`);
    lista = null;
  };
  const inchideTot = () => { inchideParagraf(); inchideLista(); };

  for (let i = 0; i < linii.length; i++) {
    const linie = linii[i] ?? "";

    if (/^```/.test(linie)) {
      inchideTot();
      const cod: string[] = [];
      i++;
      while (i < linii.length && !/^```/.test(linii[i] ?? "")) cod.push(linii[i] ?? ""), i++;
      out.push(`<pre><code>${escapeHtml(cod.join("\n"))}</code></pre>`);
      continue;
    }

    const titlu = linie.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (titlu) {
      inchideTot();
      const n = titlu[1]?.length ?? 1;
      out.push(`<h${n}>${inline(titlu[2] ?? "")}</h${n}>`);
      continue;
    }

    const neordonat = linie.match(/^[-*]\s+(.*)$/);
    const ordonat = linie.match(/^\d+\.\s+(.*)$/);
    if (neordonat || ordonat) {
      const tag = neordonat ? "ul" : "ol";
      const element = (neordonat ?? ordonat)?.[1] ?? "";
      inchideParagraf();
      if (lista && lista.tag !== tag) inchideLista();
      if (!lista) lista = { tag, elemente: [] };
      lista.elemente.push(element);
      continue;
    }

    if (linie.trim() === "") { inchideTot(); continue; }

    inchideLista();
    paragraf.push(linie);
  }
  inchideTot();
  return out.join("");
}
