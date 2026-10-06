import { letters, expect, test } from './fixtures';

test('a player switches to French before signing in and plays in French', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.getByLabel('Je confirme avoir 18 ans ou plus').check();
  await page.getByRole('button', { name: 'Jouer maintenant' }).click();

  await page.getByRole('button', { name: /Fondateur/ }).click();
  await page.getByRole('button', { name: /Ex-ingénieur/ }).click();
  await page.getByRole('button', { name: /Kigali/ }).click();
  await page.getByRole('button', { name: 'Femme', exact: true }).click();
  await page.getByLabel('Votre nom').fill('Aline E2E');
  await page.getByLabel('Pseudo').fill(`aline_${letters(6)}`);
  await expect(page.getByText('Disponible', { exact: true })).toBeVisible();
  await page.getByLabel('Votre idée en une ligne').fill('Paiements pour les commerçants');
  await page.getByLabel('Nom de l’entreprise').fill('Flutterwav');
  await expect(page.getByText('Trop proche d’une marque connue.')).toBeVisible();
  await page.getByLabel('Nom de l’entreprise').fill(`Umuco Pay ${letters(5)}`);
  await expect(page.getByText(/Disponible à Kigali/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(
    page.getByText(
      'Ceci est un jeu. Rien ici ne constitue un conseil financier, juridique ou fiscal.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Commencer' }).click();

  await expect(page.getByRole('button', { name: /Aujourd’hui/ })).toBeVisible();
  // Kigali money is shown in Rwandan francs.
  await expect(page.getByText(/FRw/).first()).toBeVisible();
});
