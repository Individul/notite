// Regula tastei Enter in editor: fiecare linie noua porneste ca sarcina.
//
// Notitele lui Dumitru sunt in primul rand liste de facut, asa ca marcajul implicit este
// `- [ ] `, nu textul simplu. Cine vrea un paragraf sterge caseta de pe linie. Doua
// exceptii mecanice: un element gol se goleste in loc sa se inmulteasca (asa iesi din
// lista), iar in interiorul unui bloc de cod nu se baga niciun marcaj.

export type LaEnter =
  // Insereaza rand nou care incepe cu `marcaj` (poate fi si gol).
  | { fel: "continua"; marcaj: string }
  // Elementul curent e gol: sterge primele `taie` caractere ale liniei si ramai pe ea.
  | { fel: "iesi"; taie: number };

const SARCINA_NOUA = "[ ] ";

// Un element de lista: indentare, marcaj (`-`, `*` sau `12.`), spatii, bifa optionala, rest.
const ELEMENT = /^([ \t]*)([-*]|\d+\.)([ \t]+)(\[[ xX]\][ \t]*)?(.*)$/;

// `12.` continua cu `13.`; buline raman ce sunt.
function urmatorulMarcaj(marcaj: string): string {
  const numar = marcaj.match(/^(\d+)\.$/);
  return numar ? `${Number(numar[1]) + 1}.` : marcaj;
}

export function laEnter(linie: string, inCod = false): LaEnter {
  if (inCod) return { fel: "continua", marcaj: "" };

  const el = linie.match(ELEMENT);
  if (!el) return { fel: "continua", marcaj: `- ${SARCINA_NOUA}` };

  const [, indent = "", marcaj = "", spatii = "", bifa, rest = ""] = el;
  if (rest.trim() === "") {
    return { fel: "iesi", taie: indent.length + marcaj.length + spatii.length + (bifa?.length ?? 0) };
  }
  const urmator = indent + urmatorulMarcaj(marcaj) + " ";
  return { fel: "continua", marcaj: bifa ? urmator + SARCINA_NOUA : urmator };
}

// Suntem intre doua garduri de ``` ? Numaram gardurile de dinaintea pozitiei; numar impar
// inseamna ca blocul e inca deschis.
export function inBlocDeCod(text: string, pozitie: number): boolean {
  let garduri = 0;
  for (const linie of text.slice(0, pozitie).split("\n")) {
    if (/^[ \t]*```/.test(linie)) garduri++;
  }
  return garduri % 2 === 1;
}
