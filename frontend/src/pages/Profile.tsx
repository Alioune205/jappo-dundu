import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatDateTime } from '@/lib/format'

export const Profile: React.FC = () => {
  const { user, refreshProfile } = useAuth()

  // Modification du profil
  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone_number || '')
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(
    null
  )
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Changement de mot de passe
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(
    null
  )
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdatingProfile(true)
    setProfileMsg(null)
    try {
      await api.patch('/api/users/me/', {
        first_name: firstName,
        last_name: lastName,
        email,
        phone_number: phone,
      })
      await refreshProfile()
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès.' })
    } catch (err: unknown) {
      setProfileMsg({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Erreur lors de la mise à jour.',
      })
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPasswordMsg({
        type: 'danger',
        text: 'Le nouveau mot de passe et sa confirmation ne correspondent pas.',
      })
      return
    }

    setIsChangingPassword(true)
    setPasswordMsg(null)
    try {
      await api.post('/api/users/me/password/', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordMsg({
        type: 'success',
        text: 'Mot de passe modifié avec succès. Vos autres sessions ont été révoquées.',
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setPasswordMsg({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe.',
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Identifiant', value: <span className="num">{user?.username}</span> },
    { label: 'Rôle', value: user?.role === 'admin' ? 'Administrateur' : 'Personnel hospitalier' },
    {
      label: 'Établissement',
      value: user?.facility ? `${user.facility.name} · ${user.facility.city}` : 'Aucun rattachement',
    },
    { label: 'Région', value: user?.region_display || user?.region || 'National' },
    { label: 'Inscrit le', value: <span className="num">{formatDateTime(user?.date_joined)}</span> },
    {
      label: 'Dernière connexion',
      value: user?.last_login ? <span className="num">{formatDateTime(user.last_login)}</span> : '—',
    },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Mon compte" description="Identité professionnelle, coordonnées et mot de passe." />

      <section className="rounded-md border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-raised text-sm font-medium text-fg">
            {(user?.full_name || user?.username || 'U').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-fg">{user?.full_name || user?.username}</h2>
            <p className="text-xs text-muted">{user?.email || 'Adresse e-mail non renseignée'}</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="bg-surface px-4 py-2.5">
              <dt className="eyebrow">{fact.label}</dt>
              <dd className="mt-0.5 truncate text-sm text-fg">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-md border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg">Coordonnées</h3>
          <p className="mt-0.5 text-xs text-muted">Utilisées pour vous joindre en cas d'urgence.</p>

          {profileMsg && (
            <Alert tone={profileMsg.type} className="mt-3" onClose={() => setProfileMsg(null)}>
              {profileMsg.text}
            </Alert>
          )}

          <form onSubmit={handleUpdateProfile} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Prénom" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Nom" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input
              label="Adresse e-mail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Téléphone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="77 123 45 67"
            />
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" isLoading={isUpdatingProfile}>
                Enregistrer
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg">Mot de passe</h3>
          <p className="mt-0.5 text-xs text-muted">Le changement déconnecte vos autres sessions.</p>

          {passwordMsg && (
            <Alert tone={passwordMsg.type} className="mt-3" onClose={() => setPasswordMsg(null)}>
              {passwordMsg.text}
            </Alert>
          )}

          <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
            <Input
              label="Mot de passe actuel"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              label="Nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="8 caractères minimum."
            />
            <Input
              label="Confirmation"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={
                confirmPassword && newPassword !== confirmPassword
                  ? 'Ne correspond pas au nouveau mot de passe.'
                  : undefined
              }
            />
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="secondary" isLoading={isChangingPassword}>
                Changer le mot de passe
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
