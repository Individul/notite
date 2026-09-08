import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  actualizeazaNota, cauta, citesteNota, creeazaNota, listeazaNote, notaZi, stergeNota, zileRecente,
  zileScrise,
} from "./db";

const A = "a@exemplu.md";
const B = "b@exemplu.md";

describe("notaZi", () => {
  it("creeaza notita zilei o singura data si o returneaza la fiecare apel", async () => {
    const prima = await notaZi(env.DB, A, "2026-09-07");
    const aDoua = await notaZi(env.DB, A, "2026-09-07");
    expect(prima.id).toBe(aDoua.id);
    expect(prima.tip).toBe("zi");
    expect(prima.data_zi).toBe("2026-09-07");
    expect(prima.corp).toBe("");
    const rand = await env.DB.prepare("SELECT count(*) AS total FROM notite").first<{ total: number }>();
    expect(rand?.total).toBe(1);
  });

  it("nu expune owner sau rid", async () => {
    const nota = await notaZi(env.DB, A, "2026-09-07");
    expect(nota).not.toHaveProperty("owner");
    expect(nota).not.toHaveProperty("rid");
  });

  it("da fiecarui owner propria notita pentru aceeasi zi", async () => {
    const a = await notaZi(env.DB, A, "2026-09-07");
    const b = await notaZi(env.DB, B, "2026-09-07");
    expect(a.id).not.toBe(b.id);
  });
});

describe("creeazaNota si citesteNota", () => {
  it("creeaza o nota durabila cu titlu, vizibila doar ownerului", async () => {
    const nota = await creeazaNota(env.DB, A, "Cumparaturi");
    expect(nota.tip).toBe("nota");
    expect(nota.data_zi).toBeNull();
    expect(nota.titlu).toBe("Cumparaturi");
    expect(await citesteNota(env.DB, A, nota.id)).toEqual(nota);
    expect(await citesteNota(env.DB, B, nota.id)).toBeNull();
  });

  it("intoarce null pentru un id inexistent", async () => {
    expect(await citesteNota(env.DB, A, "nu-exista")).toBeNull();
  });
});

describe("actualizeazaNota", () => {
  it("salveaza cand baza corespunde si avanseaza actualizat_la", async () => {
    const nota = await creeazaNota(env.DB, A, null);
    const r = await actualizeazaNota(env.DB, A, nota.id, { titlu: "Titlu", corp: "text", baza: nota.actualizat_la });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nota.corp).toBe("text");
    expect(r.nota.titlu).toBe("Titlu");
    expect(r.nota.actualizat_la > nota.actualizat_la).toBe(true);
  });

  it("raporteaza conflict cu randul curent cand baza e veche", async () => {
    const nota = await creeazaNota(env.DB, A, null);
    const r1 = await actualizeazaNota(env.DB, A, nota.id, { corp: "prima", baza: nota.actualizat_la });
    expect(r1.ok).toBe(true);
    const r2 = await actualizeazaNota(env.DB, A, nota.id, { corp: "a doua", baza: nota.actualizat_la });
    expect(r2).toMatchObject({ ok: false, motiv: "conflict" });
    if (r2.ok || r2.motiv !== "conflict") return;
    expect(r2.nota.corp).toBe("prima");
  });

  it("raporteaza lipsa pentru alt owner sau id inexistent", async () => {
    const nota = await creeazaNota(env.DB, A, null);
    expect(await actualizeazaNota(env.DB, B, nota.id, { corp: "x", baza: nota.actualizat_la }))
      .toEqual({ ok: false, motiv: "lipsa" });
    expect(await actualizeazaNota(env.DB, A, "nu-exista", { corp: "x", baza: "0" }))
      .toEqual({ ok: false, motiv: "lipsa" });
    expect((await citesteNota(env.DB, A, nota.id))?.corp).toBe("");
  });

  it("pastreaza titlul cand nu e trimis", async () => {
    const nota = await creeazaNota(env.DB, A, "Vechi");
    const r = await actualizeazaNota(env.DB, A, nota.id, { corp: "text", baza: nota.actualizat_la });
    expect(r.ok && r.nota.titlu).toBe("Vechi");
  });
});

describe("stergeNota", () => {
  it("sterge doar pentru owner si scoate din index", async () => {
    const nota = await creeazaNota(env.DB, A, "Unicorn");
    expect(await stergeNota(env.DB, B, nota.id)).toBe(false);
    expect(await cauta(env.DB, A, "unicorn")).toHaveLength(1);
    expect(await stergeNota(env.DB, A, nota.id)).toBe(true);
    expect(await citesteNota(env.DB, A, nota.id)).toBeNull();
    expect(await cauta(env.DB, A, "unicorn")).toHaveLength(0);
  });
});

describe("listeazaNote si zileRecente", () => {
  it("listeaza doar notele durabile ale ownerului, cele mai recente primele, cu rezumat", async () => {
    const veche = await creeazaNota(env.DB, A, "Veche");
    const noua = await creeazaNota(env.DB, A, null);
    await creeazaNota(env.DB, B, "A lui B");
    await notaZi(env.DB, A, "2026-09-07");
    await actualizeazaNota(env.DB, A, noua.id, { corp: "x".repeat(300), baza: noua.actualizat_la });
    const lista = await listeazaNote(env.DB, A);
    expect(lista.map((n) => n.id)).toEqual([noua.id, veche.id]);
    expect(lista[0]?.rezumat).toHaveLength(120);
    expect(lista[1]?.titlu).toBe("Veche");
  });

  it("intoarce zilele nevide ale ownerului, descrescator", async () => {
    const z1 = await notaZi(env.DB, A, "2026-09-05");
    const z2 = await notaZi(env.DB, A, "2026-09-07");
    await notaZi(env.DB, A, "2026-09-06"); // goala, nu apare
    const zB = await notaZi(env.DB, B, "2026-09-08");
    await actualizeazaNota(env.DB, A, z1.id, { corp: "ceva", baza: z1.actualizat_la });
    await actualizeazaNota(env.DB, A, z2.id, { corp: "altceva", baza: z2.actualizat_la });
    await actualizeazaNota(env.DB, B, zB.id, { corp: "b", baza: zB.actualizat_la });
    const zile = await zileRecente(env.DB, A);
    expect(zile.map((z) => z.data_zi)).toEqual(["2026-09-07", "2026-09-05"]);
  });
});

describe("cauta", () => {
  it("gaseste fara diacritice, in ambele tipuri, cu fragment marcat", async () => {
    const zi = await notaZi(env.DB, A, "2026-09-07");
    await actualizeazaNota(env.DB, A, zi.id, { corp: "am pus o etichetă pe borcan", baza: zi.actualizat_la });
    const nota = await creeazaNota(env.DB, A, "Etichetă nouă");
    const rez = await cauta(env.DB, A, "eticheta");
    expect(rez).toHaveLength(2);
    const dinZi = rez.find((r) => r.id === zi.id);
    expect(dinZi?.tip).toBe("zi");
    expect(dinZi?.data_zi).toBe("2026-09-07");
    expect(dinZi?.fragment).toContain("etichetă");
    expect(rez.find((r) => r.id === nota.id)?.titlu).toBe("Etichetă nouă");
  });

  it("nu intoarce notele altui owner", async () => {
    const b = await creeazaNota(env.DB, B, "secret");
    await actualizeazaNota(env.DB, B, b.id, { corp: "parola mea", baza: b.actualizat_la });
    expect(await cauta(env.DB, A, "parola")).toHaveLength(0);
    expect(await cauta(env.DB, B, "parola")).toHaveLength(1);
  });
});

describe("zileScrise", () => {
  it("da doar zilele cu text din interval, si numai ale ownerului", async () => {
    const scrie = async (owner: string, zi: string, corp: string) => {
      const n = await notaZi(env.DB, owner, zi);
      if (corp) await actualizeazaNota(env.DB, owner, n.id, { corp, baza: n.actualizat_la });
    };
    await scrie(A, "2026-09-01", "ceva");
    await scrie(A, "2026-09-15", "altceva");
    await scrie(A, "2026-09-20", "");        // goala: nu se numara
    await scrie(A, "2026-10-02", "in afara"); // in afara intervalului
    await scrie(B, "2026-09-10", "a lui B");

    const zile = await zileScrise(env.DB, A, "2026-09-01", "2026-09-30");
    expect(zile.sort()).toEqual(["2026-09-01", "2026-09-15"]);
  });
});
