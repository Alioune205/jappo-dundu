import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
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

const BADGES_HERO = require('../../../../assets/badges_hero.jpg')

type FilterType = 'all' | 'unlocked' | 'locked'

const enter = (step: number) =>
  FadeInDown.duration(motion.slow)
    .delay(Math.min(step, 5) * motion.stagger)
    .easing(motion.easeOut)

export default function BadgesScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const gamification = useGamification()
  const { data: donor } = useDonor()
  const [selectedBadge, setSelectedBadge] = useState<BadgeView | null>(null)

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      {/* En-tête supérieur */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + space.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.line,
          },
        ]}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/profile'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={12}
          style={[styles.circleBtn, { backgroundColor: colors.raised }]}
        >
          <Icon name="arrowLeft" size={20} color="fg" strokeWidth={2.2} />
        </Pressable>

        <Text style={styles.topBarTitle} numberOfLines={1}>
          Tableau d’Honneur
        </Text>

        <Pressable
          onPress={() => gamification.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Actualiser"
          hitSlop={12}
          style={[styles.circleBtn, { backgroundColor: colors.raised }]}
        >
          <Icon name="sparkle" size={18} color="brand" strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={gamification.isRefetching}
            onRefresh={() => void gamification.refetch()}
            tintColor={colors.muted}
            colors={[colors.brand]}
          />
        }
      >
        {/* Grande bannière image pleine largeur */}
        <Animated.View entering={enter(0)}>
          <View style={[styles.heroBanner, { borderColor: colors.line }]}>
            <Image source={BADGES_HERO} style={styles.heroBannerImage} resizeMode="cover" />
            <View style={styles.heroBannerOverlay}>
              <View style={[styles.miniBadge, { backgroundColor: colors.brand }]}>
                <Text style={styles.miniBadgeText}>CNTS · RÉPUBLIQUE DU SÉNÉGAL</Text>
              </View>
              <Text style={styles.heroBannerTitle}>Vos Trophées Citoyens</Text>
              <Text style={styles.heroBannerSubtitle}>
                Chaque don sauve des vies et élève votre rang d’honneur
              </Text>
            </View>
          </View>
        </Animated.View>

        {gamification.data && donor ? (
          <Content
            profile={gamification.data}
            donor={donor}
            onSelectBadge={(b) => setSelectedBadge(b)}
          />
        ) : gamification.isError ? (
          <View style={styles.state}>
            <Icon name="alert" size={36} color="warning" />
            <Text variant="heading">Indisponible</Text>
            <Button
              label="Réessayer"
              variant="secondary"
              onPress={() => gamification.refetch()}
              loading={gamification.isFetching}
            />
          </View>
        ) : (
          <ActivityIndicator size="large" color={colors.brand} style={styles.state} />
        )}
      </ScrollView>

      {/* Fiche pop-up détaillée au toucher */}
      {selectedBadge ? (
        <BadgeDetailModal
          view={selectedBadge}
          onClose={() => setSelectedBadge(null)}
        />
      ) : null}
    </View>
  )
}

function Content({
  profile,
  donor,
  onSelectBadge,
}: {
  profile: GamificationProfile
  donor: DonorProfile
  onSelectBadge: (badge: BadgeView) => void
}) {
  const { colors } = useTheme()
  const history = useHistory()
  const [filter, setFilter] = useState<FilterType>('all')

  const projected = useMemo(() => {
    const past = new Set((history.data?.donations ?? []).map((d) => d.donated_on))
    if (donor.last_donation_date) past.add(donor.last_donation_date)
    return projectDonations(donor.sex, [...past], 20)
  }, [history.data, donor.last_donation_date, donor.sex])

  const allBadges = useMemo(
    () => orderedBadges(profile, (remaining) => projected[remaining - 1] ?? null),
    [profile, projected]
  )

  const filteredBadges = useMemo(() => {
    if (filter === 'unlocked') return allBadges.filter((b) => b.badge.unlocked)
    if (filter === 'locked') return allBadges.filter((b) => !b.badge.unlocked)
    return allBadges
  }, [allBadges, filter])

  const unlockedCount = profile.earned_badges_count
  const lockedCount = Math.max(0, allBadges.length - unlockedCount)
  const livesSaved = profile.donations_count * 3

  return (
    <>
      {/* Carte Statut & Points - Ultra visuelle et compacte */}
      <Animated.View entering={enter(1)}>
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.statusTopRow}>
            <View style={styles.flex}>
              <Text variant="caption" tone="muted">
                Votre rang actuel
              </Text>
              <Text style={styles.statusRankTitle} numberOfLines={1}>
                {profile.title}
              </Text>
            </View>

            <View style={[styles.levelTag, { backgroundColor: colors.brandSoft }]}>
              <Icon name="award" size={14} color="brand" strokeWidth={2.4} />
              <Text style={[styles.levelTagText, { color: colors.brand }]}>
                NIVEAU {profile.level}
              </Text>
            </View>
          </View>

          {/* Jauge XP */}
          <View style={styles.xpBox}>
            <ProgressBar value={profile.progress_percent / 100} tint="brand" label="Progression" />
            <View style={styles.xpRow}>
              <Text variant="caption" tone="muted">
                {profile.points} XP total
              </Text>
              <Text variant="caption" tone="brand" style={{ fontFamily: fonts.semibold }}>
                {profile.points_to_next_level > 0
                  ? `+${profile.points_to_next_level} pts pour Niv. ${profile.level + 1}`
                  : 'Niveau Max'}
              </Text>
            </View>
          </View>

          {/* 3 mini-compteurs visuels */}
          <View style={[styles.metricsRow, { backgroundColor: colors.raised, borderColor: colors.line }]}>
            <View style={styles.metricItem}>
              <Icon name="award" size={16} color="brand" />
              <Text style={styles.metricValue}>
                {unlockedCount}/{allBadges.length}
              </Text>
              <Text variant="caption" tone="muted" style={styles.metricLabel}>
                Badges
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />

            <View style={styles.metricItem}>
              <Icon name="drop" size={16} color="brand" />
              <Text style={styles.metricValue}>{profile.donations_count}</Text>
              <Text variant="caption" tone="muted" style={styles.metricLabel}>
                Dons
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />

            <View style={styles.metricItem}>
              <Icon name="heart" size={16} color="ok" />
              <Text style={[styles.metricValue, { color: colors.ok }]}>{livesSaved}</Text>
              <Text variant="caption" tone="muted" style={styles.metricLabel}>
                Vies sauvées
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Puces de filtres */}
      <Animated.View entering={enter(2)} style={styles.filterRow}>
        <Pressable
          onPress={() => setFilter('all')}
          style={[
            styles.filterPill,
            filter === 'all'
              ? { backgroundColor: colors.brand }
              : { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filter === 'all' ? colors.onBrand : colors.fg },
            ]}
          >
            Tous ({allBadges.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('unlocked')}
          style={[
            styles.filterPill,
            filter === 'unlocked'
              ? { backgroundColor: colors.brand }
              : { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filter === 'unlocked' ? colors.onBrand : colors.fg },
            ]}
          >
            Débloqués ({unlockedCount})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('locked')}
          style={[
            styles.filterPill,
            filter === 'locked'
              ? { backgroundColor: colors.brand }
              : { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filter === 'locked' ? colors.onBrand : colors.fg },
            ]}
          >
            À débloquer ({lockedCount})
          </Text>
        </Pressable>
      </Animated.View>

      {/* Grille / Liste visuelle des badges */}
      <View style={styles.badgesGrid}>
        {filteredBadges.map((view, index) => (
          <Animated.View key={view.badge.code} entering={enter(Math.min(index + 3, 8))}>
            <BadgeCard view={view} onPress={() => onSelectBadge(view)} />
          </Animated.View>
        ))}
      </View>
    </>
  )
}

function BadgeCard({ view, onPress }: { view: BadgeView; onPress: () => void }) {
  const { colors } = useTheme()
  const { badge, icon, condition, progress } = view
  const tint = TINT[badge.category]
  const unlocked = badge.unlocked
  const tintColor = colors[tint]

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge.name}
      style={({ pressed }) => [
        styles.badgeCard,
        {
          backgroundColor: colors.surface,
          borderColor: unlocked ? tintColor : colors.line,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.badgeEmblem,
          unlocked
            ? {
                borderColor: tintColor,
                backgroundColor: tint === 'brand' ? colors.brandSoft : 'rgba(23, 178, 106, 0.12)',
              }
            : { borderColor: colors.line, backgroundColor: colors.raised },
        ]}
      >
        <Icon
          name={unlocked ? icon : 'lock'}
          size={24}
          color={unlocked ? tint : 'subtle'}
          strokeWidth={2}
        />
        {unlocked ? (
          <View style={[styles.badgeCheck, { backgroundColor: colors.ok, borderColor: colors.surface }]}>
            <Icon name="check" size={9} color="onBrand" strokeWidth={3} />
          </View>
        ) : null}
      </View>

      <View style={styles.badgeInfo}>
        <View style={styles.badgeHeaderRow}>
          <Text
            variant="bodyStrong"
            style={[styles.badgeTitle, !unlocked && { color: colors.muted }]}
            numberOfLines={1}
          >
            {badge.name}
          </Text>
          <View
            style={[
              styles.bonusPill,
              { backgroundColor: unlocked ? colors.brandSoft : colors.raised },
            ]}
          >
            <Text
              style={[
                styles.bonusPillText,
                { color: unlocked ? colors.brand : colors.muted },
              ]}
            >
              +{badge.points_bonus} pts
            </Text>
          </View>
        </View>

        <Text variant="caption" tone="muted" numberOfLines={1}>
          {condition}
        </Text>

        {progress !== null && !unlocked ? (
          <View style={{ marginTop: 2 }}>
            <ProgressBar value={progress} tint={tint} label={badge.name} />
          </View>
        ) : null}
      </View>

      <Icon name="chevron" size={16} color="muted" />
    </Pressable>
  )
}

function BadgeDetailModal({
  view,
  onClose,
}: {
  view: BadgeView
  onClose: () => void
}) {
  const { colors } = useTheme()
  const { badge, icon, condition, status, progress } = view
  const unlocked = badge.unlocked
  const tint = TINT[badge.category]
  const tintColor = colors[tint]

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View
            style={[
              styles.modalEmblem,
              unlocked
                ? {
                    borderColor: tintColor,
                    backgroundColor: tint === 'brand' ? colors.brandSoft : 'rgba(23, 178, 106, 0.12)',
                  }
                : { borderColor: colors.line, backgroundColor: colors.raised },
            ]}
          >
            <Icon
              name={unlocked ? icon : 'lock'}
              size={40}
              color={unlocked ? tint : 'subtle'}
              strokeWidth={2}
            />
            {unlocked ? (
              <View style={[styles.modalCheck, { backgroundColor: colors.ok, borderColor: colors.surface }]}>
                <Icon name="check" size={12} color="onBrand" strokeWidth={3} />
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.modalPill,
              { backgroundColor: unlocked ? 'rgba(23, 178, 106, 0.14)' : colors.raised },
            ]}
          >
            <Text
              style={[
                styles.modalPillText,
                { color: unlocked ? colors.ok : colors.muted },
              ]}
            >
              {unlocked ? 'BADGE DÉBLOQUÉ' : 'À DÉBLOQUER'}
            </Text>
          </View>

          <Text style={styles.modalTitle}>{badge.name}</Text>

          <Text variant="caption" tone="muted" style={styles.modalDesc}>
            {badge.description}
          </Text>

          <View style={[styles.modalStats, { backgroundColor: colors.raised, borderColor: colors.line }]}>
            <View style={styles.modalStatRow}>
              <Text variant="caption" tone="muted">
                Objectif
              </Text>
              <Text variant="caption" style={{ fontFamily: fonts.semibold }}>
                {condition}
              </Text>
            </View>

            <View style={[styles.modalDivider, { backgroundColor: colors.line }]} />

            <View style={styles.modalStatRow}>
              <Text variant="caption" tone="muted">
                Bonus
              </Text>
              <Text variant="caption" tone="brand" style={{ fontFamily: fonts.semibold }}>
                +{badge.points_bonus} XP
              </Text>
            </View>

            <View style={[styles.modalDivider, { backgroundColor: colors.line }]} />

            <View style={styles.modalStatRow}>
              <Text variant="caption" tone="muted">
                Statut
              </Text>
              <Text
                variant="caption"
                style={{
                  fontFamily: fonts.semibold,
                  color: unlocked ? colors.ok : colors.fg,
                }}
              >
                {unlocked && badge.awarded_at
                  ? `Obtenu le ${formatDate(badge.awarded_at)}`
                  : status}
              </Text>
            </View>
          </View>

          <Button label="Fermer" variant="primary" onPress={onClose} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    </Modal>
  )
}

function ProgressBar({
  value,
  tint,
  label,
}: {
  value: number
  tint: 'brand' | 'warning' | 'info'
  label: string
}) {
  const { colors } = useTheme()
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: colors.raised }]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${Math.max(percent, percent > 0 ? 5 : 0)}%`,
            backgroundColor: colors[tint],
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 22,
  },
  content: {
    padding: space.lg,
    gap: space.md,
    paddingBottom: space.xxxl,
  },
  state: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxxl,
  },
  flex: { flex: 1 },

  // Bannière héro pleine largeur
  heroBanner: {
    height: 140,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
  },
  heroBannerImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  heroBannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: space.md,
    justifyContent: 'flex-end',
    gap: 3,
  },
  heroBannerTitle: {
    color: '#ffffff',
    fontFamily: fonts.semibold,
    fontSize: 17,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroBannerSubtitle: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  miniBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  miniBadgeText: {
    color: '#ffffff',
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
  },

  // Carte statut
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRankTitle: {
    fontFamily: fonts.semibold,
    fontSize: 19,
    lineHeight: 24,
  },
  levelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  levelTagText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  xpBox: {
    gap: space.xs,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.xs + 2,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
  metricLabel: {
    fontSize: 11,
  },
  metricDivider: {
    width: 1,
    height: 24,
  },

  // Filtres
  filterRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  filterPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  filterPillText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },

  // Grille badges
  badgesGrid: {
    gap: space.sm,
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  badgeEmblem: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInfo: {
    flex: 1,
    gap: 2,
  },
  badgeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  badgeTitle: {
    fontSize: 14,
  },
  bonusPill: {
    paddingHorizontal: space.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  bonusPillText: {
    fontFamily: fonts.semibold,
    fontSize: 10,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    alignItems: 'center',
    gap: space.md,
  },
  modalEmblem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  modalCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPill: {
    paddingHorizontal: space.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modalPillText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  modalTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  modalDesc: {
    textAlign: 'center',
    lineHeight: 18,
  },
  modalStats: {
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs + 2,
  },
  modalStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDivider: {
    height: 1,
    width: '100%',
  },

  // Jauge
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
})
