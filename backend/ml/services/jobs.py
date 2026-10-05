"""
Exécution en arrière-plan des prédictions à la demande.

Pourquoi : sous Daphne (ASGI), Django exécute les vues synchrones dans un
seul thread partagé. Un calcul de plusieurs secondes dans la requête gelait
donc TOUTE l'API (lits, sang, missions SAMU) pendant sa durée.

Fonctionnement :
- la vue valide la demande, vérifie qu'un modèle est disponible, puis
  soumet une tâche et répond immédiatement 202 avec son identifiant ;
- la tâche s'exécute dans un thread dédié (un seul worker : les calculs sont
  sérialisés, ils n'écrasent pas les mêmes périmètres en parallèle) ;
- son état est conservé dans le cache Django (Redis en production) et lu
  par ``GET /api/ml/predict/<id>/`` ; la fin du calcul est aussi diffusée
  en temps réel (``prediction_update``), comme auparavant ;
- une demande identique déjà en attente ou en cours est réutilisée plutôt
  que dupliquée ; le périmètre est réservé de façon atomique (``cache.add``)
  pour que deux processus ne lancent pas le même calcul ;
- une tâche restée ``pending``/``running`` au-delà de ``ML_JOB_STALE_SECONDS``
  (processus redémarré pendant le calcul : la file est en mémoire) est
  déclarée échouée et la demande suivante relance le calcul, au lieu de
  bloquer le périmètre jusqu'à l'expiration du cache (1 h).

Limite : la file reste propre à chaque processus. Avec plusieurs workers
Daphne, les calculs ne sont plus sérialisés entre processus ; passer alors à
une file partagée (RQ ou Celery sur le Redis existant).

``ML_PREDICT_ASYNC = False`` exécute la tâche dans la requête (tests) ;
la réponse garde exactement la même forme.

Auteur : El Hadji Massogui Diop
"""

import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections, connections
from django.utils import timezone

logger = logging.getLogger('jappo_dundu.ml')

JOB_TTL_SECONDS = 60 * 60
# Au-delà, une tâche non terminée est considérée comme perdue.
DEFAULT_STALE_SECONDS = 15 * 60
PENDING, RUNNING, SUCCEEDED, FAILED = 'pending', 'running', 'succeeded', 'failed'
TERMINAL = {SUCCEEDED, FAILED}

_executor = None
_executor_lock = threading.Lock()


def _get_executor():
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='ml-predict')
        return _executor


def _job_key(job_id):
    return f'ml-job:{job_id}'


def _scope_key(filters):
    return 'ml-job-scope:{region}:{blood_group}:{days_ahead}'.format(
        region=filters['region'] or '*',
        blood_group=filters['blood_group'] or '*',
        days_ahead=filters['days_ahead'],
    )


def get_job(job_id):
    return cache.get(_job_key(job_id))


def _save(job):
    cache.set(_job_key(job['id']), job, timeout=JOB_TTL_SECONDS)


def _update(job, **changes):
    job.update(changes)
    _save(job)
    return job


def _is_stale(job):
    limit = getattr(settings, 'ML_JOB_STALE_SECONDS', DEFAULT_STALE_SECONDS)
    since = datetime.fromisoformat(job.get('started_at') or job['created_at'])
    return (timezone.now() - since).total_seconds() > limit


def _live_job(scope_key):
    """Tâche en attente ou en cours sur ce périmètre ; libère le périmètre sinon."""
    existing_id = cache.get(scope_key)
    if not existing_id:
        return None
    existing = get_job(existing_id)
    if existing and existing['status'] not in TERMINAL:
        if not _is_stale(existing):
            return existing
        logger.warning("Prédiction %s perdue (aucune fin après le délai) : relancée.", existing['id'])
        _update(
            existing,
            status=FAILED,
            finished_at=timezone.now().isoformat(),
            error="Calcul interrompu (redémarrage du serveur). Relancez la prédiction.",
        )
    cache.delete(scope_key)
    return None


def submit_prediction(user, region=None, blood_group=None, days_ahead=7):
    """Soumet une prédiction ; retourne l'état de la tâche (nouvelle ou réutilisée)."""
    filters = {'region': region, 'blood_group': blood_group, 'days_ahead': days_ahead}
    scope_key = _scope_key(filters)

    existing = _live_job(scope_key)
    if existing:
        return existing

    job = {
        'id': uuid.uuid4().hex,
        'status': PENDING,
        'filters': filters,
        'requested_by': user.pk,
        'created_at': timezone.now().isoformat(),
        'finished_at': None,
        'result': None,
        'error': None,
    }
    _save(job)
    if not cache.add(scope_key, job['id'], timeout=JOB_TTL_SECONDS):
        # Un autre processus vient de réserver ce périmètre : on suit sa tâche.
        winner = get_job(cache.get(scope_key) or '')
        if winner:
            cache.delete(_job_key(job['id']))
            return winner
        cache.set(scope_key, job['id'], timeout=JOB_TTL_SECONDS)

    if getattr(settings, 'ML_PREDICT_ASYNC', True):
        _get_executor().submit(_run_in_thread, job['id'])
        return job
    _run(job)
    return get_job(job['id'])


def _run_in_thread(job_id):
    # Thread hors cycle de requête : connexions base ouvertes et fermées ici.
    close_old_connections()
    try:
        job = get_job(job_id)
        if job is not None:
            _run(job)
    finally:
        connections.close_all()


def _run(job):
    from .predictor import BloodShortagePredictor

    filters = job['filters']
    _update(job, status=RUNNING, started_at=timezone.now().isoformat())
    try:
        run = BloodShortagePredictor().predict_and_save(**filters)
    except Exception as exc:  # noqa: BLE001 — l'échec est restitué au client
        logger.exception("Échec de la prédiction %s", job['id'])
        _update(
            job,
            status=FAILED,
            finished_at=timezone.now().isoformat(),
            error=str(exc) or exc.__class__.__name__,
        )
        return

    logger.info("Prédiction %s terminée : %d résultats", job['id'], run.count)
    _update(
        job,
        status=SUCCEEDED,
        finished_at=timezone.now().isoformat(),
        result={
            'predictions_count': run.count,
            'risk_summary': run.risk_summary(),
            'skipped_series': run.skipped_series,
            'model_version': run.model_version,
        },
    )
