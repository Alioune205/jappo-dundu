import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { fonts, motion, radius, space, useTheme } from '@/theme'

const ICONS: Record<string, IconName> = { alerts: 'pulse', history: 'clock', profile: 'user' }
const INDICATOR = 20

/**
 * Barre d'onglets : pictogramme et libellé, un trait rouge glisse au-dessus de
 * l'onglet actif. Le badge des Alertes compte les demandes sans réponse.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  const tab = width / state.routes.length
  const offset = useSharedValue(0)

  useEffect(() => {
    if (tab > 0) offset.set(withTiming(state.index * tab + (tab - INDICATOR) / 2, { duration: motion.base, easing: motion.easeOut }))
  }, [state.index, tab, offset])

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.bar, { backgroundColor: colors.canvas, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, space.sm) }]}
    >
      {tab > 0 && <Animated.View style={[styles.indicator, { backgroundColor: colors.brand }, indicatorStyle]} />}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const focused = state.index === index
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
            style={styles.tab}
          >
            <View>
              <Icon name={ICONS[route.name] ?? 'pulse'} size={24} color={focused ? 'fg' : 'subtle'} />
              {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.brand, borderColor: colors.canvas }]}>
                  <Text style={styles.badgeText} tone="onBrand">
                    {String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="caption" tone={focused ? 'fg' : 'subtle'} style={focused ? styles.labelActive : undefined}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  indicator: { position: 'absolute', top: -1, left: 0, width: INDICATOR, height: 2, borderRadius: 1 },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.xs },
  labelActive: { fontFamily: fonts.medium },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
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
