import * as vscode from "vscode";

/**
 *
 * Compares the specified semver with the latest semver and determines if it's outdated.
 *
 * @param specifiedSem - the semver specified in package.json (after removing ^ or ~)
 * @param latestSem - the latest semver fetched from npm registry
 * @param isCaret - whether the specified version had a caret (^), which allows minor and patch updates
 * @param isTilde - whether the specified version had a tilde (~), which allows patch updates within same minor
 * @returns whether the specified version is considered outdated compared to latest
 */
export function compareVersions(
  specifiedSem: {
    major: number;
    minor: number;
    patch: number;
  },
  latestSem: {
    major: number;
    minor: number;
    patch: number;
  },
  isCaret: boolean,
  isTilde: boolean,
) {
  let outdated = false;
  let aboveLatest = false;

  /*
    - Caret
    - caret allows minor and patch updates: ^A.B.C accepts < (A+1).0.0
    */
  if (isCaret) {
    if (latestSem.major > specifiedSem.major) {
      outdated = true;
    }
  } else if (isTilde) {
    /*
    - Tilde
    - tilde allows patch updates within same minor: ~A.B.C accepts < A.(B+1).0 
    */
    if (
      latestSem.major > specifiedSem.major ||
      (latestSem.major === specifiedSem.major &&
        latestSem.minor > specifiedSem.minor)
    ) {
      outdated = true;
    }
  } else {
    /* fixed version: any minor or patch increase is outdated */
    if (
      latestSem.major > specifiedSem.major ||
      (latestSem.major === specifiedSem.major &&
        (latestSem.minor > specifiedSem.minor ||
          (latestSem.minor === specifiedSem.minor &&
            latestSem.patch > specifiedSem.patch)))
    ) {
      outdated = true;
    }
  }

  // detect if specified version is greater than latest available
  if (specifiedSem.major > latestSem.major) {
    aboveLatest = true;
  } else if (specifiedSem.major === latestSem.major) {
    if (specifiedSem.minor > latestSem.minor) {
      aboveLatest = true;
    } else if (
      specifiedSem.minor === latestSem.minor &&
      specifiedSem.patch > latestSem.patch
    ) {
      aboveLatest = true;
    }
  }

  return {
    outdated,
    aboveLatest,
  };
}

/**
 *
 * Reads package.json, checks dependencies against npm registry for outdated versions, and creates diagnostics for any outdated dependencies.
 *
 * @param pkgUri - gets package json uri from workspace
 * @returns the opened text document and parsed package.json object
 */
export async function readPackageJson(
  pkgUri: vscode.Uri,
): Promise<{ doc: vscode.TextDocument; pkgObj: any }> {
  const doc = await vscode.workspace.openTextDocument(pkgUri);
  const content = doc.getText();
  const pkgObj = JSON.parse(content);

  return {
    doc,
    pkgObj,
  };
}

/**
 *
 * finds the range of the version string for a given dependency in package.json, to be used for diagnostics
 *
 * @param doc - the text document of package.json
 * @param name - the dependency name to find in package.json
 * @returns the range of the version string for the given dependency
 */
export function findVersionRange(
  doc: vscode.TextDocument,
  name: string,
): vscode.Range | undefined {
  try {
    const text = doc.getText();
    const key = `"${name}"`;
    let idx = text.indexOf(key);

    while (idx !== -1) {
      const colonIdx = text.indexOf(":", idx + key.length);

      if (colonIdx === -1) {
        break;
      }

      const firstQuote = text.indexOf('"', colonIdx + 1);

      if (firstQuote === -1) {
        break;
      }

      const secondQuote = text.indexOf('"', firstQuote + 1);

      if (secondQuote === -1) {
        break;
      }

      const startPos = doc.positionAt(firstQuote + 1);
      const endPos = doc.positionAt(secondQuote);

      return new vscode.Range(startPos, endPos);
    }
  } catch (err) {
    console.error("pkg-json-dep-linter: findVersionRange error", err);
    vscode.window.showErrorMessage("Failed create version range.");
  }

  return undefined;
}
