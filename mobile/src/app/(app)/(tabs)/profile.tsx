import React, { useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native'
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
import { fonts, motion, radius, space, useTheme, type ThemeMode } from '@/theme'

/** « +221778889900 » → « +221 77 888 99 00 » (numéros sénégalais) ; autres formats inchangés. */
function formatPhone(phone: string | null) {
  const match = phone ? /^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone) : null
  return match ? `+221 ${match.slice(1).join(' ')}` : phone
}

const enter = (step: number) =>
  FadeInDown.duration(motion.slow).delay(step * motion.stagger).easing(motion.easeOut)

/**
 * Profil & Paramètres : identité, groupe sanguin, disponibilité,
 * mode sombre/clair, réglages push/position, et déconnexion sécurisée avec confirmation.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function ProfileScreen() {
  const { colors, scheme, themeMode, setThemeMode, toggleTheme } = useTheme()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { data: donor } = useDonor()
  const update = useUpdateDonor()
  const location = useDeviceLocation({ auto: false })
  const push = usePushPermission()

  const [leaving, setLeaving] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  if (!user || !donor) return null

  const initials =
    `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() ||
    user.username.charAt(0).toUpperCase()
  const age = ageOn(donor.date_of_birth)
  const hasLocation = donor.latitude != null && donor.longitude != null

  const updateLocation = async () => {
    if (location.status === 'denied') return openSettings()
    const coords =
      location.status === 'granted'
        ? await location.refresh()
        : await location.request()
    if (coords) update.mutate(coords)
  }

  const handleConfirmLogout = async () => {
    setLeaving(true)
    try {
      await logout()
      setShowLogoutModal(false)
      router.replace('/login')
    } finally {
      setLeaving(false)
    }
  }

  const pushValue =
    push.status === 'granted'
      ? 'Activées'
      : push.status === 'denied'
        ? 'Refusées · ouvrir les réglages'
        : push.status === 'unsupported'
          ? 'Indisponibles sur cet appareil'
          : 'Désactivées'

  const isDarkMode = scheme === 'dark'

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <ScrollView
        style={{ backgroundColor: colors.canvas }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Mon Profil"
          right={
            <Pressable
              onPress={() => router.navigate('/home')}
              accessibilityRole="button"
              accessibilityLabel="Retour à l’accueil"
              hitSlop={8}
              style={({ pressed }) => [
                styles.close,
                {
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.raised : 'transparent',
                },
              ]}
            >
              <Icon name="close" size={20} color="muted" />
            </Pressable>
          }
        />

        <View style={styles.body}>
          {/* Identité */}
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

          {/* Profil Donneur */}
          <Animated.View entering={enter(1)}>
            <Card style={styles.donor}>
              <BloodGroupBadge group={donor.blood_group} size={64} />
              <View style={styles.flex}>
                <Text variant="eyebrow" tone="subtle">
                  Profil donneur
                </Text>
                <Text variant="heading">Groupe {spokenGroup(donor.blood_group)}</Text>
                <Text variant="caption" tone="muted">
                  {[
                    donor.sex_display,
                    age !== null ? `${age} ans` : null,
                    donor.weight_kg != null ? `${donor.weight_kg} kg` : 'poids à renseigner',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: '/donor-setup', params: { mode: 'edit' } })}
                accessibilityRole="button"
                accessibilityLabel="Modifier le profil donneur"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.edit,
                  {
                    borderColor: colors.line,
                    backgroundColor: pressed ? colors.raised : 'transparent',
                  },
                ]}
              >
                <Icon name="edit" size={18} color="muted" />
              </Pressable>
            </Card>
          </Animated.View>

          {/* Distinction & Badges */}
          <Animated.View entering={enter(2)}>
            <Card style={styles.list}>
              <Row
                icon="award"
                title="Tableau d’Honneur & Badges"
                value="Vos points XP, niveau et trophées citoyen"
                onPress={() => router.push('/badges')}
                actionLabel="Voir"
              />
              <Row
                icon="shield"
                title="Fiche d’urgence"
                value="Allergies, traitements et personnes à prévenir"
                onPress={() => router.push({ pathname: '/emergency-card' })}
                actionLabel="Ouvrir"
              />
            </Card>
          </Animated.View>

          {/* Section Paramètres & Préférences */}
          <Animated.View entering={enter(3)}>
            <Text variant="eyebrow" tone="subtle" style={styles.section}>
              Paramètres de l’application
            </Text>
            <Card style={styles.list}>
              {/* Bascule Mode Sombre */}
              <Row
                icon={isDarkMode ? 'moon' : 'sun'}
                title="Mode sombre"
                value={isDarkMode ? 'Affichage sombre actif' : 'Affichage clair actif'}
                right={
                  <Switch
                    value={isDarkMode}
                    onValueChange={() => toggleTheme()}
                    trackColor={{ false: colors.lineStrong, true: colors.brand }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor={colors.lineStrong}
                    accessibilityLabel="Activer le mode sombre"
                  />
                }
              />

              <Divider />

              {/* Choix du thème : Clair, Sombre ou Système */}
              <View style={styles.themeSelectorRow}>
                <Text variant="caption" tone="muted" style={{ marginBottom: space.xs }}>
                  Préférence de thème
                </Text>
                <View style={styles.themePillsRow}>
                  <ThemePill
                    label="Clair"
                    icon="sun"
                    selected={themeMode === 'light'}
                    onPress={() => setThemeMode('light')}
                  />
                  <ThemePill
                    label="Sombre"
                    icon="moon"
                    selected={themeMode === 'dark'}
                    onPress={() => setThemeMode('dark')}
                  />
                  <ThemePill
                    label="Système"
                    icon="settings"
                    selected={themeMode === 'system'}
                    onPress={() => setThemeMode('system')}
                  />
                </View>
              </View>
            </Card>
          </Animated.View>

          {/* Sollicitations & Disponibilité */}
          <Animated.View entering={enter(4)}>
            <Text variant="eyebrow" tone="subtle" style={styles.section}>
              Disponibilité & Alertes
            </Text>
            <Card style={styles.list}>
              <Row
                icon="drop"
                title="Disponible pour donner"
                value={
                  donor.is_available
                    ? 'Les hôpitaux proches peuvent vous solliciter.'
                    : 'Aucune sollicitation pour l’instant.'
                }
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
                title="Position géographique"
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
                title="Alertes push d'urgence"
                value={pushValue}
                onPress={
                  push.status === 'denied'
                    ? openSettings
                    : push.status === 'granted' || push.status === 'unsupported'
                      ? undefined
                      : push.enable
                }
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

          {/* Déconnexion protégée */}
          <Animated.View entering={enter(5)} style={styles.footer}>
            <Button
              label="Se déconnecter"
              variant="secondary"
              onPress={() => setShowLogoutModal(true)}
            />
            <Text variant="caption" tone="subtle" style={styles.version}>
              Jappo Dundu · version {Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </Animated.View>
        </View>
      </ScrollView>

      {/* Modal de confirmation de déconnexion */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLogoutModal(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: colors.brandSoft }]}>
              <Icon name="logout" size={28} color="brand" strokeWidth={2} />
            </View>

            <Text style={styles.modalTitle}>Confirmer la déconnexion</Text>

            <Text variant="body" tone="muted" style={styles.modalText}>
              Êtes-vous sûr de vouloir vous déconnecter de votre compte Jappo Dundu ?
            </Text>

            <View style={styles.modalActions}>
              <Button
                label="Annuler"
                variant="secondary"
                onPress={() => setShowLogoutModal(false)}
                disabled={leaving}
                style={styles.modalBtn}
              />
              <Button
                label="Déconnexion"
                variant="primary"
                loading={leaving}
                onPress={handleConfirmLogout}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function ThemePill({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string
  icon: IconName
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Thème ${label}`}
      style={[
        styles.themePill,
        {
          backgroundColor: selected ? colors.brand : colors.raised,
          borderColor: selected ? colors.brand : colors.line,
        },
      ]}
    >
      <Icon name={icon} size={15} color={selected ? 'onBrand' : 'muted'} />
      <Text
        variant="caption"
        style={[
          styles.themePillText,
          { color: selected ? colors.onBrand : colors.fg, fontFamily: selected ? fonts.semibold : fonts.regular },
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  screen: { flex: 1 },
  content: { paddingBottom: space.xxxl },
  body: { paddingHorizontal: space.xl, gap: space.lg },
  flex: { flex: 1, gap: 2 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24 },
  donor: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edit: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginBottom: space.sm, marginTop: space.sm },
  list: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 20 + space.md },
  themeSelectorRow: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  themePillsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  themePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  themePillText: {
    fontSize: 12,
  },
  error: { marginTop: space.sm },
  footer: { gap: space.md, marginTop: space.lg },
  version: { textAlign: 'center' },

  // Modal de confirmation
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.xl,
    alignItems: 'center',
    gap: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  modalText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: space.md,
    width: '100%',
    marginTop: space.xs,
  },
  modalBtn: {
    flex: 1,
  },
})
