import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the app is installable: manifest, icons and iPhone tags", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "Orion Projects", display: "standalone", start_url: "/home" });
  expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);

  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')).not.toHaveCount(0);
  const splash = page.locator('link[rel="apple-touch-startup-image"]');
  expect(await splash.count()).toBeGreaterThanOrEqual(10);
  expect((await request.get((await splash.first().getAttribute("href"))!)).ok()).toBe(true);
});

test("offline: the service worker shows a friendly page instead of an error", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Post a daily update" })).toBeVisible();
  await context.setOffline(false);
});

for (const path of ["/login", "/signup", "/forgot-password", "/offline", "/portal"]) {
  test(`${path} has no accessibility violations and no security-policy errors`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text()) && problems.push(m.text()));
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    expect(problems).toEqual([]);
  });
}
