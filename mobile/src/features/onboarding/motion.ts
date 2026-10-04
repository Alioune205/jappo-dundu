/**
 * Primitives de mouvement de l'onboarding.
 *
 * Tout dérive d'une seule valeur : `progress`, la position du défilement en
 * nombre d'écrans (0 → 3, fractionnaire pendant le geste). Parallaxe,
 * fondus, pagination et morphing du bouton en sont des fonctions pures,
 * évaluées sur le thread UI : aucun minuteur, aucun re-render par image.
 *
 * Règle : lire `progress.value` directement dans le worklet du style (ou le
 * passer en argument). Une valeur partagée lue dans une fonction imbriquée
 * n'est pas suivie par Reanimated et le style ne se mettrait plus à jour.
 */
/**
 * Coefficients de parallaxe (fraction de la largeur d'écran ajoutée au
 * déplacement de la page). Positif : l'élément « traîne » derrière la page ;
 * plus le coefficient est grand, plus l'élément arrive tard — d'où un
 * décalage naturel entre surtitre, titre et texte sans aucun délai.
 */
export const PARALLAX = {
  /** Illustration : légèrement ralentie (plan arrière). */
  visual: -0.3,
  eyebrow: 0.08,
  title: 0.16,
  body: 0.24,
} as const
