"""
Django settings for Jappo Dundu backend.

Sécurisé et configuré pour le développement et la production.
Variables sensibles chargées depuis le fichier .env

Auteur initial : Pape Alioune Sene (structure)
Configuration sécurité/DRF/JWT/CORS/Channels : El Hadji Massogui Diop
"""

import os
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# =============================================================
# SÉCURITÉ (El Hadji Massogui Diop)
# =============================================================

# SECRET_KEY chargée depuis .env — jamais en dur en production
SECRET_KEY = config(
    'SECRET_KEY',
    default='django-insecure-dev-only-change-me-in-production',
)

DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='localhost,127.0.0.1',
    cast=Csv(),
)


# =============================================================
# APPLICATION DEFINITION
# =============================================================

INSTALLED_APPS = [
    # Django core
    'daphne',  # Doit être AVANT staticfiles pour le serveur ASGI
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Apps tierces (El Hadji Massogui Diop — Sécurité & DevOps)
    'rest_framework',
    'rest_framework_simplejwt',
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
    'websockets',
]

MIDDLEWARE = [
    # CORS doit être en premier (El Hadji Massogui Diop)
    'corsheaders.middleware.CorsMiddleware',

    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',

    # Middleware de sécurité personnalisés (El Hadji Massogui Diop)
    'security.middleware.RequestLoggingMiddleware',
    'security.middleware.SecurityHeadersMiddleware',
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


# =============================================================
# ASGI — WebSockets (El Hadji Massogui Diop)
# =============================================================

ASGI_APPLICATION = 'core.asgi.application'


# =============================================================
# DATABASE — PostgreSQL via Docker (El Hadji Massogui Diop)
# =============================================================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='jappo_db'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='postgres'),
        'HOST': config('DB_HOST', default='db'),
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
# STATIC FILES
# =============================================================

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'


# =============================================================
# DEFAULT AUTO FIELD
# =============================================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# =============================================================
# DJANGO REST FRAMEWORK (El Hadji Massogui Diop)
# =============================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
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
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
}


# =============================================================
# JWT CONFIGURATION (El Hadji Massogui Diop)
# =============================================================

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=30, cast=int)
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)
    ),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'TOKEN_OBTAIN_SERIALIZER': (
        'security.authentication.JappoDunduTokenObtainPairSerializer'
    ),
}


# =============================================================
# CORS CONFIGURATION (El Hadji Massogui Diop)
# =============================================================

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
    cast=Csv(),
)

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]


# =============================================================
# CHANNELS / REDIS — WebSockets (El Hadji Massogui Diop)
# =============================================================

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [config('REDIS_URL', default='redis://redis:6379/1')],
        },
    },
}


# =============================================================
# MACHINE LEARNING (El Hadji Massogui Diop)
# =============================================================

ML_MODEL_DIR = config('ML_MODEL_DIR', default='ml/trained_models')


# =============================================================
# LOGGING (El Hadji Massogui Diop)
# =============================================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': (
                '[{asctime}] {levelname} {name} {message}'
            ),
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'jappo_dundu.log',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'jappo_dundu': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': True,
        },
        'jappo_dundu.security': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'jappo_dundu.ml': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'jappo_dundu.websockets': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}


# =============================================================
# EMAIL (configuration existante)
# =============================================================

MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}
