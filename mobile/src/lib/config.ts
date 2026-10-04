/**
 * Adresse du backend.
 *
 * EXPO_PUBLIC_API_URL (fichier .env de mobile/) : adresse joignable depuis le
 * téléphone, ex. http://192.168.1.20:8000 en Wi-Fi local (pas « localhost »,
 * qui désigne le téléphone lui-même), https://jappodundu.sn en production.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')

/** Adresse WebSocket correspondante (http → ws, https → wss). */
export const WS_URL = API_URL.replace(/^http/, 'ws')

/**
 * Identifiants OAuth de la connexion sociale (fichier .env de mobile/).
 * Un fournisseur sans identifiant pour la plateforme courante est désactivé :
 * son bouton n'apparaît qu'en développement, avec une explication.
 * Les références sont écrites en toutes lettres : Expo n'injecte que les
 * variables EXPO_PUBLIC_ nommées explicitement dans le code.
 */
export const OAUTH = {
  google: {
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  },
  facebookAppId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || undefined,
}
