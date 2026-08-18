import { describe, expect, it } from "vitest";
import { allowedMimeTypes, extensionForMime, verifyMagicBytes } from "./mime";
import {
  minimalGif,
  minimalIco,
  minimalJpeg,
  minimalPdf,
  minimalPng,
  minimalWebp,
} from "./testfiles";

describe("extensionForMime", () => {
  it("maps allowed mime types to canonical extensions", () => {
    expect(extensionForMime("image/jpeg")).toBe(".jpg");
    expect(extensionForMime("image/png")).toBe(".png");
    expect(extensionForMime("image/gif")).toBe(".gif");
    expect(extensionForMime("image/webp")).toBe(".webp");
    expect(extensionForMime("application/pdf")).toBe(".pdf");
    expect(extensionForMime("image/x-icon")).toBe(".ico");
    expect(extensionForMime("image/vnd.microsoft.icon")).toBe(".ico");
    expect(extensionForMime("image/svg+xml")).toBe(".svg");
  });

  it("returns null for disallowed mime types", () => {
    expect(extensionForMime("text/html")).toBeNull();
    expect(extensionForMime("application/octet-stream")).toBeNull();
  });
});

describe("allowedMimeTypes", () => {
  it("returns exactly the supported mime types", () => {
    expect(allowedMimeTypes().sort()).toEqual([
      "application/pdf",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/svg+xml",
      "image/vnd.microsoft.icon",
      "image/webp",
      "image/x-icon",
    ]);
  });
});

describe("verifyMagicBytes", () => {
  it("accepts a well-formed PNG", async () => {
    expect(await verifyMagicBytes(minimalPng(), "image/png")).toBe(true);
  });

  it("accepts a well-formed JPEG", async () => {
    expect(await verifyMagicBytes(minimalJpeg(), "image/jpeg")).toBe(true);
  });

  it("accepts a well-formed PDF", async () => {
    expect(await verifyMagicBytes(minimalPdf(), "application/pdf")).toBe(true);
  });

  it("accepts a well-formed WebP", async () => {
    expect(await verifyMagicBytes(minimalWebp(), "image/webp")).toBe(true);
  });

  it("accepts a well-formed GIF", async () => {
    expect(await verifyMagicBytes(minimalGif(), "image/gif")).toBe(true);
  });

  it("accepts a well-formed ICO under both icon mime types", async () => {
    expect(await verifyMagicBytes(minimalIco(), "image/x-icon")).toBe(true);
    expect(
      await verifyMagicBytes(minimalIco(), "image/vnd.microsoft.icon"),
    ).toBe(true);
  });

  it("accepts an SVG document", async () => {
    expect(
      await verifyMagicBytes(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        "image/svg+xml",
      ),
    ).toBe(true);
  });

  it("rejects a JPEG polyglot with trailing HTML", async () => {
    const polyglot = Buffer.concat([
      minimalJpeg(),
      Buffer.from("<html><script>xss()</script></html>"),
    ]);
    expect(await verifyMagicBytes(polyglot, "image/jpeg")).toBe(false);
  });

  it("rejects a PNG with trailing HTML after IEND", async () => {
    const polyglot = Buffer.concat([
      minimalPng(),
      Buffer.from("<script>alert(1)</script>"),
    ]);
    expect(await verifyMagicBytes(polyglot, "image/png")).toBe(false);
  });

  it("rejects a WebP with data appended past the RIFF size", async () => {
    const polyglot = Buffer.concat([minimalWebp(), Buffer.from("<b>hi</b>")]);
    expect(await verifyMagicBytes(polyglot, "image/webp")).toBe(false);
  });

  it("rejects a GIF with trailing HTML before the trailer", async () => {
    const gif = minimalGif();
    const tampered = Buffer.concat([
      gif.subarray(0, gif.length - 1),
      Buffer.from("<script>x()</script>"),
      gif.subarray(gif.length - 1),
    ]);
    expect(await verifyMagicBytes(tampered, "image/gif")).toBe(false);
  });

  it("rejects a PDF without a trailing %%EOF marker", async () => {
    const fake = Buffer.from("%PDF-1.4<html><script>xss()</script>");
    expect(await verifyMagicBytes(fake, "application/pdf")).toBe(false);
  });

  it("rejects a fake-header JPEG (SOI bytes followed by HTML)", async () => {
    const fake = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from("<html><body>not a jpeg</body></html>"),
    ]);
    expect(await verifyMagicBytes(fake, "image/jpeg")).toBe(false);
  });

  it("rejects a fake-header GIF (GIF8 without a versioned header)", async () => {
    const fake = Buffer.concat([
      Buffer.from("GIF8zz"),
      Buffer.from("junk that is not gif data"),
    ]);
    expect(await verifyMagicBytes(fake, "image/gif")).toBe(false);
  });

  it("rejects a fake-header WebP (no VP8 chunk)", async () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.alloc(4),
      Buffer.from("WEBP", "ascii"),
      Buffer.from("XXXX"),
    ]);
    buf.writeUInt32LE(buf.length - 8, 4);
    expect(await verifyMagicBytes(buf, "image/webp")).toBe(false);
  });

  it("rejects an HTML buffer claiming to be image/jpeg", async () => {
    const html = Buffer.from("<html><script>xss()</script>");
    expect(await verifyMagicBytes(html, "image/jpeg")).toBe(false);
  });

  it("rejects content whose real format differs from the declared type", async () => {
    expect(await verifyMagicBytes(minimalPng(), "image/jpeg")).toBe(false);
    expect(await verifyMagicBytes(minimalJpeg(), "image/png")).toBe(false);
  });

  it("rejects a truncated buffer missing the second signature (webp)", async () => {
    expect(
      await verifyMagicBytes(
        Buffer.from([0x52, 0x49, 0x46, 0x46]),
        "image/webp",
      ),
    ).toBe(false);
  });

  it("returns false for an unknown mime type", async () => {
    expect(
      await verifyMagicBytes(Buffer.from([0xff, 0xd8, 0xff]), "text/html"),
    ).toBe(false);
  });

  it("returns false for an empty buffer", async () => {
    expect(await verifyMagicBytes(Buffer.from([]), "image/png")).toBe(false);
  });
});
