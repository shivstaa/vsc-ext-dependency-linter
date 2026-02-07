import * as https from "https";

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
