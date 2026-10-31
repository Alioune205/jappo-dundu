/**
 * Notifications du navigateur pour le personnel (régulation, hôpitaux).
 *
 * Le flux temps réel met à jour les écrans ouverts ; une alerte qui arrive
 * pendant que l'onglet est en arrière-plan passerait inaperçue. Elle est
 * alors aussi montrée par le système (avec l'accord du poste). Les alertes
 * critiques restent affichées jusqu'à ce qu'on les touche.
 */

export type BrowserNotificationPermission = NotificationPermission | 'unsupported'

export function notificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (notificationPermission() === 'unsupported') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

interface SystemAlert {
  id: string
  title: string
  message: string
  critical: boolean
}

/** Montre l'alerte par le système si l'onglet n'est pas au premier plan. */
export function notifyInBackground(alert: SystemAlert): void {
  if (notificationPermission() !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  try {
    const notification = new Notification(alert.title, {
      body: alert.message,
      tag: alert.id,
      requireInteraction: alert.critical,
      icon: '/favicon.png',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Certains navigateurs (mobile) n'autorisent les notifications que via un service worker.
  }
}
