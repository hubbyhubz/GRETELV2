import { expect, test } from '@playwright/test';

test('Dashboard visibility admin panel is reachable (requires env credentials)', async ({ page, baseURL }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) test.skip(true, 'Set E2E_EMAIL and E2E_PASSWORD to run this test.');

  await page.goto(`${baseURL}/`);

  await page.getByLabel('Email').fill(email || '');
  await page.getByLabel('Password').fill(password || '');
  await page.getByRole('button', { name: /log in/i }).click();

  await expect(page.getByText(/account settings/i)).toBeVisible({ timeout: 30_000 });
});

