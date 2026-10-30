import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { todayWarsaw, type Post } from "../../src/lib/types";

test("account -> import -> carousel -> calendar -> edit -> bundle -> manual publication", async ({
  page,
  request,
}) => {
  const dataRoot = (await (await request.get("/api/settings")).json())
    .dataDir as string;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Dodaj pierwsze konto" }).click();
  await page.getByLabel("Nazwa konta").fill("Dzikie kadry");
  await page
    .getByLabel("Kontekst do podpisów AI")
    .fill("Krajobrazy, łagodny ton, bez hashtagów.");
  await page.getByRole("button", { name: "Zapisz konto" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Aktywne konto")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Konta i ustawienia" }).click();
  await page.getByRole("button", { name: "Nowe konto" }).click();
  await page.getByLabel("Nazwa konta").fill("Psie opowieści");
  await page.getByRole("button", { name: "Zapisz konto" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Aktywne konto")
    .selectOption({ label: "Dzikie kadry" });
  await page.getByRole("button", { name: "Media", exact: true }).click();
  const fixtures = "/private/tmp/instaplanner-e2e-fixtures";
  fs.mkdirSync(fixtures, { recursive: true });
  const a = path.join(fixtures, "jesień.jpeg"),
    b = path.join(fixtures, "krajobraz.png"),
    video = path.join(fixtures, "rolka.mp4"),
    mov = path.join(fixtures, "rolka.MOV");
  await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#81977b" },
  })
    .jpeg()
    .toFile(a);
  await sharp({
    create: { width: 480, height: 640, channels: 3, background: "#be976c" },
  })
    .png()
    .toFile(b);
  execFileSync(process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x668877:s=320x240:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    video,
  ]);
  execFileSync(process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    video,
    "-c",
    "copy",
    mov,
  ]);
  await page.locator('input[type="file"]').setInputFiles([a, b, video, mov]);
  await expect(page.getByText("Import 4/4")).toBeVisible();
  await page.getByRole("button", { name: "Wybierz jesień.jpeg" }).click();
  await page.getByRole("button", { name: "Wybierz krajobraz.png" }).click();
  await page.getByRole("button", { name: "Utwórz post" }).click();
  await page.getByLabel("Tytuł roboczy").fill("Jesienne światło");
  await page
    .getByLabel("Podpis na Instagram i Facebook")
    .fill("Zażółć gęślą jaźń.\n\nŚwiatło jesieni 🍂");
  await page.getByLabel("Notatka dla siebie").fill("Prywatne, nie eksportuj");
  await page.getByRole("button", { name: "Przesuń medium 2 w lewo" }).click();
  await page.getByRole("button", { name: "Zapisz post", exact: true }).click();
  await page.getByRole("button", { name: /Pomysły/ }).click();
  const tile = page.getByRole("button", { name: /Jesienne światło/ });
  await expect(tile).toBeVisible();
  await tile.dragTo(page.locator('.fc-daygrid-day[data-date="2026-10-14"]'));
  await expect(
    page.locator('.fc-daygrid-day[data-date="2026-10-14"]'),
  ).toContainText("Jesienne światło");
  const accountId = await page.getByLabel("Aktywne konto").inputValue();
  let posts = (await (
    await request.get(`/api/posts?accountId=${accountId}`)
  ).json()) as Post[];
  const post = posts.find((p) => p.title === "Jesienne światło")!;
  expect(post.exports.find((e) => e.purpose === "queue")!.status).toBe(
    "current",
  );
  const directory = path.join(dataRoot, post.exports[0].relativePath!);
  expect(fs.readFileSync(path.join(directory, "01.png"))).toEqual(
    fs.readFileSync(b),
  );
  expect(fs.readFileSync(path.join(directory, "02.jpeg"))).toEqual(
    fs.readFileSync(a),
  );
  expect(fs.readFileSync(path.join(directory, "podpis.txt"), "utf8")).toBe(
    "Zażółć gęślą jaźń.\n\nŚwiatło jesieni 🍂",
  );
  await page
    .locator('.fc-daygrid-day[data-date="2026-10-14"] .fc-event')
    .click();
  const open = page.waitForResponse((response) =>
    response.url().endsWith(`/posts/${post.id}/open`),
  );
  await page
    .getByRole("button", { name: "Otwórz paczkę", exact: true })
    .click();
  expect((await open).status()).toBe(200);
  await page
    .getByLabel("Podpis na Instagram i Facebook")
    .fill("Nowy podpis\nZ polskimi znakami: żółć.");
  await page.getByLabel("Data publikacji").fill("2026-10-16");
  await page.getByRole("button", { name: "Zapisz post", exact: true }).click();
  await expect(
    page.locator('.fc-daygrid-day[data-date="2026-10-16"]'),
  ).toContainText("Jesienne światło");
  expect(fs.existsSync(directory)).toBe(false);
  await page
    .locator('.fc-daygrid-day[data-date="2026-10-16"] .fc-event')
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Oznacz jako opublikowany", exact: true })
    .click();
  await expect(
    page.getByText("Opublikowany", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zamknij edytor" }).click();
  posts = await (await request.get(`/api/posts?accountId=${accountId}`)).json();
  expect(posts[0].publicationConfirmedAt).toBeTruthy();
  expect(posts[0].exports[0].status).toBe("absent");
  await page
    .getByLabel("Aktywne konto")
    .selectOption({ label: "Psie opowieści" });
  await expect(page.locator(".calendar-post")).toHaveCount(0);
  await page
    .getByLabel("Aktywne konto")
    .selectOption({ label: "Dzikie kadry" });
  await expect(page.locator(".calendar-post")).toHaveCount(1);
  await page.screenshot({
    path: "/private/tmp/instaplanner-calendar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page.getByRole("button", { name: "Wybierz rolka.mp4" }).click();
  await page.getByRole("button", { name: "Utwórz post" }).click();
  await page.getByLabel("Tytuł roboczy").fill("Krótka rolka");
  await page.getByLabel("Data publikacji").fill("2026-10-18");
  await page
    .getByLabel("Podpis na Instagram i Facebook")
    .fill("Rolka bez konwersji.");
  await page.getByRole("button", { name: "Zapisz post", exact: true }).click();
  posts = await (await request.get(`/api/posts?accountId=${accountId}`)).json();
  const reel = posts.find((p) => p.title === "Krótka rolka")!;
  expect(reel.media[0].thumbnailRelativePath).toBeTruthy();
  expect(
    fs.readFileSync(
      path.join(dataRoot, reel.exports[0].relativePath!, "01.mp4"),
    ),
  ).toEqual(fs.readFileSync(video));
  const library = await (
    await request.get(`/api/media?accountId=${accountId}`)
  ).json();
  const movie = library.find(
    (m: { originalName: string }) => m.originalName === "rolka.MOV",
  );
  expect(movie.mimeType).toBe("video/quicktime");
  expect(movie.thumbnailRelativePath).toBeTruthy();
  expect(errors).toEqual([]);
});

test("media drop saves a draft, persists after reload and rejects an occupied day", async ({
  page,
  request,
  baseURL,
}) => {
  const accountResponse = await request.post("/api/accounts", {
    headers: { Origin: baseURL! },
    data: {
      name: "Plan ze zdjęć",
      handle: "",
      accent: "#81977b",
      aiContext: "",
    },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = await accountResponse.json();
  const bytes = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#81977b" },
  })
    .jpeg()
    .toBuffer();
  const upload = await request.post(
    `/api/media?accountId=${account.id}&filename=plan.jpg`,
    {
      data: bytes,
      headers: { "Content-Type": "application/octet-stream", Origin: baseURL! },
    },
  );
  expect(upload.ok()).toBeTruthy();
  const medium = await upload.json();
  await page.goto("/");
  await page.getByLabel("Aktywne konto").selectOption(account.id);
  await page.getByRole("button", { name: "Media", exact: true }).click();
  const source = page.getByRole("button", { name: "Wybierz plan.jpg" });
  const day = page.locator(`.fc-daygrid-day[data-date="${todayWarsaw()}"]`);
  await source.dragTo(day);
  await expect(day.locator(".calendar-post")).toContainText("plan.jpg");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const readPosts = async (): Promise<Post[]> =>
    (await request.get(`/api/posts?accountId=${account.id}`)).json();
  const posts = await readPosts();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    scheduledDate: todayWarsaw(),
    readiness: "draft",
    caption: "",
    type: "photo",
    publicationConfirmedAt: null,
  });
  expect(posts[0].media.map((item) => item.id)).toEqual([medium.id]);
  await source.dragTo(day);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await readPosts()).toHaveLength(1);
  await page.reload();
  await expect(day.locator(".calendar-post")).toContainText("plan.jpg");
  await day.locator(".fc-event").click();
  await expect(page.getByLabel("Tytuł roboczy")).toHaveValue("plan.jpg");
  await expect(page.getByLabel("Data publikacji")).toHaveValue(todayWarsaw());
});
