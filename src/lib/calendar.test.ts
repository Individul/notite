import { describe, expect, it } from "vitest";
import { grilaLunii, lunaVecina, lunaValida, lunaZilei, ZILE_SAPTAMANA } from "./calendar";

describe("lunaValida", () => {
  it("accepta AAAA-LL si respinge restul", () => {
    expect(lunaValida("2026-09")).toBe(true);
    expect(lunaValida("2026-13")).toBe(false);
    expect(lunaValida("2026-00")).toBe(false);
    expect(lunaValida("2026-9")).toBe(false);
    expect(lunaValida("2026-09-01")).toBe(false);
    expect(lunaValida("")).toBe(false);
  });
});

describe("lunaVecina", () => {
  it("trece peste granita anului in ambele sensuri", () => {
    expect(lunaVecina("2026-01", -1)).toBe("2025-12");
    expect(lunaVecina("2026-12", 1)).toBe("2027-01");
    expect(lunaVecina("2026-09", 1)).toBe("2026-10");
  });
});

describe("lunaZilei", () => {
  it("ia luna dintr-o zi", () => {
    expect(lunaZilei("2026-09-08")).toBe("2026-09");
  });
});

describe("grilaLunii", () => {
  it("incepe saptamana luni si umple cu zile din lunile vecine", () => {
    // 1 septembrie 2026 e marti, deci prima casuta e luni, 31 august.
    const g = grilaLunii("2026-09");
    expect(g.zile[0]).toEqual({ data: "2026-08-31", numar: 31, inLuna: false });
    expect(g.zile[1]).toEqual({ data: "2026-09-01", numar: 1, inLuna: true });
    expect(ZILE_SAPTAMANA[0]).toBe("Lu");
  });

  it("intoarce saptamani intregi, fara un rand orb la coada", () => {
    const g = grilaLunii("2026-09");
    expect(g.zile.length % 7).toBe(0);
    expect(g.zile.length).toBe(35);
    expect(g.zile.at(-1)?.inLuna).toBe(false);
  });

  it("pastreaza a sasea saptamana cand luna chiar are nevoie de ea", () => {
    // August 2026 incepe sambata si are 31 de zile: nu incape in 35 de casute.
    const g = grilaLunii("2026-08");
    expect(g.zile.length).toBe(42);
    expect(g.zile.some((z) => z.data === "2026-08-31" && z.inLuna)).toBe(true);
  });

  it("tine toate zilele lunii, o singura data fiecare", () => {
    const g = grilaLunii("2026-02");
    const aleLunii = g.zile.filter((z) => z.inLuna).map((z) => z.data);
    expect(aleLunii.length).toBe(28);
    expect(new Set(aleLunii).size).toBe(28);
    expect(aleLunii[0]).toBe("2026-02-01");
    expect(aleLunii.at(-1)).toBe("2026-02-28");
  });

  it("scrie eticheta in romana si stie lunile vecine", () => {
    const g = grilaLunii("2026-09");
    expect(g.eticheta).toBe("septembrie 2026");
    expect(g.anterioara).toBe("2026-08");
    expect(g.urmatoare).toBe("2026-10");
  });
});
