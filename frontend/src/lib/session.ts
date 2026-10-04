/**
 * Stockage des jetons JWT.
 *
 * - access token : en mémoire uniquement (jamais persisté, 30 min de vie) ;
 * - refresh token : sessionStorage, effacé à la fermeture de l'onglet.
 *
 * Pourquoi sessionStorage plutôt que localStorage : les postes des hôpitaux
 * sont souvent partagés, et le backend fait tourner le refresh token à chaque
 * rafraîchissement (l'ancien est révoqué). Avec un stockage commun à tous les
 * onglets, deux onglets rafraîchissant en même temps se révoqueraient
 * mutuellement ; un stockage par onglet supprime cette course.
 */

const REFRESH_KEY = 'jappo-dundu.refresh'

let accessToken: string | null = null

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    // Navigation privée stricte ou stockage désactivé : session en mémoire seulement.
    return null
  }
}

let memoryRefresh: string | null = null

export const session = {
  getAccess(): string | null {
    return accessToken
  },

  getRefresh(): string | null {
    return storage()?.getItem(REFRESH_KEY) ?? memoryRefresh
  },

  setTokens(access: string, refresh: string): void {
    accessToken = access
    memoryRefresh = refresh
    storage()?.setItem(REFRESH_KEY, refresh)
  },

  clear(): void {
    accessToken = null
    memoryRefresh = null
    storage()?.removeItem(REFRESH_KEY)
  },
}
