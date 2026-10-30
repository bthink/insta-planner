import Database from "better-sqlite3";
import { safePath } from "./files";

export function openDatabase(root: string): Database.Database {
  const db = new Database(safePath(root, "instaplanner.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > 3)
    throw new Error("Baza pochodzi z nowszej wersji InstaPlannera.");
  if (version < 1)
    db.transaction(() => {
      db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
        accent TEXT NOT NULL, aiContext TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE media (
        id TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES accounts(id),
        originalName TEXT NOT NULL, storedRelativePath TEXT NOT NULL UNIQUE,
        thumbnailRelativePath TEXT, mediaType TEXT NOT NULL CHECK(mediaType IN ('image','video')),
        mimeType TEXT NOT NULL, hash TEXT NOT NULL, createdAt TEXT NOT NULL, thumbnailError TEXT
      );
      CREATE TABLE posts (
        id TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES accounts(id),
        title TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('photo','carousel','reel')),
        caption TEXT NOT NULL DEFAULT '', internalNotes TEXT NOT NULL DEFAULT '', scheduledDate TEXT,
        readiness TEXT NOT NULL DEFAULT 'draft' CHECK(readiness IN ('draft','ready')),
        publicationConfirmedAt TEXT, revision INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX one_post_per_day ON posts(accountId, scheduledDate) WHERE scheduledDate IS NOT NULL AND deleted = 0;
      CREATE TABLE post_media (
        postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        mediaId TEXT NOT NULL REFERENCES media(id), position INTEGER NOT NULL,
        PRIMARY KEY(postId, mediaId), UNIQUE(postId, position)
      );
      CREATE TABLE exports (
        postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK(purpose IN ('queue','manual')),
        desiredRevision INTEGER NOT NULL, exportedRevision INTEGER, relativePath TEXT,
        status TEXT NOT NULL, lastError TEXT, PRIMARY KEY(postId, purpose)
      );
      PRAGMA user_version = 1;
    `);
    })();
  if (version < 2)
    db.transaction(() => {
      db.exec(
        "ALTER TABLE accounts ADD COLUMN handle TEXT NOT NULL DEFAULT ''; PRAGMA user_version = 2;",
      );
    })();
  if (version < 3)
    db.transaction(() => {
      db.exec(
        "ALTER TABLE media ADD COLUMN hiddenFromPool INTEGER NOT NULL DEFAULT 0; PRAGMA user_version = 3;",
      );
    })();
  return db;
}
