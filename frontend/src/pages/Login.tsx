import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts'

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
    <div className="flex min-h-full items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-sm bg-critical text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-fg">Jappo Dundu</h1>
            <p className="text-xs text-muted">Régulation des urgences médicales — Sénégal</p>
          </div>
        </div>

        <div className="rounded-md border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-fg">Connexion au poste</h2>

          {errorMsg && (
            <Alert tone="danger" className="mb-4" onClose={() => setErrorMsg(null)}>
              {errorMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
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

            <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className="mt-1 w-full">
              Se connecter
            </Button>
          </form>
        </div>

        {/* Comptes de démonstration : absents des builds de production (lib/demoAccounts). */}
        {demo && (
          <div className="mt-4 rounded-md border border-dashed border-line p-3">
            <div className="eyebrow mb-2 flex items-center justify-between">
              <span>Comptes de démonstration</span>
              <span className="num normal-case tracking-normal text-subtle">{demo.password}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {demo.accounts.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => fillCredentials(account.username, demo.password)}
                  className="cursor-pointer rounded border border-line px-2 py-1.5 text-left transition-colors hover:border-line-strong hover:bg-raised"
                >
                  <span className="block text-xs text-fg">{account.label}</span>
                  <span className="num block text-2xs text-muted">{account.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-2xs leading-relaxed text-subtle">
          Accès réservé au personnel habilité. Les connexions sont journalisées.
        </p>
      </div>
    </div>
  )
}
