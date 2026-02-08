import * as https from "https";
import { isNamedPrerelease, compareSemver } from "./semver-util";

/**
 *
 * Fetch the latest version for a named package from npm registry
 *
 * @param pkgName - package name to check
 * @returns - latest version of package
 */
export function fetchLatestVersion(pkgName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(pkgName);
    const url = `https://registry.npmjs.org/${encoded}/latest`;

    https
      .get(url, (res) => {
        let body = "";

        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);

            if (json && json.version) {
              resolve(json.version);
            } else {
              reject(new Error("no version in registry response"));
            }
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

/**
 *
 * Fetch the highest version for a named prerelease (e.g. "beta", "alpha")
 *
 * @param pkgName - package to look up
 * @param tagName - prerelease tag to look for (e.g. "beta")
 * @returns  prerelease version or null if no matching versions are found.
 */
export function fetchHighestNamedPrereleaseVersion(
  pkgName: string,
  tagName: string,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(pkgName);
    const url = `https://registry.npmjs.org/${encoded}`;

    https
      .get(url, (res) => {
        let body = "";

        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);

            const versions = Object.keys(json.versions || {});

            const candidates = new Set<string>();

            // include dist-tag if it exists
            if (json && json["dist-tags"] && json["dist-tags"][tagName]) {
              candidates.add(json["dist-tags"][tagName]);
            }

            for (const v of versions) {
              if (isNamedPrerelease(v, tagName)) {
                candidates.add(v);
              }
            }

            if (candidates.size === 0) {
              resolve(null);
              return;
            }

            let best: string | null = null;

            for (const v of candidates) {
              if (!best) {
                best = v;
                continue;
              }

              if (compareSemver(v, best) === 1) {
                best = v;
              }
            }

            resolve(best);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}
