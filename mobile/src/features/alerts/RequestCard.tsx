import React, { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { BloodGroupBadge } from '@/components/ui/BloodGroup'
import { Icon } from '@/components/ui/Icon'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { deadline, timeAgo } from '@/lib/dates'
import { formatDistance } from '@/lib/location'
import { motion, radius, space, useTheme } from '@/theme'
import type { NearbyRequest } from '@/types/api'
import { RESPONSE_LABEL, units, URGENCY } from './format'

interface RequestCardProps {
  request: NearbyRequest
  now: number
  onPress: (id: number) => void
}

/**
 * Une demande : groupe, gravité, établissement, distance. Le pied de carte dit
 * où en est le donneur (à répondre, attendu, déclinée). Une demande critique
 * porte un filet rouge sur le bord gauche, visible en balayant la liste.
 */
export const RequestCard = memo(function RequestCard({ request, now, onPress }: RequestCardProps) {
  const { colors } = useTheme()
  const pressed = useSharedValue(0)
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pressed.value * 0.015 }] }))

  const urgency = URGENCY[request.urgency]
  const response = request.my_response
  const settled = response === 'declined' || response === 'cancelled'
  const accepted = response === 'accepted'
  const distance = formatDistance(request.distance_km)
  const place = [request.facility.city, distance].filter(Boolean).join(' · ')
  const when = request.needed_by ? deadline(request.needed_by, new Date(now)) : null

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={() => onPress(request.id)}
        onPressIn={() => pressed.set(withSpring(1, motion.press))}
        onPressOut={() => pressed.set(withSpring(0, motion.press))}
        accessibilityRole="button"
        accessibilityHint="Ouvre le détail et les réponses possibles"
        accessibilityLabel={[
          `Demande ${urgency.label.toLowerCase()}`,
          `groupe ${request.blood_group_display}`,
          request.facility.name,
          place,
          units(request.units_remaining),
          response ? RESPONSE_LABEL[response] : 'sans réponse',
        ].join(', ')}
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: accepted ? colors.ok : colors.line, opacity: settled ? 0.62 : 1 },
        ]}
      >
        {request.urgency === 'critical' && !response && <View style={[styles.stripe, { backgroundColor: colors.brand }]} />}
        <View style={styles.top}>
          <BloodGroupBadge group={request.blood_group} muted={settled} />
          <View style={styles.main}>
            <Text variant="eyebrow" tone={settled ? 'subtle' : urgency.tone}>
              {urgency.label} · {timeAgo(request.created_at, now)}
            </Text>
            <Text variant="heading" numberOfLines={2}>
              {request.facility.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {place}
            </Text>
          </View>
        </View>

        <View style={[styles.foot, { borderTopColor: colors.line }]}>
          {accepted ? (
            <View style={styles.status}>
              <StatusDot color="ok" pulse />
              <Text variant="label" tone="ok">
                {RESPONSE_LABEL.accepted}
              </Text>
            </View>
          ) : settled ? (
            <Text variant="label" tone="subtle">
              {RESPONSE_LABEL[response!]}
            </Text>
          ) : (
            <Text variant="label">
              {units(request.units_remaining)}
              {when ? <Text variant="label" tone="muted">{`  ·  ${when}`}</Text> : null}
            </Text>
          )}
          <View style={styles.cta}>
            {!accepted && !settled && (
              <Text variant="label" tone="brand">
                Répondre
              </Text>
            )}
            <Icon name="chevron" size={18} color={!accepted && !settled ? 'brand' : 'subtle'} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  top: { flexDirection: 'row', gap: space.md, padding: space.lg, paddingBottom: space.md },
  main: { flex: 1, gap: 2 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    height: 44,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
})
