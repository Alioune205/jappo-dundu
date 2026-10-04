/**
 * Ajustements propres à la version web (prévisualisation navigateur) :
 * Edge et Internet Explorer ajoutent leur propre bouton « œil » et une croix
 * d'effacement dans les champs ; nos champs ont déjà les leurs. Le contour
 * de focus du navigateur est aussi retiré : le liseré animé du champ
 * (TextField) signale déjà le focus, clavier compris.
 */
import { Platform } from 'react-native'

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = 'input::-ms-reveal, input::-ms-clear { display: none; } input:focus, textarea:focus { outline: none; }'
  document.head.appendChild(style)
}
