/**
 * Comptes de démonstration (créés par backend/seed_demo_data.py).
 *
 * Ils ne sont compilés dans le bundle qu'en développement, ou si
 * VITE_SHOW_DEMO_ACCOUNTS=true est fixé au build (instance de démonstration).
 * En production, la condition vaut `false` à la compilation : les
 * identifiants et le mot de passe disparaissent du JavaScript livré.
 */
export const SHOW_DEMO_ACCOUNTS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'

export interface DemoAccounts {
  password: string
  accounts: { username: string; label: string }[]
}

export const DEMO_ACCOUNTS: DemoAccounts | null = SHOW_DEMO_ACCOUNTS
  ? {
      password: 'Password123!',
      accounts: [
        { username: 'admin', label: 'Administration' },
        { username: 'dr.diop', label: 'Hôpital — lits' },
        { username: 'cnts.dakar', label: 'CNTS — sang' },
        { username: 'samu.driver', label: 'SAMU — équipage' },
      ],
    }
  : null
