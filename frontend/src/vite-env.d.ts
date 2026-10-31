/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_BACKEND_URL?: string
  /** « true » : affiche les comptes de démonstration sur l'écran de connexion. */
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string
  /** Minutes sans activité avant déconnexion (60 par défaut). */
  readonly VITE_IDLE_MINUTES?: string
  /** « true » : toutes les fonctions (sinon la version cœur du sujet). */
  readonly VITE_FULL_FEATURES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
