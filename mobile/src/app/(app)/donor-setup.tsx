import React, { useState } from 'react'
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Animated from 'react-native-reanimated'
import { AuthShell, enter } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { BloodGroupPicker } from '@/features/donor/BloodGroupPicker'
import { PermissionCard, type PermissionState } from '@/features/donor/PermissionCard'
import { ApiError, type FieldErrors } from '@/lib/api'
import { maskFrDate, parseFrDate, toFrInput } from '@/lib/dates'
import { openSettings, useDeviceLocation, type Coords } from '@/lib/location'
import { pushSupported, usePushPermission } from '@/lib/push'
import { useDonor, useSaveDonor } from '@/lib/queries'
import { EMPTY_DONOR, validateDonor, type DonorForm } from '@/lib/validation'
import { space, useTheme } from '@/theme'
import type { DonorProfile, Sex } from '@/types/api'

const SEXES = [
  { value: 'F' as Sex, label: 'Femme' },
  { value: 'M' as Sex, label: 'Homme' },
]

function formOf(donor: DonorProfile | undefined): DonorForm {
  if (!donor) return EMPTY_DONOR
  return {
    blood_group: donor.blood_group,
    sex: donor.sex,
    date_of_birth: toFrInput(donor.date_of_birth),
    last_donation_date: toFrInput(donor.last_donation_date),
    is_available: donor.is_available,
  }
}

/**
 * Profil donneur : juste après l'inscription (création), ou depuis l'onglet
 * Profil (`?mode=edit`). Le groupe sanguin et la position décident des
 * alertes reçues ; les autorisations sont demandées ici, en contexte.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function DonorSetupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const editing = mode === 'edit'
  const { data: donor, isPending } = useDonor()
  const { colors } = useTheme()
  // Modification : le formulaire part du profil enregistré, attendu avant d'afficher.
  if (editing && isPending) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    )
  }
  return <DonorFormScreen donor={donor} editing={editing} />
}

function DonorFormScreen({ donor, editing }: { donor: DonorProfile | undefined; editing: boolean }) {
  const router = useRouter()
  const { colors } = useTheme()
  const save = useSaveDonor()
  const location = useDeviceLocation({ auto: false })
  const push = usePushPermission()

  const [form, setForm] = useState<DonorForm>(() => formOf(donor))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  // Position retenue pour le profil : celle déjà enregistrée, remplacée si le donneur la met à jour.
  const [coords, setCoords] = useState<Coords | null>(() =>
    donor?.latitude != null && donor.longitude != null ? { latitude: donor.latitude, longitude: donor.longitude } : null
  )

  const set = (patch: Partial<DonorForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    // Le champ corrigé perd son erreur aussitôt, sans attendre un nouvel envoi.
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch)) delete next[key]
      return next
    })
  }
  const errorOf = (field: keyof DonorForm) => errors[field]?.[0]

  const shareLocation = async () => {
    if (location.status === 'denied') return openSettings()
    const next = location.status === 'granted' ? await location.refresh() : await location.request()
    if (next) setCoords(next)
  }

  const locationState: PermissionState =
    location.locating ? 'busy' : coords ? 'done' : location.status === 'denied' ? 'blocked' : 'todo'
  const pushState: PermissionState =
    push.busy ? 'busy' : push.status === 'granted' ? 'done' : push.status === 'denied' ? 'blocked' : 'todo'

  const submit = async () => {
    const local = validateDonor(form)
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return
    try {
      await save.mutateAsync({
        blood_group: form.blood_group!,
        sex: form.sex!,
        date_of_birth: parseFrDate(form.date_of_birth)!,
        last_donation_date: parseFrDate(form.last_donation_date),
        is_available: form.is_available,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      })
      if (editing && router.canGoBack()) router.back()
      else router.replace('/alerts')
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors)
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.')
    }
  }

  return (
    <AuthShell
      title={editing ? 'Mon profil de donneur.' : 'Votre profil de donneur.'}
      subtitle={
        editing
          ? 'Ces informations décident des demandes qui vous sont adressées.'
          : 'Trente secondes, et vous recevez les demandes qui correspondent à votre groupe. Les hôpitaux ne voient ni votre nom ni votre numéro avant que vous acceptiez.'
      }
      onBack={editing ? () => router.back() : undefined}
      step={editing ? undefined : { current: 2, total: 2 }}
    >
      <Animated.View entering={enter(1)}>
        <BloodGroupPicker value={form.blood_group} onChange={(blood_group) => set({ blood_group })} error={errorOf('blood_group')} />
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.block}>
        <Segmented label="Sexe" value={form.sex} options={SEXES} onChange={(sex) => set({ sex })} error={errorOf('sex')} />
        {!errorOf('sex') && (
          <Text variant="caption" tone="subtle">
            Délai minimal entre deux dons : 4 mois pour les femmes, 3 mois pour les hommes.
          </Text>
        )}
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="Date de naissance"
            icon="calendar"
            value={form.date_of_birth}
            onChangeText={(value) => set({ date_of_birth: maskFrDate(value) })}
            placeholder="JJ/MM/AAAA"
            keyboardType="number-pad"
            maxLength={10}
            autoComplete="birthdate-full"
            error={errorOf('date_of_birth')}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Dernier don"
            icon="calendar"
            value={form.last_donation_date}
            onChangeText={(value) => set({ last_donation_date: maskFrDate(value) })}
            placeholder="JJ/MM/AAAA"
            keyboardType="number-pad"
            maxLength={10}
            hint="Vide si jamais donné."
            error={errorOf('last_donation_date')}
          />
        </View>
      </Animated.View>

      <Animated.View entering={enter(4)} style={[styles.toggle, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <View style={styles.toggleText}>
          <Text variant="bodyStrong">Disponible pour donner</Text>
          <Text variant="caption" tone="muted">
            Désactivez pendant un voyage ou une maladie : aucune sollicitation.
          </Text>
        </View>
        <Switch
          value={form.is_available}
          onValueChange={(is_available) => set({ is_available })}
          trackColor={{ false: colors.lineStrong, true: colors.ok }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.lineStrong}
          accessibilityLabel="Disponible pour donner"
        />
      </Animated.View>

      <Animated.View entering={enter(5)} style={styles.block}>
        <Text variant="eyebrow" tone="subtle" style={styles.section}>
          Être prévenu
        </Text>
        <PermissionCard
          icon="pin"
          title="Hôpitaux autour de vous"
          body="Votre position, arrondie à 100 m, sert à vous adresser les demandes proches. Elle n’est jamais montrée aux hôpitaux."
          state={locationState}
          actionLabel={coords ? 'Mettre à jour' : 'Partager ma position'}
          doneLabel="Position enregistrée"
          onAction={shareLocation}
        />
        {pushSupported && (
          <PermissionCard
            icon="bell"
            title="Alertes, même application fermée"
            body="Une notification quand un hôpital proche a besoin de votre groupe. Rien d’autre."
            state={pushState}
            actionLabel="Activer les alertes"
            doneLabel="Alertes activées"
            onAction={push.status === 'denied' ? openSettings : push.enable}
          />
        )}
      </Animated.View>

      {formError ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Animated.View entering={enter(6)} style={styles.action}>
        <Button label={editing ? 'Enregistrer' : 'Terminer'} onPress={submit} loading={save.isPending} haptic />
      </Animated.View>
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  block: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  section: { marginTop: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderWidth: 1, borderRadius: 16, padding: space.lg },
  toggleText: { flex: 1, gap: space.xs },
  action: { marginTop: space.sm },
})
