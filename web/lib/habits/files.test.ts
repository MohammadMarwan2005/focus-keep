import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSvg, iconUrl, ownedIconPath, sniffImage } from "./files";
import { parseLineDirs, sanitizeLineDirs } from "./bidi";

const bytes = (...xs: number[]) => new Uint8Array(xs);

test("sniffImage identifies png / jpg / webp by magic bytes only", () => {
  assert.equal(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), "png");
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpg");
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assert.equal(sniffImage(webp), "webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a")), null);
  assert.equal(sniffImage(bytes()), null);
});

const ok = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h24v24H0z"/><use href="#g"/></svg>`;
const check = (s: string) => checkSvg(s, new TextEncoder().encode(s).length);

test("checkSvg accepts a plain monochrome icon with local references", () => {
  assert.equal(check(ok), null);
});

test("checkSvg rejects scripts, handlers, foreignObject and external refs", () => {
  assert.ok(check(`<svg><script>alert(1)</script></svg>`));
  assert.ok(check(`<svg onload="alert(1)"><path/></svg>`));
  assert.ok(check(`<svg><path ONCLICK = 'x'/></svg>`));
  assert.ok(check(`<svg><foreignObject><div/></foreignObject></svg>`));
  assert.ok(check(`<svg><image href="https://evil.example/x.png"/></svg>`));
  assert.ok(check(`<svg><use xlink:href="other.svg#a"/></svg>`));
  assert.ok(check(`<svg><path style="fill:url(https://evil.example/x)"/></svg>`));
  assert.ok(check(`<svg><style>@import "https://evil.example/a.css";</style></svg>`));
  assert.ok(check(`<svg><a href="javascript:alert(1)"><path/></a></svg>`));
  assert.ok(check(`<!DOCTYPE svg [<!ENTITY x "y">]><svg/>`));
  assert.ok(check(`not an svg`));
});

test("checkSvg enforces the 100 KB limit", () => {
  assert.ok(checkSvg(ok, 100 * 1024 + 1));
  assert.equal(checkSvg(ok, 100 * 1024), null);
});

test("ownedIconPath only accepts this user's random file names of the right kind", () => {
  const name = "0123456789abcdef01234567";
  assert.equal(ownedIconPath(7, `habits/7/${name}.png`, "image"), `habits/7/${name}.png`);
  assert.equal(ownedIconPath(7, `habits/7/${name}.svg`, "svg"), `habits/7/${name}.svg`);
  assert.equal(ownedIconPath(7, `habits/7/${name}.svg`, "image"), null);
  assert.equal(ownedIconPath(7, `habits/8/${name}.png`, "image"), null);     // another user
  assert.equal(ownedIconPath(7, `habits/7/../8/${name}.png`, "image"), null); // traversal
  assert.equal(ownedIconPath(7, `audio/theme-7.mp3`, "image"), null);
  assert.equal(iconUrl(`habits/7/${name}.webp`), `/api/habits/icon/${name}.webp`);
  assert.equal(iconUrl(null), null);
});

test("line dirs: parse ignores junk, sanitize drops lines that don't exist", () => {
  assert.deepEqual(parseLineDirs('{"0":"rtl","1":"ltr","x":"rtl","2":"up"}'), { 0: "rtl", 1: "ltr" });
  assert.deepEqual(parseLineDirs("not json"), {});
  assert.equal(sanitizeLineDirs('{"0":"ltr","5":"rtl"}', "one\ntwo"), '{"0":"ltr"}');
  assert.equal(sanitizeLineDirs('{"3":"ltr"}', "one"), null);
  assert.equal(sanitizeLineDirs(42, "one"), null);
});
