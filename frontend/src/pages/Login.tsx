import React, { useState } from 'react'
import { useNavigate } from 'react-router'
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ink-950 relative overflow-hidden">
      {/* Halos lumineux en arrière-plan */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-brand-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-sky-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md surface border border-white/10 bg-ink-900/80 shadow-2xl rounded-3xl p-8 backdrop-blur-2xl relative z-10 animate-slide-up">
        {/* En-tête */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4 shadow-brand">
            <span className="text-2xl">🩸</span>
          </div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Jappo Dundu
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Portail Web Hôpitaux, Régulation & SAMU Sénégal
          </p>
        </div>

        {errorMsg && (
          <Alert tone="danger" className="mb-6" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom d'utilisateur ou e-mail"
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ex. awa.ndiaye ou dr.diallo"
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
            Se connecter au portail
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
          <p className="text-[11px] text-ink-500 leading-relaxed">
            Accès sécurisé réservé au personnel hospitalier, administrateurs et régulateurs de santé.
            En cas de perte d'accès, contactez votre administrateur d'établissement.
          </p>
        </div>
      </div>
    </div>
  )
}
