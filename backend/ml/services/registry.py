"""
Registre des modèles entraînés : stockage, chargement et cache.

- Les fichiers sont stockés dans ``settings.ML_MODEL_DIR`` ; la base ne
  garde que le nom du fichier (portable entre poste local et conteneur).
- Le chargement n'accepte que des fichiers de ce répertoire (joblib
  exécute du code à la désérialisation : aucun chemin arbitraire).
- Le modèle actif est gardé en mémoire et rechargé seulement si le modèle
  actif ou son fichier changent.

Auteur : El Hadji Massogui Diop
"""

import logging
import os
import re
import threading
from pathlib import Path, PureWindowsPath

import joblib
import sklearn
from django.conf import settings

logger = logging.getLogger('jappo_dundu.ml')

MODEL_FORMAT_VERSION = 2
_VERSION_PATTERN = re.compile(r'^[A-Za-z0-9._-]{1,50}$')

_cache = {'key': None, 'bundle': None}
_cache_lock = threading.Lock()


class ModelNotAvailableError(Exception):
    """Aucun modèle utilisable (non entraîné, fichier absent ou obsolète)."""


def model_dir():
    return Path(settings.ML_MODEL_DIR)


def validate_version(version):
    if not _VERSION_PATTERN.match(version or ''):
        raise ValueError(
            "Version invalide : 1 à 50 caractères parmi lettres, chiffres, "
            "'.', '_' et '-'."
        )
    return version


def model_filename(version):
    return f'blood_shortage_v{validate_version(version)}.joblib'


def resolve_model_path(stored_name):
    """Chemin du fichier modèle, toujours à l'intérieur de ML_MODEL_DIR.

    Accepte aussi les anciens enregistrements contenant un chemin absolu
    (Windows ou POSIX) : seul le nom de fichier est conservé.
    """
    return model_dir() / PureWindowsPath(stored_name).name


def save_bundle(bundle, version):
    """Écrit le bundle de façon atomique et retourne le nom du fichier."""
    directory = model_dir()
    directory.mkdir(parents=True, exist_ok=True)
    filename = model_filename(version)
    path = directory / filename
    if path.exists():
        raise ValueError(f"Un fichier modèle existe déjà pour la version {version}.")

    temporary = path.with_suffix('.tmp')
    joblib.dump(bundle, temporary, compress=3)
    os.replace(temporary, path)
    logger.info("Modèle sauvegardé : %s", path)
    return filename


def _active_metadata():
    from ml.models import MLModelMetadata

    return MLModelMetadata.objects.filter(is_active=True).first()


def load_active_bundle():
    """Retourne le bundle du modèle actif (mis en cache)."""
    metadata = _active_metadata()
    if metadata is None:
        raise ModelNotAvailableError(
            "Aucun modèle actif. Exécutez 'python manage.py train_model'."
        )

    path = resolve_model_path(metadata.model_file_path)
    try:
        cache_key = (str(path), path.stat().st_mtime_ns)
    except FileNotFoundError:
        logger.error("Fichier du modèle actif introuvable : %s", path)
        raise ModelNotAvailableError(
            f"Fichier du modèle v{metadata.version} introuvable. "
            "Ré-entraînez le modèle."
        ) from None

    with _cache_lock:
        if _cache['key'] == cache_key:
            return _cache['bundle']

        bundle = joblib.load(path)
        if (
            not isinstance(bundle, dict)
            or bundle.get('format_version') != MODEL_FORMAT_VERSION
        ):
            raise ModelNotAvailableError(
                f"Le modèle v{metadata.version} utilise un format obsolète. "
                "Ré-entraînez le modèle."
            )
        if bundle.get('sklearn_version') != sklearn.__version__:
            logger.warning(
                "Modèle entraîné avec scikit-learn %s, exécuté avec %s : "
                "ré-entraînez-le dans l'environnement de production.",
                bundle.get('sklearn_version'), sklearn.__version__,
            )

        _cache.update(key=cache_key, bundle=bundle)
        logger.info("Modèle v%s chargé en mémoire.", bundle['version'])
        return bundle


def clear_cache():
    with _cache_lock:
        _cache.update(key=None, bundle=None)


def active_model_status():
    """État du modèle actif pour la supervision (sans le charger)."""
    metadata = _active_metadata()
    if metadata is None:
        return {'status': 'not_trained'}
    if not resolve_model_path(metadata.model_file_path).is_file():
        return {'status': 'missing_file', 'version': metadata.version}
    return {
        'status': 'up',
        'version': metadata.version,
        'trained_at': metadata.trained_at.isoformat(),
    }
