// Applique le thème mémorisé avant le premier rendu (pas de flash clair/sombre).
// Fichier séparé et non inline : la Content-Security-Policy interdit les scripts inline.
try {
  if (localStorage.getItem('jappo-dundu.theme') === 'light') {
    document.documentElement.classList.remove('dark')
  }
} catch (_) {
  // Stockage indisponible : le thème sombre par défaut s'applique.
}
