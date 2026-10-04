import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import Animated from 'react-native-reanimated'
import { AuthShell, enter } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/SelectField'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { useAuth } from '@/context/AuthContext'
import { api, ApiError, type FieldErrors } from '@/lib/api'
import { REGIONS } from '@/lib/constants'
import { formatPhoneInput, nationalDigits } from '@/lib/validation'
import { space } from '@/theme'
import type { RegionCode } from '@/types/api'

/**
 * Après une inscription par Google, Facebook ou Apple : le fournisseur ne
 * donne ni téléphone ni région, indispensables pour être contacté par un
 * hôpital et recevoir les alertes régionales.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function CompleteProfileScreen() {
  const router = useRouter()
  const { user, refreshProfile, logout } = useAuth()
  const [phone, setPhone] = useState(user?.phone_number ? formatPhoneInput(user.phone_number.slice(-9)) : '')
  const [region, setRegion] = useState<RegionCode | null>(user?.region ?? null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const digits = nationalDigits(phone)
    const local: FieldErrors = {}
    if (!digits) local.phone_number = ['Numéro à 9 chiffres, ex. 77 123 45 67.']
    if (!region) local.region = ['Choisissez votre région.']
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    try {
      await api.patch('/api/users/me/', { phone_number: `+221${digits}`, region })
      await refreshProfile()
      router.replace('/donor-setup')
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fieldErrors).length ? err.fieldErrors : { phone_number: [err instanceof Error ? err.message : 'Enregistrement impossible.'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={user?.first_name ? `Bienvenue, ${user.first_name}.` : 'Plus qu’une étape.'}
      subtitle="Votre numéro permet à l’hôpital de vous joindre quand vous acceptez une demande ; votre région, de recevoir ses alertes."
      step={{ current: 1, total: 2 }}
      onBack={() => logout().then(() => router.replace('/login'))}
    >
      <Animated.View entering={enter(1)}>
        <TextField
          label="Téléphone"
          icon="phone"
          prefix="+221"
          placeholder="77 123 45 67"
          value={phone}
          onChangeText={(value) => {
            setPhone(formatPhoneInput(value))
            setErrors(({ phone_number: _, ...rest }) => rest)
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          hint="Vous pourrez aussi vous connecter avec ce numéro."
          error={errors.phone_number?.[0]}
        />
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <SelectField
          label="Région"
          icon="pin"
          value={region}
          options={REGIONS}
          onChange={(value) => {
            setRegion(value)
            setErrors(({ region: _, ...rest }) => rest)
          }}
          error={errors.region?.[0]}
        />
      </Animated.View>
      {errors.detail ? (
        <Text variant="caption" tone="brand">
          {errors.detail[0]}
        </Text>
      ) : null}
      <Animated.View entering={enter(3)} style={styles.action}>
        <Button label="Continuer" onPress={submit} loading={busy} haptic />
      </Animated.View>
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  action: { marginTop: space.sm },
})
