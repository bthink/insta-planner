import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { Store, validateDate } from "../src/server/store";
import { copyTree, safePath } from "../src/server/files";
import { isOverdue, todayWarsaw } from "../src/lib/types";
import { checkRequest } from "../src/server/http";
import type { PostInput, Post } from "../src/lib/types";

const roots: string[] = [];
const stores: Store[] = [];
async function setup() {
  const root = fs.mkdtempSync("/private/tmp/instaplanner-test-");
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  await store.ready;
  const first = store.saveAccount({
    name: "Dzikie kadry",
    accent: "#ad7857",
    aiContext: "Po polsku, spokojnie.",
  });
  const second = store.saveAccount({
    name: "Psie opowieści",
    accent: "#729273",
    aiContext: "Psy i spacer.",
  });
  const imageA = await sharp({
    create: { width: 100, height: 120, channels: 3, background: "#72a886" },
  })
    .jpeg()
    .toBuffer();
  const imageB = await sharp({
    create: { width: 160, height: 120, channels: 3, background: "#bca58d" },
  })
    .png()
    .toBuffer();
  const a = await store.lock(() =>
    store.importMedia(first.id, "żółw.jpeg", Readable.from(imageA)),
  );
  const b = await store.lock(() =>
    store.importMedia(first.id, "las.png", Readable.from(imageB)),
  );
  const draft: PostInput = {
    accountId: first.id,
    title: "Żółw w jesiennym lesie",
    type: "carousel",
    caption: "Zażółć gęślą jaźń.\n\nDruga linia 🐢\n",
    internalNotes: "Prywatna notatka",
    scheduledDate: "2026-10-11",
    readiness: "draft",
    mediaIds: [a.id, b.id],
  };
  return { root, store, first, second, a, b, imageA, imageB, draft };
}
after(() => {
  for (const store of stores) {
    try {
      store.db.close();
    } catch {}
  }
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});
function bundle(root: string, post: Post, purpose = "queue") {
  return path.join(
    root,
    post.exports.find((e) => e.purpose === purpose)!.relativePath!,
  );
}

test("export preserves media bytes, original extensions, exact caption and order", async () => {
  const { root, store, draft, imageA, imageB } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  const directory = bundle(root, post);
  assert.deepEqual(fs.readFileSync(path.join(directory, "01.jpeg")), imageA);
  assert.deepEqual(fs.readFileSync(path.join(directory, "02.png")), imageB);
  assert.equal(
    fs.readFileSync(path.join(directory, "podpis.txt"), "utf8"),
    draft.caption,
  );
  assert.equal(post.exports[0].status, "current");
  assert.equal(fs.existsSync(path.join(directory, "notatka.txt")), false);
});

test("account isolation and daily collision roll back all changes", async () => {
  const { store, first, second, a, draft } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  const idea = await store.lock(() =>
    store.savePost({ ...draft, scheduledDate: null, caption: "Zachowaj mnie" }),
  );
  await assert.rejects(
    store.lock(() =>
      store.schedule(idea.id, post.scheduledDate, idea.revision),
    ),
    /już zajęty/,
  );
  assert.equal(store.post(idea.id).revision, idea.revision);
  assert.equal(store.post(idea.id).scheduledDate, null);
  assert.equal(store.post(idea.id).caption, "Zachowaj mnie");
  await assert.rejects(
    store.lock(() => store.savePost({ ...draft, accountId: second.id })),
    /Media muszą/,
  );
  const copied = await store.lock(() => store.copyMedia(a.id, second.id));
  assert.equal(copied.hash, a.hash);
  assert.notEqual(copied.id, a.id);
  const other = await store.lock(() =>
    store.savePost({
      ...draft,
      type: "photo",
      mediaIds: [copied.id],
      accountId: second.id,
    }),
  );
  assert.equal(other.scheduledDate, post.scheduledDate);
  assert.equal(store.media(first.id).length, 2);
  assert.equal(store.media(second.id).length, 1);
  await assert.rejects(
    store.lock(() => store.deleteMedia(a.id)),
    /należy do posta/,
  );
});

test("edits replace bundles, title/date moves remove old copies, removing date cleans queue", async () => {
  const { root, store, draft, a, b, imageA, imageB } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  const old = bundle(root, post);
  const changed = await store.lock(() =>
    store.savePost(
      {
        ...draft,
        title: "Nowy tytuł",
        scheduledDate: "2026-11-02",
        mediaIds: [b.id, a.id],
        caption: "Nowy\npodpis",
        revision: post.revision,
      },
      post.id,
    ),
  );
  assert.equal(fs.existsSync(old), false);
  const latest = bundle(root, changed);
  assert.deepEqual(fs.readFileSync(path.join(latest, "01.png")), imageB);
  assert.deepEqual(fs.readFileSync(path.join(latest, "02.jpeg")), imageA);
  const less = await store.lock(() =>
    store.savePost(
      {
        ...draft,
        title: changed.title,
        type: "photo",
        scheduledDate: changed.scheduledDate,
        mediaIds: [a.id],
        revision: changed.revision,
      },
      post.id,
    ),
  );
  assert.deepEqual(fs.readdirSync(bundle(root, less)).sort(), [
    ".instaplanner.json",
    "01.jpeg",
    "podpis.txt",
  ]);
  const unscheduled = await store.lock(() =>
    store.schedule(post.id, null, less.revision),
  );
  assert.equal(unscheduled.exports[0].status, "absent");
  assert.equal(fs.existsSync(latest), false);
  assert.equal(store.media(draft.accountId).length, 2);
});

test("publication is manual, cleanup preserves history and originals, undo and manual export", async () => {
  const { root, store, draft, a } = await setup();
  const post = await store.lock(() =>
    store.savePost({ ...draft, scheduledDate: "2000-01-01" }),
  );
  assert.equal(isOverdue(post), true);
  await store.lock(() => store.reconcile());
  assert.equal(store.post(post.id).publicationConfirmedAt, null);
  assert.equal(fs.existsSync(bundle(root, post)), true);
  assert.equal(
    store.media(a.accountId).find((m) => m.id === a.id)!.published,
    0,
  );
  const published = await store.lock(() =>
    store.publish(post.id, true, post.revision),
  );
  assert.ok(published.publicationConfirmedAt);
  assert.equal(fs.existsSync(bundle(root, post)), false);
  assert.equal(published.caption, draft.caption);
  assert.equal(published.media.length, 2);
  assert.equal(fs.existsSync(path.join(root, a.storedRelativePath)), true);
  assert.equal(
    store.media(a.accountId).find((m) => m.id === a.id)!.published,
    1,
  );
  assert.deepEqual(fs.readdirSync(path.join(root, "eksporty")), []);
  const manual = await store.lock(() => store.manualExport(post.id));
  assert.equal(manual.publicationConfirmedAt, published.publicationConfirmedAt);
  assert.equal(fs.existsSync(bundle(root, manual, "manual")), true);
  const edited = await store.lock(() =>
    store.savePost(
      {
        ...draft,
        caption: "Edycja historii",
        scheduledDate: "2000-01-01",
        revision: manual.revision,
      },
      post.id,
    ),
  );
  assert.equal(
    edited.exports.find((e) => e.purpose === "queue")!.status,
    "absent",
  );
  assert.equal(
    fs.readFileSync(
      path.join(bundle(root, manual, "manual"), "podpis.txt"),
      "utf8",
    ),
    draft.caption,
  );
  await store.lock(() => store.removeManualExport(post.id));
  assert.equal(fs.existsSync(bundle(root, manual, "manual")), false);
  const undone = await store.lock(() =>
    store.publish(post.id, false, edited.revision),
  );
  assert.equal(undone.publicationConfirmedAt, null);
  assert.equal(isOverdue(undone), true);
  assert.equal(
    undone.exports.find((e) => e.purpose === "queue")!.status,
    "current",
  );
});

test("failed export keeps saved data and last good bundle, restart recovers staged operations", async () => {
  const { root, store, draft } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  const directory = bundle(root, post);
  store.fault = (point) => {
    if (point === "prepared") throw new Error("Test: dysk niedostępny");
  };
  const failed = await store.lock(() =>
    store.savePost(
      { ...draft, caption: "Najnowszy podpis", revision: post.revision },
      post.id,
    ),
  );
  assert.equal(failed.caption, "Najnowszy podpis");
  assert.equal(failed.exports[0].status, "error");
  assert.equal(
    fs.readFileSync(path.join(directory, "podpis.txt"), "utf8"),
    draft.caption,
  );
  store.db.close();
  const restarted = new Store(root);
  stores.push(restarted);
  await restarted.ready;
  const recovered = restarted.post(post.id);
  assert.equal(recovered.exports[0].status, "current");
  assert.equal(
    fs.readFileSync(path.join(bundle(root, recovered), "podpis.txt"), "utf8"),
    "Najnowszy podpis",
  );
  const parent = path.dirname(bundle(root, recovered));
  assert.equal(fs.readdirSync(parent).length, 1);
});

test("crash after replacement recovers; cleanup failure never undoes publication", async () => {
  const { root, store, draft } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  store.fault = (point) => {
    if (point === "installed") throw new Error("Przerwanie");
  };
  const interrupted = await store.lock(() =>
    store.savePost(
      { ...draft, caption: "Wersja po przerwaniu", revision: post.revision },
      post.id,
    ),
  );
  assert.equal(interrupted.exports[0].status, "error");
  store.fault = undefined;
  await store.lock(() => store.reconcile());
  assert.equal(store.post(post.id).exports[0].status, "current");
  const goodPath = bundle(root, store.post(post.id));
  const foreign = path.join(path.dirname(goodPath), "moje-prywatne-pliki");
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, "cenne.txt"), "zachowaj");
  store.fault = (point) => {
    if (point === "cleanup") throw new Error("Brak uprawnień");
  };
  const published = await store.lock(() =>
    store.publish(post.id, true, interrupted.revision),
  );
  assert.ok(published.publicationConfirmedAt);
  assert.equal(published.exports[0].status, "cleanup_pending");
  assert.equal(fs.existsSync(goodPath), true);
  store.db.close();
  const restart = new Store(root);
  stores.push(restart);
  await restart.ready;
  assert.ok(restart.post(post.id).publicationConfirmedAt);
  assert.equal(restart.post(post.id).exports[0].status, "absent");
  assert.equal(fs.existsSync(goodPath), false);
  assert.equal(
    fs.readFileSync(path.join(foreign, "cenne.txt"), "utf8"),
    "zachowaj",
  );
});

test("serialization and revision checks prevent older edits and exports overwriting newer versions", async () => {
  const { root, store, draft } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  const attempts = await Promise.allSettled([
    store.lock(() =>
      store.savePost(
        { ...draft, caption: "Pierwszy", revision: post.revision },
        post.id,
      ),
    ),
    store.lock(() =>
      store.savePost(
        { ...draft, caption: "Nieaktualny", revision: post.revision },
        post.id,
      ),
    ),
  ]);
  assert.equal(attempts[0].status, "fulfilled");
  assert.equal(attempts[1].status, "rejected");
  const latest = store.post(post.id);
  assert.equal(latest.caption, "Pierwszy");
  assert.equal(
    fs.readFileSync(path.join(bundle(root, latest), "podpis.txt"), "utf8"),
    "Pierwszy",
  );
});

test("backup API includes WAL and portable paths; restored data exports correctly", async () => {
  const { root, store, draft } = await setup();
  const post = await store.lock(() => store.savePost(draft));
  const backup = await store.lock(() => store.backup());
  const restoredRoot = fs.mkdtempSync("/private/tmp/instaplanner-restored-");
  roots.push(restoredRoot);
  copyTree(path.join(root, backup), restoredRoot);
  const restored = new Store(restoredRoot);
  stores.push(restored);
  await restored.ready;
  const restoredPost = restored.post(post.id);
  assert.equal(restoredPost.caption, draft.caption);
  assert.equal(restored.accounts().length, 2);
  assert.ok(fs.existsSync(bundle(restoredRoot, restoredPost)));
  assert.equal(fs.existsSync(path.join(restoredRoot, ".env.local")), false);
});

test("dates, Warsaw midnight and DST preserve calendar days", () => {
  assert.equal(todayWarsaw(new Date("2026-10-09T22:30:00Z")), "2026-10-10");
  assert.equal(todayWarsaw(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(validateDate("2026-03-29"), "2026-03-29");
  assert.throws(() => validateDate("2026-02-30"));
  assert.throws(() => validateDate("2026-13-01"));
});

test("symlinks, escaping paths, fake uploads and cross-origin requests are rejected", async () => {
  const { root, store, first } = await setup();
  assert.throws(() => safePath(root, "../outside"));
  fs.symlinkSync("/private/tmp", path.join(root, "link"));
  assert.throws(() => safePath(root, "link/file"), /symboliczne/);
  await assert.rejects(
    store.lock(() =>
      store.importMedia(first.id, "fake.jpg", Readable.from("not an image")),
    ),
    /Obsługiwane/,
  );
  assert.throws(
    () =>
      checkRequest(
        new Request("http://127.0.0.1:3210/api/posts", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      ),
    /lokalnej/,
  );
  assert.throws(
    () => checkRequest(new Request("http://evil.test:3210/api/media")),
    /lokalnie/,
  );
  assert.doesNotThrow(() =>
    checkRequest(
      new Request("http://127.0.0.1:3210/api/posts", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3210" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkRequest(
      new Request("http://localhost:3210/api/posts", {
        method: "POST",
        headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210" },
      }),
    ),
  );
});

test("clearing a pool removes unused files, preserves posts and isolates accounts", async () => {
  const { root, store, first, second, a, b, draft, imageA } = await setup();
  const other = await store.lock(() => store.copyMedia(a.id, second.id));
  const post = await store.lock(() =>
    store.savePost({ ...draft, type: "photo", mediaIds: [a.id] }),
  );
  await assert.rejects(store.lock(() => store.clearMediaPool("missing")));
  const result = await store.lock(() => store.clearMediaPool(first.id));
  assert.deepEqual(result, { deleted: 1, retained: 1 });
  assert.deepEqual(
    store.media(first.id).map((m) => m.id),
    [a.id],
  );
  assert.equal(store.media(second.id)[0].id, other.id);
  assert.equal(fs.existsSync(path.join(root, b.storedRelativePath)), false);
  assert.equal(fs.existsSync(path.join(root, b.thumbnailRelativePath!)), false);
  assert.deepEqual(
    fs.readFileSync(path.join(root, a.storedRelativePath)),
    imageA,
  );
  assert.ok(fs.existsSync(path.join(root, a.thumbnailRelativePath!)));
  assert.deepEqual(
    store.post(post.id).media.map((m) => m.id),
    [a.id],
  );
  assert.deepEqual(
    fs.readFileSync(path.join(bundle(root, post), "01.jpeg")),
    imageA,
  );
  assert.deepEqual(await store.lock(() => store.clearMediaPool(first.id)), {
    deleted: 0,
    retained: 1,
  });
  const edited = await store.lock(() =>
    store.savePost(
      {
        ...draft,
        type: "photo",
        mediaIds: [a.id],
        revision: post.revision,
        caption: "After clearing",
      },
      post.id,
    ),
  );
  assert.equal(edited.media[0].id, a.id);
  store.db.close();
  const restarted = new Store(root);
  stores.push(restarted);
  await restarted.ready;
  assert.deepEqual(
    restarted.media(first.id).map((m) => m.id),
    [a.id],
  );
  assert.equal(restarted.post(post.id).media[0].id, a.id);
});

test("published pool cleanup preserves posts, files, exports and other accounts", async () => {
  const { root, store, first, second, a, b, draft, imageA } = await setup();
  const other = await store.copyMedia(a.id, second.id);
  const post = await store.savePost({
    ...draft,
    type: "photo",
    mediaIds: [a.id],
  });
  assert.equal(store.media(first.id).find((m) => m.id === a.id)!.planned, 1);
  assert.deepEqual(store.removePublishedFromPool(first.id), { removed: 0 });
  const published = await store.publish(post.id, true, post.revision);
  const exported = await store.manualExport(published.id);
  const upcoming = await store.savePost({
    ...draft,
    scheduledDate: "2026-11-02",
  });
  assert.deepEqual(store.removePublishedFromPool(first.id), { removed: 1 });
  assert.deepEqual(
    store.media(first.id).map((m) => m.id),
    [b.id],
  );
  assert.equal(store.media(second.id)[0].id, other.id);
  assert.equal(store.post(post.id).media[0].id, a.id);
  assert.equal(store.post(upcoming.id).media.length, 2);
  assert.deepEqual(
    fs.readFileSync(path.join(root, a.storedRelativePath)),
    imageA,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(bundle(root, exported, "manual"), "01.jpeg")),
    imageA,
  );
  assert.deepEqual(store.removePublishedFromPool(first.id), { removed: 0 });
  const restarted = new Store(root);
  stores.push(restarted);
  await restarted.ready;
  assert.deepEqual(
    restarted.media(first.id).map((m) => m.id),
    [b.id],
  );
  assert.equal(restarted.post(post.id).media[0].id, a.id);
});

test("individual published media removal only hides the pool entry", async () => {
  const { store, first, a, b, draft } = await setup();
  const post = await store.savePost(draft);
  assert.throws(() => store.deleteMedia(a.id), /Medium należy do posta/);
  await store.publish(post.id, true, post.revision);
  store.deleteMedia(a.id);
  assert.deepEqual(
    store.media(first.id).map((m) => m.id),
    [b.id],
  );
  assert.equal(store.post(post.id).media.length, 2);
  assert.ok(
    fs.existsSync(path.join(store.root, store.medium(a.id).storedRelativePath)),
  );
});
