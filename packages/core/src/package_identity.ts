import metadata from "../../../deno.json" with { type: "json" };

export const TSUGIORI_PACKAGE_NAME = metadata.name;
export const TSUGIORI_PACKAGE_VERSION = metadata.version;
export const TSUGIORI_PACKAGE_IDENTITY =
  `${TSUGIORI_PACKAGE_NAME}@${TSUGIORI_PACKAGE_VERSION}`;
