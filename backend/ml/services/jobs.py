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
  que dupliquée.

``ML_PREDICT_ASYNC = False`` exécute la tâche dans la requête (tests) ;
la réponse garde exactement la même forme.

Auteur : El Hadji Massogui Diop
"""

import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections, connections
from django.utils import timezone

logger = logging.getLogger('jappo_dundu.ml')

JOB_TTL_SECONDS = 60 * 60
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


def submit_prediction(user, region=None, blood_group=None, days_ahead=7):
    """Soumet une prédiction ; retourne l'état de la tâche (nouvelle ou réutilisée)."""
    filters = {'region': region, 'blood_group': blood_group, 'days_ahead': days_ahead}
    scope_key = _scope_key(filters)

    existing_id = cache.get(scope_key)
    if existing_id:
        existing = get_job(existing_id)
        if existing and existing['status'] not in TERMINAL:
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
