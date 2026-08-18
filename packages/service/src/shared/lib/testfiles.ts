export function minimalJpeg(): Buffer {
  const parts: Buffer[] = [
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0".padEnd(14, "\0")),
    Buffer.from([0xff, 0xdb, 0x00, 0x05, 0x01, 0x02, 0x03]),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    Buffer.from([0x12, 0x34, 0x56, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ];
  return Buffer.concat(parts);
}

export function minimalPng(): Buffer {
  const ihdr = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr, 0);
  ihdr.writeUInt32BE(13, 8);
  ihdr.write("IHDR", 12, "ascii");
  ihdr.writeUInt32BE(1, 16);
  ihdr.writeUInt32BE(1, 20);
  ihdr[24] = 8;
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iend.write("IEND", 4, "ascii");
  return Buffer.concat([ihdr, iend]);
}

export function minimalGif(): Buffer {
  return Buffer.concat([
    Buffer.from("GIF89a", "ascii"),
    Buffer.from([0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]),
    Buffer.from([0x3b]),
  ]);
}

export function minimalWebp(): Buffer {
  const buf = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "ascii"),
    Buffer.from("VP8 ", "ascii"),
    Buffer.from([0x0a, 0x00, 0x00, 0x00, 0x00, 0x9d]),
  ]);
  buf.writeUInt32LE(buf.length - 8, 4);
  return buf;
}

export function minimalPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
  );
}

export function minimalIco(): Buffer {
  const payload = Buffer.from([0x28, 0x00, 0x00, 0x00, 0x01, 0x00]);
  const buf = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
    Buffer.alloc(16),
    payload,
  ]);
  const entryOffset = 6;
  buf.writeUInt32LE(payload.length, entryOffset + 8);
  buf.writeUInt32LE(22, entryOffset + 12);
  return buf;
}
