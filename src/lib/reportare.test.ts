import { describe, expect, it } from "vitest";
import { adaugaReportate, desparteSarcini, TITLU_REPORTATE } from "./reportare";

describe("desparteSarcini", () => {
  it("scoate doar sarcinile nebifate, lasand restul pe loc", () => {
    const r = desparteSarcini("- [ ] de facut\n- [x] gata\n- element simplu\ntext");
    expect(r.mutate).toEqual(["- [ ] de facut"]);
    expect(r.ramase).toBe("- [x] gata\n- element simplu\ntext");
  });

  it("merge cu *, cu liste numerotate si cu majuscula la bifa", () => {
    const r = desparteSarcini("* [ ] unu\n1. [ ] doi\n- [X] gata");
    expect(r.mutate).toEqual(["* [ ] unu", "1. [ ] doi"]);
    expect(r.ramase).toBe("- [X] gata");
  });

  it("nu atinge randurile dintr-un bloc de cod", () => {
    const sursa = "```\n- [ ] nu e sarcina\n```\n- [ ] asta da";
    const r = desparteSarcini(sursa);
    expect(r.mutate).toEqual(["- [ ] asta da"]);
    expect(r.ramase).toBe("```\n- [ ] nu e sarcina\n```");
  });

  it("lasa pe loc o sarcina fara text", () => {
    const r = desparteSarcini("- [ ]\n- [ ] cu text");
    expect(r.mutate).toEqual(["- [ ] cu text"]);
    expect(r.ramase).toBe("- [ ]");
  });

  it("strange gaurile ramase in urma si taie coada", () => {
    const r = desparteSarcini("## Titlu\n\n- [ ] a\n\ndupa");
    expect(r.ramase).toBe("## Titlu\n\ndupa");
  });

  it("nu schimba nimic cand n-are ce muta", () => {
    const sursa = "doar text\n\n- [x] gata";
    const r = desparteSarcini(sursa);
    expect(r.mutate).toEqual([]);
    expect(r.ramase).toBe(sursa);
  });
});

describe("adaugaReportate", () => {
  it("pune titlul si sarcinile in capul zilei", () => {
    expect(adaugaReportate("ce scriu azi", ["- [ ] a", "- [ ] b"])).toBe(
      `${TITLU_REPORTATE}\n- [ ] a\n- [ ] b\n\nce scriu azi`
    );
  });

  it("intr-o zi goala lasa doar blocul", () => {
    expect(adaugaReportate("", ["- [ ] a"])).toBe(`${TITLU_REPORTATE}\n- [ ] a`);
    expect(adaugaReportate("  \n\n", ["- [ ] a"])).toBe(`${TITLU_REPORTATE}\n- [ ] a`);
  });

  it("adauga in blocul existent, nu face al doilea titlu", () => {
    const sursa = `${TITLU_REPORTATE}\n- [ ] a\n- [x] b\n\nrestul zilei`;
    expect(adaugaReportate(sursa, ["- [ ] c"])).toBe(
      `${TITLU_REPORTATE}\n- [ ] a\n- [x] b\n- [ ] c\n\nrestul zilei`
    );
  });

  it("nu dubleaza un rand care e deja in bloc", () => {
    const sursa = `${TITLU_REPORTATE}\n- [ ] a`;
    expect(adaugaReportate(sursa, ["- [ ] a"])).toBe(sursa);
  });

  it("intoarce textul neatins cand nu are ce adauga", () => {
    expect(adaugaReportate("ceva", [])).toBe("ceva");
  });
});
