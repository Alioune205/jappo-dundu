# ============================================================
# Jappo Dundu — Backend Dockerfile
# Multi-stage build pour un déploiement léger et sécurisé
#
# Auteur : El Hadji Massogui Diop
# ============================================================

# --- Stage 1 : Base Python ---
FROM python:3.12-slim AS base

# Empêcher Python de créer des fichiers .pyc et activer le flush immédiat
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Installer les dépendances système nécessaires pour PostgreSQL et compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
        libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Créer un utilisateur non-root pour la sécurité
RUN groupadd -r jappo && useradd -r -g jappo -d /app -s /sbin/nologin jappo

# Définir le répertoire de travail
WORKDIR /app

# --- Stage 2 : Installation des dépendances ---
FROM base AS dependencies

# Copier uniquement le fichier requirements pour tirer parti du cache Docker
COPY requirements.txt .

# Installer les dépendances Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --- Stage 3 : Application finale ---
FROM dependencies AS production

# Copier tout le code source
COPY . .

# Créer les répertoires nécessaires
RUN mkdir -p ml/trained_models staticfiles && \
    chown -R jappo:jappo /app

# Collecter les fichiers statiques
RUN python manage.py collectstatic --noinput 2>/dev/null || true

# Passer à l'utilisateur non-root
USER jappo

# Exposer le port de l'application
EXPOSE 8000

# Health check Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health/')" || exit 1

# Commande de démarrage : Daphne (serveur ASGI pour WebSockets)
CMD ["daphne", \
     "-b", "0.0.0.0", \
     "-p", "8000", \
     "--access-log", "-", \
     "core.asgi:application"]
