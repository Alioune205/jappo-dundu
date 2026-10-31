import React, { useEffect, useRef, useState } from 'react'
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatGroup } from '@/components/ui/BloodGroup'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { useAuth } from '@/context/AuthContext'
import { URGENCY, sortRequests, units } from '@/features/alerts/format'
import {
  DONOR_CONDITIONS,
  LIVES_PER_DONATION,
  WHY_DONATE,
  type DonationDrive,
} from '@/features/donor/content'
import { recoveryProgress } from '@/features/history/timeline'
import { deadline, formatDate } from '@/lib/dates'
import { formatDistance, useDeviceLocation } from '@/lib/location'
import { useBloodDrives, useDonor, useHistory, useNearby } from '@/lib/queries'
import { isActiveSos, useMySos } from '@/lib/sos'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import type { DonorProfile, NearbyRequest } from '@/types/api'

const HERO_DONATION = require('../../../../assets/hero_donation.jpg')
const IMPACT_MATERNITY = require('../../../../assets/impact_maternity.jpg')

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

/** Accès à l'alerte SOS : toujours en tête de l'accueil, état de l'alerte en cours s'il y en a une. */
function SosEntry() {
  const { colors } = useTheme()
  const router = useRouter()
  const { data: alert } = useMySos()
  const active = isActiveSos(alert)
  return (
    <Pressable
      onPress={() => router.navigate('/sos')}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Suivre mon alerte SOS' : 'Urgence médicale : alerter le SAMU'}
      style={({ pressed }) => [styles.sosCard, { backgroundColor: colors.brand, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={[styles.sosBadge, { borderColor: colors.onBrand }]}>
        <Text style={[styles.sosLabel, { color: colors.onBrand }]}>SOS</Text>
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong" tone="onBrand">
          {active ? `Alerte en cours · ${alert!.status_display.toLowerCase()}` : 'Urgence médicale ?'}
        </Text>
        <Text variant="caption" tone="onBrand">
          {active ? 'Touchez pour suivre les secours.' : 'Alerter le SAMU avec votre position.'}
        </Text>
      </View>
      <Icon name="chevron" size={20} color="onBrand" />
    </Pressable>
  )
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

  const donations = history.data?.donations.length ?? 0
  const recordedLast = history.data?.donations[0]?.donated_on ?? null
  const lastDonation = donor.last_donation_date ?? recordedLast
  // Date saisie par le donneur, sans don enregistré par un centre : on le précise.
  const declaredOnly = lastDonation !== null && donations === 0
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
          <Stat
            icon="award"
            value={String(donations).padStart(2, '0')}
            label={donations > 1 ? 'dons enregistrés' : 'don enregistré'}
            onPress={() => router.navigate('/badges')}
            hint="Ouvre vos badges"
          />
          <View style={[styles.avatarRing, { borderColor: colors.surface, backgroundColor: colors.brand }]}>
            <Text style={[styles.initials, { color: colors.onBrand }]}>{initials}</Text>
            <View style={[styles.groupBubble, { backgroundColor: colors.surface, borderColor: colors.brandSoft }]}>
              <Text style={[styles.groupText, { color: colors.brand }]}>{formatGroup(donor.blood_group)}</Text>
            </View>
          </View>
          <Stat icon="calendar" value={lastDonation ? formatDate(lastDonation, { short: true }) : '—'} label={declaredOnly ? 'Don déclaré' : 'Dernier don'} alignEnd />
        </Animated.View>
      </View>

      <View style={styles.body}>
        <SosEntry />

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

        {/* Bannière visuelle campagne nationale */}
        <Animated.View entering={enter(2.5)}>
          <Pressable
            onPress={() => router.navigate('/centers')}
            accessibilityRole="button"
            accessibilityLabel="Campagne nationale du don de sang. Trouver un centre de collecte"
            style={({ pressed }) => [
              styles.campaignCard,
              { backgroundColor: colors.surface, borderColor: colors.line, opacity: pressed ? 0.95 : 1 },
            ]}
          >
            <View style={styles.campaignImageWrapper}>
              <Image source={HERO_DONATION} style={styles.campaignImage} resizeMode="cover" />
              <View style={[styles.campaignBadge, { backgroundColor: colors.brand }]}>
                <Text style={styles.campaignBadgeText}>CAMPAGNE NATIONALE · CNTS</Text>
              </View>
            </View>
            <View style={styles.campaignBody}>
              <Text variant="heading">
                Votre sang est une force vitale
              </Text>
              <Text variant="caption" tone="muted" style={styles.campaignDescription}>
                Chaque don sauve jusqu’à 3 vies à Dakar et dans les régions. Les banques de sang de nos hôpitaux comptent sur votre solidarité.
              </Text>
              <View style={styles.campaignActionRow}>
                <Text variant="label" tone="brand">
                  Trouver un centre de collecte proche
                </Text>
                <Icon name="route" size={16} color="brand" />
              </View>
            </View>
          </Pressable>
        </Animated.View>

        {/* Journées de don de sang organisées par le CNTS (défilement automatique & interactif) */}
        <Animated.View entering={enter(3)}>
          <DrivesCarousel />
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

function DrivesCarousel() {
  const { data: drives = [] } = useBloodDrives()
  if (drives.length === 0) return null
  return <DrivesSlides drives={drives} />
}

function DrivesSlides({ drives }: { drives: DonationDrive[] }) {
  const { colors } = useTheme()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const cardWidth = Math.min(width - space.xl * 2, 420)
  const scrollRef = useRef<any>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const isInteracting = useRef(false)

  // Défilement automatique toutes les 7 secondes pour laisser le temps de lire
  useEffect(() => {
    const timer = setInterval(() => {
      if (isInteracting.current) return
      setActiveSlide((prev) => {
        const next = (prev + 1) % drives.length
        scrollRef.current?.scrollTo({
          x: next * (cardWidth + space.md),
          animated: true,
        })
        return next
      })
    }, 7000)
    return () => clearInterval(timer)
  }, [cardWidth, drives.length])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const idx = Math.round(x / (cardWidth + space.md))
    if (idx >= 0 && idx < drives.length && idx !== activeSlide) {
      setActiveSlide(idx)
    }
  }

  const scrollToIndex = (index: number) => {
    setActiveSlide(index)
    scrollRef.current?.scrollTo({
      x: index * (cardWidth + space.md),
      animated: true,
    })
  }

  return (
    <View style={styles.section}>
      <SectionTitle
        title="Journées de don du CNTS"
        action="Centres fixes"
        onAction={() => router.navigate('/centers')}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        decelerationRate="fast"
        snapToInterval={cardWidth + space.md}
        snapToAlignment="start"
        scrollEventThrottle={32}
        onScroll={onScroll}
        onTouchStart={() => {
          isInteracting.current = true
        }}
        onTouchEnd={() => {
          setTimeout(() => {
            isInteracting.current = false
          }, 5000)
        }}
      >
        {drives.map((drive, index) => (
          <DriveTile
            key={drive.id}
            drive={drive}
            width={cardWidth}
            highlighted={index === activeSlide}
            onAction={() => router.navigate('/centers')}
          />
        ))}
      </ScrollView>

      {/* Barre d'indicateurs et navigation */}
      <View style={styles.dotsRow}>
        <Pressable
          onPress={() => scrollToIndex((activeSlide - 1 + drives.length) % drives.length)}
          accessibilityRole="button"
          accessibilityLabel="Journée précédente"
          hitSlop={8}
          style={[styles.arrowButton, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <Icon name="arrowLeft" size={14} color="muted" />
        </Pressable>

        <View style={styles.pillsGroup}>
          {drives.map((drive, idx) => (
            <Pressable
              key={drive.id}
              onPress={() => scrollToIndex(idx)}
              accessibilityRole="button"
              accessibilityLabel={`Aller à la journée ${drive.title}`}
              hitSlop={8}
              style={[
                styles.dotPill,
                {
                  backgroundColor: idx === activeSlide ? colors.brand : colors.lineStrong,
                  width: idx === activeSlide ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={() => scrollToIndex((activeSlide + 1) % drives.length)}
          accessibilityRole="button"
          accessibilityLabel="Journée suivante"
          hitSlop={8}
          style={[styles.arrowButton, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <Icon name="arrow" size={14} color="muted" />
        </Pressable>
      </View>
    </View>
  )
}

function DriveTile({
  drive,
  width,
  highlighted,
  onAction,
}: {
  drive: DonationDrive
  width: number
  highlighted: boolean
  onAction: () => void
}) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        styles.tile,
        {
          width,
          backgroundColor: colors.surface,
          borderColor: highlighted ? colors.brand : colors.line,
        },
      ]}
    >
      <View style={styles.tileHead}>
        <View style={styles.flex}>
          <Text style={styles.driveTitle}>
            {drive.title}
          </Text>
          <Text variant="caption" tone="brand" style={styles.driveDate}>
            📅 {drive.date}
          </Text>
        </View>
        <View style={[styles.groupChip, { backgroundColor: colors.brandSoft }]}>
          <Text style={[styles.groupChipText, { color: colors.brand }]}>{drive.tag}</Text>
        </View>
      </View>

      <View style={[styles.driveInfoBox, { backgroundColor: colors.raised, borderColor: colors.line }]}>
        <View style={styles.tileRow}>
          <Icon name="clock" size={15} color="brand" />
          <Text variant="caption" tone="fg" style={styles.tileRowText}>
            {drive.time}
          </Text>
        </View>

        <View style={styles.tileRow}>
          <Icon name="pin" size={15} color="brand" />
          <Text variant="caption" tone="fg" style={styles.tileRowText}>
            {drive.location}
          </Text>
        </View>

        <View style={styles.tileRow}>
          <Icon name="award" size={15} color="brand" />
          <Text variant="caption" tone="muted" style={styles.tileRowText}>
            {drive.target}
          </Text>
        </View>

        <View style={styles.tileRow}>
          <Icon name="shield" size={15} color="ok" />
          <Text variant="caption" tone="muted" style={styles.tileRowText}>
            {drive.organizer}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={`Voir le lieu pour ${drive.title}`}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: highlighted ? colors.brand : colors.raised,
            borderWidth: 1,
            borderColor: highlighted ? colors.brand : colors.line,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Text variant="label" tone={highlighted ? 'onBrand' : 'fg'}>
          Voir le lieu & itinéraire →
        </Text>
      </Pressable>
    </View>
  )
}

interface StatProps {
  icon: IconName
  value: string
  label: string
  alignEnd?: boolean
  onPress?: () => void
  hint?: string
}

function Stat({ icon, value, label, alignEnd = false, onPress, hint }: StatProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.stat, alignEnd && styles.statEnd, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={24} color="brand" />
      <View>
        <Text variant="bodyStrong" tone="brand">
          {value}
        </Text>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      </View>
    </Pressable>
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
  sosCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  sosBadge: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sosLabel: { fontFamily: fonts.semibold, fontSize: 15, letterSpacing: 1 },
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
  carousel: {
    paddingVertical: space.xs,
    gap: space.md,
  },
  tile: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.lg,
    gap: space.sm,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  driveTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  driveDate: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  groupChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  groupChipText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  driveInfoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs + 3,
    marginTop: space.xs,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  tileRowText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    marginTop: space.xs,
  },
  why: { gap: space.sm },
  whyCard: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  whyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  conditions: { borderRadius: 24, padding: space.xl, gap: space.sm },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  source: { marginTop: space.sm },
  empty: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  campaignCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  campaignImageWrapper: {
    height: 190,
    width: '100%',
    position: 'relative',
  },
  campaignImage: {
    width: '100%',
    height: '100%',
  },
  campaignBadge: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  campaignBadgeText: {
    color: '#ffffff',
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  campaignBody: {
    padding: space.lg,
    gap: space.xs,
  },
  campaignDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  campaignActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    marginTop: space.md,
  },
  pillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotPill: {
    height: 6,
    borderRadius: 3,
  },
  arrowButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
