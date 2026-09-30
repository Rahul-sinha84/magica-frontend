import { expect, test } from "@playwright/test";

test.skip(!process.env.CLERK_SECRET_KEY, "needs Clerk keys in .env.local");

test("signed-out visitor is sent to sign-in", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign-in page renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("main", { name: "Sign in to Magica" })).toBeVisible();
});

test("shows a spinner instead of a blank page while Clerk is unreachable", async ({ page }) => {
  await page.route(/clerk\.accounts\.dev|clerk\.com/, (route) => route.abort());
  await page.goto("/sign-in");
  await expect(page.getByRole("main").getByLabel("Loading")).toBeVisible();
});

test("spinner is replaced by the form once Clerk loads", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Continue", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("main").getByLabel("Loading")).toHaveCount(0);
});
