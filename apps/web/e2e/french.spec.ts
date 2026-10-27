import { letters, expect, test } from './fixtures';

test('a player joins and edits their profile in French', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  // 1: the path (the role's name agrees with the player's sex: Fondateur or Fondatrice).
  await expect(page.getByRole('heading', { name: 'Choisissez votre voie' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Choisissez votre voie' })
    .getByRole('radio', { name: /^Fondat/ })
    .check();
  await page.getByRole('button', { name: /^Continuer/ }).click();
  // 2: the look.
  await expect(page.getByRole('heading', { name: 'Votre look' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Je suis' })
    .getByRole('radio', { name: 'Une femme' })
    .check();
  await expect(
    page.locator('.su-stage-big').getByText('Fondatrice · Sweat à capuche'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Plus d’options/ })).toBeVisible();
  await page.getByRole('button', { name: /^Suivant/ }).click();
  // 3: about you.
  await expect(page.getByRole('heading', { name: 'À propos de vous' })).toBeVisible();
  await page.getByLabel('Votre nom', { exact: true }).fill('Aline');
  await page
    .getByRole('radiogroup', { name: 'Votre ville' })
    .getByRole('radio', { name: 'Lagos' })
    .check();
  await page.getByLabel('Nom d’utilisateur').fill(`aline_${letters(6)}`);
  await page.getByLabel('Email', { exact: true }).fill('aline@gmail');
  await page.getByLabel('Email', { exact: true }).blur();
  await expect(page.getByRole('alert')).toHaveText(
    'Ajoutez la fin de votre e-mail, comme ada@gmail.com',
  );
  await page.getByLabel('Email', { exact: true }).fill(`aline-${letters()}@example.com`);
  await page.getByRole('checkbox', { name: 'J’ai 18 ans ou plus' }).check();
  await page.getByRole('button', { name: /^Jouer/ }).click();
  await expect(page.getByRole('button', { name: /Aujourd’hui/ })).toBeVisible();
  await page.getByRole('button', { name: 'Moi', exact: true }).click();
  await page.getByLabel('Votre nom').fill('Aline E2E');
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
  await expect(page.getByText('Profil enregistré.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configurer votre entreprise' })).toBeVisible();
});
