/**
 * Contenu de la page d'accueil publique.
 *
 * Les fonctionnalités décrites sont celles du code (modules sang, lits,
 * ambulances, prévisions, temps réel, rôles). Les informations sur le don de
 * sang viennent du Centre National de Transfusion Sanguine (cnts.gouv.sn,
 * consulté le 6 octobre 2026) : à tenir à jour avec lui.
 */

export const SOURCE = {
  name: 'Centre National de Transfusion Sanguine (CNTS)',
  url: 'https://cnts.gouv.sn',
  consulted: '6 octobre 2026',
}

export type ModuleKey = 'blood' | 'beds' | 'ambulances'

/** Les trois modules, au même niveau. */
export const MODULES: {
  key: ModuleKey
  name: string
  tagline: string
  features: string[]
}[] = [
  {
    key: 'blood',
    name: 'Jappo Sang',
    tagline: 'Le bon donneur, au bon moment.',
    features: [
      'Les hôpitaux publient leurs besoins : groupe, nombre de poches, urgence, rayon de recherche.',
      'Les donneurs compatibles les plus proches reçoivent une alerte sur leur téléphone.',
      'Réponse en un geste ; l’hôpital voit qui vient et confirme le don.',
      'Délais entre deux dons respectés automatiquement.',
    ],
  },
  {
    key: 'beds',
    name: 'Jappo Lits',
    tagline: 'Chaque lit libre, visible en temps réel.',
    features: [
      'Capacités par service : réanimation, urgences, maternité, pédiatrie…',
      'Entrées et sorties en un clic, taux d’occupation à jour.',
      'Alerte dès qu’un service vital est saturé, ou à nouveau disponible.',
      'Recherche des établissements les plus proches ayant des lits libres.',
    ],
  },
  {
    key: 'ambulances',
    name: 'Jappo Ambulance',
    tagline: 'L’ambulance la plus proche, sans perdre une minute.',
    features: [
      'Création des missions par la régulation, par niveau de priorité.',
      'Affectation automatique de l’ambulance disponible la plus proche.',
      'Suivi GPS des véhicules et des missions sur la carte, en direct.',
      'Destination proposée : les hôpitaux proches qui ont un lit libre.',
    ],
  },
]

/** Une urgence de bout en bout : les trois modules travaillent ensemble. */
export const SCENARIO = [
  {
    module: 'ambulances' as ModuleKey,
    time: '00:00',
    title: 'L’appel arrive au SAMU',
    text: 'La régulation crée la mission ; l’ambulance disponible la plus proche est affectée automatiquement.',
  },
  {
    module: 'beds' as ModuleKey,
    time: '00:04',
    title: 'Un lit est trouvé avant l’arrivée',
    text: 'L’équipage voit les hôpitaux proches qui ont un lit libre dans le bon service et s’y dirige.',
  },
  {
    module: 'beds' as ModuleKey,
    time: '00:18',
    title: 'L’hôpital se prépare',
    text: 'L’administrateur des lits suit la mission qui arrive et enregistre l’admission en un clic.',
  },
  {
    module: 'blood' as ModuleKey,
    time: '00:25',
    title: 'Il faut du sang O−',
    text: 'L’hôpital publie une demande urgente : les donneurs compatibles les plus proches sont alertés.',
  },
]

/** Les publics de la plateforme (un rôle d'administration par domaine). */
export const AUDIENCES = [
  {
    who: 'Donneurs',
    where: 'Application mobile',
    text: 'Recevoir les alertes des hôpitaux proches, répondre en un geste et suivre ses dons.',
  },
  {
    who: 'Hôpitaux',
    where: 'Interface web',
    text: 'L’administrateur des lits gère les capacités ; l’administrateur du sang publie les demandes et confirme les dons.',
  },
  {
    who: 'SAMU et ambulanciers',
    where: 'Interface web et carte',
    text: 'L’administrateur des ambulances régule les missions de sa région et suit sa flotte en direct.',
  },
  {
    who: 'Supervision nationale',
    where: 'Tableau de bord',
    text: 'L’administrateur général voit tout le réseau, gère les établissements et les comptes.',
  },
]

export const PILOTING = [
  {
    title: 'Temps réel',
    text: 'Demandes de sang, lits et missions se mettent à jour sur tous les écrans dès qu’ils changent, sans recharger la page.',
  },
  {
    title: 'Prévisions de pénurie',
    text: 'Un modèle d’apprentissage automatique estime les stocks de sang par région et par groupe pour les jours à venir. En démonstration : il est entraîné sur des données simulées.',
  },
  {
    title: 'Données protégées',
    text: 'Chaque compte ne voit que son domaine et son établissement. Les donneurs ne reçoivent jamais d’information sur les patients.',
  },
]

/** Groupes en tension publiés par le CNTS. */
export const BLOOD_NEEDS = {
  updated: '30 septembre 2026',
  groups: [
    { group: 'O−', level: 'critical' as const },
    { group: 'B−', level: 'critical' as const },
    { group: 'A+', level: 'low' as const },
    { group: 'A−', level: 'low' as const },
  ],
}

export const DONOR_CONDITIONS = [
  'Avoir entre 18 et 60 ans',
  'Peser au moins 50 kg',
  'Être en bonne santé le jour du don',
  'Hommes : 3 mois entre deux dons ; femmes : 4 mois',
]

export const FAQ = [
  {
    q: 'Qu’est-ce que Jappo Dundu ?',
    a: 'Une plateforme qui relie en temps réel les donneurs de sang, les lits hospitaliers et les ambulances au Sénégal. « Jappo Dundu » signifie « Connecter la vie » en wolof.',
  },
  {
    q: 'Qui peut utiliser la plateforme ?',
    a: 'Les donneurs, avec l’application mobile ; les hôpitaux, le SAMU et la supervision nationale, avec l’interface web. Chaque professionnel a un rôle qui limite ce qu’il voit à son domaine et à son établissement.',
  },
  {
    q: 'Comment mon hôpital peut-il rejoindre Jappo Dundu ?',
    a: 'L’administrateur général crée l’établissement, puis les comptes de ses administrateurs (lits, sang ou ambulances).',
  },
  {
    q: 'Ma position est-elle partagée ?',
    a: 'Elle sert seulement à vous montrer les demandes des hôpitaux proches. Elle n’est jamais transmise aux hôpitaux.',
  },
  {
    q: 'Qui peut donner son sang ?',
    a: 'Les personnes de 18 à 60 ans, de 50 kg au moins, en bonne santé. Un entretien médical confidentiel confirme l’aptitude le jour du don.',
  },
  {
    q: 'Jappo Dundu remplace-t-il le CNTS ?',
    a: 'Non. La plateforme facilite la mise en relation ; le prélèvement et la sécurité transfusionnelle restent assurés par le CNTS et ses centres.',
  },
]
