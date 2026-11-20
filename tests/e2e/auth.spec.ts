import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("login form validates input before contacting the server", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Enter your password")).toBeVisible();
});

test("sign-up form checks the password rules", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Surname").fill("Azzopardi");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Repeat password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
});

test("password can be shown and hidden", async ({ page }) => {
  await page.goto("/login");
  const field = page.getByLabel("Password", { exact: true });
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(field).toHaveAttribute("type", "text");
});

test("login offers 'keep me signed in' (on by default) and remembers the email on this device", async ({ page }) => {
  await page.goto("/login");
  const box = page.getByLabel("Keep me signed in on this device");
  await expect(box).toBeChecked();
  await page.evaluate(() => localStorage.setItem("orion:remembered-email", "tina@orion.test"));
  await page.reload();
  await expect(page.getByLabel("Email")).toHaveValue("tina@orion.test");
});
