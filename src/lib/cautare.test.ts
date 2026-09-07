import { describe, expect, it } from "vitest";
import { fragmentHtml, pregatesteInterogare } from "./cautare";

describe("pregatesteInterogare", () => {
  it("transforma cuvintele in termeni cu prefix, intre ghilimele", () => {
    expect(pregatesteInterogare('lapte "roșu" (x) AND')).toBe('"lapte"* "roșu"* "x"* "AND"*');
  });

  it("intoarce null pentru interogare goala sau doar semne", () => {
    expect(pregatesteInterogare("")).toBeNull();
    expect(pregatesteInterogare("   ")).toBeNull();
    expect(pregatesteInterogare('"" () *')).toBeNull();
  });

  it("nu lasa ghilimele sau operatori FTS sa scape", () => {
    expect(pregatesteInterogare('a"b NOT c*')).toBe('"a"* "b"* "NOT"* "c"*');
  });
});

describe("fragmentHtml", () => {
  it("escapeaza HTML-ul si transforma markerele in <mark>", () => {
    expect(fragmentHtml(String.fromCharCode(1) + "<b>" + String.fromCharCode(2) + " &")).toBe("<mark>&lt;b&gt;</mark> &amp;");
  });

  it("lasa textul fara markere neschimbat in afara escaparii", () => {
    expect(fragmentHtml("nimic aici")).toBe("nimic aici");
  });
});
