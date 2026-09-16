export type CacheRestoreResult = "hit" | "miss";

export interface TaskArtifactCacheAdapter {
  restore(key: string, destination: string): Promise<CacheRestoreResult>;
  store(key: string, source: string): Promise<void>;
}

export class LocalTaskArtifactCache implements TaskArtifactCacheAdapter {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async restore(key: string, destination: string): Promise<CacheRestoreResult> {
    const source = this.pathFor(key);
    try {
      await Deno.stat(source);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return "miss";
      throw error;
    }
    await copyDirectory(source, destination);
    return "hit";
  }

  async store(key: string, source: string): Promise<void> {
    await Deno.mkdir(this.#root, { recursive: true });
    const destination = this.pathFor(key);
    const staging = `${destination}.tmp-${crypto.randomUUID()}`;
    const previous = `${destination}.old-${crypto.randomUUID()}`;
    try {
      await copyDirectory(source, staging);
      let replaced = false;
      try {
        await Deno.rename(destination, previous);
        replaced = true;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
      await Deno.rename(staging, destination);
      if (replaced) await Deno.remove(previous, { recursive: true });
    } catch (error) {
      await removeIfPresent(staging);
      throw error;
    }
  }

  pathFor(key: string): string {
    return `${this.#root}/${key}`;
  }
}

export async function copyDirectory(
  source: string,
  destination: string,
): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const from = `${source}/${entry.name}`;
    const to = `${destination}/${entry.name}`;
    if (entry.isDirectory) {
      await copyDirectory(from, to);
    } else if (entry.isFile) {
      await Deno.copyFile(from, to);
    }
  }
}

export async function removeIfPresent(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}
