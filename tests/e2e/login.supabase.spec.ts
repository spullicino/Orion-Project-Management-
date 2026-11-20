import { expect, test } from "@playwright/test";

// Needs a running Supabase with supabase/seed.sql applied. Run with: E2E_SUPABASE=1 npm run test:e2e
const PASSWORD = "OrionDemo!2026";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("@supabase an approved user lands on Home", async ({ page }) => {
  await signIn(page, "tech1@orion.test");
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText("Technician")).toBeVisible();
});

test("@supabase a pending user sees the waiting screen", async ({ page }) => {
  await signIn(page, "pending@orion.test");
  await expect(page).toHaveURL(/\/pending/);
  await expect(page.getByText("waiting for an administrator")).toBeVisible();
});

test("@supabase a technician cannot open the admin screen", async ({ page }) => {
  await signIn(page, "tech1@orion.test");
  await page.waitForURL(/\/home/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/home\?denied=1/);
});

test("@supabase an admin sees pending approvals", async ({ page }) => {
  await signIn(page, "admin@orion.test");
  await page.goto("/admin");
  await expect(page.getByText("pending@orion.test")).toBeVisible();
});

test("@supabase a technician adds a task and changes its status", async ({ page }) => {
  await signIn(page, "tech1@orion.test");
  await page.waitForURL(/\/home/);
  await page.goto("/projects");
  await page.getByText("Valletta Office Fit-out").click();
  await page.waitForURL(/\/board/);
  const title = `E2E task ${Date.now()}`;
  await page.getByLabel("Add a task to Planning").first().fill(title);
  await page.keyboard.press("Enter");
  await expect(page.getByText(title).first()).toBeVisible();
  await page.getByText(title).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /Status: .* Change status/ }).click();
  await page.getByRole("button", { name: "Working on it" }).click();
  await expect(page.getByRole("dialog").getByText("Working on it")).toBeVisible();
});

test("@supabase a basic user can view but not edit the board", async ({ page }) => {
  await signIn(page, "basic@orion.test");
  await page.waitForURL(/\/home/);
  await page.goto("/projects");
  await page.getByText("Valletta Office Fit-out").click();
  await expect(page.getByText("You can view this project but not change it.")).toBeVisible();
  await expect(page.getByLabel(/Add a task to/)).toHaveCount(0);
});

test("@supabase a manager exports the Gantt chart as PDF and creates a client link", async ({ page }) => {
  await signIn(page, "manager@orion.test");
  await page.waitForURL(/\/home/);
  await page.goto("/projects");
  await page.getByText("Valletta Office Fit-out").click();
  await page.getByRole("link", { name: "Gantt" }).click();
  await expect(page.getByRole("img", { name: /Gantt chart/ })).toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/valletta-office-fit-out-gantt-.*\.pdf/);

  await page.getByRole("button", { name: "Share with client" }).click();
  await page.getByRole("button", { name: /Create link/ }).click();
  await expect(page.getByText("Active").first()).toBeVisible();
});

test("@supabase a technician posts a daily update with a photo", async ({ page }) => {
  await signIn(page, "tech1@orion.test");
  await page.waitForURL(/\/home/);
  await page.goto("/daily-update");
  await page.getByLabel("Project").selectOption({ label: "Valletta Office Fit-out" });
  const text = `E2E diary ${Date.now()}`;
  await page.getByLabel("What did you do today?").fill(text);
  await page.getByRole("button", { name: "8 h" }).click();
  await page.locator("input[type=file][multiple]").setInputFiles("tests/e2e/fixtures/site-photo.jpg");
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Post update" }).click();
  await expect(page.getByText("Daily update sent")).toBeVisible({ timeout: 30_000 });
  await page.goto("/projects");
  await page.getByText("Valletta Office Fit-out").click();
  await page.getByRole("link", { name: "Diary" }).click();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open photo 1 of 1/ }).first()).toBeVisible();
});
