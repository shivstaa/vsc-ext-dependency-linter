/**
 *
 * Utility function to parse a semver version string into its components.
 *
 * @param v - version string to parse, e.g. "1.2.3"
 * @returns object with major, minor, patch numbers, or null if invalid
 */
export function parseSemver(v: string | undefined) {
  if (!v) {
    return null;
  }

  const m = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

  if (!m) {
    return null;
  }

  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  const patch = m[3] ? parseInt(m[3], 10) : 0;

  return {
    major,
    minor,
    patch,
  };
}
