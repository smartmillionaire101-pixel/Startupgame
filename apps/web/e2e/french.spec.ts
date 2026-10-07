import { letters, expect, test } from './fixtures';

test('a player joins and edits their profile in French', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.getByLabel('Nom d’utilisateur').fill(`aline_${letters(6)}`);
  await page.getByLabel('Email', { exact: true }).fill(`aline-${letters()}@example.com`);
  await page.getByLabel('Rejoindre en tant que').selectOption('founder');
  await page.getByRole('button', { name: 'Jouer maintenant' }).click();
  await expect(page.getByRole('button', { name: /Aujourd’hui/ })).toBeVisible();
  await page.getByRole('button', { name: 'Moi', exact: true }).click();
  await page.getByLabel('Votre nom').fill('Aline E2E');
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
  await expect(page.getByText('Profil enregistré.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configurer votre entreprise' })).toBeVisible();
});
