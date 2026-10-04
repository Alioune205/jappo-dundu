import { expect, type Page } from '@playwright/test'

/** Connexion avec un compte de démonstration (affichés en développement). */
export async function loginAs(page: Page, accountLabel = 'Administration') {
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(accountLabel) }).click()
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
}

/** Lien du menu latéral (les tuiles du tableau de bord sont aussi des liens). */
export function menuLink(page: Page, label: string) {
  return page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: label })
}

/** Attend que le flux temps réel soit établi (pastille de l'en-tête). */
export async function expectRealtimeConnected(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Temps réel' })).toBeVisible({ timeout: 20_000 })
}

/** Lit « 6 / 10 » → 6. */
export function firstNumber(text: string | null): number {
  const match = /\d+/.exec(text ?? '')
  if (!match) throw new Error(`Nombre introuvable dans « ${text} »`)
  return Number(match[0])
}
