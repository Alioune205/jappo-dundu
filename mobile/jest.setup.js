// Environnement de test : modules natifs remplacés par leurs simulations officielles.
// Les tests couvrent toutes les fonctions, y compris celles masquées par défaut.
process.env.EXPO_PUBLIC_FULL_FEATURES = 'true'
// SDK 58 (Reanimated 4.7, Worklets 0.13) : les simulations officielles
// remplacent les modules natifs ; setUpTests() initialise le module natif.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))
// Reanimated 4.7 lance son initialisation native (gestion des animations CSS)
// même sous Jest, où seul le moteur JS existe : on la neutralise.
jest.mock('react-native-reanimated/src/initializers.native', () => ({ initializeReanimatedModule: () => {} }))
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}))
