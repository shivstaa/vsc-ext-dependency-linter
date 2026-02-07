import * as vscode from "vscode";
import { fetchLatestVersion } from "./fetchVersion";
import { compareVersions, readPackageJson, findVersionRange } from "./utils";
import { parseSemver } from "./semver-util";

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

              const { outdated, aboveLatest } = compareVersions(
                specifiedSem,
                latestSem,
                isCaret,
                isTilde,
              );

              if (aboveLatest) {
                try {
                  const range = findVersionRange(doc, name);

                  if (range) {
                    const message = `Entry is out of range; expected ${latest} but got ${specified}`;
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
                    const message = `Dependency "${name}" is outdated: specified ${specified}; latest ${latest}`;
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
                  `pkg-json-dep-linter: OK - ${name}: specified ${specified} latest ${latest}`,
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
