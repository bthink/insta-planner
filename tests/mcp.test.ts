import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../src/mcp/server";
import { PlannerApi, openImport } from "../src/mcp/api";

test("MCP protocol drives real API, media previews, calendar, conflict protection and byte-preserving exports", async () => {
  const root = fs.mkdtempSync("/private/tmp/instaplanner-mcp-");
  process.env.INSTAPLANNER_DATA_DIR = root;
  const { GET: handle } = await import("../src/app/api/[...path]/route");
  const { getStore } = await import("../src/server/store");
  const api = new PlannerApi(async (input, init) => {
    const url = new URL(String(input));
    const request = new Request(url, init);
    return handle(request, {
      params: Promise.resolve({ path: url.pathname.slice(5).split("/") }),
    });
  });
  const server = createMcpServer(api, [root]);
  const client = new Client({ name: "mcp-test", version: "1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  async function call(name: string, args: Record<string, unknown> = {}) {
    return client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }
  async function value(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<any> {
    const result = await call(name, args);
    assert.ok(!result.isError, JSON.stringify(result));
    assert.equal(result.content[0].type, "text");
    return JSON.parse((result.content[0] as { text: string }).text);
  }
  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.length >= 20);
    assert.equal(
      tools.tools.find((t) => t.name === "delete_post")?.annotations
        ?.destructiveHint,
      true,
    );
    assert.equal(
      tools.tools.find((t) => t.name === "view_media")?.annotations
        ?.readOnlyHint,
      true,
    );
    const prompt = await client.getPrompt({
      name: "plan_photo_series",
      arguments: { accountId: "test", brief: "Zaplanuj serię" },
    });
    assert.equal(prompt.messages[0].content.type, "text");
    assert.match(
      (prompt.messages[0].content as { text: string }).text,
      /obejrzyj podglądy/,
    );
    const account = await value("save_account", {
      name: "Krajobraz",
      aiContext: "Spokojny ton",
    });
    assert.equal((await value("list_accounts"))[0].aiContext, "Spokojny ton");
    const bytes = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#f80" },
    })
      .png()
      .toBuffer();
    const file = path.join(root, "source.png");
    fs.writeFileSync(file, bytes);
    const settings = await value("get_settings");
    assert.equal(settings.timezone, "Europe/Warsaw");
    assert.deepEqual(settings.importRoots, [root]);
    const listing = await value("list_import_files", { directory: root });
    assert.ok(
      listing.files.some((entry: { path: string }) => entry.path === file),
    );
    assert.ok((await call("list_import_files", { directory: "/etc" })).isError);
    const imported = await value("import_media", {
      accountId: account.id,
      files: [
        { path: "/etc/passwd" },
        { path: file },
        { name: "second.png", base64: bytes.toString("base64") },
        { name: "bad.png", base64: "!!!!" },
      ],
    });
    assert.ok(imported.results[0].error);
    assert.ok(imported.results[3].error);
    const a = imported.results[1].media.id,
      b = imported.results[2].media.id;
    const previews = await call("view_media", { mediaIds: [a, "missing", b] });
    assert.equal(previews.content.filter((c) => c.type === "image").length, 2);
    assert.match((previews.content[0] as { text: string }).text, new RegExp(a));
    const input = {
      accountId: account.id,
      title: "Spacer",
      type: "carousel",
      caption: "Gotowy podpis",
      internalNotes: "Kolejność: drugi, pierwszy",
      scheduledDate: "2026-11-01",
      readiness: "ready",
      mediaIds: [b, a],
    };
    const post = await value("save_post", input);
    assert.equal(post.publicationConfirmedAt, null);
    assert.deepEqual(
      post.media.map((m: { id: string }) => m.id),
      [b, a],
    );
    const exported = path.join(
      root,
      post.exports.find((e: { purpose: string }) => e.purpose === "queue")
        .relativePath,
    );
    assert.deepEqual(fs.readFileSync(path.join(exported, "01.png")), bytes);
    assert.equal(
      fs.readFileSync(path.join(exported, "podpis.txt"), "utf8"),
      input.caption,
    );
    assert.equal(
      (await value("list_media", { accountId: account.id, unusedOnly: true }))
        .total,
      0,
    );
    assert.ok(
      (await call("save_post", { ...input, title: "Kolizja" })).isError,
    );
    const moved = await value("schedule_post", {
      id: post.id,
      revision: post.revision,
      date: "2026-11-02",
    });
    assert.ok(
      (
        await call("schedule_post", {
          id: post.id,
          revision: post.revision,
          date: null,
        })
      ).isError,
    );
    assert.equal(
      (await value("get_post", { id: post.id })).scheduledDate,
      "2026-11-02",
    );
    assert.equal(
      (
        await value("list_posts", {
          accountId: account.id,
          from: "2026-11-02",
          to: "2026-11-02",
        })
      ).total,
      1,
    );
    assert.ok(
      (
        await call("record_publication", {
          id: post.id,
          revision: moved.revision,
          published: true,
        })
      ).isError,
    );
    assert.equal(
      (await value("get_post", { id: post.id })).publicationConfirmedAt,
      null,
    );
    const published = await value("record_publication", {
      id: post.id,
      revision: moved.revision,
      published: true,
      userConfirmed: true,
    });
    assert.ok(published.publicationConfirmedAt);
    const restored = await value("record_publication", {
      id: post.id,
      revision: published.revision,
      published: false,
      userConfirmed: true,
    });
    assert.equal(restored.publicationConfirmedAt, null);
    assert.ok((await call("delete_media", { id: a })).isError);
    const other = await value("save_account", { name: "Inne" });
    assert.ok(
      (
        await call("save_post", {
          ...input,
          accountId: other.id,
          scheduledDate: null,
        })
      ).isError,
    );
    const copy = await value("copy_media", { id: a, accountId: other.id });
    assert.equal(copy.accountId, other.id);
    const backup = await value("create_backup");
    assert.ok(fs.existsSync(backup.path));
    await value("delete_post", { id: post.id });
    await value("delete_media", { id: a });
  } finally {
    await client.close();
    await server.close();
    (await getStore()).db.close();
    delete process.env.INSTAPLANNER_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local import rejects traversal, symlink escapes and non-files", () => {
  const root = fs.mkdtempSync("/private/tmp/instaplanner-import-");
  try {
    fs.symlinkSync("/etc/passwd", path.join(root, "escape.png"));
    assert.throws(
      () => openImport(path.join(root, "escape.png"), [root]),
      /poza folderami/,
    );
    assert.throws(() =>
      openImport(path.join(root, "..", "..", "etc", "passwd"), [root]),
    );
    assert.throws(() => openImport(root, [root]));
    assert.throws(() => openImport("relative.png", [root]), /bezwzględną/);
    assert.throws(() => openImport("/etc/passwd", []), /poza folderami/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("API bridge keeps loopback origin, rejects redirects and gives actionable failures", async () => {
  const api = new PlannerApi(async (input, init) => {
    assert.equal(
      String(input),
      "http://127.0.0.1:3210/api/posts/example/schedule",
    );
    assert.equal(
      new Headers(init?.headers).get("origin"),
      "http://127.0.0.1:3210",
    );
    assert.equal(init?.redirect, "error");
    assert.equal(init?.body, JSON.stringify({ date: null, revision: 1 }));
    return Response.json({ error: "Konflikt rewizji" }, { status: 409 });
  });
  await assert.rejects(
    api.json("posts/example/schedule", "POST", { date: null, revision: 1 }),
    /Konflikt rewizji/,
  );
  const offline = new PlannerApi(async () => {
    throw new Error("ECONNREFUSED");
  });
  await assert.rejects(offline.json("accounts"), /Uruchom aplikację/);
});

test("stdio launcher handshakes from outside project without logging to stdout", async () => {
  const client = new Client({ name: "stdio-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("scripts/mcp-launcher.mjs")],
    cwd: "/private/tmp",
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    assert.ok(
      (await client.listTools()).tools.some((t) => t.name === "view_media"),
    );
  } finally {
    await client.close();
  }
});
