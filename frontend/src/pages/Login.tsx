import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts'
import { BrandMark } from '@/components/layout/BrandMark'

const MODULES = [
  { name: 'Jappo Sang', text: 'Alertes aux donneurs compatibles les plus proches.', color: 'var(--flag-red)' },
  { name: 'Jappo Lits', text: 'Disponibilité des lits par service, en direct.', color: 'var(--gold)' },
  { name: 'Jappo Ambulance', text: 'Missions SAMU et position des véhicules.', color: '#4cc47f' },
]

export const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setErrorMsg('Veuillez renseigner votre identifiant et votre mot de passe.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Impossible de vous connecter. Vérifiez vos identifiants.'
      setErrorMsg(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Copie locale : TypeScript ne restreint pas un import dans les callbacks.
  const demo = DEMO_ACCOUNTS

  const fillCredentials = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setErrorMsg(null)
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div aria-hidden="true" className="tricolor h-1 shrink-0" />

      <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Volet institutionnel */}
        <aside className="relative hidden overflow-hidden bg-sidebar px-12 py-12 text-sidebar-fg lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <BrandMark className="h-12 w-12" />
            <div>
              <p className="font-display text-2xl font-semibold leading-tight">Jappo Dundu</p>
              <p className="text-sm text-sidebar-muted">« Connecter la vie »</p>
            </div>
          </div>

          <div className="mt-auto max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              Plateforme nationale
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-white">
              Régulation des urgences médicales au Sénégal
            </h1>
            <p className="mt-4 text-base leading-relaxed text-sidebar-muted">
              Donneurs de sang, lits hospitaliers et ambulances, réunis en temps réel pour les
              établissements de santé et le SAMU.
            </p>

            <ul className="mt-8 space-y-3">
              {MODULES.map((module) => (
                <li key={module.name} className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: module.color }} />
                  <span>
                    <span className="block text-sm font-semibold text-white">{module.name}</span>
                    <span className="block text-sm text-sidebar-muted">{module.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-12 text-xs text-sidebar-muted">Connecter · Sauver · Vivre</p>
        </aside>

        {/* Formulaire */}
        <main className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <BrandMark className="h-10 w-10" />
              <div>
                <p className="font-display text-xl font-semibold leading-tight text-fg">Jappo Dundu</p>
                <p className="text-sm text-muted">Urgences médicales · Sénégal</p>
              </div>
            </div>

            <div className="panel p-7 sm:p-8">
              <h2 className="font-display text-2xl font-semibold text-fg">Connexion</h2>
              <div aria-hidden="true" className="tricolor mt-2 h-1 w-14 rounded-full" />
              <p className="mt-3 text-sm text-muted">Espace réservé aux établissements de santé et à la régulation.</p>

              {errorMsg && (
                <Alert tone="danger" className="mt-5" onClose={() => setErrorMsg(null)}>
                  {errorMsg}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <Input
                  label="Identifiant"
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />

                <Input
                  label="Mot de passe"
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className="mt-2 w-full">
                  Se connecter
                </Button>
              </form>
            </div>

            {/* Comptes de démonstration : absents des builds de production (lib/demoAccounts). */}
            {demo && (
              <div className="mt-5 rounded-xl border border-dashed border-line-strong bg-surface/60 p-4">
                <div className="eyebrow mb-3 flex items-center justify-between">
                  <span>Comptes de démonstration</span>
                  <span className="num normal-case tracking-normal text-subtle">{demo.password}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {demo.accounts.map((account) => (
                    <button
                      key={account.username}
                      type="button"
                      onClick={() => fillCredentials(account.username, demo.password)}
                      className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand hover:bg-brand-soft"
                    >
                      <span className="block text-[0.9375rem] font-semibold text-fg">{account.label}</span>
                      <span className="num block text-2xs text-muted">{account.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 text-center text-xs leading-relaxed text-subtle">
              Accès réservé au personnel habilité. Les connexions sont journalisées.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
