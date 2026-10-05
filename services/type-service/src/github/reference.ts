import { ServiceError } from "../errors.ts";

export type ActionSource = Readonly<
  { uses: string; owner: string; repo: string; path: string; ref: string }
>;

export function parseUses(uses: string): ActionSource {
  const at = uses.indexOf("@");
  const location = uses.slice(0, at).split("/");
  const ref = uses.slice(at + 1);
  if (
    at < 0 || uses.length > 2048 || location.length < 2 ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(location[0]) ||
    !/^[A-Za-z0-9_.-]+$/.test(location[1]) ||
    location.some((part) => !part || part === "." || part === "..") ||
    [...uses.slice(0, at) + ref].some((char) =>
      char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 ||
      "\\@?#".includes(char)
    ) || !ref ||
    ref.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new ServiceError("invalid_request", 400);
  }
  return {
    uses,
    owner: location[0],
    repo: location[1],
    path: location.slice(2).join("/"),
    ref,
  };
}

export function encodeUses(source: ActionSource): string {
  const location = [
    source.owner,
    source.repo,
    ...source.path.split("/").filter(Boolean),
  ].map(encodeURIComponent).join("/");
  return `${location}@${encodeURIComponent(source.ref)}`;
}

export function metadataUrl(
  source: ActionSource,
  sha: string,
  filename: string,
): string {
  return `https://github.com/${encodeURIComponent(source.owner)}/${
    encodeURIComponent(source.repo)
  }/blob/${sha}/${
    [...source.path.split("/").filter(Boolean), filename].map(
      encodeURIComponent,
    ).join("/")
  }`;
}
