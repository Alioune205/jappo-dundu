# syntax=docker/dockerfile:1
# ============================================================
# Jappo Dundu — Image du backend (API REST + WebSockets)
#
# Build multi-étapes : les dépendances sont installées dans un
# environnement virtuel, seul ce venv est copié dans l'image finale.
# Toutes les dépendances sont des wheels précompilées (psycopg2-binary,
# numpy, scikit-learn...) : aucun compilateur dans l'image.
#
# Auteur : El Hadji Massogui Diop
# ============================================================

ARG PYTHON_VERSION=3.14

# --- Étape 1 : dépendances ---
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

COPY requirements.txt /tmp/requirements.txt
RUN pip install --only-binary=:all: -r /tmp/requirements.txt

# --- Étape 2 : image d'exécution ---
FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH

# Utilisateur non privilégié
RUN groupadd --system jappo \
    && useradd --system --gid jappo --home-dir /app --shell /usr/sbin/nologin jappo

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=jappo:jappo . .

# Répertoires inscriptibles (montés en volumes en production)
RUN mkdir -p staticfiles ml/trained_models \
    && chown jappo:jappo staticfiles ml/trained_models

USER jappo

EXPOSE 8000

# Sonde de vivacité : /api/health/ répond sans dépendre de la base
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4)"]

# Daphne : serveur ASGI (HTTP + WebSocket). Journal d'accès désactivé :
# les requêtes sont journalisées par security.middleware (avec X-Request-ID).
CMD ["daphne", "--bind", "0.0.0.0", "--port", "8000", "--verbosity", "0", "core.asgi:application"]
