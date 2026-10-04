import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type TextInput } from 'react-native'
import { Link, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated from 'react-native-reanimated'
import { AuthShell, enter } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { SelectField } from '@/components/ui/SelectField'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { useAuth, type SocialProvider } from '@/context/AuthContext'
import { SocialButtons } from '@/features/auth/SocialButtons'
import { PasswordStrength } from '@/features/auth/PasswordStrength'
import { TermsSheet } from '@/features/auth/TermsSheet'
import { ApiError, type FieldErrors } from '@/lib/api'
import { REGIONS } from '@/lib/constants'
import { EMPTY_REGISTRATION, formatPhoneInput, nationalDigits, validateRegistration, type RegistrationForm } from '@/lib/validation'
import { space } from '@/theme'
import type { RegionCode } from '@/types/api'

/**
 * Inscription (étape 1 sur 2, le profil donneur suit). L'identifiant de
 * connexion est le numéro de téléphone : un champ de moins, et rien à
 * retenir.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function RegisterScreen() {
  const { register, socialLogin } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState<RegistrationForm>(EMPTY_REGISTRATION)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const lastNameRef = useRef<TextInput>(null)
  const phoneRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)

  const set = (patch: Partial<RegistrationForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    // Le champ corrigé perd son erreur aussitôt, sans attendre un nouvel envoi.
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch)) delete next[key]
      return next
    })
  }
  const errorOf = (field: keyof RegistrationForm) => errors[field]?.[0]

  const submit = async () => {
    const local = validateRegistration(form)
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      return
    }
    const digits = nationalDigits(form.phone_number)!
    setSubmitting(true)
    try {
      await register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: `+221${digits}`,
        region: form.region as RegionCode,
        // Identifiant technique = numéro : la connexion se fait avec le téléphone.
        username: digits,
        password: form.password,
      })
      router.replace('/donor-setup')
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const { username, ...rest } = err.fieldErrors
        // L'identifiant étant le numéro, un doublon d'identifiant est un numéro déjà inscrit.
        setErrors(username ? { ...rest, phone_number: rest.phone_number ?? ['Ce numéro a déjà un compte : connectez-vous.'] } : rest)
      }
      setFormError(err instanceof Error ? err.message : 'Inscription impossible.')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setSubmitting(false)
    }
  }

  const social = async (provider: SocialProvider, payload: Record<string, string>) => {
    const { profileComplete } = await socialLogin(provider, payload)
    router.replace(profileComplete ? '/donor-setup' : '/complete-profile')
  }

  return (
    <AuthShell
      title="Créer votre compte."
      subtitle="Rejoignez les donneurs de votre région. Votre groupe sanguin vous sera demandé juste après."
      step={{ current: 1, total: 2 }}
      onBack={router.canGoBack() ? () => router.back() : () => router.replace('/login')}
      footer={
        <Link href="/login" replace asChild>
          <Pressable hitSlop={8} accessibilityRole="link">
            <Text variant="label" tone="muted">
              Déjà inscrit ?{' '}
              <Text variant="label" tone="brand">
                Se connecter
              </Text>
            </Text>
          </Pressable>
        </Link>
      }
    >
      <Animated.View entering={enter(1)} style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="Prénom"
            placeholder="Awa"
            value={form.first_name}
            onChangeText={(v) => set({ first_name: v })}
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
            error={errorOf('first_name')}
          />
        </View>
        <View style={styles.half}>
          <TextField
            ref={lastNameRef}
            label="Nom"
            placeholder="Ndiaye"
            value={form.last_name}
            onChangeText={(v) => set({ last_name: v })}
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            error={errorOf('last_name')}
          />
        </View>
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <TextField
          ref={phoneRef}
          label="Téléphone"
          icon="phone"
          prefix="+221"
          placeholder="77 123 45 67"
          value={form.phone_number}
          onChangeText={(v) => set({ phone_number: formatPhoneInput(v) })}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          hint="Il vous servira à vous connecter. Les hôpitaux ne le voient que si vous acceptez une demande."
          error={errorOf('phone_number')}
        />
      </Animated.View>
      <Animated.View entering={enter(3)}>
        <SelectField label="Région" icon="pin" value={form.region} options={REGIONS} onChange={(region) => set({ region })} error={errorOf('region')} />
      </Animated.View>
      <Animated.View entering={enter(4)} style={styles.group}>
        <TextField
          ref={passwordRef}
          label="Mot de passe"
          icon="lock"
          password
          placeholder="8 caractères minimum"
          value={form.password}
          onChangeText={(v) => set({ password: v })}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          error={errorOf('password')}
        />
        {!errorOf('password') && <PasswordStrength password={form.password} />}
      </Animated.View>
      <Animated.View entering={enter(5)}>
        <TextField
          ref={confirmRef}
          label="Confirmer le mot de passe"
          icon="lock"
          password
          placeholder="Le même, une seconde fois"
          value={form.confirm}
          onChangeText={(v) => set({ confirm: v })}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          error={errorOf('confirm')}
        />
      </Animated.View>
      <Animated.View entering={enter(6)}>
        <Checkbox
          checked={form.terms}
          onChange={(terms) => set({ terms })}
          accessibilityLabel="J’accepte les conditions d’utilisation et la politique de confidentialité"
          error={errorOf('terms')}
        >
          <Text variant="label" tone="muted">
            J’accepte les{' '}
            <Text variant="label" tone="brand" onPress={() => setTermsOpen(true)} accessibilityRole="link">
              conditions et la confidentialité
            </Text>
          </Text>
        </Checkbox>
      </Animated.View>
      {formError ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Animated.View entering={enter(7)} style={styles.action}>
        <Button label="Créer mon compte" onPress={submit} loading={submitting} haptic />
      </Animated.View>
      <Animated.View entering={enter(8)}>
        <SocialButtons label="ou s’inscrire avec" onToken={social} />
      </Animated.View>

      <TermsSheet
        visible={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAccept={() => {
          set({ terms: true })
          setTermsOpen(false)
        }}
      />
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  group: { gap: space.md },
  action: { marginTop: space.sm },
})
