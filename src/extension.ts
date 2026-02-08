import * as vscode from "vscode";
import {
  fetchLatestVersion,
  fetchHighestNamedPrereleaseVersion,
} from "./utils/fetchVersion";
import {
  compareVersions,
  readPackageJson,
  findVersionRange,
} from "./utils/utils";
import { parseSemver, compareSemver } from "./utils/semver-util";

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection(
    "pkg-json-dep-linter",
  );
  context.subscriptions.push(diagnosticCollection);

  async function checkPackageJson(pkgUri: vscode.Uri) {
    // ignore package.json files inside node_modules
    if (pkgUri.fsPath.includes("node_modules")) {
      return;
    }

    try {
      const { doc, pkgObj } = await readPackageJson(pkgUri);

      const depsGroups: Array<{
        name: string;
        deps: Record<string, string> | undefined;
      }> = [
        { name: "dependencies", deps: pkgObj.dependencies },
        { name: "devDependencies", deps: pkgObj.devDependencies },
      ];

      // clear previous diagnostics for this file
      diagnosticCollection.set(pkgUri, []);
      const allDiagnostics: vscode.Diagnostic[] = [];

      for (const group of depsGroups) {
        if (!group.deps) {
          continue;
        }

        const names = Object.keys(group.deps);

        await Promise.all(
          names.map(async (name) => {
            const specified = group.deps![name];

            if (!specified || typeof specified !== "string") {
              return;
            }

            if (
              specified.startsWith("file:") ||
              specified.startsWith("git+") ||
              specified.startsWith("workspace:")
            ) {
              return;
            }

            const specTrim = specified.trim();
            const isCaret = specTrim.startsWith("^");
            const isTilde = specTrim.startsWith("~");
            const cleaned = specTrim.replace(/^[\^~\s]+/, "");
            const specifiedSem = parseSemver(cleaned);

            if (!specifiedSem) {
              return;
            }

            try {
              const latest = await fetchLatestVersion(name);
              const latestSem = parseSemver(latest);

              if (!latestSem) {
                return;
              }

              /**
               * If the package.json specified version includes a named prerelease (e.g. "beta"),
               * check the highest matching named prerelease from npm and compare against that.
               * which version we'll compare against in messages/logs (defaults to release latest)
               */
              let outdated = false;
              let aboveLatest = false;
              let comparedToVersion: string | null = latest;

              const hasNamedPre =
                specifiedSem &&
                (specifiedSem as any).prerelease &&
                (specifiedSem as any).prerelease.length > 0 &&
                typeof (specifiedSem as any).prerelease[0] === "string";

              if (hasNamedPre) {
                const tagName = String((specifiedSem as any).prerelease[0]);
                try {
                  const best = await fetchHighestNamedPrereleaseVersion(
                    name,
                    tagName,
                  );

                  if (best) {
                    comparedToVersion = best;
                    const cmp = compareSemver(cleaned, best);

                    if (cmp === -1) {
                      outdated = true;
                    } else if (cmp === 1) {
                      aboveLatest = true;
                    }
                  } else {
                    // fallback to release latest if no prerelease versions found for tag
                    const cv = compareVersions(
                      specifiedSem as any,
                      latestSem,
                      isCaret,
                      isTilde,
                    );
                    outdated = cv.outdated;
                    aboveLatest = cv.aboveLatest;
                  }
                } catch (err) {
                  console.error(
                    `pkg-json-dep-linter: error fetching named prerelease for ${name}:`,
                    err,
                  );
                }
              } else {
                const cv = compareVersions(
                  specifiedSem as any,
                  latestSem,
                  isCaret,
                  isTilde,
                );
                outdated = cv.outdated;
                aboveLatest = cv.aboveLatest;
              }

              if (aboveLatest) {
                try {
                  const range = findVersionRange(doc, name);

                  if (range) {
                    const message = `Entry is out of range; expected ${comparedToVersion} but got ${specified}`;
                    const diag = new vscode.Diagnostic(
                      range,
                      message,
                      vscode.DiagnosticSeverity.Error,
                    );
                    diag.source = "pkg-json-dep-linter";
                    allDiagnostics.push(diag);
                  }
                } catch (err) {
                  console.error(
                    "pkg-json-dep-linter: failed to create diagnostic range",
                    err,
                  );
                }
                return;
              }

              if (outdated) {
                try {
                  const range = findVersionRange(doc, name);

                  if (range) {
                    const message = `Dependency "${name}" is outdated: specified ${specified}; latest ${comparedToVersion}`;
                    const diag = new vscode.Diagnostic(
                      range,
                      message,
                      vscode.DiagnosticSeverity.Warning,
                    );
                    diag.source = "pkg-json-dep-linter";
                    allDiagnostics.push(diag);
                  }
                } catch (err) {
                  console.error(
                    "pkg-json-dep-linter: failed to create diagnostic range",
                    err,
                  );
                }
              } else {
                console.log(
                  `pkg-json-dep-linter: OK - ${name}: specified ${specified} latest ${comparedToVersion}`,
                );
              }
            } catch (err) {
              console.error(
                `pkg-json-dep-linter: error fetching latest for ${name}:`,
                err,
              );
            }
          }),
        );
      }

      if (allDiagnostics.length > 0) {
        diagnosticCollection.set(pkgUri, allDiagnostics);
      } else {
        diagnosticCollection.delete(pkgUri);
      }
    } catch (err) {
      console.error("pkg-json-dep-linter: failed to read package.json", err);
    }
  }

  // Watch all package.json files in the workspace and run check on create/change
  const watcher = vscode.workspace.createFileSystemWatcher("**/package.json");
  watcher.onDidCreate((uri) => void checkPackageJson(uri));
  watcher.onDidChange((uri) => void checkPackageJson(uri));
  watcher.onDidDelete((uri) => diagnosticCollection.delete(uri));
  context.subscriptions.push(watcher);

  // Run check for any existing package.json files on activation
  (async () => {
    const files = await vscode.workspace.findFiles("**/package.json");
    for (const f of files) {
      await checkPackageJson(f);
    }
  })();
}

// This method is called when your extension is deactivated
export function deactivate() {}
