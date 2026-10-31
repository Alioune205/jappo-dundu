"""
Journal d'audit consultable.

``record(request_or_user, action, target=None, facility=None, **detail)`` trace
une action sensible ; l'échec de l'écriture ne bloque jamais l'action métier
(il est seulement journalisé). Actions tracées :

- ``donor.lookup``           : recherche d'un donneur (téléphone ou carte) ;
- ``sos.caller_card``        : consultation de la fiche d'urgence d'un appelant ;
- ``emergency_access.open``  : ouverture d'un accès d'urgence ;
- ``user.role_changed``      : rôle ou établissement d'un compte modifié ;
- ``two_factor.enabled`` / ``two_factor.disabled``.
"""

import logging

logger = logging.getLogger('jappo_dundu.security')


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip() or request.META.get('REMOTE_ADDR')) or None


def record(actor, action, target=None, *, facility=None, **detail):
    from .models import AuditEvent

    request = actor if hasattr(actor, 'META') else None
    user = getattr(request, 'user', None) if request is not None else actor
    try:
        AuditEvent.objects.create(
            user=user if getattr(user, 'is_authenticated', False) else None,
            action=action,
            target_type=type(target).__name__ if target is not None else '',
            target_id=str(getattr(target, 'pk', '') or ''),
            facility=facility,
            detail=detail,
            ip_address=_client_ip(request) if request is not None else None,
        )
    except Exception:  # noqa: BLE001 — l'audit ne bloque jamais l'action
        logger.exception("Écriture du journal d'audit impossible (%s)", action)
