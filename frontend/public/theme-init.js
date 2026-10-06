// Applique le thème mémorisé avant le premier rendu (pas de flash clair/sombre).
// Fichier séparé et non inline : la Content-Security-Policy interdit les scripts inline.
try {
  if (localStorage.getItem('jappo-dundu.theme') === 'dark') {
    document.documentElement.classList.add('dark')
  }
} catch (_) {
  // Stockage indisponible : le thème clair par défaut s'applique.
}
