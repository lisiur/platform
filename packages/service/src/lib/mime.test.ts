import { describe, expect, it } from "vitest";
import { allowedMimeTypes, extensionForMime, verifyMagicBytes } from "./mime";

describe("extensionForMime", () => {
  it("maps allowed mime types to canonical extensions", () => {
    expect(extensionForMime("image/jpeg")).toBe(".jpg");
    expect(extensionForMime("image/png")).toBe(".png");
    expect(extensionForMime("image/gif")).toBe(".gif");
    expect(extensionForMime("image/webp")).toBe(".webp");
    expect(extensionForMime("application/pdf")).toBe(".pdf");
  });

  it("returns null for disallowed mime types", () => {
    expect(extensionForMime("text/html")).toBeNull();
    expect(extensionForMime("image/svg+xml")).toBeNull();
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
      "image/webp",
    ]);
  });
});

describe("verifyMagicBytes", () => {
  it("accepts a real PNG buffer", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    expect(verifyMagicBytes(png, "image/png")).toBe(true);
  });

  it("accepts a real JPEG buffer", () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(verifyMagicBytes(jpg, "image/jpeg")).toBe(true);
  });

  it("accepts a real PDF buffer", () => {
    const pdf = Buffer.from("%PDF-1.4\nstuff");
    expect(verifyMagicBytes(pdf, "application/pdf")).toBe(true);
  });

  it("accepts a real WebP buffer", () => {
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(verifyMagicBytes(webp, "image/webp")).toBe(true);
  });

  it("accepts a real GIF buffer", () => {
    expect(verifyMagicBytes(Buffer.from("GIF89a..."), "image/gif")).toBe(true);
  });

  it("rejects an HTML buffer claiming to be image/jpeg", () => {
    const html = Buffer.from("<html><script>xss()</script>");
    expect(verifyMagicBytes(html, "image/jpeg")).toBe(false);
  });

  it("rejects a truncated buffer missing the second signature (webp)", () => {
    expect(
      verifyMagicBytes(Buffer.from([0x52, 0x49, 0x46, 0x46]), "image/webp"),
    ).toBe(false);
  });

  it("returns false for an unknown mime type", () => {
    expect(verifyMagicBytes(Buffer.from([0xff, 0xd8, 0xff]), "text/html")).toBe(
      false,
    );
  });

  it("returns false for an empty buffer", () => {
    expect(verifyMagicBytes(Buffer.from([]), "image/png")).toBe(false);
  });
});
