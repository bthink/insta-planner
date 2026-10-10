import fs from "node:fs";
import { Readable } from "node:stream";
import { AppError, getStore } from "@/server/store";
import { safePath } from "@/server/files";
import { checkRequest, readJson } from "@/server/http";
import { generateCaption } from "@/server/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  try {
    checkRequest(request);
    const store = await getStore();
    const segments = (await context.params).path;
    const [resource, id, action] = segments;
    if (segments.length > 3) throw new AppError("Nie znaleziono akcji.", 404);
    const method = request.method;
    const url = new URL(request.url);
    if (resource === "health" && method === "GET")
      return json({
        app: "InstaPlanner",
        ready: true,
        instanceId: process.env.INSTAPLANNER_INSTANCE_ID || null,
      });
    if (resource === "settings" && method === "GET")
      return json({
        dataDir: store.root,
        aiAvailable: !!process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      });
    if (resource === "accounts") {
      if (method === "GET") return json(store.accounts());
      if (method === "POST" || method === "PATCH") {
        const body = await readJson(request);
        return json(await store.lock(() => store.saveAccount(body, id)));
      }
      if (method === "DELETE" && id) {
        await store.lock(() => store.deleteAccount(id));
        return json({ ok: true });
      }
    }
    if (resource === "media") {
      if (method === "GET" && !id)
        return json(store.media(url.searchParams.get("accountId") || ""));
      if (method === "GET" && id) {
        const medium = store.medium(id),
          thumb = action === "thumbnail";
        const relative = thumb
          ? medium.thumbnailRelativePath
          : medium.storedRelativePath;
        if (!relative) throw new AppError("Brak miniatury.", 404);
        const filename = safePath(store.root, relative),
          stat = fs.statSync(filename);
        const stream = Readable.toWeb(
          fs.createReadStream(filename),
        ) as ReadableStream;
        return new Response(stream, {
          headers: {
            "Content-Type": thumb ? "image/jpeg" : medium.mimeType,
            "Content-Length": String(stat.size),
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "POST" && !id) {
        if (!request.body) throw new AppError("Wybierz plik.");
        const accountId = url.searchParams.get("accountId") || "",
          filename = url.searchParams.get("filename") || "";
        const stream = Readable.fromWeb(
          request.body as Parameters<typeof Readable.fromWeb>[0],
        );
        return json(
          await store.lock(() =>
            store.importMedia(accountId, filename, stream),
          ),
          201,
        );
      }
      if (method === "POST" && id && action === "copy") {
        const body = await readJson(request);
        return json(
          await store.lock(() => store.copyMedia(id, String(body.accountId))),
          201,
        );
      }
      if (method === "DELETE" && id) {
        await store.lock(() => store.deleteMedia(id));
        return json({ ok: true });
      }
    }
    if (resource === "posts") {
      if (method === "GET")
        return json(
          id
            ? store.post(id)
            : store.posts(url.searchParams.get("accountId") || ""),
        );
      if ((method === "POST" && !id) || (method === "PATCH" && id)) {
        const body = await readJson(request);
        return json(
          await store.lock(() => store.savePost(body, id)),
          id ? 200 : 201,
        );
      }
      if (method === "DELETE" && id) {
        await store.lock(() => store.deletePost(id));
        return json({ ok: true });
      }
      if (method === "POST" && id && action) {
        if (action === "retry")
          return json(await store.lock(() => store.retry(id)));
        if (action === "export")
          return json(await store.lock(() => store.manualExport(id)));
        if (action === "remove-export")
          return json(await store.lock(() => store.removeManualExport(id)));
        const body = await readJson(request);
        if (action === "schedule")
          return json(
            await store.lock(() =>
              store.schedule(id, body.date, Number(body.revision)),
            ),
          );
        if (action === "publish") {
          if (typeof body.published !== "boolean")
            throw new AppError("Nieprawidłowy status publikacji.");
          return json(
            await store.lock(() =>
              store.publish(
                id,
                body.published as boolean,
                Number(body.revision),
              ),
            ),
          );
        }
        if (action === "open") {
          await store.lock(() =>
            store.openFolder(
              id,
              body.purpose === "manual" ? "manual" : "queue",
            ),
          );
          return json({ ok: true });
        }
        if (action === "ai")
          return json(await generateCaption(store, id, body));
      }
    }
    if (resource === "backup" && method === "POST") {
      const relative = await store.lock(() => store.backup());
      return json({ relative, path: safePath(store.root, relative) });
    }
    throw new AppError("Nie znaleziono akcji.", 404);
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    const code = (error as NodeJS.ErrnoException).code;
    return json(
      {
        error:
          code === "ENOSPC"
            ? "Brak miejsca na dysku."
            : code === "EACCES" || code === "EPERM"
              ? "Brak dostępu do folderu danych. Sprawdź uprawnienia i .env.local."
              : "Operacja nie powiodła się. Sprawdź folder danych i spróbuj ponownie.",
      },
      500,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
