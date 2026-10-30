import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { fileTypeFromFile } from "file-type";
import type Database from "better-sqlite3";
import type {
  Account,
  Media,
  Post,
  PostInput,
  ExportState,
} from "../lib/types";
import {
  configuredRoot,
  initializeRoot,
  safePath,
  slug,
  copyTree,
} from "./files";
import { openDatabase } from "./database";

const run = promisify(execFile);
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function text(value: unknown, label: string, max = 20000): string {
  if (typeof value !== "string" || value.length > max)
    throw new AppError(`Nieprawidłowe pole: ${label}.`);
  return value;
}
export function validateDate(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AppError("Nieprawidłowa data.");
  const date = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new AppError("Nieprawidłowa data.");
  return value;
}

type Manifest = {
  app: "InstaPlanner";
  postId: string;
  purpose: "queue" | "manual";
  revision: number;
};
export class Store {
  readonly db: Database.Database;
  private tail: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;
  // Fault injection is used only by data integrity tests.
  fault?: (point: "prepared" | "installed" | "cleanup", post: Post) => void;

  constructor(readonly root: string) {
    initializeRoot(root);
    this.db = openDatabase(root);
    this.ready = this.lock(async () => {
      await this.reconcile();
    });
  }
  lock<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
  accounts(): Account[] {
    return this.db
      .prepare("SELECT * FROM accounts ORDER BY rowid")
      .all() as Account[];
  }
  account(id: string): Account {
    const account = this.db
      .prepare("SELECT * FROM accounts WHERE id = ?")
      .get(id) as Account | undefined;
    if (!account) throw new AppError("Konto nie istnieje.", 404);
    return account;
  }
  saveAccount(input: unknown, id?: string): Account {
    const data = input as Account;
    const name = text(data.name, "nazwa", 120).trim();
    if (!name) throw new AppError("Podaj nazwę konta.");
    const accent = text(data.accent, "kolor", 7);
    if (!/^#[0-9a-f]{6}$/i.test(accent))
      throw new AppError("Wybierz poprawny kolor.");
    const aiContext = text(data.aiContext ?? "", "kontekst AI");
    const handle = text(data.handle ?? "", "identyfikator konta", 120).trim();
    if (id) {
      this.account(id);
      this.db
        .prepare(
          "UPDATE accounts SET name = ?, accent = ?, aiContext = ?, handle = ? WHERE id = ?",
        )
        .run(name, accent, aiContext, handle, id);
    } else {
      id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO accounts (id,name,slug,accent,aiContext,handle) VALUES (?,?,?,?,?,?)",
        )
        .run(
          id,
          name,
          `${slug(name)}-${id.slice(0, 8)}`,
          accent,
          aiContext,
          handle,
        );
    }
    return this.account(id);
  }
  deleteAccount(id: string): void {
    this.account(id);
    if (
      this.db
        .prepare(
          "SELECT id FROM posts WHERE accountId = ? UNION SELECT id FROM media WHERE accountId = ? LIMIT 1",
        )
        .get(id, id)
    )
      throw new AppError(
        "Można usunąć tylko puste konto. Konto z historią zachowujemy.",
      );
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  }
  media(accountId: string): Media[] {
    this.account(accountId);
    return this.db
      .prepare(
        `SELECT m.*,
      (SELECT COUNT(*) FROM post_media pm JOIN posts p ON p.id = pm.postId WHERE pm.mediaId = m.id AND p.deleted = 0 AND p.scheduledDate IS NOT NULL AND p.publicationConfirmedAt IS NULL) planned,
      (SELECT COUNT(*) FROM post_media pm JOIN posts p ON p.id = pm.postId WHERE pm.mediaId = m.id AND p.deleted = 0 AND p.publicationConfirmedAt IS NOT NULL) published
      FROM media m WHERE accountId = ? AND hiddenFromPool = 0 ORDER BY createdAt DESC`,
      )
      .all(accountId) as Media[];
  }
  medium(id: string): Media {
    const row = this.db.prepare("SELECT * FROM media WHERE id = ?").get(id) as
      Media | undefined;
    if (!row) throw new AppError("Medium nie istnieje.", 404);
    return row;
  }
  private async thumbnail(
    id: string,
    source: string,
    type: Media["mediaType"],
  ): Promise<{ relative: string | null; error: string | null }> {
    const relative = `miniatury/${id}.jpg`,
      destination = safePath(this.root, relative);
    try {
      if (type === "image")
        await sharp(source)
          .rotate()
          .resize(640, 640, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(destination);
      else
        await run(
          process.env.FFMPEG_PATH || "ffmpeg",
          [
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-i",
            source,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:640:force_original_aspect_ratio=decrease",
            destination,
          ],
          { timeout: 30000, maxBuffer: 1024 * 1024 },
        );
      return { relative, error: null };
    } catch {
      fs.rmSync(destination, { force: true });
      return {
        relative: null,
        error:
          type === "video"
            ? "Brak miniatury filmu. Sprawdź FFmpeg i format pliku."
            : "Nie udało się przygotować miniatury zdjęcia.",
      };
    }
  }
  async importMedia(
    accountId: string,
    originalName: string,
    stream: Readable,
  ): Promise<Media> {
    this.account(accountId);
    text(originalName, "nazwa pliku", 255);
    originalName = path.basename(originalName.replace(/\\/g, "/"));
    const id = randomUUID(),
      directory = safePath(this.root, `media/${accountId}`);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = safePath(this.root, `media/${accountId}/.${id}.upload`);
    let stored: string | undefined;
    try {
      let size = 0;
      const hash = createHash("sha256");
      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > 2 * 1024 ** 3)
            return callback(new AppError("Maksymalny rozmiar pliku to 2 GB."));
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        stream,
        meter,
        fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
      const detected = await fileTypeFromFile(temporary);
      const allowed: Record<string, { ext: string; type: Media["mediaType"] }> =
        {
          "image/jpeg": { ext: "jpg", type: "image" },
          "image/png": { ext: "png", type: "image" },
          "image/webp": { ext: "webp", type: "image" },
          "video/mp4": { ext: "mp4", type: "video" },
          "video/quicktime": { ext: "mov", type: "video" },
        };
      const format = detected && allowed[detected.mime];
      if (!format || !detected)
        throw new AppError(
          "Obsługiwane są pliki JPEG, PNG, WebP, MP4 i MOV. Typ sprawdzamy na podstawie zawartości.",
        );
      // Preserve the supported original extension, including .jpeg and capitalization.
      const originalExt = path.extname(originalName).slice(1);
      const validExts =
        format.type === "image"
          ? format.ext === "jpg"
            ? ["jpg", "jpeg"]
            : [format.ext]
          : [format.ext];
      const ext = validExts.includes(originalExt.toLowerCase())
        ? originalExt
        : format.ext;
      const relative = `media/${accountId}/${id}.${ext}`;
      stored = safePath(this.root, relative);
      fs.renameSync(temporary, stored);
      const thumb = await this.thumbnail(id, stored, format.type);
      this.db
        .prepare(
          `INSERT INTO media (id,accountId,originalName,storedRelativePath,thumbnailRelativePath,mediaType,mimeType,hash,createdAt,thumbnailError) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          accountId,
          originalName,
          relative,
          thumb.relative,
          format.type,
          detected.mime,
          hash.digest("hex"),
          new Date().toISOString(),
          thumb.error,
        );
      return this.medium(id);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      if (stored) fs.rmSync(stored, { force: true });
      fs.rmSync(safePath(this.root, `miniatury/${id}.jpg`), { force: true });
      throw error;
    }
  }
  async copyMedia(id: string, accountId: string): Promise<Media> {
    const source = this.medium(id);
    if (source.accountId === accountId)
      throw new AppError("Wybierz inne konto.");
    return this.importMedia(
      accountId,
      source.originalName,
      fs.createReadStream(safePath(this.root, source.storedRelativePath)),
    );
  }
  clearMediaPool(accountId: string): { deleted: number; retained: number } {
    const media = this.media(accountId);
    let deleted = 0;
    let retained = 0;
    for (const medium of media) {
      const linked = this.db
        .prepare("SELECT postId FROM post_media WHERE mediaId = ? LIMIT 1")
        .get(medium.id);
      if (linked) {
        retained++;
      } else {
        this.deleteMedia(medium.id);
        deleted++;
      }
    }
    return { deleted, retained };
  }
  removePublishedFromPool(accountId: string): { removed: number } {
    this.account(accountId);
    const result = this.db
      .prepare(
        `
      UPDATE media SET hiddenFromPool = 1
      WHERE accountId = ? AND hiddenFromPool = 0 AND EXISTS (
        SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.postId
        WHERE pm.mediaId = media.id AND p.deleted = 0
          AND p.publicationConfirmedAt IS NOT NULL
      )
    `,
      )
      .run(accountId);
    return { removed: result.changes };
  }
  deleteMedia(id: string): void {
    const medium = this.medium(id);
    if (
      this.db
        .prepare(
          `SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.postId
      WHERE pm.mediaId = ? AND p.deleted = 0 AND p.publicationConfirmedAt IS NOT NULL`,
        )
        .get(id)
    ) {
      this.db
        .prepare("UPDATE media SET hiddenFromPool = 1 WHERE id = ?")
        .run(id);
      return;
    }
    if (
      this.db
        .prepare("SELECT postId FROM post_media WHERE mediaId = ? LIMIT 1")
        .get(id)
    )
      throw new AppError(
        "Medium należy do posta lub historii. Najpierw usuń je z powiązanych postów.",
      );
    fs.rmSync(safePath(this.root, medium.storedRelativePath), { force: true });
    if (medium.thumbnailRelativePath)
      fs.rmSync(safePath(this.root, medium.thumbnailRelativePath), {
        force: true,
      });
    this.db.prepare("DELETE FROM media WHERE id = ?").run(id);
  }
  post(id: string, includeDeleted = false): Post {
    const row = this.db
      .prepare(
        `SELECT * FROM posts WHERE id = ? ${includeDeleted ? "" : "AND deleted = 0"}`,
      )
      .get(id) as Post | undefined;
    if (!row) throw new AppError("Post nie istnieje.", 404);
    return {
      ...row,
      media: this.db
        .prepare(
          "SELECT m.* FROM post_media pm JOIN media m ON m.id = pm.mediaId WHERE pm.postId = ? ORDER BY pm.position",
        )
        .all(id) as Media[],
      exports: this.db
        .prepare("SELECT * FROM exports WHERE postId = ?")
        .all(id) as ExportState[],
    };
  }
  posts(accountId: string): Post[] {
    this.account(accountId);
    return (
      this.db
        .prepare(
          "SELECT id FROM posts WHERE accountId = ? AND deleted = 0 ORDER BY rowid DESC",
        )
        .all(accountId) as { id: string }[]
    ).map((row) => this.post(row.id));
  }
  async savePost(input: unknown, id?: string): Promise<Post> {
    const data = input as PostInput;
    this.account(data.accountId);
    const previous = id ? this.post(id) : undefined;
    if (
      previous &&
      (previous.accountId !== data.accountId ||
        previous.revision !== data.revision)
    )
      throw new AppError(
        "Post został zmieniony. Otwórz go ponownie przed zapisem.",
        409,
      );
    const title = text(data.title, "tytuł", 200).trim() || "Nowy pomysł";
    const caption = text(data.caption, "podpis"),
      internalNotes = text(data.internalNotes, "notatka");
    const scheduledDate = validateDate(data.scheduledDate);
    if (
      !["photo", "carousel", "reel"].includes(data.type) ||
      !["draft", "ready"].includes(data.readiness)
    )
      throw new AppError("Nieprawidłowy typ lub gotowość posta.");
    if (
      !Array.isArray(data.mediaIds) ||
      data.mediaIds.length > 20 ||
      new Set(data.mediaIds).size !== data.mediaIds.length
    )
      throw new AppError("Wybierz maksymalnie 20 różnych mediów.");
    const media = data.mediaIds.map((mediaId) => this.medium(mediaId));
    if (media.some((m) => m.accountId !== data.accountId))
      throw new AppError("Media muszą należeć do konta posta.");
    if (
      data.type === "reel" &&
      (media.length > 1 || media.some((m) => m.mediaType !== "video"))
    )
      throw new AppError("Rolka może zawierać jeden film.");
    if (data.type !== "reel" && media.some((m) => m.mediaType !== "image"))
      throw new AppError("Zdjęcie i karuzela mogą zawierać wyłącznie zdjęcia.");
    if (data.type === "photo" && media.length > 1)
      throw new AppError("Dla kilku zdjęć wybierz karuzelę.");
    id ||= randomUUID();
    const postId = id;
    const revision = (previous?.revision || 0) + 1;
    try {
      this.db.transaction(() => {
        if (previous)
          this.db
            .prepare(
              "UPDATE posts SET title=?,type=?,caption=?,internalNotes=?,scheduledDate=?,readiness=?,revision=? WHERE id=?",
            )
            .run(
              title,
              data.type,
              caption,
              internalNotes,
              scheduledDate,
              data.readiness,
              revision,
              postId,
            );
        else
          this.db
            .prepare(
              "INSERT INTO posts (id,accountId,title,type,caption,internalNotes,scheduledDate,readiness,revision) VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .run(
              postId,
              data.accountId,
              title,
              data.type,
              caption,
              internalNotes,
              scheduledDate,
              data.readiness,
              revision,
            );
        this.db.prepare("DELETE FROM post_media WHERE postId=?").run(postId);
        for (const [position, m] of media.entries())
          this.db
            .prepare(
              "INSERT INTO post_media (postId,mediaId,position) VALUES (?,?,?)",
            )
            .run(postId, m.id, position);
        this.requestQueue(postId);
        // Editing a published post does not trigger a manual export.
      })();
    } catch (error) {
      if ((error as Error).message.includes("UNIQUE constraint failed: posts"))
        throw new AppError(
          "Ten dzień jest już zajęty na tym koncie. Posty pozostały bez zmian.",
          409,
        );
      throw error;
    }
    await this.syncExport(postId, "queue");
    return this.post(postId);
  }
  async schedule(id: string, date: unknown, revision: number): Promise<Post> {
    const post = this.post(id);
    return this.savePost(
      {
        ...post,
        scheduledDate: date,
        revision,
        mediaIds: post.media.map((m) => m.id),
      },
      id,
    );
  }
  private requestQueue(id: string): void {
    const post = this.post(id, true);
    const needed =
      !!post.scheduledDate && !post.publicationConfirmedAt && !post.deleted;
    this.db
      .prepare(
        `INSERT INTO exports (postId,purpose,desiredRevision,status) VALUES (?,'queue',?,?)
      ON CONFLICT(postId,purpose) DO UPDATE SET desiredRevision=excluded.desiredRevision,status=excluded.status,lastError=NULL`,
      )
      .run(id, post.revision, needed ? "pending" : "cleanup_pending");
  }
  async publish(
    id: string,
    published: boolean,
    revision: number,
  ): Promise<Post> {
    const post = this.post(id);
    if (post.revision !== revision)
      throw new AppError("Post został zmieniony. Otwórz go ponownie.", 409);
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE posts SET publicationConfirmedAt=?,revision=revision+1 WHERE id=?",
        )
        .run(published ? new Date().toISOString() : null, id);
      this.requestQueue(id);
    })();
    await this.syncExport(id, "queue");
    return this.post(id);
  }
  async deletePost(id: string): Promise<void> {
    this.post(id);
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE posts SET deleted=1,revision=revision+1 WHERE id=?")
        .run(id);
      this.requestQueue(id);
      this.db
        .prepare(
          "UPDATE exports SET status='cleanup_pending' WHERE postId=? AND purpose='manual'",
        )
        .run(id);
    })();
    await this.syncExport(id, "queue");
    await this.syncExport(id, "manual");
    this.db.prepare("DELETE FROM post_media WHERE postId=?").run(id);
  }
  private manifest(directory: string): Manifest | null {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(
          safePath(
            this.root,
            path.relative(
              this.root,
              path.join(directory, ".instaplanner.json"),
            ),
          ),
          "utf8",
        ),
      );
      return manifest.app === "InstaPlanner" &&
        typeof manifest.postId === "string" &&
        ["queue", "manual"].includes(manifest.purpose)
        ? manifest
        : null;
    } catch {
      return null;
    }
  }
  private managedDirectories(
    post: Post,
    purpose: ExportState["purpose"],
  ): string[] {
    const account = this.account(post.accountId);
    const parent = safePath(
      this.root,
      `${purpose === "queue" ? "kolejka" : "eksporty"}/${account.slug}`,
    );
    if (!fs.existsSync(parent)) return [];
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((item) => item.isDirectory() && !item.isSymbolicLink())
      .map((item) => path.join(parent, item.name))
      .filter((dir) => {
        const manifest = this.manifest(dir);
        return manifest?.postId === post.id && manifest.purpose === purpose;
      });
  }
  private cleanup(
    post: Post,
    purpose: ExportState["purpose"],
    except?: string,
  ): void {
    this.fault?.("cleanup", post);
    for (const dir of this.managedDirectories(post, purpose)) {
      if (dir !== except)
        fs.rmSync(safePath(this.root, path.relative(this.root, dir)), {
          recursive: true,
        });
    }
  }
  async syncExport(id: string, purpose: ExportState["purpose"]): Promise<void> {
    const post = this.post(id, true);
    const state = post.exports.find((e) => e.purpose === purpose);
    if (!state) return;
    const needed =
      !post.deleted &&
      (purpose === "queue"
        ? !!post.scheduledDate && !post.publicationConfirmedAt
        : state.status !== "cleanup_pending" && state.status !== "absent");
    try {
      if (!needed) {
        this.cleanup(post, purpose);
        this.db
          .prepare(
            "UPDATE exports SET status='absent',relativePath=NULL,exportedRevision=NULL,lastError=NULL WHERE postId=? AND purpose=?",
          )
          .run(id, purpose);
        return;
      }
      const account = this.account(post.accountId);
      const parentRelative = `${purpose === "queue" ? "kolejka" : "eksporty"}/${account.slug}`;
      const parent = safePath(this.root, parentRelative);
      fs.mkdirSync(parent, { recursive: true });
      const relative = `${parentRelative}/${post.scheduledDate || "bez-daty"}-${slug(post.title)}-${id.slice(0, 8)}`;
      const target = safePath(this.root, relative);
      const currentManifest = this.manifest(target);
      const desiredRevision =
        purpose === "manual" && state.status === "current"
          ? state.exportedRevision
          : post.revision;
      if (
        currentManifest?.postId === id &&
        currentManifest.purpose === purpose &&
        currentManifest.revision === desiredRevision &&
        state.status === "current" &&
        state.relativePath === relative
      ) {
        this.cleanup(post, purpose, target);
        return;
      }
      if (
        fs.existsSync(target) &&
        (currentManifest?.postId !== id || currentManifest.purpose !== purpose)
      )
        throw new Error(
          "Docelowy folder zawiera obce pliki. Nie został nadpisany.",
        );
      const token = randomUUID(),
        stage = safePath(this.root, `${parentRelative}/.stage-${id}-${token}`),
        old = safePath(this.root, `${parentRelative}/.old-${id}-${token}`);
      fs.mkdirSync(stage);
      const manifest: Manifest = {
        app: "InstaPlanner",
        postId: id,
        purpose,
        revision: post.revision,
      };
      fs.writeFileSync(
        path.join(stage, ".instaplanner.json"),
        JSON.stringify(manifest, null, 2),
      );
      for (const [position, medium] of post.media.entries())
        fs.copyFileSync(
          safePath(this.root, medium.storedRelativePath),
          path.join(
            stage,
            `${String(position + 1).padStart(2, "0")}${path.extname(medium.storedRelativePath)}`,
          ),
        );
      fs.writeFileSync(path.join(stage, "podpis.txt"), post.caption, "utf8");
      this.fault?.("prepared", post);
      // All mutating operations run under Store.lock. Check the persisted revision too.
      const latest = this.post(id, true);
      if (
        latest.revision !== post.revision ||
        latest.deleted ||
        (purpose === "queue" &&
          (!latest.scheduledDate || latest.publicationConfirmedAt))
      )
        throw new Error(
          "Post zmienił się w czasie eksportu. Ponów przygotowanie paczki.",
        );
      const hadTarget = fs.existsSync(target);
      if (hadTarget) fs.renameSync(target, old);
      try {
        fs.renameSync(stage, target);
      } catch (error) {
        if (hadTarget) fs.renameSync(old, target);
        throw error;
      }
      this.fault?.("installed", post);
      this.cleanup(post, purpose, target);
      this.db
        .prepare(
          "UPDATE exports SET desiredRevision=?,exportedRevision=?,relativePath=?,status='current',lastError=NULL WHERE postId=? AND purpose=?",
        )
        .run(post.revision, post.revision, relative, id, purpose);
    } catch (error) {
      const message =
        (error as NodeJS.ErrnoException).code === "ENOSPC"
          ? "Brak miejsca na dysku. Post został zapisany."
          : (error as Error).message;
      this.db
        .prepare(
          "UPDATE exports SET status=?,lastError=? WHERE postId=? AND purpose=?",
        )
        .run(needed ? "error" : "cleanup_pending", message, id, purpose);
    }
  }
  async manualExport(id: string): Promise<Post> {
    const post = this.post(id);
    if (!post.publicationConfirmedAt)
      throw new AppError(
        "Ta akcja służy do odtwarzania paczki z historii. Zaplanowany post eksportuje się automatycznie.",
      );
    this.db
      .prepare(
        `INSERT INTO exports (postId,purpose,desiredRevision,status) VALUES (?,'manual',?,'pending') ON CONFLICT(postId,purpose) DO UPDATE SET desiredRevision=excluded.desiredRevision,status='pending',lastError=NULL`,
      )
      .run(id, post.revision);
    await this.syncExport(id, "manual");
    return this.post(id);
  }
  async removeManualExport(id: string): Promise<Post> {
    this.post(id);
    this.db
      .prepare(
        "UPDATE exports SET status='cleanup_pending' WHERE postId=? AND purpose='manual'",
      )
      .run(id);
    await this.syncExport(id, "manual");
    return this.post(id);
  }
  async retry(id: string): Promise<Post> {
    const post = this.post(id);
    await this.syncExport(id, "queue");
    const manual = post.exports.find((e) => e.purpose === "manual");
    if (
      manual &&
      ["pending", "error", "cleanup_pending"].includes(manual.status)
    )
      await this.syncExport(id, "manual");
    return this.post(id);
  }
  async reconcile(): Promise<void> {
    for (const row of this.db.prepare("SELECT id FROM posts").all() as {
      id: string;
    }[]) {
      await this.syncExport(row.id, "queue");
      const manual = this.post(row.id, true).exports.find(
        (e) => e.purpose === "manual",
      );
      if (
        manual &&
        ["pending", "error", "cleanup_pending"].includes(manual.status)
      )
        await this.syncExport(row.id, "manual");
    }
    // Interrupted uploads never have a database record. They are safe to discard.
    for (const account of this.accounts()) {
      const directory = safePath(this.root, `media/${account.id}`);
      if (fs.existsSync(directory))
        for (const item of fs.readdirSync(directory))
          if (/^\.[0-9a-f-]+\.upload$/.test(item))
            fs.rmSync(
              safePath(
                this.root,
                path.relative(this.root, path.join(directory, item)),
              ),
              { force: true },
            );
    }
  }
  async backup(): Promise<string> {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const relative = `backups/${id}`,
      directory = safePath(this.root, relative);
    fs.mkdirSync(directory);
    try {
      // SQLite's online backup API includes committed WAL data.
      await this.db.backup(path.join(directory, "instaplanner.sqlite"));
      for (const name of ["media", "miniatury", "kolejka", "eksporty"])
        copyTree(safePath(this.root, name), path.join(directory, name));
      fs.writeFileSync(
        path.join(directory, "backup.json"),
        JSON.stringify(
          {
            app: "InstaPlanner",
            schema: 1,
            createdAt: new Date().toISOString(),
            complete: true,
          },
          null,
          2,
        ),
      );
      return relative;
    } catch (error) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }
  async openFolder(id: string, purpose: ExportState["purpose"]): Promise<void> {
    const state = this.post(id).exports.find((e) => e.purpose === purpose);
    if (!state?.relativePath || state.status !== "current")
      throw new AppError("Najpierw przygotuj aktualną paczkę.");
    const directory = safePath(this.root, state.relativePath);
    const manifest = this.manifest(directory);
    if (manifest?.postId !== id || manifest.purpose !== purpose)
      throw new AppError("Nie znaleziono zarządzanej paczki.");
    if (process.platform !== "darwin")
      throw new AppError("Otwieranie w Finderze jest dostępne na macOS.");
    await run("/usr/bin/open", [directory]);
  }
}

declare global {
  var instaPlannerStore: Store | undefined;
}
export async function getStore(): Promise<Store> {
  const store = (globalThis.instaPlannerStore ||= new Store(configuredRoot()));
  await store.ready;
  return store;
}
