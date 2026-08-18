import { fromBuffer } from "file-type";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "image/svg+xml": ".svg",
};

export function extensionForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

export function allowedMimeTypes(): string[] {
  return Object.keys(MIME_EXT);
}

const MIME_ALIASES: Record<string, string> = {
  "image/vnd.microsoft.icon": "image/x-icon",
};

function isPadding(byte: number | undefined): boolean {
  return (
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0d ||
    byte === 0x20
  );
}

function hasOnlyPadding(buf: Buffer, from: number): boolean {
  for (let i = from; i < buf.length; i++) {
    if (!isPadding(buf[i])) return false;
  }
  return true;
}

function verifyJpeg(buf: Buffer): boolean {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) return false;
    while (i < buf.length && buf[i] === 0xff) i++;
    if (i >= buf.length) return false;
    const marker = buf[i];
    i++;
    if (marker === 0xd9) return hasOnlyPadding(buf, i);
    if (
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      continue;
    if (i + 2 > buf.length) return false;
    if (marker === 0xda) {
      while (i + 1 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const next = buf[i + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          i += 2;
          continue;
        }
        break;
      }
      continue;
    }
    const segLen = buf.readUInt16BE(i);
    if (segLen < 2) return false;
    i += segLen;
  }
  return false;
}

function verifyPng(buf: Buffer): boolean {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 8 || !SIG.every((b, i) => buf[i] === b)) return false;
  if (buf.length < 16 || buf.toString("ascii", 12, 16) !== "IHDR") return false;
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    i += 8 + len + 4;
    if (i > buf.length) return false;
    if (type === "IEND") return i === buf.length;
  }
  return false;
}

function skipSubBlocks(buf: Buffer, i: number): number {
  while (i < buf.length) {
    const size = buf[i];
    i++;
    if (size === 0) return i;
    i += size;
    if (i > buf.length) return -1;
  }
  return -1;
}

function colorTableSize(packed: number): number {
  return packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
}

function verifyGif(buf: Buffer): boolean {
  if (buf.length < 20) return false;
  const header = buf.toString("ascii", 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return false;
  let i = 13 + colorTableSize(buf[10]);
  while (i < buf.length) {
    const block = buf[i];
    if (block === 0x3b) return i === buf.length - 1;
    if (block === 0x21) {
      i = skipSubBlocks(buf, i + 2);
      if (i < 0) return false;
      continue;
    }
    if (block === 0x2c) {
      i += 10 + colorTableSize(buf[i + 9]);
      i = skipSubBlocks(buf, i + 1);
      if (i < 0) return false;
      continue;
    }
    return false;
  }
  return false;
}

function verifyWebp(buf: Buffer): boolean {
  if (buf.length < 16) return false;
  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return false;
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk !== "VP8 " && chunk !== "VP8L" && chunk !== "VP8X") return false;
  return buf.readUInt32LE(4) === buf.length - 8;
}

function verifyPdf(buf: Buffer): boolean {
  if (buf.length < 8 || buf.toString("ascii", 0, 5) !== "%PDF-") return false;
  const tailStart = Math.max(0, buf.length - 64);
  const tail = buf.subarray(tailStart).toString("latin1");
  const idx = tail.lastIndexOf("%%EOF");
  if (idx === -1) return false;
  return hasOnlyPadding(buf, tailStart + idx + 5);
}

function verifyIco(buf: Buffer): boolean {
  if (buf.length < 22) return false;
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return false;
  const count = buf.readUInt16LE(4);
  if (count < 1 || 6 + count * 16 > buf.length) return false;
  let end = 0;
  for (let e = 0; e < count; e++) {
    const base = 6 + e * 16;
    end = Math.max(
      end,
      buf.readUInt32LE(base + 8) + buf.readUInt32LE(base + 12),
    );
  }
  return end === buf.length;
}

export async function verifyMagicBytes(
  buf: Buffer,
  mime: string,
): Promise<boolean> {
  const normalized = MIME_ALIASES[mime] ?? mime;
  if (normalized === "image/svg+xml") {
    const head = buf.subarray(0, 256).toString("utf8").trimStart();
    return head.startsWith("<?xml") || head.startsWith("<svg");
  }
  const detected = await fromBuffer(buf);
  if (detected && detected.mime !== normalized) return false;
  switch (normalized) {
    case "image/jpeg":
      return verifyJpeg(buf);
    case "image/png":
      return verifyPng(buf);
    case "image/gif":
      return verifyGif(buf);
    case "image/webp":
      return verifyWebp(buf);
    case "application/pdf":
      return verifyPdf(buf);
    case "image/x-icon":
      return verifyIco(buf);
    default:
      return false;
  }
}
