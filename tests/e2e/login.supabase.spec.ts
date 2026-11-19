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
