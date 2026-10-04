#!/usr/bin/env python3
"""
Scénarios de vérification MVP de Jappo Dundu (tests de bout en bout).

Exécute contre un déploiement réel (poste local ou serveur) les scénarios
décrits dans deploy/MVP_TEST_SCENARIOS.md, affiche PASS/FAIL pour chacun
et se termine avec le code 1 si un scénario échoue.

Prérequis :
    pip install -r deploy/requirements-smoke.txt

Usage :
    python deploy/smoke_test.py --base-url https://jappodundu.example.sn \\
        --username admin --password '...' --check-frontend

Les identifiants peuvent aussi être fournis par les variables
SMOKE_BASE_URL, SMOKE_USERNAME et SMOKE_PASSWORD. Le compte doit être
administrateur (is_staff).

Auteur : El Hadji Massogui Diop
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect as ws_connect

TIMEOUT = 20


@dataclass
class Response:
    status: int
    headers: dict
    body: object


@dataclass
class Context:
    base_url: str
    username: str
    password: str
    cors_origin: str | None
    check_frontend: bool
    state: dict = field(default_factory=dict)

    @property
    def ws_url(self):
        return self.base_url.replace('https://', 'wss://', 1).replace('http://', 'ws://', 1)


def http(ctx, method, path, token=None, payload=None, headers=None):
    request = urllib.request.Request(ctx.base_url + path, method=method)
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    if token:
        request.add_header('Authorization', f'Bearer {token}')
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        request.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(request, data=data, timeout=TIMEOUT) as raw:
            status, response_headers, content = raw.status, raw.headers, raw.read()
    except urllib.error.HTTPError as error:
        status, response_headers, content = error.code, error.headers, error.read()
    text = content.decode('utf-8', errors='replace')
    try:
        body = json.loads(text)
    except ValueError:
        body = text
    return Response(status, {k.lower(): v for k, v in response_headers.items()}, body)


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_status(response, expected, what):
    expect(
        response.status == expected,
        f"{what} : HTTP {response.status} (attendu {expected}) — {str(response.body)[:200]}",
    )


def login(ctx):
    response = http(ctx, 'POST', '/api/auth/token/', payload={
        'username': ctx.username, 'password': ctx.password,
    })
    expect_status(response, 200, "connexion")
    return response.body


# --- Scénarios ------------------------------------------------------------

def s01_health(ctx):
    response = http(ctx, 'GET', '/api/health/')
    expect_status(response, 200, "sonde")
    expect(response.body.get('status') == 'healthy', f"statut : {response.body}")
    return "API vivante"


def s02_security_headers(ctx):
    response = http(ctx, 'GET', '/api/ml/predictions/')
    required = {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'cache-control': 'no-store',
    }
    for name, value in required.items():
        expect(response.headers.get(name) == value, f"en-tête {name} = {response.headers.get(name)!r}")
    expect('x-request-id' in response.headers, "X-Request-ID absent")
    return "nosniff, DENY, no-store, X-Request-ID"


def s03_protected_route(ctx):
    expect_status(http(ctx, 'GET', '/api/ml/predictions/'), 401, "route protégée sans token")
    return "401 sans token"


def s04_bad_credentials(ctx):
    response = http(ctx, 'POST', '/api/auth/token/', payload={
        'username': ctx.username, 'password': ctx.password + '-faux',
    })
    expect_status(response, 401, "mauvais mot de passe")
    return "401"


def s05_login(ctx):
    body = login(ctx)
    expect('access' in body and 'refresh' in body, "tokens absents")
    expect(body['user']['role'] == 'admin', f"rôle : {body['user'].get('role')} (compte admin requis)")
    ctx.state.update(access=body['access'], refresh=body['refresh'])
    return f"connecté en tant que {body['user']['username']} (admin)"


def s06_system_status(ctx):
    response = http(ctx, 'GET', '/api/status/', token=ctx.state['access'])
    expect_status(response, 200, "état du système")
    checks = response.body['checks']
    expect(checks['database']['status'] == 'up', f"base : {checks['database']}")
    expect(checks['channel_layer']['status'] == 'up', f"channel layer : {checks['channel_layer']}")
    return (
        f"base {checks['database'].get('engine')}, "
        f"temps réel {checks['channel_layer'].get('backend')}, "
        f"modèle ML {checks['ml_model']['status']}"
    )


def s07_ml_model(ctx):
    response = http(ctx, 'GET', '/api/ml/model-info/', token=ctx.state['access'])
    expect(
        response.status == 200,
        "aucun modèle actif : exécuter 'python manage.py train_model' sur le serveur",
    )
    model = response.body['model']
    metrics = model['metrics']
    return (
        f"v{model['version']} — MAE {metrics.get('mae')} "
        f"(baseline {metrics.get('baseline_mae')}), "
        f"rappel pénuries {metrics.get('critical_recall')}"
    )


def s08_ws_rejects_anonymous(ctx):
    with ws_connect(ctx.ws_url + '/ws/alerts/', open_timeout=TIMEOUT) as ws:
        try:
            ws.recv(timeout=5)
        except ConnectionClosed as closed:
            code = closed.rcvd.code if closed.rcvd else None
            expect(code == 4401, f"code de fermeture {code} (attendu 4401)")
            return "connexion anonyme fermée (4401)"
    raise AssertionError("la connexion anonyme n'a pas été fermée")


def s09_s10_realtime_prediction(ctx):
    """WebSocket authentifié puis prédiction diffusée en temps réel."""
    # Le JWT ne va jamais dans l'URL : on l'échange contre un ticket à usage unique.
    ticket = http(ctx, 'POST', '/api/realtime/ticket/', token=ctx.state['access'])
    expect_status(ticket, 201, "ticket WebSocket")
    url = f"{ctx.ws_url}/ws/dashboard/?ticket={ticket.body['ticket']}"
    with ws_connect(url, open_timeout=TIMEOUT) as ws:
        welcome = json.loads(ws.recv(timeout=10))
        expect(welcome['type'] == 'connection_established', f"accueil : {welcome}")
        ws.send(json.dumps({'type': 'ping'}))
        expect(json.loads(ws.recv(timeout=10)) == {'type': 'pong'}, "pas de pong")

        response = http(ctx, 'POST', '/api/ml/predict/', token=ctx.state['access'],
                        payload={'days_ahead': 7})
        # Le calcul tourne en arrière-plan : réponse immédiate 202 + identifiant de tâche.
        expect_status(response, 202, "prédiction à la demande")
        job_id = response.body['job_id']

        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            message = json.loads(ws.recv(timeout=max(0.1, deadline - time.monotonic())))
            if message['type'] == 'prediction_update':
                data = message['data']
                job = http(ctx, 'GET', f'/api/ml/predict/{job_id}/', token=ctx.state['access'])
                expect_status(job, 200, "état de la tâche de prédiction")
                expect(job.body['status'] == 'succeeded', f"tâche : {job.body}")
                ctx.state['predictions_count'] = job.body['predictions_count']
                expect(
                    data['predictions_count'] == ctx.state['predictions_count'],
                    f"diffusion incohérente : {data}",
                )
                return (
                    f"{data['predictions_count']} prédictions, diffusées en temps réel "
                    f"({data['risk_summary']})"
                )
    raise AssertionError("aucun prediction_update reçu en 30 s")


def s11_predictions_listing(ctx):
    response = http(ctx, 'GET', '/api/ml/predictions/', token=ctx.state['access'])
    expect_status(response, 200, "liste des prédictions")
    expect(
        response.body['count'] == ctx.state.get('predictions_count'),
        f"{response.body['count']} prédictions listées, "
        f"{ctx.state.get('predictions_count')} générées",
    )
    summary = http(ctx, 'GET', '/api/ml/predictions/summary/', token=ctx.state['access'])
    expect_status(summary, 200, "synthèse par région")
    top = summary.body[0] if summary.body else {}
    return f"{response.body['count']} prédictions ; région la plus critique : {top.get('region_display')}"


def s12_refresh_rotation(ctx):
    old_refresh = ctx.state['refresh']
    response = http(ctx, 'POST', '/api/auth/token/refresh/', payload={'refresh': old_refresh})
    expect_status(response, 200, "rafraîchissement")
    ctx.state['refresh'] = response.body['refresh']
    replay = http(ctx, 'POST', '/api/auth/token/refresh/', payload={'refresh': old_refresh})
    expect_status(replay, 401, "réutilisation de l'ancien refresh token")
    return "nouveau refresh émis, ancien révoqué"


def s13_logout(ctx):
    refresh = ctx.state['refresh']
    expect_status(
        http(ctx, 'POST', '/api/auth/logout/', payload={'refresh': refresh}), 200, "déconnexion"
    )
    reuse = http(ctx, 'POST', '/api/auth/token/refresh/', payload={'refresh': refresh})
    expect_status(reuse, 401, "refresh après déconnexion")
    return "refresh token révoqué"


def s14_cors(ctx):
    def preflight(origin):
        return http(ctx, 'OPTIONS', '/api/auth/token/', headers={
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
        })

    allowed = preflight(ctx.cors_origin)
    expect(
        allowed.headers.get('access-control-allow-origin') == ctx.cors_origin,
        f"origine autorisée refusée : {allowed.headers.get('access-control-allow-origin')}",
    )
    denied = preflight('https://site-malveillant.example')
    expect('access-control-allow-origin' not in denied.headers, "origine inconnue acceptée")
    return f"{ctx.cors_origin} autorisée, origine inconnue refusée"


def s15_frontend(ctx):
    home = http(ctx, 'GET', '/')
    expect_status(home, 200, "page d'accueil")
    expect('text/html' in home.headers.get('content-type', ''), "la racine ne sert pas de HTML")
    deep_link = http(ctx, 'GET', '/tableau-de-bord/stocks')
    expect_status(deep_link, 200, "lien profond de l'application monopage")
    return "frontend servi, routes de l'application monopage redirigées vers index.html"


SCENARIOS = [
    ('S01', "Sonde de vivacité", s01_health, None),
    ('S02', "En-têtes de sécurité", s02_security_headers, None),
    ('S03', "Route protégée sans token", s03_protected_route, None),
    ('S04', "Connexion refusée (mauvais mot de passe)", s04_bad_credentials, None),
    ('S05', "Connexion administrateur (JWT)", s05_login, None),
    ('S06', "État des dépendances", s06_system_status, 'S05'),
    ('S07', "Modèle ML actif", s07_ml_model, 'S05'),
    ('S08', "WebSocket anonyme refusé", s08_ws_rejects_anonymous, None),
    ('S09', "WebSocket + prédiction diffusée en temps réel", s09_s10_realtime_prediction, 'S07'),
    ('S11', "Prédictions consultables", s11_predictions_listing, 'S09'),
    ('S12', "Rotation du refresh token", s12_refresh_rotation, 'S05'),
    ('S13', "Déconnexion (révocation)", s13_logout, 'S12'),
    ('S14', "CORS", s14_cors, None),
    ('S15', "Hébergement du frontend", s15_frontend, None),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--base-url', default=os.environ.get('SMOKE_BASE_URL', 'http://localhost'))
    parser.add_argument('--username', default=os.environ.get('SMOKE_USERNAME'))
    parser.add_argument('--password', default=os.environ.get('SMOKE_PASSWORD'))
    parser.add_argument('--cors-origin', help="Origine autorisée à vérifier (ex. http://localhost:3000).")
    parser.add_argument('--check-frontend', action='store_true', help="Vérifier le frontend servi.")
    args = parser.parse_args()
    if not args.username or not args.password:
        parser.error("identifiants requis (--username/--password ou SMOKE_USERNAME/SMOKE_PASSWORD)")

    ctx = Context(
        base_url=args.base_url.rstrip('/'),
        username=args.username,
        password=args.password,
        cors_origin=args.cors_origin,
        check_frontend=args.check_frontend,
    )
    print(f"Scénarios MVP Jappo Dundu — {ctx.base_url}\n")

    results = {}
    for scenario_id, title, run, requires in SCENARIOS:
        if scenario_id == 'S14' and not ctx.cors_origin:
            status, detail = 'SKIP', "--cors-origin non fourni"
        elif scenario_id == 'S15' and not ctx.check_frontend:
            status, detail = 'SKIP', "--check-frontend non demandé"
        elif requires and results.get(requires) != 'PASS':
            status, detail = 'FAIL', f"prérequis {requires} en échec"
        else:
            try:
                status, detail = 'PASS', run(ctx)
            except Exception as exc:  # noqa: BLE001 — rapport, pas de crash
                status, detail = 'FAIL', f"{type(exc).__name__}: {exc}"
        results[scenario_id] = status
        print(f"[{status}] {scenario_id} {title} — {detail}")

    failed = [s for s, status in results.items() if status == 'FAIL']
    passed = sum(status == 'PASS' for status in results.values())
    print(f"\n{passed} réussi(s), {len(failed)} échec(s), "
          f"{len(results) - passed - len(failed)} ignoré(s).")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
