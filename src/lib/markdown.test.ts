import { describe, expect, it } from "vitest";
import { escapeHtml, randeazaMarkdown } from "./markdown";

describe("escapeHtml", () => {
  it("escapeaza cele cinci caractere speciale", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});

describe("randeazaMarkdown: siguranta", () => {
  it("escapeaza HTML brut, inclusiv script", () => {
    expect(randeazaMarkdown("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("respinge linkurile javascript: si data:, lasandu-le text simplu", () => {
    expect(randeazaMarkdown("[x](javascript:alert(1))")).toBe("<p>[x](javascript:alert(1))</p>");
    expect(randeazaMarkdown("[x](data:text/html,hi)")).toBe("<p>[x](data:text/html,hi)</p>");
  });

  it("accepta https, http, mailto si cai relative, cu target si rel sigure", () => {
    expect(randeazaMarkdown("[a](https://x.md/?a=1&b=2)")).toBe(
      '<p><a href="https://x.md/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">a</a></p>'
    );
    expect(randeazaMarkdown("[m](mailto:x@y.md)")).toContain('href="mailto:x@y.md"');
    expect(randeazaMarkdown("[r](/zi/2026-09-07)")).toContain('href="/zi/2026-09-07"');
  });

  it("nu permite iesirea din atributul href prin ghilimele", () => {
    const html = randeazaMarkdown('[a](https://x.md/" onclick="1)');
    expect(html).not.toContain('onclick="');
    expect(html).toContain('href="https://x.md/"');
  });
});

describe("randeazaMarkdown: inline", () => {
  it("randeaza bold, italic, cod si autolink", () => {
    expect(randeazaMarkdown("**tare** *apasat* _subtil_ `cod <b>`")).toBe(
      "<p><strong>tare</strong> <em>apasat</em> <em>subtil</em> <code>cod &lt;b&gt;</code></p>"
    );
    expect(randeazaMarkdown("vezi https://x.md/a?b=1 aici")).toBe(
      '<p>vezi <a href="https://x.md/a?b=1" target="_blank" rel="noopener noreferrer">https://x.md/a?b=1</a> aici</p>'
    );
  });

  it("nu transforma steluta izolata sau underscore din cuvinte", () => {
    expect(randeazaMarkdown("2 * 3 = 6")).toBe("<p>2 * 3 = 6</p>");
    expect(randeazaMarkdown("snake_case_nume")).toBe("<p>snake_case_nume</p>");
  });
});

describe("randeazaMarkdown: blocuri", () => {
  it("face titluri din #, ## si ###", () => {
    expect(randeazaMarkdown("# Unu\n## Doi\n### Trei\n#### Patru")).toBe(
      "<h1>Unu</h1><h2>Doi</h2><h3>Trei</h3><p>#### Patru</p>"
    );
  });

  it("face liste neordonate si ordonate, cu inline in elemente", () => {
    expect(randeazaMarkdown("- **a**\n* b\n\n1. unu\n2. doi")).toBe(
      "<ul><li><strong>a</strong></li><li>b</li></ul><ol><li>unu</li><li>doi</li></ol>"
    );
  });

  it("separa paragrafele prin linie goala si pune <br> la newline simplu", () => {
    expect(randeazaMarkdown("unu\ndoi\n\ntrei")).toBe("<p>unu<br>doi</p><p>trei</p>");
  });

  it("pastreaza continutul fence-urilor literal, escapat, fara inline", () => {
    expect(randeazaMarkdown("```\n# nu titlu\n**nu bold** <x>\n```")).toBe(
      "<pre><code># nu titlu\n**nu bold** &lt;x&gt;</code></pre>"
    );
  });

  it("intoarce sir gol pentru text gol", () => {
    expect(randeazaMarkdown("")).toBe("");
    expect(randeazaMarkdown("  \n\n ")).toBe("");
  });

  it("accepta CRLF", () => {
    expect(randeazaMarkdown("a\r\n\r\nb")).toBe("<p>a</p><p>b</p>");
  });
});
