// Acces la date. Toate functiile primesc `owner` si il pun in WHERE: nimeni nu vede
// notitele altcuiva, chiar daca ghiceste un id.

export interface Nota {
  id: string;
  tip: "zi" | "nota";
  data_zi: string | null;
  titlu: string | null;
  corp: string;
  creat_la: string;
  actualizat_la: string;
}

export interface NotaRezumat {
  id: string;
  titlu: string | null;
  rezumat: string;
  actualizat_la: string;
}

export interface ZiRecenta {
  id: string;
  data_zi: string;
  rezumat: string;
}

export interface Rezultat {
  id: string;
  tip: "zi" | "nota";
  data_zi: string | null;
  titlu: string | null;
  fragment: string;
}

export type RezultatActualizare =
  | { ok: true; nota: Nota }
  | { ok: false; motiv: "lipsa" }
  | { ok: false; motiv: "conflict"; nota: Nota };

// Markerele din fragmentul FTS; cautare.ts le transforma in <mark>, dupa escapare.
export const MARCAJ_START = String.fromCharCode(1);
export const MARCAJ_STOP = String.fromCharCode(2);

const COLOANE = "id, tip, data_zi, titlu, corp, creat_la, actualizat_la";

// Timp strict crescator: in Workers `Date.now()` poate sta pe loc intr-o cerere, iar
// concurenta optimista compara `actualizat_la`, deci doua scrieri nu pot primi aceeasi valoare.
let ultimMs = 0;
function acum(): string {
  let ms = Date.now();
  if (ms <= ultimMs) ms = ultimMs + 1;
  ultimMs = ms;
  return new Date(ms).toISOString();
}

export async function notaZi(db: D1Database, owner: string, data: string): Promise<Nota> {
  const t = acum();
  await db
    .prepare(
      `INSERT INTO notite (id, owner, tip, data_zi, titlu, corp, creat_la, actualizat_la)
       VALUES (?, ?, 'zi', ?, NULL, '', ?, ?)
       ON CONFLICT(owner, data_zi) DO NOTHING`
    )
    .bind(crypto.randomUUID(), owner, data, t, t)
    .run();
  const nota = await db
    .prepare(`SELECT ${COLOANE} FROM notite WHERE owner = ? AND data_zi = ?`)
    .bind(owner, data)
    .first<Nota>();
  if (!nota) throw new Error("notita zilei lipseste dupa inserare");
  return nota;
}

export async function creeazaNota(db: D1Database, owner: string, titlu: string | null): Promise<Nota> {
  const t = acum();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO notite (id, owner, tip, data_zi, titlu, corp, creat_la, actualizat_la)
       VALUES (?, ?, 'nota', NULL, ?, '', ?, ?)`
    )
    .bind(id, owner, titlu, t, t)
    .run();
  const nota = await citesteNota(db, owner, id);
  if (!nota) throw new Error("nota lipseste dupa inserare");
  return nota;
}

export async function citesteNota(db: D1Database, owner: string, id: string): Promise<Nota | null> {
  return db
    .prepare(`SELECT ${COLOANE} FROM notite WHERE id = ? AND owner = ?`)
    .bind(id, owner)
    .first<Nota>();
}

// Compare-and-set pe `actualizat_la`: scrie doar daca randul nu s-a schimbat de la `baza`.
// Daca `titlu` lipseste (undefined), ramane cel existent.
export async function actualizeazaNota(
  db: D1Database, owner: string, id: string,
  { titlu, corp, baza }: { titlu?: string | null; corp: string; baza: string }
): Promise<RezultatActualizare> {
  const t = acum();
  const r = await db
    .prepare(
      `UPDATE notite SET titlu = CASE WHEN ? THEN ? ELSE titlu END, corp = ?, actualizat_la = ?
       WHERE id = ? AND owner = ? AND actualizat_la = ?`
    )
    .bind(titlu === undefined ? 0 : 1, titlu ?? null, corp, t, id, owner, baza)
    .run();
  if (r.meta.changes > 0) {
    const nota = await citesteNota(db, owner, id);
    if (!nota) return { ok: false, motiv: "lipsa" };
    return { ok: true, nota };
  }
  const curenta = await citesteNota(db, owner, id);
  if (!curenta) return { ok: false, motiv: "lipsa" };
  return { ok: false, motiv: "conflict", nota: curenta };
}

export async function stergeNota(db: D1Database, owner: string, id: string): Promise<boolean> {
  const r = await db.prepare("DELETE FROM notite WHERE id = ? AND owner = ?").bind(id, owner).run();
  return r.meta.changes > 0;
}

export async function listeazaNote(db: D1Database, owner: string): Promise<NotaRezumat[]> {
  const r = await db
    .prepare(
      `SELECT id, titlu, substr(corp, 1, 120) AS rezumat, actualizat_la
       FROM notite WHERE owner = ? AND tip = 'nota'
       ORDER BY actualizat_la DESC LIMIT 200`
    )
    .bind(owner)
    .all<NotaRezumat>();
  return r.results;
}

export async function zileRecente(db: D1Database, owner: string, n = 14): Promise<ZiRecenta[]> {
  const r = await db
    .prepare(
      `SELECT id, data_zi, substr(corp, 1, 120) AS rezumat
       FROM notite WHERE owner = ? AND tip = 'zi' AND corp <> ''
       ORDER BY data_zi DESC LIMIT ?`
    )
    .bind(owner, n)
    .all<ZiRecenta>();
  return r.results;
}

// Zilele scrise dintr-un interval, pentru punctele din calendar. Doar datele, fara text.
export async function zileScrise(
  db: D1Database,
  owner: string,
  dela: string,
  panala: string
): Promise<string[]> {
  const r = await db
    .prepare(
      `SELECT data_zi FROM notite
       WHERE owner = ? AND tip = 'zi' AND corp <> '' AND data_zi BETWEEN ? AND ?`
    )
    .bind(owner, dela, panala)
    .all<{ data_zi: string }>();
  return r.results.map((x) => x.data_zi);
}

// `interogare` este deja in sintaxa FTS5 (vezi cautare.ts). Fragmentul vine din corp
// (coloana 1) cu markere de control, ca sa poata fi escapat in siguranta inainte de <mark>.
export async function cauta(db: D1Database, owner: string, interogare: string): Promise<Rezultat[]> {
  const r = await db
    .prepare(
      `SELECT n.id, n.tip, n.data_zi, n.titlu,
              snippet(notite_fts, 1, ?, ?, '…', 24) AS fragment
       FROM notite_fts f JOIN notite n ON n.rid = f.rowid
       WHERE notite_fts MATCH ? AND n.owner = ?
       ORDER BY bm25(notite_fts, 3.0, 1.0) LIMIT 50`
    )
    .bind(MARCAJ_START, MARCAJ_STOP, interogare, owner)
    .all<Rezultat>();
  return r.results;
}
