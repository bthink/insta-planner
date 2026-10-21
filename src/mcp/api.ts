import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

// One application process owns the database and serializes all writes.
const origin = "http://127.0.0.1:3210";
export class PlannerApi {
  constructor(private readonly transport: typeof fetch = fetch) {}

  async request(
    route: string,
    method = "GET",
    body?: unknown,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.transport(`${origin}/api/${route}`, {
        method,
        headers: {
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      throw new Error(
        "Brak odpowiedzi InstaPlanner. Uruchom aplikację na porcie 3210. Po błędzie połączenia sprawdź stan przed ponowieniem zapisu.",
      );
    }
    await this.check(response);
    return response;
  }

  async json(route: string, method = "GET", body?: unknown): Promise<unknown> {
    return (await this.request(route, method, body)).json();
  }

  private async check(response: Response): Promise<void> {
    if (response.ok) return;
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error || `Błąd aplikacji: HTTP ${response.status}`);
  }

  async upload(
    accountId: string,
    name: string,
    stream: Readable,
  ): Promise<unknown> {
    const body = Readable.toWeb(stream);
    try {
      const response = await this.transport(
        `${origin}/api/media?${new URLSearchParams({ accountId, filename: name })}`,
        {
          method: "POST",
          headers: { Origin: origin },
          body,
          duplex: "half",
          redirect: "error",
          signal: AbortSignal.timeout(300000),
        } as RequestInit & { duplex: string },
      );
      await this.check(response);
      return await response.json();
    } finally {
      stream.destroy();
    }
  }
}

export function resolveImportPath(
  filename: string,
  roots: string[],
  allowRoot = false,
): string {
  if (!path.isAbsolute(filename))
    throw new Error("Podaj bezwzględną ścieżkę pliku.");
  const resolved = fs.realpathSync(filename);
  if (
    !roots.some((root) => {
      let canonicalRoot: string;
      try {
        canonicalRoot = fs.realpathSync(root);
      } catch {
        return false;
      }
      const relative = path.relative(canonicalRoot, resolved);
      return (
        (allowRoot || relative !== "") &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    })
  )
    throw new Error(
      "Plik jest poza folderami INSTAPLANNER_IMPORT_DIRS. Użyj dozwolonego folderu lub importu base64.",
    );
  return resolved;
}

export function openImport(filename: string, roots: string[]): Readable {
  const resolved = resolveImportPath(filename, roots);
  const fd = fs.openSync(
    resolved,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 2 * 1024 ** 3)
      throw new Error("Wymagany zwykły plik o rozmiarze do 2 GB.");
    return fs.createReadStream(resolved, { fd, autoClose: true });
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
