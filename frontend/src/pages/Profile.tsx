import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold font-display text-white tracking-tight">
          Mon Compte & Sécurité
        </h1>
        <p className="text-xs text-ink-400 mt-1">
          Informations personnelles, établissement rattaché et authentification
        </p>
      </div>

      {/* Carte d'identité professionnelle */}
      <Card className="p-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center font-display font-bold text-2xl text-white shadow-brand shrink-0">
            {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
          </div>

          <div className="space-y-1 truncate">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-ink-100">{user?.full_name}</h2>
              <Badge tone="brand" size="sm">
                {user?.role === 'admin' ? 'Administrateur' : 'Personnel Hospitalier'}
              </Badge>
            </div>
            <div className="text-xs text-ink-400">
              Identifiant : <span className="font-mono text-ink-200">{user?.username}</span>
            </div>
            {user?.facility && (
              <div className="text-xs text-sky-400 font-medium">
                🏥 {user.facility.name} ({user.facility.city})
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 mt-6 border-t border-white/[0.06] text-xs">
          <div>
            <span className="text-ink-500 text-[10px] uppercase block">Inscrit le</span>
            <span className="font-semibold text-ink-300">{formatDateTime(user?.date_joined)}</span>
          </div>
          <div>
            <span className="text-ink-500 text-[10px] uppercase block">Dernière connexion</span>
            <span className="font-semibold text-ink-300">
              {user?.last_login ? formatDateTime(user.last_login) : 'Session courante'}
            </span>
          </div>
          <div>
            <span className="text-ink-500 text-[10px] uppercase block">Région</span>
            <span className="font-semibold text-ink-300 capitalize">
              {user?.region_display || user?.region || 'National'}
            </span>
          </div>
          <div>
            <span className="text-ink-500 text-[10px] uppercase block">Statut du Compte</span>
            <span className="font-semibold text-emerald-400">✓ Actif</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Modifier les coordonnées */}
        <Card className="p-6 space-y-4">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-base">Coordonnées Professionnelles</CardTitle>
            <CardDescription>Mettez à jour votre nom, e-mail et numéro de contact</CardDescription>
          </CardHeader>

          {profileMsg && (
            <Alert tone={profileMsg.type} onClose={() => setProfileMsg(null)}>
              {profileMsg.text}
            </Alert>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                label="Nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <Input
              label="Adresse E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Numéro de Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="77 123 45 67"
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              isLoading={isUpdatingProfile}
            >
              Enregistrer les Modifications
            </Button>
          </form>
        </Card>

        {/* Changer le mot de passe */}
        <Card className="p-6 space-y-4">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-base">Sécurité du Mot de Passe</CardTitle>
            <CardDescription>
              Ferme automatiquement les autres sessions actives
            </CardDescription>
          </CardHeader>

          {passwordMsg && (
            <Alert tone={passwordMsg.type} onClose={() => setPasswordMsg(null)}>
              {passwordMsg.text}
            </Alert>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label="Mot de passe actuel"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <Input
              label="Nouveau mot de passe"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="8 caractères minimum, sécurisé"
            />

            <Input
              label="Confirmer le nouveau mot de passe"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button
              type="submit"
              variant="secondary"
              size="md"
              className="w-full"
              isLoading={isChangingPassword}
            >
              Modifier mon Mot de Passe
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
