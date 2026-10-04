"""
Logique métier de l'application Identity.

Réinitialisation du mot de passe
--------------------------------
1. ``request_reset(identifiant)`` : numéro, identifiant ou e-mail. Si un
   compte actif correspond, un code à 6 chiffres part par SMS (et par e-mail
   si le compte en a un). La réponse de l'API est la même dans tous les cas :
   on ne révèle pas quels numéros ont un compte.
2. ``confirm_reset(identifiant, code, nouveau mot de passe)`` : code valable
   15 minutes, 5 essais au plus, à usage unique. Le mot de passe passe les
   validateurs Django ; toutes les sessions existantes sont fermées.

Le code n'est jamais stocké en clair : seule son empreinte HMAC (clé
SECRET_KEY) est conservée. Trois codes au plus par compte et par heure.

Connexion sociale
-----------------
``social_login(identité)`` retrouve le compte lié (fournisseur + identifiant),
sinon rattache un compte donneur existant ayant la même adresse e-mail
**vérifiée**, sinon crée un compte donneur. Un compte professionnel (admin,
personnel, ambulancier) n'est jamais rattaché automatiquement : il garde sa
connexion par mot de passe.

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

import hashlib
import hmac
import logging
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from security.authentication import resolve_login
from security.roles import Role, get_user_roles
from users.services import create_account, get_profile, revoke_refresh_tokens

from .models import PasswordResetCode, SocialAccount
from .sms import send_sms
from .social import SocialAuthError, SocialIdentity

logger = logging.getLogger('jappo_dundu.identity')
User = get_user_model()

CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5
MAX_CODES_PER_HOUR = 3


class ResetError(Exception):
    """Code refusé (message affichable)."""


def _digest(user_id, code):
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"reset:{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def find_account(identifier):
    """Compte actif désigné par un numéro, un identifiant ou un e-mail ; None sinon."""
    value = (identifier or '').strip()
    if not value:
        return None
    user = User.objects.filter(username__iexact=resolve_login(value), is_active=True).first()
    if user is None and '@' in value:
        user = User.objects.filter(email__iexact=value, is_active=True).first()
    return user


def request_reset(identifier):
    """Envoie un code si un compte correspond ; retourne le code créé (ou None)."""
    user = find_account(identifier)
    if user is None:
        return None
    now = timezone.now()
    recent = PasswordResetCode.objects.filter(user=user, created_at__gte=now - timedelta(hours=1)).count()
    if recent >= MAX_CODES_PER_HOUR:
        logger.warning("Réinitialisation : trop de codes demandés pour user=%s", user.pk)
        return None

    code = f"{secrets.randbelow(10**6):06d}"
    profile = get_profile(user)
    channels = []
    text = (
        f"Jappo Dundu : votre code de réinitialisation est {code}. "
        "Il expire dans 15 minutes. Ne le communiquez à personne."
    )
    if profile.phone_number and send_sms(profile.phone_number, text):
        channels.append('sms')
    if user.email:
        sent = send_mail(
            "Votre code de réinitialisation Jappo Dundu",
            f"Bonjour,\n\n{text}\n\nSi vous n'avez rien demandé, ignorez ce message : "
            "votre mot de passe reste inchangé.\n\nL'équipe Jappo Dundu",
            None,
            [user.email],
            fail_silently=True,
        )
        if sent:
            channels.append('email')
    if not channels:
        logger.warning("Réinitialisation : aucun canal pour user=%s", user.pk)
        return None

    with transaction.atomic():
        # Un nouveau code annule les précédents.
        PasswordResetCode.objects.filter(user=user, used_at__isnull=True, expires_at__gt=now).update(expires_at=now)
        reset = PasswordResetCode.objects.create(
            user=user,
            code_hash=_digest(user.pk, code),
            channels=','.join(channels),
            expires_at=now + CODE_TTL,
        )
    logger.info("Réinitialisation : code envoyé user=%s canaux=%s", user.pk, reset.channels)
    return reset


INVALID_CODE = "Code invalide ou expiré. Demandez-en un nouveau."


def confirm_reset(identifier, code, new_password):
    """Change le mot de passe si le code est bon ; retourne l'utilisateur.

    Lève ResetError (code) ou django ValidationError (mot de passe).
    """
    user = find_account(identifier)
    if user is None or not re.fullmatch(r'\d{6}', code or ''):
        raise ResetError(INVALID_CODE)
    error = None
    with transaction.atomic():
        reset = (
            PasswordResetCode.objects.select_for_update()
            .filter(user=user, used_at__isnull=True, expires_at__gt=timezone.now())
            .order_by('-created_at')
            .first()
        )
        if reset is None or reset.attempts >= MAX_ATTEMPTS:
            error = INVALID_CODE
        elif not hmac.compare_digest(reset.code_hash, _digest(user.pk, code)):
            # L'essai raté est compté puis validé avec la transaction : l'erreur
            # n'est levée qu'après, sinon le compteur serait annulé avec elle.
            reset.attempts += 1
            reset.save(update_fields=['attempts'])
            left = MAX_ATTEMPTS - reset.attempts
            error = f"Code incorrect. Encore {left} essai{'s' if left > 1 else ''}." if left else INVALID_CODE
        else:
            # Validé avant d'utiliser le code : un mot de passe refusé laisse le code valable.
            password_validation.validate_password(new_password, user=user)
            user.set_password(new_password)
            user.save(update_fields=['password'])
            reset.used_at = timezone.now()
            reset.save(update_fields=['used_at'])
    if error:
        raise ResetError(error)
    revoke_refresh_tokens(user)
    logger.info("Mot de passe réinitialisé : user=%s", user.pk)
    return user


def _username_for(identity: SocialIdentity):
    base = re.sub(r'[^\w.@+-]', '', f"{identity.provider}-{identity.uid}")[:140] or identity.provider
    username, n = base, 1
    while User.objects.filter(username__iexact=username).exists():
        n += 1
        username = f"{base}-{n}"
    return username


def social_login(identity: SocialIdentity):
    """Compte correspondant à l'identité externe : (utilisateur, créé ?)."""
    with transaction.atomic():
        account = (
            SocialAccount.objects.select_for_update()
            .select_related('user')
            .filter(provider=identity.provider, uid=identity.uid)
            .first()
        )
        if account is not None:
            if not account.user.is_active:
                raise SocialAuthError("Ce compte est désactivé.", status=403)
            account.last_login_at = timezone.now()
            account.save(update_fields=['last_login_at'])
            return account.user, False

        email = identity.email.strip() if identity.email_verified else ''
        user = User.objects.filter(email__iexact=email).first() if email else None
        if user is not None:
            if not user.is_active:
                raise SocialAuthError("Ce compte est désactivé.", status=403)
            if get_user_roles(user) - {Role.DONOR}:
                raise SocialAuthError(
                    "Ce compte professionnel se connecte avec son identifiant et son mot de passe.",
                    status=403,
                )
        created = user is None
        if created:
            user = create_account(
                username=_username_for(identity),
                password=None,
                role=Role.DONOR,
                first_name=identity.first_name[:150],
                last_name=identity.last_name[:150],
                email=email,
            )
        SocialAccount.objects.create(user=user, provider=identity.provider, uid=identity.uid, email=identity.email[:254])
    logger.info("Connexion %s : user=%s créé=%s", identity.provider, user.pk, created)
    return user, created


def profile_complete(user):
    """Téléphone et région renseignés (requis pour donner : contact et alertes)."""
    profile = get_profile(user)
    return bool(profile.phone_number and profile.region)
