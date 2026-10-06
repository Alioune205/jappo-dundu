import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Ambulance,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Droplets,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts'
import { BrandMark, BrandName } from '@/components/layout/BrandMark'

/** Icône et couleur des comptes de démonstration, par identifiant. */
const DEMO_STYLE: Record<string, { icon: React.ElementType; text: string; soft: string }> = {
  admin: { icon: ShieldCheck, text: 'text-fg', soft: 'bg-raised' },
  'dr.diop': { icon: BedDouble, text: 'text-accent-blue', soft: 'bg-accent-blue/10' },
  'cnts.dakar': { icon: Droplets, text: 'text-accent-red', soft: 'bg-accent-red/10' },
  'samu.regulation': { icon: Ambulance, text: 'text-accent-green', soft: 'bg-accent-green/10' },
}

const MODULES = [
  { icon: Droplets, label: 'Sang' },
  { icon: BedDouble, label: 'Lits' },
  { icon: Ambulance, label: 'Ambulances' },
]

const fieldClass =
  'h-12 w-full rounded-full border border-line-strong bg-surface pl-11 text-[0.9375rem] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-subtle hover:border-fg/40 focus:border-brand focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_15%,transparent)]'

/**
 * Connexion de l'espace professionnel. Même style « papier » que la page
 * d'accueil (classe .landing, voir index.css).
 */
export const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
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
      const message = err instanceof Error ? err.message : 'Impossible de vous connecter. Vérifiez vos identifiants.'
      setErrorMsg(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const demo = DEMO_ACCOUNTS

  const fillCredentials = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setErrorMsg(null)
  }

  const watchCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'))

  return (
    <div className="landing grid min-h-full bg-canvas text-fg lg:grid-cols-[1fr_1.05fr]">
      {/* Volet photo (grand écran) */}
      <aside className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:block lg:h-screen">
        <picture>
          <source srcSet="/images/landing/need.webp" type="image/webp" />
          <img
            src="/images/landing/need.jpg"
            alt="Une ambulance en intervention de nuit"
            className="absolute inset-0 h-full w-full object-cover object-[50%_40%]"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/85" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <div className="flex items-center justify-between">
            <Link to="/bienvenue" className="flex items-center gap-2">
              <span className="rounded-full bg-white/95 p-1">
                <BrandMark className="h-9 w-9" />
              </span>
              <span className="text-lg font-bold">Jappo Dundu</span>
            </Link>
            <Link
              to="/bienvenue"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Accueil
            </Link>
          </div>
          <div>
            <p className="font-label text-xs font-semibold text-amber">Espace professionnel</p>
            <p className="font-display mt-3 max-w-lg text-4xl xl:text-5xl font-semibold leading-[1.05]">
              Chaque minute compte. <span className="italic text-amber">Chaque lit aussi.</span>
            </p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">
              Hôpitaux, centres de transfusion et SAMU : une seule plateforme pour le sang, les lits et les
              ambulances, en temps réel.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <li
                  key={m.label}
                  className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-medium backdrop-blur"
                >
                  <m.icon className="h-4 w-4 text-amber" aria-hidden="true" />
                  {m.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* Formulaire */}
      <main className="relative flex flex-col overflow-hidden px-5 py-8 sm:px-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 -top-48 h-[28rem] w-[28rem] rounded-full bg-amber-soft opacity-70"
        />
        <div className="relative flex items-center justify-between lg:hidden">
          <Link to="/bienvenue" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9" />
            <BrandName className="text-base" />
          </Link>
          <Link to="/bienvenue" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Accueil
          </Link>
        </div>

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 lg:py-6">
          <p className="font-label text-xs font-semibold text-brand">Espace professionnel</p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-[1.1] text-fg sm:text-5xl">
            Connexion à votre <span className="highlight">espace</span>
          </h1>
          <p className="mt-3 text-base text-muted">
            Administrateurs des lits, du sang, des ambulances et supervision nationale.
          </p>

          {errorMsg && (
            <Alert tone="danger" className="mt-6" onClose={() => setErrorMsg(null)}>
              {errorMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-fg">
                Identifiant
              </label>
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle"
                  aria-hidden="true"
                />
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  autoFocus
                  placeholder="ex. dr.diop"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${fieldClass} pr-4`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-fg">
                Mot de passe
              </label>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={watchCapsLock}
                  onKeyDown={watchCapsLock}
                  aria-describedby={capsLock ? 'caps-lock' : undefined}
                  className={`${fieldClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-raised hover:text-fg"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {capsLock && (
                <p id="caps-lock" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Majuscules activées
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand text-base font-semibold text-on-brand shadow-[0_10px_24px_-10px_var(--brand)] transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                </svg>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="mt-5 flex items-start gap-2 text-sm text-muted">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Mot de passe oublié ? Contactez l’administrateur général de la plateforme.
          </p>

          {/* Comptes de démonstration : absents des builds de production (lib/demoAccounts). */}
          {demo && (
            <div className="mt-8 rounded-[1.75rem] border border-dashed border-line-strong p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-label text-[0.65rem] font-semibold text-muted">Comptes de démonstration</p>
                <p className="text-xs text-muted">
                  Mot de passe : <span className="font-semibold text-fg">{demo.password}</span>
                </p>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {demo.accounts.map((account) => {
                  const style = DEMO_STYLE[account.username] ?? DEMO_STYLE.admin
                  const Icon = style.icon
                  return (
                    <button
                      key={account.username}
                      title={`${account.label} (${account.username})`}
                      type="button"
                      onClick={() => fillCredentials(account.username, demo.password)}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand/40 ${
                        username === account.username ? 'border-brand' : 'border-line'
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.soft}`}>
                        <Icon className={`h-4 w-4 ${style.text}`} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-fg">{account.label}</span>
                        <span className="block truncate text-xs text-muted">{account.username}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-md space-y-2 text-center text-xs text-subtle">
          <p>Accès réservé au personnel habilité. Les connexions sont journalisées.</p>
          <p>
            Vous souhaitez donner votre sang ?{' '}
            <Link to="/bienvenue#don" className="font-semibold text-brand hover:text-brand-strong">
              Découvrir Jappo Dundu
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
