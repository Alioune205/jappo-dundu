import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { callFacility, openDirections } from '@/features/alerts/format'
import { formatTime, timeAgo } from '@/lib/dates'
import type { DriverStep } from '@/lib/missions'
import { motion, radius, space, useTheme } from '@/theme'
import type { Mission } from '@/types/api'
import { currentTarget, nextAction, PRIORITY, stepIndex, STEPS } from './format'

interface MissionPanelProps {
  mission: Mission
  now: number
  busy: boolean
  error: string | null
  onAdvance: (status: DriverStep) => void
  /** Transport demandé sans destination, ou changement d'hôpital : ouvre le choix. */
  onChooseDestination: () => void
}

/**
 * Mission en cours : où aller, qui appeler, et un seul geste principal pour
 * passer à l'étape suivante. Les boutons sont grands et contrastés : ils se
 * touchent d'une main, dans un véhicule, en plein soleil.
 */
export function MissionPanel({ mission, now, busy, error, onAdvance, onChooseDestination }: MissionPanelProps) {
  const { colors } = useTheme()
  const [confirmFinish, setConfirmFinish] = useState(false)
  const priority = PRIORITY[mission.priority]
  const action = nextAction(mission)
  const target = currentTarget(mission)
  const current = stepIndex(mission.status)

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)} layout={LinearTransition.duration(motion.base)} style={styles.stack}>
      <Card style={[styles.card, mission.priority === 'critical' && { borderColor: colors.brand }]}>
        <View style={styles.headRow}>
          <StatusDot color={mission.priority === 'critical' ? 'brand' : mission.priority === 'urgent' ? 'warning' : 'muted'} pulse size={10} />
          <Text variant="eyebrow" tone={priority.tone}>
            Mission {priority.label.toLowerCase()} · n° {mission.id}
          </Text>
        </View>
        <Text variant="title">{mission.description || 'Intervention d’urgence'}</Text>
        <Text variant="caption" tone="muted">
          Signalée {timeAgo(mission.created_at, now)} · {mission.region_display}
        </Text>

        <Steps mission={mission} current={current} />

        <View style={[styles.place, { backgroundColor: colors.raised }]}>
          <Icon name={target?.kind === 'destination' ? 'hospital' : 'pin'} size={20} color={target?.kind === 'destination' ? 'fg' : 'brand'} />
          <View style={styles.placeText}>
            <Text variant="caption" tone="subtle">
              {target?.kind === 'destination' ? 'Hôpital de destination' : 'Lieu d’intervention'}
            </Text>
            <Text variant="bodyStrong">{target?.name ?? mission.pickup_address}</Text>
          </View>
        </View>

        {mission.destination && mission.status !== 'transporting' ? (
          <View style={styles.destination}>
            <Icon name="hospital" size={18} color="muted" />
            <Text variant="label" tone="muted" style={styles.destinationText} numberOfLines={1}>
              Destination prévue : {mission.destination.name}
            </Text>
            {mission.status === 'on_site' ? (
              <Pressable onPress={onChooseDestination} accessibilityRole="button" hitSlop={8}>
                <Text variant="label" tone="brand">
                  Changer
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {target ? (
          <View style={styles.actions}>
            <ActionButton icon="route" label="Itinéraire" onPress={() => openDirections(target)} />
            {target.phone ? (
              <ActionButton
                icon="phone"
                label={target.kind === 'destination' ? 'Appeler l’hôpital' : 'Appelant'}
                onPress={() => callFacility(target.phone!)}
              />
            ) : null}
          </View>
        ) : null}
      </Card>

      {action ? (
        <Button
          label={action.needsDestination ? 'Choisir l’hôpital et transporter' : action.label}
          onPress={() => (action.needsDestination ? onChooseDestination() : onAdvance(action.status))}
          loading={busy}
          haptic
        />
      ) : null}

      {mission.status === 'on_site' ? (
        <Pressable
          onPress={() => {
            if (!confirmFinish) return setConfirmFinish(true)
            setConfirmFinish(false)
            onAdvance('completed')
          }}
          disabled={busy}
          accessibilityRole="button"
          style={styles.secondary}
          hitSlop={8}
        >
          <Text variant="label" tone={confirmFinish ? 'brand' : 'muted'}>
            {confirmFinish ? 'Toucher à nouveau pour terminer sans transport' : 'Terminer sur place (sans transport)'}
          </Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite" style={styles.center}>
          {error}
        </Text>
      ) : null}
    </Animated.View>
  )
}

/** Frise des étapes : faites (heure), en cours (point vivant), à venir. */
function Steps({ mission, current }: { mission: Mission; current: number }) {
  const { colors } = useTheme()
  return (
    <View style={styles.steps} accessibilityLabel={`Étape : ${mission.status_display}`}>
      {STEPS.map((step, index) => {
        const done = index < current
        const active = index === current
        const at = mission[step.at]
        return (
          <View key={step.status} style={styles.step}>
            <View style={[styles.bar, { backgroundColor: done || active ? colors.ok : colors.line }]} />
            <Text variant="label" tone={active ? 'fg' : done ? 'muted' : 'subtle'}>
              {step.label}
            </Text>
            <Text variant="caption" tone="subtle">
              {at ? formatTime(at) : ' '}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.raised : colors.surface }]}
    >
      <Icon name={icon} size={20} />
      <Text variant="bodyStrong" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  card: { gap: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  steps: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  step: { flex: 1, gap: 4 },
  bar: { height: 4, borderRadius: 2 },
  place: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  placeText: { flex: 1, gap: 2 },
  destination: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  destinationText: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.md },
  action: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  secondary: { alignSelf: 'center', paddingVertical: space.sm },
  center: { textAlign: 'center' },
})
