"""
Serveur backend des tests de bout en bout (frontend/e2e, Playwright).

1. recrée une base PostgreSQL dédiée (``jappo_e2e`` par défaut) : chaque
   campagne de tests part d'un état connu, sans toucher à la base de
   développement ;
2. applique les migrations et charge les données de démonstration
   (``seed_demo_data.py``) ;
3. démarre le serveur ASGI (HTTP + WebSockets) sur ``E2E_BACKEND_PORT``.

Variables (facultatives) : DB_NAME, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
(lues aussi dans backend/.env), REDIS_URL, E2E_BACKEND_PORT.

Usage : python scripts/e2e_server.py   (lancé par frontend/playwright.config.ts)

Auteur : El Hadji Massogui Diop
"""

import os
import subprocess
import sys
from pathlib import Path

import psycopg2
from decouple import AutoConfig
from psycopg2 import sql

BACKEND_DIR = Path(__file__).resolve().parents[1]
config = AutoConfig(search_path=BACKEND_DIR)

DB_NAME = os.environ.get('DB_NAME', 'jappo_e2e')
if DB_NAME == config('DB_NAME', default='jappo_db'):
    sys.exit(f"Refus : la base E2E ({DB_NAME}) doit être distincte de la base de développement.")

PORT = os.environ.get('E2E_BACKEND_PORT', '8010')

# Windows résout « localhost » d'abord en IPv6 (::1) alors que PostgreSQL et
# Redis (Docker) n'écoutent qu'en IPv4 : ~2 s perdues par connexion, assez
# pour faire expirer la poignée de main WebSocket. On force donc l'IPv4.
DB_HOST = config('DB_HOST', default='127.0.0.1').replace('localhost', '127.0.0.1')

env = {
    **os.environ,
    'DB_NAME': DB_NAME,
    'DB_HOST': DB_HOST,
    'DEBUG': 'True',
    'ALLOWED_HOSTS': 'localhost,127.0.0.1',
    # Base Redis distincte : pas de diffusion croisée avec le serveur de développement.
    'REDIS_URL': os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379/5'),
    'CACHE_REDIS_URL': '',
    # Pas de limitation de débit pendant les tests.
    'THROTTLE_LOGIN_RATE': '1000/minute',
    'PYTHONUNBUFFERED': '1',
}


def recreate_database():
    connection = psycopg2.connect(
        dbname='postgres',
        user=config('DB_USER', default='postgres'),
        password=config('DB_PASSWORD', default=''),
        host=DB_HOST,
        port=config('DB_PORT', default='5432'),
    )
    connection.autocommit = True
    with connection.cursor() as cursor:
        cursor.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(DB_NAME)))
        cursor.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(DB_NAME)))
    connection.close()


def run(*args):
    subprocess.run([sys.executable, *args], cwd=BACKEND_DIR, env=env, check=True)


if __name__ == '__main__':
    print(f"[e2e] Base {DB_NAME} recréée", flush=True)
    recreate_database()
    run('manage.py', 'migrate', '--noinput', '-v', '0')
    run('seed_demo_data.py')
    print(f"[e2e] Serveur sur http://127.0.0.1:{PORT}", flush=True)
    run('manage.py', 'runserver', f'127.0.0.1:{PORT}', '--noreload')
