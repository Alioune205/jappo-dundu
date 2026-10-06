import React from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatGroup } from '@/components/ui/BloodGroup'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { useAuth } from '@/context/AuthContext'
import { URGENCY, sortRequests, units } from '@/features/alerts/format'
import { DONOR_CONDITIONS, LIVES_PER_DONATION, WHY_DONATE } from '@/features/donor/content'
import { recoveryProgress } from '@/features/history/timeline'
import { deadline, formatDate } from '@/lib/dates'
import { formatDistance, useDeviceLocation } from '@/lib/location'
import { useDonor, useHistory, useNearby } from '@/lib/queries'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import type { DonorProfile, NearbyRequest } from '@/types/api'

const enter = (step: number) => FadeInDown.duration(motion.slow).delay(step * motion.stagger).easing(motion.easeOut)

/**
 * Accueil du donneur : carte d'identité (groupe, dons, dernier don), aptitude
 * à donner, demandes en cours autour de lui, et pourquoi donner.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function HomeScreen() {
  const { data: donor } = useDonor()
  return donor ? <Home donor={donor} /> : null
}

function Home({ donor }: { donor: DonorProfile }) {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const history = useHistory()
  const location = useDeviceLocation()
  const canQuery = !!location.coords || (donor.latitude != null && donor.longitude != null)
  const nearby = useNearby(location.coords, { enabled: canQuery, live: false })
  const requests = sortRequests(nearby.data ?? []).slice(0, 5)

  const donations = history.data?.donations.length ?? 0
  const lastDonation = donor.last_donation_date ?? history.data?.donations[0]?.donated_on ?? null
  const initials = user ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() || user.username.charAt(0).toUpperCase() : '?'
  const progress = recoveryProgress(donor.last_donation_date, donor.next_eligible_date)

  const refreshing = nearby.isRefetching || history.isRefetching
  const refresh = () => {
    nearby.refetch()
    history.refetch()
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />}
    >
      {/* En-tête : identité du donneur */}
      <View style={[styles.hero, { backgroundColor: colors.brandSoft, paddingTop: insets.top + space.sm }]}>
        <View style={styles.topBar}>
          <IconButton icon="menu" label="Mon profil" onPress={() => router.navigate('/profile')} />
          <IconButton icon="bell" label="Alertes" onPress={() => router.navigate('/alerts')} />
        </View>

        <Animated.View entering={enter(0)} style={styles.identity}>
          <Text variant="title" style={styles.center} numberOfLines={1} accessibilityRole="header">
            {user?.full_name || user?.username}
          </Text>
          <Text variant="label" tone="brand" style={styles.center}>
            Donneur{donor.is_available ? ' · disponible' : ''}
          </Text>
        </Animated.View>

        <Animated.View entering={enter(1)} style={styles.statsRow}>
          <Stat icon="award" value={String(donations).padStart(2, '0')} label={donations > 1 ? 'dons' : 'don'} />
          <View style={[styles.avatarRing, { borderColor: colors.surface, backgroundColor: colors.brand }]}>
            <Text style={[styles.initials, { color: colors.onBrand }]}>{initials}</Text>
            <View style={[styles.groupBubble, { backgroundColor: colors.surface, borderColor: colors.brandSoft }]}>
              <Text style={[styles.groupText, { color: colors.brand }]}>{formatGroup(donor.blood_group)}</Text>
            </View>
          </View>
          <Stat icon="calendar" value={lastDonation ? formatDate(lastDonation, { short: true }) : '—'} label="Dernier don" alignEnd />
        </Animated.View>
      </View>

      <View style={styles.body}>
        {/* Aptitude */}
        <Animated.View entering={enter(2)} style={[styles.eligibility, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={[styles.eligibilityIcon, { backgroundColor: donor.is_eligible ? 'rgba(6, 118, 71, 0.12)' : colors.raised }]}>
            <Icon name={donor.is_eligible ? 'check' : 'clock'} size={20} color={donor.is_eligible ? 'ok' : 'muted'} />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{donor.is_eligible ? 'Vous pouvez donner' : 'Votre corps récupère'}</Text>
            <Text variant="caption" tone="muted">
              {donor.is_eligible
                ? `Votre don peut aider jusqu’à ${LIVES_PER_DONATION} patients.`
                : donor.next_eligible_date
                  ? `Prochain don possible le ${formatDate(donor.next_eligible_date)}.`
                  : donor.ineligibility_reasons[0] ?? 'Don impossible pour le moment.'}
            </Text>
            {!donor.is_eligible && donor.next_eligible_date ? (
              <View style={[styles.track, { backgroundColor: colors.raised }]}>
                <View style={[styles.fill, { backgroundColor: colors.brand, width: `${Math.round(progress * 100)}%` }]} />
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Demandes en cours */}
        <Animated.View entering={enter(3)}>
          <SectionTitle title="Demandes en cours" action="Voir tout" onAction={() => router.navigate('/alerts')} />
          {!canQuery ? (
            <EmptyCard text="Partagez votre position pour voir les demandes des hôpitaux proches." action="Activer" onPress={() => router.navigate('/alerts')} />
          ) : requests.length === 0 ? (
            <EmptyCard text={nearby.isLoading ? 'Recherche des demandes proches…' : 'Aucune demande compatible autour de vous pour le moment. Merci de rester disponible.'} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} decelerationRate="fast" snapToInterval={CARD_WIDTH + space.md}>
              {requests.map((request, index) => (
                <RequestTile
                  key={request.id}
                  request={request}
                  highlighted={index === 0}
                  onPress={() => router.navigate({ pathname: '/alerts', params: { request: String(request.id) } })}
                />
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* Pourquoi donner */}
        <Animated.View entering={enter(4)} style={styles.section}>
          <SectionTitle title="Pourquoi donner son sang ?" />
          <View style={styles.why}>
            {WHY_DONATE.map((item) => (
              <View key={item.title} style={[styles.whyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={[styles.whyIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name={item.icon} size={20} color="brand" />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{item.title}</Text>
                  <Text variant="caption" tone="muted">
                    {item.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Conditions */}
        <Animated.View entering={enter(5)} style={[styles.conditions, { backgroundColor: colors.brand }]}>
          <Text variant="eyebrow" tone="onBrand" style={styles.dim}>
            Qui peut donner ?
          </Text>
          {DONOR_CONDITIONS.map((condition) => (
            <View key={condition} style={styles.conditionRow}>
              <Icon name="check" size={16} color="onBrand" strokeWidth={2.4} />
              <Text variant="body" tone="onBrand" style={styles.flex}>
                {condition}
              </Text>
            </View>
          ))}
          <Text variant="caption" tone="onBrand" style={[styles.dim, styles.source]}>
            Source : CNTS (cnts.gouv.sn). Un entretien médical confirme l’aptitude le jour du don.
          </Text>
        </Animated.View>
      </View>
    </ScrollView>
  )
}

const CARD_WIDTH = 260

function RequestTile({ request, highlighted, onPress }: { request: NearbyRequest; highlighted: boolean; onPress: () => void }) {
  const { colors } = useTheme()
  const urgency = URGENCY[request.urgency]
  const answered = request.my_response === 'accepted'
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: highlighted ? colors.surface : colors.brandSoft, borderColor: highlighted ? colors.line : 'transparent' },
      ]}
    >
      <View style={styles.tileHead}>
        <Text variant="heading" numberOfLines={1} style={styles.flex}>
          {request.facility.name}
        </Text>
        <View style={[styles.groupChip, { backgroundColor: colors.brand }]}>
          <Text style={[styles.groupChipText, { color: colors.onBrand }]}>{formatGroup(request.blood_group)}</Text>
        </View>
      </View>
      <View style={styles.tileRow}>
        <Icon name="calendar" size={15} color="muted" />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {request.needed_by ? deadline(request.needed_by) : 'Dès que possible'} · {units(request.units_remaining)}
        </Text>
      </View>
      <View style={styles.tileRow}>
        <Icon name="pin" size={15} color="muted" />
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
          {request.facility.city}
          {request.distance_km != null ? ` · ${formatDistance(request.distance_km)}` : ''}
        </Text>
        <Text variant="caption" tone={urgency.tone} style={styles.urgency}>
          {urgency.label}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${answered ? 'Voir ma participation' : 'Je participe'} : ${request.facility.name}`}
        style={({ pressed }) => [styles.cta, { backgroundColor: answered ? colors.ok : colors.fg, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text variant="label" style={{ color: colors.canvas }}>
          {answered ? 'On vous attend' : 'Je participe'}
        </Text>
      </Pressable>
    </View>
  )
}

function Stat({ icon, value, label, alignEnd = false }: { icon: IconName; value: string; label: string; alignEnd?: boolean }) {
  return (
    <View style={[styles.stat, alignEnd && styles.statEnd]}>
      <Icon name={icon} size={24} color="brand" />
      <View>
        <Text variant="bodyStrong" tone="brand">
          {value}
        </Text>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      </View>
    </View>
  )
}

function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? colors.surface : 'transparent' }]}
    >
      <Icon name={icon} size={24} />
    </Pressable>
  )
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.dot, { backgroundColor: colors.brand }]} />
      <Text variant="heading" style={styles.flex} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" tone="brand">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function EmptyCard({ text, action, onPress }: { text: string; action?: string; onPress?: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text variant="caption" tone="muted" style={styles.flex}>
        {text}
      </Text>
      {action ? (
        <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" tone="brand">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  dim: { opacity: 0.85 },
  hero: { paddingHorizontal: space.xl, paddingBottom: space.xl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginHorizontal: -space.sm },
  identity: { gap: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statEnd: { justifyContent: 'flex-end' },
  avatarRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 40 },
  groupBubble: {
    position: 'absolute',
    right: -6,
    bottom: -2,
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  body: { paddingHorizontal: space.xl, gap: space.xl, marginTop: space.xl },
  eligibility: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  eligibilityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space.sm },
  fill: { height: '100%', borderRadius: 3 },
  section: { gap: 0 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  carousel: { gap: space.md, paddingRight: space.xl },
  tile: { width: CARD_WIDTH, padding: space.lg, borderRadius: 20, borderWidth: 1, gap: space.sm },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  urgency: { fontFamily: fonts.medium },
  groupChip: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  groupChipText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  cta: { marginTop: space.xs, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  why: { gap: space.sm },
  whyCard: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  whyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  conditions: { borderRadius: 24, padding: space.xl, gap: space.sm },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  source: { marginTop: space.sm },
  empty: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
})
