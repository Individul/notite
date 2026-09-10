import { describe, expect, it } from "vitest";
import { adaugaLaCapat, inBlocDeCod, laEnter, sarcinaNebifata, scoateLinia } from "./sarcini";

describe("sarcinaNebifata", () => {
  it("recunoaste doar elementele cu caseta goala", () => {
    expect(sarcinaNebifata("- [ ] lapte")).toBe(true);
    expect(sarcinaNebifata("  * [ ] adanc")).toBe(true);
    expect(sarcinaNebifata("2. [ ] doi")).toBe(true);
    expect(sarcinaNebifata("- [x] gata")).toBe(false);
    expect(sarcinaNebifata("- [X] gata")).toBe(false);
    expect(sarcinaNebifata("- lista simpla")).toBe(false);
    expect(sarcinaNebifata("text")).toBe(false);
  });
});

describe("scoateLinia", () => {
  it("scoate exact linia ceruta, daca textul ei e cel asteptat", () => {
    expect(scoateLinia("a\n- [ ] b\nc", 1, "- [ ] b")).toBe("a\nc");
    expect(scoateLinia("- [ ] singura", 0, "- [ ] singura")).toBe("");
    expect(scoateLinia("a\n- [ ] ultima", 1, "- [ ] ultima")).toBe("a");
    expect(scoateLinia("- [ ] prima\nb", 0, "- [ ] prima")).toBe("b");
  });

  it("refuza cand linia s-a schimbat intre timp sau indexul e in afara", () => {
    expect(scoateLinia("a\n- [ ] b", 1, "- [ ] altceva")).toBeNull();
    expect(scoateLinia("a\n- [ ] b", 5, "- [ ] b")).toBeNull();
    expect(scoateLinia("a\n- [ ] b", -1, "- [ ] b")).toBeNull();
  });
});

describe("adaugaLaCapat", () => {
  it("pune linia la sfarsit, pe rand nou, fara sa dubleze randurile goale", () => {
    expect(adaugaLaCapat("", "- [ ] b")).toBe("- [ ] b");
    expect(adaugaLaCapat("a", "- [ ] b")).toBe("a\n- [ ] b");
    expect(adaugaLaCapat("a\n", "- [ ] b")).toBe("a\n- [ ] b");
    expect(adaugaLaCapat("a\n\n", "- [ ] b")).toBe("a\n\n- [ ] b");
  });
});

describe("laEnter: linia noua e sarcina", () => {
  it("porneste o sarcina dupa text simplu, titlu sau linie goala", () => {
    expect(laEnter("gand liber")).toEqual({ fel: "continua", marcaj: "- [ ] " });
    expect(laEnter("## Azi")).toEqual({ fel: "continua", marcaj: "- [ ] " });
    expect(laEnter("")).toEqual({ fel: "continua", marcaj: "- [ ] " });
  });

  it("continua o sarcina cu alta sarcina nebifata", () => {
    expect(laEnter("- [ ] lapte")).toEqual({ fel: "continua", marcaj: "- [ ] " });
    expect(laEnter("- [x] gata")).toEqual({ fel: "continua", marcaj: "- [ ] " });
    expect(laEnter("* [X] gata")).toEqual({ fel: "continua", marcaj: "* [ ] " });
  });

  it("pastreaza indentarea si stilul marcajului", () => {
    expect(laEnter("   - [ ] adanc")).toEqual({ fel: "continua", marcaj: "   - [ ] " });
    expect(laEnter("  * altfel")).toEqual({ fel: "continua", marcaj: "  * " });
  });

  it("lasa lista simpla sa ramana lista simpla", () => {
    expect(laEnter("- pâine")).toEqual({ fel: "continua", marcaj: "- " });
  });

  it("numara mai departe la lista ordonata", () => {
    expect(laEnter("1. unu")).toEqual({ fel: "continua", marcaj: "2. " });
    expect(laEnter("3. [ ] trei")).toEqual({ fel: "continua", marcaj: "4. [ ] " });
  });
});

describe("laEnter: iesirea din lista", () => {
  it("goleste elementul gol in loc sa faca altul", () => {
    expect(laEnter("- [ ] ")).toEqual({ fel: "iesi", taie: 6 });
    expect(laEnter("- [ ]")).toEqual({ fel: "iesi", taie: 5 });
    expect(laEnter("- ")).toEqual({ fel: "iesi", taie: 2 });
    expect(laEnter("  - [ ] ")).toEqual({ fel: "iesi", taie: 8 });
    expect(laEnter("1. ")).toEqual({ fel: "iesi", taie: 3 });
  });
});

describe("laEnter: blocul de cod", () => {
  it("nu baga marcaje in interiorul unui bloc de cod", () => {
    expect(laEnter("cod = 1", true)).toEqual({ fel: "continua", marcaj: "" });
    expect(laEnter("- [ ] pare sarcina", true)).toEqual({ fel: "continua", marcaj: "" });
  });
});

describe("inBlocDeCod", () => {
  const text = ["intro", "```", "cod = 1", "```", "dupa"].join("\n");
  const inceputLiniei = (n: number) => text.split("\n").slice(0, n).join("\n").length + (n ? 1 : 0);

  it("stie cand pozitia e intre doua garduri", () => {
    expect(inBlocDeCod(text, inceputLiniei(0))).toBe(false);
    expect(inBlocDeCod(text, inceputLiniei(2))).toBe(true);
    expect(inBlocDeCod(text, inceputLiniei(4))).toBe(false);
  });

  it("numara si gardul de pe linia curenta, pana la pozitie", () => {
    // Cursorul stă la capătul rândului tocmai tastat: blocul e deja deschis.
    expect(inBlocDeCod("```", 3)).toBe(true);
    expect(inBlocDeCod("```", 0)).toBe(false);
  });

  it("trateaza gardul nesfarsit ca bloc deschis pana la capat", () => {
    const deschis = ["```", "cod"].join("\n");
    expect(inBlocDeCod(deschis, deschis.length)).toBe(true);
  });

  it("nu se incurca de trei ghilimele din mijlocul unei linii", () => {
    const inline = "text ``` tot text";
    expect(inBlocDeCod(inline, inline.length)).toBe(false);
  });
});
