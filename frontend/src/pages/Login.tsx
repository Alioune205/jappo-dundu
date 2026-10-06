import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts'
import { BrandMark, BrandName } from '@/components/layout/BrandMark'

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
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14" />
          <BrandName className="mt-3 text-3xl" />
          <h1 className="mt-6 text-xl font-bold text-fg">Connexion à votre espace</h1>
          <p className="mt-1 text-sm text-muted">Régulation des urgences médicales au Sénégal</p>
        </div>

        <div className="panel p-6 shadow-[var(--shadow-raised)] sm:p-8">
          {errorMsg && (
            <Alert tone="danger" className="mb-5" onClose={() => setErrorMsg(null)}>
              {errorMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Comptes de démonstration</span>
              <span className="num">
                mot de passe : <span className="font-medium text-fg">{demo.password}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {demo.accounts.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => fillCredentials(account.username, demo.password)}
                  className="cursor-pointer rounded-xl border border-line bg-surface px-3 py-2 text-left shadow-[var(--shadow-panel)] transition-colors hover:border-brand/40 hover:bg-brand-soft"
                >
                  <span className="block text-sm font-medium text-fg">{account.label}</span>
                  <span className="num block text-2xs text-muted">{account.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-subtle">
          Accès réservé au personnel habilité. Les connexions sont journalisées.
        </p>
      </div>
    </div>
  )
}
