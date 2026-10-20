import React, { useMemo } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { CNTS, orderedBadges, projectDonations, TINT, type BadgeView } from '@/features/badges/badges'
import { formatDate } from '@/lib/dates'
import { useDonor, useGamification, useHistory } from '@/lib/queries'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import type { DonorProfile, GamificationProfile } from '@/types/api'

const enter = (step: number) => FadeInDown.duration(motion.slow).delay(Math.min(step, 6) * motion.stagger).easing(motion.easeOut)

/**
 * Mes Badges : niveau, points et badges du donneur, obtenus ou à débloquer,
 * avec ce qu'il reste à accomplir pour chacun. Ouvert depuis le profil et
 * l'accueil (pas de bouton dans la barre d'onglets).
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function BadgesScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const gamification = useGamification()
  const { data: donor } = useDonor()

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/profile'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={10}
          style={styles.back}
        >
          <Icon name="back" size={24} color="onBrand" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.barTitle} accessibilityRole="header">
          Mes Badges
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={gamification.isRefetching}
            onRefresh={() => gamification.refetch()}
            tintColor={colors.muted}
            colors={[colors.brand]}
          />
        }
      >
        <Animated.View entering={enter(0)} style={styles.hero}>
          <Medal />
          <Text style={styles.heroTitle}>Votre Tableau d’Honneur</Text>
          <Text variant="body" tone="muted" style={styles.center}>
            Chaque don vous rapproche d’un nouveau badge.
          </Text>
        </Animated.View>

        {gamification.data && donor ? (
          <Content profile={gamification.data} donor={donor} />
        ) : gamification.isError ? (
          <View style={styles.state}>
            <Text variant="heading">Badges indisponibles</Text>
            <Text variant="body" tone="muted" style={styles.center}>
              {gamification.error.message}
            </Text>
            <Button label="Réessayer" variant="secondary" onPress={() => gamification.refetch()} loading={gamification.isFetching} />
          </View>
        ) : (
          <ActivityIndicator color={colors.muted} style={styles.state} />
        )}
      </ScrollView>
    </View>
  )
}

function Content({ profile, donor }: { profile: GamificationProfile; donor: DonorProfile }) {
  const history = useHistory()
  // Prochains dons au plus tôt selon les règles CNTS (dons enregistrés + dernier don déclaré).
  const projected = useMemo(() => {
    const past = new Set((history.data?.donations ?? []).map((d) => d.donated_on))
    if (donor.last_donation_date) past.add(donor.last_donation_date)
    return projectDonations(donor.sex, [...past], 20)
  }, [history.data, donor.last_donation_date, donor.sex])
  const badges = orderedBadges(profile, (remaining) => projected[remaining - 1] ?? null)
  return (
    <>
      <Animated.View entering={enter(1)}>
        <LevelCard profile={profile} />
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <SpacingCard donor={donor} />
      </Animated.View>
      {badges.map((view, index) => (
        <Animated.View key={view.badge.code} entering={enter(index + 3)}>
          <BadgeCard view={view} />
        </Animated.View>
      ))}
    </>
  )
}

/** Niveau, capital de points et chemin vers le niveau suivant. */
function LevelCard({ profile }: { profile: GamificationProfile }) {
  const { colors } = useTheme()
  const max = profile.next_level_points === null
  return (
    <View style={[styles.level, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.levelTop}>
        <View style={styles.flex}>
          <Text variant="eyebrow" tone="muted">
            Niveau {profile.level}
          </Text>
          <Text variant="heading">{profile.title}</Text>
        </View>
        <View style={styles.points}>
          <Text tone="brand" style={styles.pointsValue}>
            {profile.points}
          </Text>
          <Text variant="caption" tone="muted">
            points
          </Text>
        </View>
      </View>
      <ProgressBar value={profile.progress_percent / 100} tint="brand" label={`Niveau ${profile.level}`} />
      <Text variant="caption" tone="muted">
        {max
          ? 'Niveau maximal atteint : merci pour votre fidélité.'
          : `Encore ${profile.points_to_next_level} points pour le niveau ${profile.level + 1}`}
        {` · ${profile.donations_count} don${profile.donations_count > 1 ? 's' : ''} · ${profile.earned_badges_count} badge${profile.earned_badges_count > 1 ? 's' : ''}`}
      </Text>
    </View>
  )
}

/** Règle d'espacement du CNTS : quand le prochain don est possible. */
function SpacingCard({ donor }: { donor: DonorProfile }) {
  const { colors } = useTheme()
  const waiting = !donor.is_eligible && donor.next_eligible_date
  return (
    <View style={[styles.spacing, { backgroundColor: waiting ? colors.raised : 'rgba(6, 118, 71, 0.08)', borderColor: colors.line }]}>
      <Icon name={waiting ? 'clock' : 'check'} size={20} color={waiting ? 'muted' : 'ok'} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">
          {waiting ? `Prochain don possible le ${formatDate(donor.next_eligible_date)}` : donor.is_eligible ? 'Vous pouvez donner dès aujourd’hui' : 'Don impossible pour l’instant'}
        </Text>
        <Text variant="caption" tone="muted">
          Règle du CNTS : {CNTS.rule[donor.sex]}. Les badges suivent ce rythme pour protéger votre santé.
        </Text>
      </View>
    </View>
  )
}

function BadgeCard({ view }: { view: BadgeView }) {
  const { colors } = useTheme()
  const { badge, icon, condition, status, progress } = view
  const tint = TINT[badge.category]
  const unlocked = badge.unlocked
  const tintColor = colors[tint]

  return (
    <View
      accessibilityLabel={`${badge.name}, ${unlocked ? 'obtenu' : 'verrouillé'}. ${condition}. ${status}. Bonus ${badge.points_bonus} points.`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: unlocked ? tintColor : colors.line,
          shadowColor: unlocked ? tintColor : '#000',
        },
      ]}
    >
      <View
        style={[
          styles.emblem,
          unlocked
            ? { borderColor: tintColor, backgroundColor: colors.surface }
            : { borderColor: colors.lineStrong, backgroundColor: colors.raised },
        ]}
      >
        <Icon name={unlocked ? icon : 'lock'} size={30} color={unlocked ? tint : 'subtle'} strokeWidth={unlocked ? 2 : 1.8} />
        {unlocked ? (
          <View style={[styles.check, { backgroundColor: colors.ok, borderColor: colors.surface }]}>
            <Icon name="check" size={12} color="onBrand" strokeWidth={3} />
          </View>
        ) : null}
      </View>

      <View style={styles.cardBody}>
        <Text variant="heading" tone={unlocked ? 'fg' : 'subtle'} numberOfLines={2}>
          {badge.name}
        </Text>
        <Text variant="label" style={{ color: tintColor }}>
          {condition}
          <Text variant="label" tone="muted">{`  ·  +${badge.points_bonus} pts`}</Text>
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {unlocked && badge.awarded_at ? `Obtenu le ${formatDate(badge.awarded_at)}` : status}
        </Text>
        {progress !== null ? <ProgressBar value={progress} tint={tint} label={badge.name} /> : null}
      </View>
    </View>
  )
}

function ProgressBar({ value, tint, label }: { value: number; tint: 'brand' | 'warning' | 'info'; label: string }) {
  const { colors } = useTheme()
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: colors.raised }]}
    >
      <View style={[styles.fill, { width: `${Math.max(percent, percent > 0 ? 4 : 0)}%`, backgroundColor: colors[tint] }]} />
    </View>
  )
}

/** Médaille de l'en-tête : ruban et étoile. */
function Medal() {
  const { colors } = useTheme()
  return (
    <View style={styles.medal} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.ribbon}>
        <View style={[styles.ribbonHalf, { backgroundColor: colors.brand }]} />
        <View style={[styles.ribbonHalf, { backgroundColor: '#B0060D' }]} />
      </View>
      <View style={[styles.medalDisc, { backgroundColor: colors.warning }]}>
        <Icon name="sparkle" size={30} color="onBrand" strokeWidth={2} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: '#7A0A10',
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color: '#FFFFFF' },
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, textAlign: 'center' },
  center: { textAlign: 'center' },
  state: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  flex: { flex: 1, gap: 2 },
  level: { borderWidth: 1, borderRadius: radius.lg + 4, padding: space.lg, gap: space.md },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  points: { alignItems: 'flex-end' },
  pointsValue: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 32 },
  spacing: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: radius.lg, padding: space.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    borderWidth: 1.5,
    borderRadius: radius.lg + 6,
    padding: space.lg,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  emblem: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space.xs },
  fill: { height: '100%', borderRadius: 3 },
  medal: { alignItems: 'center', marginBottom: space.xs },
  ribbon: { flexDirection: 'row', width: 28, height: 26 },
  ribbonHalf: { flex: 1 },
  medalDisc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: -4 },
})
