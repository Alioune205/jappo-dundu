import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { Shield, Hospital, Droplet, Ambulance } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

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

  const fillCredentials = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setErrorMsg(null)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      <div className="w-full max-w-md clinical-card p-8 relative z-10 shadow-xl">
        {/* En-tête institutionnel */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center mx-auto mb-3 text-white shadow-sm">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            Jappo Dundu
          </h1>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mt-0.5">
            Plateforme Nationale des Urgences Médicales du Sénégal
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-2 rounded-full text-[11px] font-medium bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900">
            Portail Professionnel & SAMU 15
          </div>
        </div>

        {errorMsg && (
          <Alert tone="danger" className="mb-5" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Identifiant institutionnel"
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ex. admin ou dr.diop"
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
            placeholder="••••••••••••"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            className="w-full mt-2"
          >
            Se Connecter
          </Button>
        </form>

        {/* Comptes de démonstration pré-configurés */}
        <div className="mt-6 pt-5 border-t border-[var(--border-main)] space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block text-center">
            Accès Rapide Démonstration
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => fillCredentials('admin', 'Password123!')}
              className="p-2 rounded-lg bg-[var(--bg-subtle)] hover:border-slate-400 dark:hover:border-slate-600 border border-[var(--border-main)] text-left transition-colors cursor-pointer"
            >
              <div className="font-semibold text-[var(--text-main)] flex items-center gap-1">
                <Shield className="w-3 h-3 text-red-600 dark:text-red-400" />
                Admin
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">admin / Password123!</div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('dr.diop', 'Password123!')}
              className="p-2 rounded-lg bg-[var(--bg-subtle)] hover:border-slate-400 dark:hover:border-slate-600 border border-[var(--border-main)] text-left transition-colors cursor-pointer"
            >
              <div className="font-semibold text-[var(--text-main)] flex items-center gap-1">
                <Hospital className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                Hôpital (Lits)
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">dr.diop / Password123!</div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('cnts.dakar', 'Password123!')}
              className="p-2 rounded-lg bg-[var(--bg-subtle)] hover:border-slate-400 dark:hover:border-slate-600 border border-[var(--border-main)] text-left transition-colors cursor-pointer"
            >
              <div className="font-semibold text-[var(--text-main)] flex items-center gap-1">
                <Droplet className="w-3 h-3 text-red-600 dark:text-red-400" />
                CNTS (Sang)
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">cnts.dakar / Password123!</div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('samu.driver', 'Password123!')}
              className="p-2 rounded-lg bg-[var(--bg-subtle)] hover:border-slate-400 dark:hover:border-slate-600 border border-[var(--border-main)] text-left transition-colors cursor-pointer"
            >
              <div className="font-semibold text-[var(--text-main)] flex items-center gap-1">
                <Ambulance className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                SAMU (SMUR)
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">samu.driver / Password123!</div>
            </button>
          </div>
        </div>

        <div className="mt-5 text-center">
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Système protégé et audité sous contrôle du Ministère de la Santé et du SAMU National.
          </p>
        </div>
      </div>
    </div>
  )
}
