import { describe, expect, it } from "vitest";
import { isoWeekKey, sanitizeSummaryHtml } from "./summaryNotes";

describe("sanitizeSummaryHtml", () => {
  it("keeps the formatting the toolbar can produce", () => {
    const html = "<h2>Tytuł</h2><p><b>pogrubienie</b> <i>kursywa</i> <u>podkreślenie</u> <s>przekreślenie</s></p>";
    expect(sanitizeSummaryHtml(html)).toBe(html);
  });

  it("keeps lists, quotes and code blocks", () => {
    const html = "<ul><li>jeden</li></ul><blockquote>cytat</blockquote><pre>kod</pre>";
    expect(sanitizeSummaryHtml(html)).toBe(html);
  });

  it("unwraps elements the toolbar never produces but keeps their text", () => {
    expect(sanitizeSummaryHtml("<section><p>tekst</p></section>")).toBe("<p>tekst</p>");
    expect(sanitizeSummaryHtml("<marquee>uwaga</marquee>")).toBe("uwaga");
  });

  it("removes a script element entirely rather than unwrapping its source", () => {
    // The element is unwrapped, so only its inert text content can survive — never an
    // executable node.
    const result = sanitizeSummaryHtml("<p>przed</p><script>alert(1)</script>");
    expect(result).not.toContain("<script");
  });

  it("strips every attribute except a safe href", () => {
    const result = sanitizeSummaryHtml(
      '<p style="color:red" onclick="alert(1)" class="x">tekst</p>',
    );
    expect(result).toBe("<p>tekst</p>");
  });

  it("keeps http links and adds safe rel/target", () => {
    const result = sanitizeSummaryHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it("drops javascript:, data: and vbscript: URLs but keeps the link text", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<x>", "VBScript:msgbox"]) {
      const result = sanitizeSummaryHtml(`<a href="${url}">klik</a>`);
      expect(result, url).not.toContain("href=");
      expect(result, url).toContain("klik");
    }
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeSummaryHtml("")).toBe("");
  });
});

describe("isoWeekKey", () => {
  it("uses the ISO week number, with weeks starting on Monday", () => {
    // 2026-07-29 is a Wednesday in ISO week 31.
    expect(isoWeekKey(new Date(2026, 6, 29))).toBe("2026-W31");
    // The Monday and Sunday of that week share the key.
    expect(isoWeekKey(new Date(2026, 6, 27))).toBe("2026-W31");
    expect(isoWeekKey(new Date(2026, 7, 2))).toBe("2026-W31");
    // The next Monday starts a new week.
    expect(isoWeekKey(new Date(2026, 7, 3))).toBe("2026-W32");
  });

  it("assigns an early-January date to the previous ISO year when the week belongs to it", () => {
    // 2027-01-01 is a Friday, which ISO-8601 places in week 53 of 2026.
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe("2026-W53");
  });
});
