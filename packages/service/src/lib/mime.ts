const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export function extensionForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

export function allowedMimeTypes(): string[] {
  return Object.keys(MIME_EXT);
}

type Sig = { offset: number; bytes: number[] };

const SIGNATURES: Record<string, Sig[]> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ],
  "image/gif": [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
};

export function verifyMagicBytes(buf: Buffer, mime: string): boolean {
  const sigs = SIGNATURES[mime];
  if (!sigs) return false;
  return sigs.every(({ offset, bytes }) =>
    bytes.every((b, i) => buf[offset + i] === b),
  );
}
