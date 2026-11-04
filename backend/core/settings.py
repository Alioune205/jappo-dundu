"""
Django settings for Jappo Dundu backend.

Toute valeur sensible ou dépendante de l'environnement est lue depuis les
variables d'environnement (fichier .env en local, voir .env.example).
Les valeurs par défaut sont sûres : sans configuration explicite, DEBUG
est désactivé et une SECRET_KEY est exigée.

Auteur initial : Pape Alioune Sene (structure)
Configuration sécurité/DRF/JWT/CORS/Channels/déploiement : El Hadji Massogui Diop
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# =============================================================
# SÉCURITÉ DE BASE (El Hadji Massogui Diop)
# =============================================================

DEBUG = config('DEBUG', default=False, cast=bool)

SECRET_KEY = config('SECRET_KEY', default='')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured(
            "SECRET_KEY doit être définie lorsque DEBUG=False. Générez-en une "
            "avec : python -c \"from django.core.management.utils import "
            "get_random_secret_key; print(get_random_secret_key())\""
        )
    SECRET_KEY = 'django-insecure-dev-only-never-use-in-production'

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default='', cast=Csv())


# =============================================================
# APPLICATION DEFINITION
# =============================================================

INSTALLED_APPS = [
    # Serveur ASGI : doit précéder staticfiles (runserver = Daphne)
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Apps tierces (El Hadji Massogui Diop — Sécurité & DevOps)
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'channels',
    'drf_spectacular',
    'drf_spectacular_sidecar',

    # Apps du projet
    'users',
    'sang',
    'lits',
    'ambulances',
    'sih',

    # Apps El Hadji Massogui Diop
    'ml',
    'security',
    'realtime',

    # App mobile (Pape Alioune Sene)
    'push',
    'identity',

    # Assistant IA de supervision (Gemini, Grok en secours)
    'assistant',
]

MIDDLEWARE = [
    # Sonde de vivacité : avant la validation d'hôte et la redirection HTTPS
    'security.middleware.HealthCheckMiddleware',
    # Journal d'audit et en-têtes : englobent toutes les réponses
    'security.middleware.RequestLoggingMiddleware',
    'security.middleware.SecurityHeadersMiddleware',
    # CORS avant CommonMiddleware (exigence django-cors-headers)
    'corsheaders.middleware.CorsMiddleware',

    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'


# =============================================================
# DATABASE — PostgreSQL/PostGIS (El Hadji Massogui Diop)
# =============================================================
# DB_ENGINE permet de passer au backend PostGIS
# (django.contrib.gis.db.backends.postgis) sans modifier ce fichier.

DB_ENGINE = config('DB_ENGINE', default='django.db.backends.postgresql')

DATABASES = {
    'default': {
        'ENGINE': DB_ENGINE,
        'NAME': config(
            'DB_NAME',
            default=(
                str(BASE_DIR / 'db.sqlite3')
                if DB_ENGINE.endswith('sqlite3')
                else 'jappo_db'
            ),
        ),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}


# =============================================================
# PASSWORD VALIDATION
# =============================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# =============================================================
# INTERNATIONALIZATION
# =============================================================

LANGUAGE_CODE = 'fr-fr'

TIME_ZONE = 'Africa/Dakar'

USE_I18N = True

USE_TZ = True


# =============================================================
# STATIC FILES (servis par Caddy en production)
# =============================================================

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'


# =============================================================
# DEFAULT AUTO FIELD
# =============================================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# =============================================================
# HTTPS & EN-TÊTES DE SÉCURITÉ (El Hadji Massogui Diop)
# =============================================================

# Derrière le reverse proxy (Caddy), le schéma d'origine est transmis
# par X-Forwarded-Proto. À n'activer que derrière un proxy de confiance.
BEHIND_PROXY = config('BEHIND_PROXY', default=False, cast=bool)
if BEHIND_PROXY:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

HTTPS_ENABLED = config('HTTPS_ENABLED', default=not DEBUG, cast=bool)
SECURE_SSL_REDIRECT = HTTPS_ENABLED
SESSION_COOKIE_SECURE = HTTPS_ENABLED
CSRF_COOKIE_SECURE = HTTPS_ENABLED
SECURE_HSTS_SECONDS = (
    config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
    if HTTPS_ENABLED
    else 0
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config(
    'SECURE_HSTS_INCLUDE_SUBDOMAINS', default=True, cast=bool
)
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=False, cast=bool)

SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_HTTPONLY = True

# Content-Security-Policy des réponses Django (API JSON et administration).
# L'application React a sa propre politique, émise par Caddy (deploy/Caddyfile).
# Aucun script inline ni tiers : une injection HTML ne peut ni exécuter de
# code, ni exfiltrer de données vers un domaine extérieur.
SECURE_CSP = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    # Attributs style= de l'administration Django.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
}


# =============================================================
# DJANGO REST FRAMEWORK (El Hadji Massogui Diop)
# =============================================================

REST_FRAMEWORK = {
    # Schéma OpenAPI 3 généré à partir des vues et sérialiseurs (Swagger).
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    # Sécurisé par défaut : toute route exige un utilisateur authentifié.
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'security.throttling.AnonBurstThrottle',
        'security.throttling.AnonSustainedThrottle',
        'security.throttling.UserBurstThrottle',
        'security.throttling.UserSustainedThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon_burst': '5/second',
        'anon_sustained': '100/hour',
        # Utilisateurs authentifiés : un chargement du tableau de bord émet à
        # lui seul ~10 requêtes (données, tickets WebSocket, profil) et les
        # écrans se rafraîchissent sur événement temps réel. Des plafonds plus
        # bas (anciennement 10/s et 1000/h) bloquaient un régulateur en pleine
        # garde ; ceux-ci arrêtent toujours un script qui martèle l'API.
        'user_burst': config('THROTTLE_USER_BURST_RATE', default='30/second'),
        'user_sustained': config('THROTTLE_USER_SUSTAINED_RATE', default='10000/hour'),
        'login': config('THROTTLE_LOGIN_RATE', default='10/minute'),
        'ml_predict': config('THROTTLE_ML_PREDICT_RATE', default='30/hour'),
        # Recherche d'un donneur (carte ou téléphone) par un centre de don.
        'donor_lookup': config('THROTTLE_DONOR_LOOKUP_RATE', default='120/hour'),
        # Alerte SOS d'un citoyen (une seule active à la fois, voir ambulances.services).
        'sos': config('THROTTLE_SOS_RATE', default='10/hour'),
        'locate': config('THROTTLE_LOCATE_RATE', default='30/hour'),
        'facility_application': config('THROTTLE_FACILITY_APPLICATION_RATE', default='5/hour'),
        # Récupération de compte : demandes de code et essais, par adresse IP.
        'password_reset': config('THROTTLE_PASSWORD_RESET_RATE', default='5/hour'),
        'password_reset_confirm': config('THROTTLE_PASSWORD_RESET_CONFIRM_RATE', default='20/hour'),
        # Progiciels SIH : un compteur par clé d'API (et non un compteur commun).
        'sih_burst': config('THROTTLE_SIH_BURST_RATE', default='20/second'),
        'sih_sustained': config('THROTTLE_SIH_SUSTAINED_RATE', default='20000/hour'),
        # Questions à l'assistant IA : chaque appel est facturé par le fournisseur.
        'assistant': config('THROTTLE_ASSISTANT_RATE', default='60/hour'),
    },
    # Nombre de reverse proxies de confiance devant l'application : sans
    # cette valeur, un X-Forwarded-For forgé contourne le throttling.
    'NUM_PROXIES': config('NUM_PROXIES', default=0, cast=int),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
}

# Documentation de l'API (drf-spectacular) : /api/schema/ (OpenAPI 3),
# /api/docs/ (Swagger UI) et /api/redoc/. Ouverte en développement, réservée
# aux administrateurs en production. Swagger UI est servi par le serveur
# (sidecar) : aucune dépendance à un CDN, la CSP reste stricte.
SPECTACULAR_SETTINGS = {
    'TITLE': 'API Jappo Dundu',
    'DESCRIPTION': (
        "API REST de la plateforme Jappo Dundu : coordination des urgences "
        "médicales au Sénégal (sang, lits hospitaliers, ambulances). "
        "Authentification par jeton JWT : obtenez un jeton avec "
        "POST /api/auth/token/, puis cliquez sur « Authorize » et collez "
        "le jeton d'accès."
    ),
    'VERSION': '1.0.0',
    'SCHEMA_PATH_PREFIX': r'/api/',
    'COMPONENT_SPLIT_REQUEST': True,
    # Noms explicites des listes de choix homonymes (sinon suffixes aléatoires).
    'ENUM_NAME_OVERRIDES': {
        'AmbulanceStatusEnum': 'ambulances.models.Ambulance.Status',
        'MissionStatusEnum': 'ambulances.models.Mission.Status',
        # Même liste pour la priorité d'une mission et l'urgence d'une demande de sang.
        'PriorityEnum': 'ambulances.models.Mission.Priority',
        'BedCategoryEnum': 'lits.models.BedCapacity.Category',
        'BedReservationStatusEnum': 'lits.models.BedReservation.Status',
        'BloodRequestStatusEnum': 'sang.models.BloodRequest.Status',
        'DonorResponseStatusEnum': 'sang.models.DonorResponse.Status',
        'BloodSupplyOrderStatusEnum': 'sang.models.BloodSupplyOrder.Status',
        'BadgeCategoryEnum': 'sang.models.Badge.Category',
        'BloodComponentEnum': 'sang.models.Component',
        'BloodGroupEnum': 'ml.constants.BLOOD_GROUPS',
        'SyncStatusEnum': 'sih.models.HospitalSyncLog.Status',
        'FacilityApplicationStatusEnum': 'users.models.FacilityApplication.Status',
    },
    'SERVE_INCLUDE_SCHEMA': False,
    'SERVE_PERMISSIONS': (
        ['rest_framework.permissions.AllowAny']
        if DEBUG
        else ['rest_framework.permissions.IsAdminUser']
    ),
    'SWAGGER_UI_DIST': 'SIDECAR',
    'SWAGGER_UI_FAVICON_HREF': 'SIDECAR',
    'REDOC_DIST': 'SIDECAR',
    'SWAGGER_UI_SETTINGS': {
        'persistAuthorization': True,
        'displayRequestDuration': True,
        'docExpansion': 'none',
        'filter': True,
    },
    'TAGS': [
        {'name': 'auth', 'description': "Connexion JWT, double authentification, récupération de compte."},
        {'name': 'users', 'description': "Comptes, rôles et rattachement à un établissement."},
        {'name': 'facilities', 'description': "Établissements de santé (hôpitaux, CNTS, SAMU)."},
        {'name': 'sang', 'description': "Jappo Sang : demandes, donneurs, dons, stocks, collectes."},
        {'name': 'lits', 'description': "Jappo Lits : capacités par service, admissions, réservations."},
        {'name': 'ambulances', 'description': "Jappo Ambulances : flotte, missions SAMU, SOS citoyen."},
        {'name': 'ml', 'description': "Prévision des pénuries de sang (apprentissage automatique)."},
        {'name': 'realtime', 'description': "Tickets de connexion WebSocket et alertes critiques."},
        {'name': 'push', 'description': "Enregistrement des appareils pour les notifications push."},
        {'name': 'sih', 'description': "Interopérabilité avec les logiciels hospitaliers (clé API)."},
        {'name': 'supervision', 'description': "Indicateurs de pilotage du réseau et leurs objectifs."},
        {'name': 'security', 'description': "Journal d'audit et accès d'urgence (« bris de glace »)."},
        {'name': 'status', 'description': "État des dépendances du service (administrateurs)."},
    ],
}


# =============================================================
# JWT (El Hadji Massogui Diop)
# =============================================================

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=30, cast=int)
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)
    ),
    # Chaque refresh émet un nouveau refresh token et révoque l'ancien.
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
    'TOKEN_OBTAIN_SERIALIZER': (
        'security.authentication.JappoDunduTokenObtainPairSerializer'
    ),
}


# =============================================================
# CORS (El Hadji Massogui Diop)
# =============================================================
# En production, le frontend est servi sur le même domaine que l'API
# (Caddy) : CORS ne concerne que le développement ou des domaines tiers.

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
    cast=Csv(),
)
CORS_URLS_REGEX = r'^/api/.*$'
# L'authentification passe par l'en-tête Authorization, pas par cookie.
CORS_ALLOW_CREDENTIALS = config('CORS_ALLOW_CREDENTIALS', default=False, cast=bool)
CORS_EXPOSE_HEADERS = ['X-Request-ID']


# =============================================================
# CHANNELS / REDIS — WebSockets (El Hadji Massogui Diop)
# =============================================================
# Sans REDIS_URL, le channel layer en mémoire suffit pour un processus
# unique (développement) ; Redis est requis en production.

REDIS_URL = config('REDIS_URL', default='')

if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            # redis-py 8 fixe un délai de lecture de 5 s par défaut, égal à
            # l'attente bloquante de channels_redis (BZPOPMIN, 5 s) : chaque
            # consumer WebSocket expirait toutes les 5 s. Délai porté à 15 s,
            # qui détecte toujours une connexion morte.
            'CONFIG': {'hosts': [{'address': REDIS_URL, 'socket_timeout': 15}]},
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
    }


# =============================================================
# CACHE (throttling) (El Hadji Massogui Diop)
# =============================================================

CACHE_REDIS_URL = config('CACHE_REDIS_URL', default='')

if CACHE_REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': CACHE_REDIS_URL,
            'KEY_PREFIX': 'jappo',
        },
    }
else:
    CACHES = {
        'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    }


# =============================================================
# MACHINE LEARNING (El Hadji Massogui Diop)
# =============================================================

ML_MODEL_DIR = BASE_DIR / config('ML_MODEL_DIR', default='ml/trained_models')

# Seuils de risque en jours de stock (stock prévu / consommation moyenne).
# Valeurs par défaut à valider avec le CNTS.
ML_SHORTAGE_CRITICAL_DAYS = config('ML_SHORTAGE_CRITICAL_DAYS', default=2.0, cast=float)
ML_SHORTAGE_WARNING_DAYS = config('ML_SHORTAGE_WARNING_DAYS', default=5.0, cast=float)

# Prédictions à la demande exécutées hors de la requête HTTP (ml/services/jobs.py).
# False : exécution dans la requête (tests ; la réponse garde la même forme).
ML_PREDICT_ASYNC = config('ML_PREDICT_ASYNC', default=True, cast=bool)
# Au-delà de ce délai (s), une prédiction non terminée est déclarée perdue et relançable.
ML_JOB_STALE_SECONDS = config('ML_JOB_STALE_SECONDS', default=900, cast=int)

# Durée de vie d'un ticket de connexion WebSocket (realtime/tickets.py).
REALTIME_TICKET_TTL = config('REALTIME_TICKET_TTL', default=30, cast=int)


# =============================================================
# NOTIFICATIONS PUSH (application mobile — Pape Alioune Sene)
# =============================================================
# Service push d'Expo (relaie vers FCM et APNs) : voir push/services.py.
PUSH_ENABLED = config('PUSH_ENABLED', default=True, cast=bool)
# False : envoi dans la requête (tests) ; True : thread dédié.
PUSH_ASYNC = config('PUSH_ASYNC', default=True, cast=bool)
PUSH_EXPO_URL = config('PUSH_EXPO_URL', default='https://exp.host/--/api/v2/push/send')
# Jeton d'accès Expo, requis si « enhanced push security » est activé sur le projet.
PUSH_EXPO_ACCESS_TOKEN = config('PUSH_EXPO_ACCESS_TOKEN', default='')
# Nombre maximal de donneurs sollicités par demande (les plus proches).
PUSH_MAX_DONORS = config('PUSH_MAX_DONORS', default=50, cast=int)


# =============================================================
# LOGGING (El Hadji Massogui Diop)
# =============================================================
# Journaux sur la sortie standard (collectés par Docker) ; fichier
# optionnel via LOG_FILE.

LOG_LEVEL = config('LOG_LEVEL', default='INFO')
LOG_FILE = config('LOG_FILE', default='')

_LOG_HANDLERS = {
    'console': {
        'class': 'logging.StreamHandler',
        'formatter': 'verbose',
    },
}
if LOG_FILE:
    _LOG_HANDLERS['file'] = {
        'class': 'logging.handlers.RotatingFileHandler',
        'filename': LOG_FILE,
        'maxBytes': 10 * 1024 * 1024,
        'backupCount': 5,
        'encoding': 'utf-8',
        'formatter': 'verbose',
    }

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': _LOG_HANDLERS,
    'root': {
        'handlers': list(_LOG_HANDLERS),
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': list(_LOG_HANDLERS),
            'level': 'WARNING',
            'propagate': False,
        },
        'jappo_dundu': {
            'handlers': list(_LOG_HANDLERS),
            'level': LOG_LEVEL,
            'propagate': False,
        },
    },
}


# =============================================================
# EMAIL
# =============================================================
# Avec EMAIL_HOST : envoi SMTP (production, voir deploy/.env.example).
# Sans EMAIL_HOST :
# - DEBUG : e-mails affichés dans la console (développement) ;
# - hors DEBUG : AUCUN e-mail n'est envoyé ni écrit. La console finirait dans
#   les journaux Docker avec les codes de réinitialisation qu'elle contient.

_EMAIL_HOST = config('EMAIL_HOST', default='')

if _EMAIL_HOST:
    MAILERS = {
        'default': {
            'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
            'OPTIONS': {
                'host': _EMAIL_HOST,
                'port': config('EMAIL_PORT', default=587, cast=int),
                'username': config('EMAIL_HOST_USER', default=''),
                'password': config('EMAIL_HOST_PASSWORD', default=''),
                'use_tls': config('EMAIL_USE_TLS', default=True, cast=bool),
                'timeout': 10,
            },
        },
    }
else:
    MAILERS = {
        'default': {
            'BACKEND': (
                'django.core.mail.backends.console.EmailBackend'
                if DEBUG
                else 'django.core.mail.backends.dummy.EmailBackend'
            ),
        },
    }

DEFAULT_FROM_EMAIL = config(
    'DEFAULT_FROM_EMAIL', default='Jappo Dundu <no-reply@localhost>'
)
SERVER_EMAIL = DEFAULT_FROM_EMAIL


# =============================================================
# IDENTITÉ : SMS et connexion sociale (Pape Alioune Sene)
# =============================================================
# Codes de réinitialisation : « console » (DEBUG uniquement, code dans le
# journal du serveur), « orange » (API SMS d'Orange Sénégal) ou « twilio »
SMS_BACKEND = config('SMS_BACKEND', default='console')
SMS_ORANGE_CLIENT_ID = config('SMS_ORANGE_CLIENT_ID', default='')
SMS_ORANGE_CLIENT_SECRET = config('SMS_ORANGE_CLIENT_SECRET', default='')
SMS_ORANGE_SENDER = config('SMS_ORANGE_SENDER', default='')

TWILIO_ACCOUNT_SID = config('TWILIO_ACCOUNT_SID', default='')
TWILIO_AUTH_TOKEN = config('TWILIO_AUTH_TOKEN', default='')
TWILIO_SENDER = config('TWILIO_SENDER', default='')

# Identifiants OAuth acceptés (audiences des jetons) ; vide = fournisseur désactivé.
GOOGLE_CLIENT_IDS = config('GOOGLE_CLIENT_IDS', default='', cast=Csv())
# Identifiant d'application iOS, ex. « sn.jappodundu.donneurs » (« host.exp.Exponent »
# en plus pour tester dans Expo Go). Vide par défaut, comme les autres : un fournisseur
# non configuré est refusé (503).
APPLE_AUDIENCES = config('APPLE_AUDIENCES', default='', cast=Csv())
FACEBOOK_APP_ID = config('FACEBOOK_APP_ID', default='')
FACEBOOK_APP_SECRET = config('FACEBOOK_APP_SECRET', default='')

# --- Temps de trajet (geo/routing.py) ---
# Serveur OSRM (carte OpenStreetMap du Sénégal) ; vide : durées estimées.
OSRM_URL = config('OSRM_URL', default='')
OSRM_TIMEOUT_SECONDS = config('OSRM_TIMEOUT_SECONDS', default=1.5, cast=float)
ROUTING_DETOUR_FACTOR = config('ROUTING_DETOUR_FACTOR', default=1.4, cast=float)
ROUTING_SPEED_KMH = config('ROUTING_SPEED_KMH', default=35, cast=float)

# Adresse publique du site web (liens envoyés par SMS, ex. localisation de l'appelant).
PUBLIC_WEB_URL = config('PUBLIC_WEB_URL', default='http://localhost:3000')


# =============================================================
# ASSISTANT IA DE SUPERVISION (assistant/providers.py)
# =============================================================
# Gemini répond d'abord ; en cas d'échec (clé absente, quota, délai), Grok prend
# le relais. Sans aucune clé, le site web utilise son assistant local.
GEMINI_API_KEY = config('GEMINI_API_KEY', default='')
GEMINI_MODEL = config('GEMINI_MODEL', default='gemini-3.5-flash')
# Réflexion du modèle avant réponse : « low » (rapide), « high », ou vide pour le défaut du modèle.
GEMINI_THINKING_LEVEL = config('GEMINI_THINKING_LEVEL', default='low')
GROK_API_KEY = config('GROK_API_KEY', default='')
GROK_MODEL = config('GROK_MODEL', default='grok-3-mini')
ASSISTANT_TIMEOUT_SECONDS = config('ASSISTANT_TIMEOUT_SECONDS', default=30, cast=float)
