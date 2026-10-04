/**
 * Jetons JWT de la session.
 *
 * - jeton d'accès : en mémoire uniquement (30 min de vie) ;
 * - jeton de rafraîchissement : SecureStore (Keychain iOS, Keystore Android),
 *   jamais AsyncStorage, qui n'est pas chiffré. Sur le web (prévisualisation),
 *   SecureStore n'existe pas : sessionStorage prend le relais.
 */
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const REFRESH_KEY = 'jappo-dundu.refresh'

let accessToken: string | null = null
let refreshToken: string | null = null

const webStore = {
  get: () => {
    try {
      return window.sessionStorage.getItem(REFRESH_KEY)
    } catch {
      return null
    }
  },
  set: (value: string | null) => {
    try {
      if (value) window.sessionStorage.setItem(REFRESH_KEY, value)
      else window.sessionStorage.removeItem(REFRESH_KEY)
    } catch {
      // Stockage indisponible : la session reste en mémoire.
    }
  },
}

export const session = {
  getAccess: () => accessToken,
  getRefresh: () => refreshToken,

  /** Relit le jeton de rafraîchissement au démarrage de l'application. */
  async restore(): Promise<string | null> {
    refreshToken = Platform.OS === 'web' ? webStore.get() : await SecureStore.getItemAsync(REFRESH_KEY)
    return refreshToken
  },

  async setTokens(access: string, refresh: string) {
    accessToken = access
    refreshToken = refresh
    if (Platform.OS === 'web') webStore.set(refresh)
    else await SecureStore.setItemAsync(REFRESH_KEY, refresh)
  },

  async clear() {
    accessToken = null
    refreshToken = null
    if (Platform.OS === 'web') webStore.set(null)
    else await SecureStore.deleteItemAsync(REFRESH_KEY)
  },
}
