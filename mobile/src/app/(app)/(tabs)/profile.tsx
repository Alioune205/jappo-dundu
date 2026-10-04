import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { ScreenHeader } from '@/components/ScreenHeader'
import { BloodGroupBadge, spokenGroup } from '@/components/ui/BloodGroup'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { useAuth } from '@/context/AuthContext'
import { ageOn, timeAgo } from '@/lib/dates'
import { openSettings, useDeviceLocation } from '@/lib/location'
import { usePushPermission } from '@/lib/push'
import { useDonor, useUpdateDonor } from '@/lib/queries'
import { fonts, motion, radius, space, useTheme } from '@/theme'

/** « +221778889900 » → « +221 77 888 99 00 » (numéros sénégalais) ; autres formats inchangés. */
function formatPhone(phone: string | null) {
  const match = phone ? /^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone) : null
  return match ? `+221 ${match.slice(1).join(' ')}` : phone
}

const enter = (step: number) => FadeInDown.duration(motion.slow).delay(step * motion.stagger).easing(motion.easeOut)

/**
 * Profil : identité, profil donneur, disponibilité, position, alertes et
 * déconnexion. Les réglages s'appliquent au toucher (optimistes).
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function ProfileScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { data: donor } = useDonor()
  const update = useUpdateDonor()
  const location = useDeviceLocation({ auto: false })
  const push = usePushPermission()
  const [leaving, setLeaving] = useState(false)

  if (!user || !donor) return null

  const initials = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() || user.username.charAt(0).toUpperCase()
  const age = ageOn(donor.date_of_birth)
  const hasLocation = donor.latitude != null && donor.longitude != null

  const updateLocation = async () => {
    if (location.status === 'denied') return openSettings()
    const coords = location.status === 'granted' ? await location.refresh() : await location.request()
    if (coords) update.mutate(coords)
  }

  const pushValue =
    push.status === 'granted'
      ? 'Activées'
      : push.status === 'denied'
        ? 'Refusées · ouvrir les réglages'
        : push.status === 'unsupported'
          ? 'Indisponibles sur cet appareil'
          : 'Désactivées'

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Profil" />
      <View style={styles.body}>
        <Animated.View entering={enter(0)} style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.raised, borderColor: colors.line }]}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {user.full_name}
            </Text>
            <Text variant="caption" tone="muted">
              {[formatPhone(user.phone_number), user.region_display].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={enter(1)}>
          <Card style={styles.donor}>
            <BloodGroupBadge group={donor.blood_group} size={64} />
            <View style={styles.flex}>
              <Text variant="eyebrow" tone="subtle">
                Profil donneur
              </Text>
              <Text variant="heading">Groupe {spokenGroup(donor.blood_group)}</Text>
              <Text variant="caption" tone="muted">
                {[donor.sex_display, age !== null ? `${age} ans` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: '/donor-setup', params: { mode: 'edit' } })}
              accessibilityRole="button"
              accessibilityLabel="Modifier le profil donneur"
              hitSlop={8}
              style={({ pressed }) => [styles.edit, { borderColor: colors.line, backgroundColor: pressed ? colors.raised : 'transparent' }]}
            >
              <Icon name="edit" size={18} color="muted" />
            </Pressable>
          </Card>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <Text variant="eyebrow" tone="subtle" style={styles.section}>
            Sollicitations
          </Text>
          <Card style={styles.list}>
            <Row
              icon="drop"
              title="Disponible pour donner"
              value={donor.is_available ? 'Les hôpitaux proches peuvent vous solliciter.' : 'Aucune sollicitation pour l’instant.'}
              right={
                <Switch
                  value={donor.is_available}
                  onValueChange={(is_available) => update.mutate({ is_available })}
                  trackColor={{ false: colors.lineStrong, true: colors.ok }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={colors.lineStrong}
                  accessibilityLabel="Disponible pour donner"
                />
              }
            />
            <Divider />
            <Row
              icon="pin"
              title="Position"
              value={
                hasLocation && donor.location_updated_at
                  ? `Enregistrée ${timeAgo(donor.location_updated_at)}`
                  : 'Non partagée : alertes push limitées'
              }
              onPress={updateLocation}
              busy={location.locating || (update.isPending && update.variables?.latitude !== undefined)}
              actionLabel={hasLocation ? 'Mettre à jour' : 'Partager'}
            />
            <Divider />
            <Row
              icon="bell"
              title="Alertes push"
              value={pushValue}
              onPress={push.status === 'denied' ? openSettings : push.status === 'granted' || push.status === 'unsupported' ? undefined : push.enable}
              busy={push.busy}
              actionLabel="Activer"
            />
          </Card>
          {update.error ? (
            <Text variant="caption" tone="brand" style={styles.error} accessibilityLiveRegion="polite">
              {update.error.message}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={enter(3)} style={styles.footer}>
          <Button
            label="Se déconnecter"
            variant="secondary"
            loading={leaving}
            onPress={async () => {
              setLeaving(true)
              await logout()
              router.replace('/login')
            }}
          />
          <Text variant="caption" tone="subtle" style={styles.version}>
            Jappo Dundu · version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </Animated.View>
      </View>
    </ScrollView>
  )
}

interface RowProps {
  icon: IconName
  title: string
  value: string
  right?: React.ReactNode
  onPress?: () => void
  actionLabel?: string
  busy?: boolean
}

function Row({ icon, title, value, right, onPress, actionLabel, busy }: RowProps) {
  const { colors } = useTheme()
  const content = (
    <>
      <Icon name={icon} size={20} color="muted" />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {value}
        </Text>
      </View>
      {right ??
        (busy ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : onPress ? (
          <Text variant="label" tone="brand">
            {actionLabel}
          </Text>
        ) : null)}
    </>
  )
  if (!onPress || right) return <View style={styles.row}>{content}</View>
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${title} : ${value}. ${actionLabel ?? ''}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.raised }]}
    >
      {content}
    </Pressable>
  )
}

function Divider() {
  const { colors } = useTheme()
  return <View style={[styles.divider, { backgroundColor: colors.line }]} />
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  body: { paddingHorizontal: space.xl, gap: space.lg },
  flex: { flex: 1, gap: 2 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24 },
  donor: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  edit: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section: { marginBottom: space.sm, marginTop: space.sm },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 20 + space.md },
  error: { marginTop: space.sm },
  footer: { gap: space.md, marginTop: space.lg },
  version: { textAlign: 'center' },
})
