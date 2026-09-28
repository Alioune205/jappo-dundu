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

    # Apps du projet
    'users',
    'sang',
    'lits',
    'ambulances',

    # Apps El Hadji Massogui Diop
    'ml',
    'security',
    'realtime',
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


# =============================================================
# DJANGO REST FRAMEWORK (El Hadji Massogui Diop)
# =============================================================

REST_FRAMEWORK = {
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
        'user_burst': '10/second',
        'user_sustained': '1000/hour',
        'login': config('THROTTLE_LOGIN_RATE', default='10/minute'),
        'ml_predict': config('THROTTLE_ML_PREDICT_RATE', default='30/hour'),
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
            'CONFIG': {'hosts': [REDIS_URL]},
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
# Sans EMAIL_HOST : e-mails affichés dans la console (développement).
# Avec EMAIL_HOST : envoi SMTP (production, voir deploy/.env.example).

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
            'BACKEND': 'django.core.mail.backends.console.EmailBackend',
        },
    }

DEFAULT_FROM_EMAIL = config(
    'DEFAULT_FROM_EMAIL', default='Jappo Dundu <no-reply@localhost>'
)
SERVER_EMAIL = DEFAULT_FROM_EMAIL
