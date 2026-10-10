import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable } from "node:stream";
import sharp from "sharp";
import { Store } from "../src/server/store";
import { generateCaption } from "../src/server/ai";

test("AI proposal uses the original account and only selected previews without overwriting the caption", async () => {
  const root = fs.mkdtempSync("/private/tmp/instaplanner-ai-");
  const store = new Store(root);
  await store.ready;
  try {
    const account = store.saveAccount({
      name: "Psy",
      accent: "#778866",
      aiContext: "Psie opowieści. Bez hashtagów.",
    });
    const other = store.saveAccount({
      name: "Krajobrazy",
      accent: "#998877",
      aiContext: "Kontekst innego konta",
    });
    const image = await sharp({
      create: { width: 1500, height: 1000, channels: 3, background: "#ccc" },
    })
      .jpeg()
      .toBuffer();
    const medium = await store.lock(() =>
      store.importMedia(account.id, "pies.jpg", Readable.from(image)),
    );
    const post = await store.lock(() =>
      store.savePost({
        accountId: account.id,
        title: "Spacer",
        type: "photo",
        caption: "Zachowaj ten podpis",
        internalNotes: "Wieczorny spacer",
        scheduledDate: null,
        readiness: "draft",
        mediaIds: [medium.id],
      }),
    );
    const otherPost = await store.lock(() =>
      store.savePost({
        accountId: other.id,
        title: "Inny post",
        type: "photo",
        caption: "Inny podpis",
        internalNotes: "",
        scheduledDate: null,
        readiness: "draft",
        mediaIds: [],
      }),
    );
    const result = await generateCaption(
      store,
      post.id,
      { mediaIds: [medium.id], hints: "Krótko", revision: post.revision },
      {
        apiKey: "fake-key",
        transport: async (params) => {
          assert.equal(params.store, false);
          const serialized = JSON.stringify(params.input);
          assert.match(serialized, /Psie opowieści/);
          assert.doesNotMatch(serialized, /Kontekst innego konta/);
          const content = (
            params.input as {
              content: { type: string; image_url?: string }[];
            }[]
          )[0].content;
          const previews = content.filter((c) => c.type === "input_image");
          assert.equal(previews.length, 1);
          const buffer = Buffer.from(
            previews[0].image_url!.split(",")[1],
            "base64",
          );
          const metadata = await sharp(buffer).metadata();
          assert.ok(metadata.width! <= 1024);
          assert.ok(metadata.height! <= 1024);
          await store.lock(() =>
            store.savePost(
              {
                ...otherPost,
                mediaIds: [],
                revision: otherPost.revision,
                caption: "Zmiana w innym poście",
              },
              otherPost.id,
            ),
          );
          return { output_text: "Nowa propozycja" };
        },
      },
    );
    assert.equal(result.postId, post.id);
    assert.equal(result.caption, "Nowa propozycja");
    assert.equal(store.post(post.id).caption, "Zachowaj ten podpis");
    assert.equal(store.post(otherPost.id).caption, "Zmiana w innym poście");
    await assert.rejects(
      generateCaption(
        store,
        post.id,
        { mediaIds: [], revision: post.revision },
        {
          apiKey: "fake",
          transport: async () => {
            throw new Error("offline");
          },
        },
      ),
      /pozostał bez zmian/,
    );
    assert.equal(store.post(post.id).caption, "Zachowaj ten podpis");
    await assert.rejects(
      generateCaption(
        store,
        post.id,
        { mediaIds: ["foreign"], revision: post.revision },
        { apiKey: "fake" },
      ),
      /należące do tego posta/,
    );
    await assert.rejects(
      generateCaption(
        store,
        post.id,
        { mediaIds: [], revision: post.revision },
        { apiKey: "" },
      ),
      /Dodaj klucz/,
    );
  } finally {
    store.db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
