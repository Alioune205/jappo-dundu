/**
 * Configuration dynamique : complète app.json avec ce qui dépend du .env.
 *
 * Connexion Facebook : le retour d'authentification arrive sur le schéma
 * « fb<identifiant de l'application> », déclaré seulement s'il est renseigné.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => {
  const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID
  const base = Array.isArray(config.scheme) ? config.scheme : config.scheme ? [config.scheme] : []
  const schemes = facebookAppId ? [...base, `fb${facebookAppId}`] : base
  return {
    ...config,
    name: config.name ?? 'Jappo Dundu',
    slug: config.slug ?? 'jappo-dundu',
    scheme: schemes.length > 1 ? schemes : schemes[0],
  }
}
