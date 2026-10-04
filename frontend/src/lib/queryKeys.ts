/**
 * Clés de cache TanStack Query, définies une seule fois.
 *
 * Une même clé sert à charger les données, à les invalider après une
 * mutation et à les rafraîchir sur événement temps réel
 * (useRealtimeRefresh) : une faute de frappe dans l'un de ces endroits
 * empêcherait silencieusement un écran de se mettre à jour. Importer ces
 * constantes la transforme en erreur de compilation.
 *
 * Les clés sont des préfixes : `[...QK.bedCapacities, category, region]`
 * pour une requête filtrée ; `QK.bedCapacities` pour invalider toutes ses
 * variantes.
 */
export const QK = {
  // Sang
  bloodRequests: ['blood-requests'],
  requestMatches: ['request-matches'],
  requestResponses: ['request-responses'],
  // Lits
  bedCapacities: ['bed-capacities'],
  bedsSummary: ['beds-summary'],
  // SAMU
  ambulancesList: ['ambulances-list'],
  ambulancesFleet: ['ambulances-fleet'],
  missionsActive: ['missions-active'],
  missionsAll: ['missions-all'],
  missionStats: ['mission-stats'],
  // Prévisions
  predictionsSummary: ['predictions-summary'],
  mlPredictionsList: ['ml-predictions-list'],
  mlModelInfo: ['ml-model-info'],
  mlPredictJob: ['ml-predict-job'],
  // Structures et comptes
  adminFacilities: ['admin-facilities'],
  adminUsers: ['admin-users'],
  facilityOptions: ['facility-options'],
  facilitiesMap: ['facilities-map'],
  facilitiesHospitals: ['facilities-hospitals'],
} as const satisfies Record<string, readonly [string]>
