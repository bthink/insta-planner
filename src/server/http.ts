import { AppError } from "./store";
export function checkRequest(request: Request): void {
  const url = new URL(request.url);
  const allowed = new Set(["127.0.0.1:3210", "localhost:3210"]);
  const host = request.headers.get("host") || url.host;
  if (!allowed.has(host) || !allowed.has(url.host))
    throw new AppError("Aplikacja jest dostępna wyłącznie lokalnie.", 403);
  // Next may normalize Request.url to localhost internally. The browser's Host
  // header identifies the actual origin, which still must be loopback only.
  const expectedOrigin = `http://${host}`;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site")
    throw new AppError("Żądanie z innej strony zostało odrzucone.", 403);
  if (!["GET", "HEAD"].includes(request.method) && origin !== expectedOrigin)
    throw new AppError("Żądanie musi pochodzić z lokalnej aplikacji.", 403);
  if (origin && origin !== expectedOrigin)
    throw new AppError("Nieprawidłowe pochodzenie żądania.", 403);
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 100000) throw new AppError("Żądanie jest zbyt duże.", 413);
  const raw = await request.text();
  if (raw.length > 100000) throw new AppError("Żądanie jest zbyt duże.", 413);
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw new AppError("Nieprawidłowa treść żądania.");
  }
}
