/**
 *
 * Utility function to parse a semver version string into its components.
 *
 * @param v - version string to parse, e.g. "1.2.3"
 * @returns object with major, minor, patch numbers, or null if invalid
 */
export type PrereleaseIdentifier = number | string;

export interface SemVerParts {
  major: number;
  minor: number;
  patch: number;
  prerelease?: PrereleaseIdentifier[];
}

/**
 *
 * Parses a semver version string into its components
 *
 * @param v - version string to parse
 * @returns object with major, minor, patch, and optional prerelease parts, or null if invalid
 */
export function parseSemver(v: string | undefined): SemVerParts | null {
  if (!v) {
    return null;
  }

  // capture core and optional prerelease (ignores build metadata)
  const m = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);

  if (!m) {
    return null;
  }

  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  const patch = m[3] ? parseInt(m[3], 10) : 0;

  const result: SemVerParts = { major, minor, patch };

  if (m[4]) {
    const ids = m[4].split(".").map((id) => {
      return /^[0-9]+$/.test(id) ? parseInt(id, 10) : id;
    });

    result.prerelease = ids;
  }

  return result;
}

function compareIdentifiers(a: PrereleaseIdentifier, b: PrereleaseIdentifier) {
  const aIsNum = typeof a === "number";
  const bIsNum = typeof b === "number";

  if (aIsNum && bIsNum) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // numeric < non-numeric
  if (aIsNum && !bIsNum) {
    return -1;
  }

  if (!aIsNum && bIsNum) {
    return 1;
  }

  // both strings
  if (a < (b as string)) {
    return -1;
  }

  if (a > (b as string)) {
    return 1;
  }

  return 0;
}

/**
 *
 * Compares two semver version strings
 *
 * @param a - first version to compare
 * @param b - second version to compare
 * @returns the version comparison result
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  if (!pa || !pb) {
    if (pa && !pb) {
      return 1;
    }

    if (!pa && pb) {
      return -1;
    }

    return 0;
  }

  if (pa.major !== pb.major) {
    return pa.major < pb.major ? -1 : 1;
  }

  if (pa.minor !== pb.minor) {
    return pa.minor < pb.minor ? -1 : 1;
  }

  if (pa.patch !== pb.patch) {
    return pa.patch < pb.patch ? -1 : 1;
  }

  const aPre = pa.prerelease;
  const bPre = pb.prerelease;

  if (!aPre && !bPre) {
    return 0;
  }

  // release > prerelease
  if (!aPre && bPre) {
    return 1;
  }

  if (aPre && !bPre) {
    return -1;
  }

  const len = Math.max(aPre!.length, bPre!.length);

  for (let i = 0; i < len; i++) {
    const ai = aPre![i];
    const bi = bPre![i];

    if (ai === undefined) {
      return -1;
    }

    if (bi === undefined) {
      return 1;
    }

    const cmp = compareIdentifiers(ai, bi);

    if (cmp !== 0) {
      return cmp;
    }
  }

  return 0;
}

/**
 *
 * Checks if a version string is a prerelease with a specific tag as its identifier
 *
 * @param v - package version
 * @param name - prerelease tag for lookup
 * @returns true if version is a prerelease and the prerelease identifier
 */
export function isNamedPrerelease(v: string | undefined, name: string) {
  const p = parseSemver(v);

  if (!p || !p.prerelease || p.prerelease.length === 0) {
    return false;
  }

  const first = p.prerelease[0];

  return String(first) === name;
}
