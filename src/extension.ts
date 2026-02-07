import * as vscode from "vscode";
import { fetchLatestVersion } from "./fetchVersion";
import { compareVersions, readPackageJson, findVersionRange } from "./utils";
import { parseSemver } from "./semver-util";

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection(
    "pkg-json-dep-linter",
  );
  context.subscriptions.push(diagnosticCollection);

  const disposable = vscode.commands.registerCommand(
    "pkg-json-dep-linter.helloWorld",
    async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage(
          "No workspace folder is open. Open a folder with a package.json to use this command.",
        );
        return;
      }

      const pkgUri = vscode.Uri.joinPath(folders[0].uri, "package.json");
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
                console.log(
                  `pkg-json-dep-linter: skipping ${name} (non-registry spec: ${specified})`,
                );
                return;
              }

              const specTrim = specified.trim();
              const isCaret = specTrim.startsWith("^");
              const isTilde = specTrim.startsWith("~");
              const cleaned = specTrim.replace(/^[\^~\s]+/, "");
              const specifiedSem = parseSemver(cleaned);

              if (!specifiedSem) {
                console.log(
                  `pkg-json-dep-linter: skipping ${name} (cannot parse specified version: ${specified})`,
                );
                return;
              }

              try {
                const latest = await fetchLatestVersion(name);
                const latestSem = parseSemver(latest);

                if (!latestSem) {
                  console.log(
                    `pkg-json-dep-linter: cannot parse latest version for ${name}: ${latest}`,
                  );
                  return;
                }

                const { outdated } = compareVersions(
                  specifiedSem,
                  latestSem,
                  isCaret,
                  isTilde,
                );

                if (outdated) {
                  console.log(
                    `pkg-json-dep-linter: OUTDATED - ${name}: specified ${specified}; latest ${latest})`,
                  );
                  try {
                    const range = findVersionRange(doc, name);

                    if (range) {
                      const message = `Dependency ${name} is outdated: specified ${specified}; latest ${latest}`;
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

        vscode.window.showInformationMessage(
          "package.json checked for outdated packages.",
        );
      } catch (err) {
        console.error("pkg-json-dep-linter: failed to read package.json", err);
        vscode.window.showErrorMessage(
          "Failed to read package.json. See Debug Console for details.",
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
