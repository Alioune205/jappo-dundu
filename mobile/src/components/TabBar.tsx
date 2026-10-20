import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { fonts, motion, radius, space, useTheme } from '@/theme'

const ICONS: Record<string, IconName> = {
  home: 'home',
  card: 'qr',
  alerts: 'pulse',
  history: 'clock',
  centers: 'pin',
}
/** Écrans des onglets sans bouton dans la barre (ouverts depuis l'accueil). */
const HIDDEN = new Set(['profile', 'badges'])
const BUBBLE = 52

/**
 * Barre d'onglets : bandeau rouge arrondi, pictogrammes blancs ; une bulle
 * claire glisse derrière l'onglet actif. Le badge des Alertes compte les
 * demandes sans réponse.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  const routes = state.routes.filter((route) => !HIDDEN.has(route.name))
  const activeKey = state.routes[state.index]?.key
  const activeIndex = routes.findIndex((route) => route.key === activeKey)
  const tab = width / routes.length
  const offset = useSharedValue(0)

  useEffect(() => {
    if (tab > 0 && activeIndex >= 0) {
      offset.set(withTiming(activeIndex * tab + (tab - BUBBLE) / 2, { duration: motion.base, easing: motion.easeOut }))
    }
  }, [activeIndex, tab, offset])

  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
    <View style={[styles.wrap, { backgroundColor: colors.canvas, paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.bar, { backgroundColor: colors.brand }]}>
        {tab > 0 && activeIndex >= 0 && <Animated.View style={[styles.bubble, bubbleStyle]} />}
        {routes.map((route) => {
          const { options } = descriptors[route.key]
          const focused = route.key === activeKey
          const label = typeof options.title === 'string' ? options.title : route.name
          const badge = options.tabBarBadge
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${label}, ${badge} en attente` : label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!focused && !event.defaultPrevented) {
                  Haptics.selectionAsync()
                  navigation.navigate(route.name, route.params)
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[styles.tab, !focused && styles.idle]}
            >
              <View>
                <Icon name={ICONS[route.name] ?? 'pulse'} size={22} color="onBrand" strokeWidth={focused ? 2.1 : 1.8} />
                {badge ? (
                  <View style={[styles.badge, { backgroundColor: colors.onBrand, borderColor: colors.brand }]}>
                    <Text style={[styles.badgeText, { color: colors.brand }]}>{String(badge)}</Text>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" tone="onBrand" numberOfLines={1} style={[styles.label, focused && styles.labelActive]}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  bar: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingVertical: space.sm,
    shadowColor: '#7A0A10',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bubble: {
    position: 'absolute',
    top: 6,
    left: 0,
    width: BUBBLE,
    bottom: 6,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.xs },
  idle: { opacity: 0.72 },
  label: { fontSize: 11, lineHeight: 14 },
  labelActive: { fontFamily: fonts.semibold },
  badge: {
    position: 'absolute',
    top: -5,
    right: -11,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 12 },
})
