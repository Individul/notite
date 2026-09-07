import { describe, expect, it } from "vitest";
import { aziChisinau, etichetaZi, fmtZi, parseDbDate, ziValida, ziVecina } from "./data";

describe("aziChisinau", () => {
  it("trece in ziua urmatoare la 21:00 UTC (vara, UTC+3)", () => {
    expect(aziChisinau(new Date("2026-07-10T20:59:59Z"))).toBe("2026-07-10");
    expect(aziChisinau(new Date("2026-07-10T21:00:00Z"))).toBe("2026-07-11");
  });

  it("trece in ziua urmatoare la 22:00 UTC iarna (UTC+2)", () => {
    expect(aziChisinau(new Date("2026-01-10T21:59:59Z"))).toBe("2026-01-10");
    expect(aziChisinau(new Date("2026-01-10T22:00:00Z"))).toBe("2026-01-11");
  });
});

describe("ziValida", () => {
  it("accepta doar date calendaristice reale in format AAAA-LL-ZZ", () => {
    expect(ziValida("2026-09-07")).toBe(true);
    expect(ziValida("2028-02-29")).toBe(true);
    expect(ziValida("2026-02-30")).toBe(false);
    expect(ziValida("2026-13-01")).toBe(false);
    expect(ziValida("2026-9-7")).toBe(false);
    expect(ziValida("azi")).toBe(false);
    expect(ziValida("")).toBe(false);
  });
});

describe("ziVecina", () => {
  it("sare peste granitele de luna si de an", () => {
    expect(ziVecina("2026-12-31", 1)).toBe("2027-01-01");
    expect(ziVecina("2026-03-01", -1)).toBe("2026-02-28");
    expect(ziVecina("2026-09-07", 0)).toBe("2026-09-07");
  });
});

describe("fmtZi si etichetaZi", () => {
  it("formateaza data lunga in romana", () => {
    expect(fmtZi("2026-09-07")).toBe("luni, 7 septembrie 2026");
  });

  it("eticheteaza azi, ieri, maine si altfel ziua saptamanii", () => {
    const azi = "2026-09-07";
    expect(etichetaZi("2026-09-07", azi)).toBe("Azi");
    expect(etichetaZi("2026-09-06", azi)).toBe("Ieri");
    expect(etichetaZi("2026-09-08", azi)).toBe("Mâine");
    expect(etichetaZi("2026-09-09", azi)).toBe("Miercuri");
  });
});

describe("parseDbDate", () => {
  it("citeste atat ISO cu T/Z cat si formatul D1 cu spatiu", () => {
    expect(parseDbDate("2026-09-07T10:00:00.000Z")?.toISOString()).toBe("2026-09-07T10:00:00.000Z");
    expect(parseDbDate("2026-09-07 10:00:00")?.toISOString()).toBe("2026-09-07T10:00:00.000Z");
    expect(parseDbDate(null)).toBeNull();
    expect(parseDbDate("nimic")).toBeNull();
  });
});
