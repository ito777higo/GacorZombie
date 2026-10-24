import { test as base, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const test = base.extend({
  gameURL: [async ({}, use, workerInfo) => {
    const production = workerInfo.project.name.startsWith("build-");
    const options = { root, server: { host: "127.0.0.1", port: 0 }, preview: { host: "127.0.0.1", port: 0 } };
    const server = production ? await preview(options) : await createServer(options);
    if (!production) await server.listen();
    try {
      await use(`http://127.0.0.1:${server.httpServer.address().port}/`);
    } finally {
      if (production) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
      else await server.close();
    }
  }, { scope: "worker" }],
});

async function headAt(page, x, y) {
  const pixel = await page.locator("#board").evaluate((canvas, cell) =>
    [...canvas.getContext("2d").getImageData(cell.x * 20 + 2, cell.y * 20 + 2, 1, 1).data], { x, y });
  expect(pixel).toEqual([44, 73, 52, 255]);
}

async function eatFirstFruit(page) {
  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(12 * 130);
  await page.keyboard.press("ArrowLeft");
  await page.clock.runFor(12 * 130);
  await expect(page.locator("#score")).toHaveText("010");
  await headAt(page, 0, 0);
}

test.beforeEach(async ({ page, gameURL }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.__gameErrors = errors;
  await page.addInitScript(() => { Math.random = () => 0; });
  const time = new Date("2026-10-25T00:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.goto(gameURL);
  await expect(page.locator("#action")).toBeEnabled();
});

test.afterEach(async ({ page }) => {
  expect(page.__gameErrors).toEqual([]);
});

test("ready screen, original styling, responsive layout, and pace selection", async ({ page }) => {
  await expect(page).toHaveTitle("Pixel Snake · GacorZombie");
  await expect(page.locator("#overlay-title")).toHaveText("READY?");
  await expect(page.locator("#score")).toHaveText("000");
  await expect(page.locator("#pause")).toBeDisabled();
  await expect(page.locator("#startup-help")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("#board")).toHaveCSS("touch-action", "none");
  await page.getByRole("button", { name: "悠闲", exact: true }).click();
  await page.locator("#action").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await expect(page.locator('[data-pace="normal"]')).toBeDisabled();
  await page.clock.runFor(179);
  await headAt(page, 12, 12);
  await page.clock.runFor(1);
  await headAt(page, 13, 12);
});

test("keyboard movement, food, score, wall collision, best score, and restart", async ({ page }) => {
  await eatFirstFruit(page);
  await expect(page.locator("#best")).toHaveText("010");
  await page.clock.runFor(128);
  await expect(page.locator("#overlay-title")).toHaveText("GAME OVER");
  await expect(page.locator("#overlay-message")).toContainText("碰到边界啦");
  await expect(page.locator("#pause")).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.locator("#overlay")).toBeHidden();
  await expect(page.locator("#score")).toHaveText("000");
  await expect(page.locator("#best")).toHaveText("010");
  await headAt(page, 12, 12);
  await page.clock.runFor(130);
  await headAt(page, 13, 12);
  await page.keyboard.press("r");
  await headAt(page, 12, 12);
  await page.reload();
  await expect(page.locator("#best")).toHaveText("010");
});

test("self collision is reported through the real keyboard controls", async ({ page }) => {
  await eatFirstFruit(page);
  for (const key of ["ArrowDown", "ArrowRight", "ArrowUp"]) {
    await page.keyboard.press(key);
    await page.clock.runFor(128);
  }
  await expect(page.locator("#overlay-title")).toHaveText("GAME OVER");
  await expect(page.locator("#overlay-message")).toContainText("咬到自己啦");
});

test("Enter, arrows, WASD, pause/resume, reversal rejection, and restart button", async ({ page }) => {
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await page.clock.runFor(130);
  await headAt(page, 13, 12);
  for (const [key, x, y] of [["ArrowUp", 13, 11], ["a", 12, 11], ["s", 12, 12], ["d", 13, 12]]) {
    await page.keyboard.press(key);
    await page.clock.runFor(130);
    await headAt(page, x, y);
  }
  await page.keyboard.press("Space");
  await expect(page.locator("#overlay-title")).toHaveText("PAUSED");
  const frozen = await page.locator("#board").evaluate(canvas => canvas.toDataURL());
  await page.keyboard.press("w");
  await page.clock.runFor(2000);
  expect(await page.locator("#board").evaluate(canvas => canvas.toDataURL())).toBe(frozen);
  await page.keyboard.press("Space");
  await page.clock.runFor(130);
  await headAt(page, 14, 12);
  await page.locator("#pause").click();
  await expect(page.locator("#overlay-title")).toHaveText("PAUSED");
  await page.locator("#action").click();
  await page.clock.runFor(130);
  await headAt(page, 15, 12);
  await page.locator("#restart").click();
  await headAt(page, 12, 12);
  await expect(page.locator("#score")).toHaveText("000");
});

test("touch direction buttons, real canvas swipes, pause, resume, and restart", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch gestures run on the mobile projects.");
  await page.getByRole("button", { name: "向上", exact: true }).tap();
  await page.clock.runFor(130);
  await headAt(page, 12, 11);
  for (const [name, x, y] of [["向左", 11, 11], ["向下", 11, 12], ["向右", 12, 12]]) {
    await page.getByRole("button", { name, exact: true }).tap();
    await page.clock.runFor(130);
    await headAt(page, x, y);
  }
  const session = await page.context().newCDPSession(page);
  try {
    for (const [dx, dy, x, y] of [[0, -55, 12, 11], [-55, 0, 11, 11], [0, 55, 11, 12], [55, 0, 12, 12]]) {
      await page.locator("#board").scrollIntoViewIfNeeded();
      const box = await page.locator("#board").boundingBox();
      const origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [origin] });
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: origin.x + dx, y: origin.y + dy }] });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.clock.runFor(130);
      await headAt(page, x, y);
    }
  } finally {
    await session.detach();
  }
  await page.locator("#pause").tap();
  await expect(page.locator("#overlay-title")).toHaveText("PAUSED");
  await page.clock.runFor(1000);
  await page.locator("#action").tap();
  await page.clock.runFor(130);
  await headAt(page, 13, 12);
  await page.locator("#restart").tap();
  await headAt(page, 12, 12);
});

test("downloadable standalone build remains playable", async ({ page, gameURL }) => {
  await page.goto(new URL("play.html", gameURL).href);
  await expect(page.locator("#action")).toBeEnabled();
  await page.locator("#action").click();
  await page.clock.runFor(130);
  await headAt(page, 13, 12);
  await page.keyboard.press("Space");
  await expect(page.locator("#overlay-title")).toHaveText("PAUSED");
});
