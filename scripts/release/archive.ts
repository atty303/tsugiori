import { gunzipSync, gzipSync } from "node:zlib";

export type Files = ReadonlyMap<string, Uint8Array>;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const limit = 16 * 1024 * 1024;

function validPath(path: string): boolean {
  return path.length <= 100 && /^[A-Za-z0-9_./-]+$/.test(path) &&
    path.split("/").every((part) =>
      part !== "" && part !== "." && part !== ".."
    );
}

/** Deterministic ustar with only regular files, no filesystem metadata. */
export function archive(files: Files): Uint8Array {
  const parts: Uint8Array[] = [];
  for (
    const [path, bytes] of [...files].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
  ) {
    if (!validPath(path)) throw new Error(`Unsupported archive path: ${path}`);
    const header = new Uint8Array(512);
    const put = (offset: number, value: string) =>
      header.set(encoder.encode(value), offset);
    const octal = (value: number, width: number) =>
      value.toString(8).padStart(width - 1, "0") + "\0";
    put(0, path);
    put(100, octal(0o644, 8));
    put(108, octal(0, 8));
    put(116, octal(0, 8));
    put(124, octal(bytes.length, 12));
    put(136, octal(0, 12));
    put(148, "        ");
    put(156, "0");
    put(257, "ustar\0");
    put(263, "00");
    put(
      148,
      header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") +
        "\0 ",
    );
    parts.push(header, bytes, new Uint8Array((512 - bytes.length % 512) % 512));
  }
  parts.push(new Uint8Array(1024));
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  if (length > limit) throw new Error("Release source exceeds 16 MiB");
  const tar = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    tar.set(part, offset);
    offset += part.length;
  }
  return gzipSync(tar, { level: 9 });
}

/** Reject links, duplicate paths, traversal and oversized untrusted archives. */
export function unarchive(bytes: Uint8Array): Files {
  const tar = gunzipSync(bytes, { maxOutputLength: limit });
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  const field = (header: Uint8Array, start: number, length: number) =>
    decoder.decode(header.subarray(start, start + length)).split("\0")[0];
  while (offset + 1024 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (!tar.subarray(offset).every((byte) => byte === 0)) {
        throw new Error("Invalid tar terminator");
      }
      return files;
    }
    const path = field(header, 0, 100);
    const size = Number.parseInt(field(header, 124, 12), 8);
    const checksum = Number.parseInt(field(header, 148, 8), 8);
    const expected = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (
      !validPath(path) || files.has(path) || header[156] !== 48 ||
      field(header, 257, 6) !== "ustar" || field(header, 345, 155) !== "" ||
      !Number.isSafeInteger(size) || size < 0 || checksum !== expected ||
      offset + 512 + size > tar.length - 1024
    ) {
      throw new Error("Invalid source archive");
    }
    files.set(
      path,
      Uint8Array.from(tar.subarray(offset + 512, offset + 512 + size)),
    );
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("Truncated source archive");
}

export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
  );
  return `sha256-${
    [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  }`;
}
