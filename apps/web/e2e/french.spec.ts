import { expect, test } from './fixtures';

test('a player switches to French before signing in and plays in French', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.getByLabel('Numéro de mobile').fill(`+22177${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Date de naissance').fill('1990-05-20');
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  const code = (await page.getByText(/votre code est \d{6}/i).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('Code à 6 chiffres').fill(code);
  await page.getByRole('button', { name: 'Vérifier' }).click();

  await page.getByRole('button', { name: /Fondateur/ }).click();
  await page.getByRole('button', { name: /Ex-ingénieur/ }).click();
  await page.getByRole('button', { name: /Kigali/ }).click();
  await page.getByLabel('Votre nom').fill('Aline E2E');
  await page.getByLabel('Pseudo').fill(`aline_${Date.now().toString().slice(-6)}`);
  await expect(page.getByText('Disponible', { exact: true })).toBeVisible();
  await page.getByLabel('Votre idée en une ligne').fill('Paiements pour les commerçants');
  await page.getByLabel('Nom de l’entreprise').fill('Flutterwav');
  await expect(page.getByText('Trop proche d’une marque connue.')).toBeVisible();
  await page.getByLabel('Nom de l’entreprise').fill(`Umuco Pay ${Date.now().toString().slice(-4)}`);
  await expect(page.getByText(/Disponible à Kigali/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(
    page.getByText(
      'Ceci est un jeu. Rien ici ne constitue un conseil financier, juridique ou fiscal.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Commencer' }).click();

  await expect(page.getByRole('button', { name: /Accueil/ })).toBeVisible();
  // Kigali money is shown in Rwandan francs.
  await expect(page.getByText(/FRw/).first()).toBeVisible();
});
