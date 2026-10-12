"""
Services métier d'interopérabilité SIH (Système d'Information Hospitalier).

Gère :
- La synchronisation en masse des lits avec diffusion temps réel (WebSocket)
- Le traitement des événements ADT (Admission / Décharge)
- La synchronisation automatisée des stocks sanguins
- La traçabilité exhaustive via HospitalSyncLog

Auteur : Pape Alioune Sene
"""

import logging
import time
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from lits.models import BedCapacity
from lits.services import notify_capacity
from ml.models import BloodStockRecord
from realtime.broadcast import broadcast_dashboard
from users.exceptions import Conflict

from .models import HospitalApiKey, HospitalSyncLog

logger = logging.getLogger('jappo_dundu.sih')


def log_sync(facility, sync_type, status, items_count, details=None, error_message='', api_key=None, ip_address=None, start_time=None):
    """Enregistre une trace d'audit d'interopérabilité SIH."""
    duration_ms = (time.perf_counter() - start_time) * 1000 if start_time else 0.0
    try:
        HospitalSyncLog.objects.create(
            facility=facility,
            api_key=api_key,
            sync_type=sync_type,
            status=status,
            items_count=items_count,
            details=details or {},
            error_message=error_message,
            ip_address=ip_address,
            duration_ms=round(duration_ms, 2),
        )
    except Exception as exc:
        logger.error("Échec d'enregistrement du log SIH : %s", exc)


@transaction.atomic
def sync_beds_batch(facility, services_data, *, api_key=None, ip_address=None):
    """Synchronise la liste des capacités de lits d'un établissement depuis son SIH."""
    start_time = time.perf_counter()
    results = []

    try:
        for item in services_data:
            cat = item['category']
            total = item['total_beds']
            occupied = item['occupied_beds']

            capacity = (
                BedCapacity.objects.select_for_update()
                .filter(facility=facility, category=cat)
                .first()
            )

            if capacity:
                previous_available = capacity.available_beds
                capacity.total_beds = total
                capacity.occupied_beds = occupied
                capacity.save(update_fields=['total_beds', 'occupied_beds', 'updated_at'])
                notify_capacity(capacity, previous_available)
            else:
                capacity = BedCapacity.objects.create(
                    facility=facility,
                    category=cat,
                    total_beds=total,
                    occupied_beds=occupied,
                )
                notify_capacity(capacity, previous_available=None)

            results.append({
                'id': capacity.id,
                'category': capacity.category,
                'category_display': capacity.get_category_display(),
                'total_beds': capacity.total_beds,
                'occupied_beds': capacity.occupied_beds,
                'available_beds': capacity.available_beds,
                'occupancy_rate': capacity.occupancy_rate,
            })

        log_sync(
            facility=facility,
            sync_type=HospitalSyncLog.SyncType.BEDS_SYNC,
            status=HospitalSyncLog.Status.SUCCESS,
            items_count=len(results),
            details={'categories': [r['category'] for r in results]},
            api_key=api_key,
            ip_address=ip_address,
            start_time=start_time,
        )
        return results

    except Exception as exc:
        log_sync(
            facility=facility,
            sync_type=HospitalSyncLog.SyncType.BEDS_SYNC,
            status=HospitalSyncLog.Status.ERROR,
            items_count=len(results),
            error_message=str(exc),
            api_key=api_key,
            ip_address=ip_address,
            start_time=start_time,
        )
        raise


@transaction.atomic
def process_bed_event(facility, category, action, *, delta=1, patient_ref=None, api_key=None, ip_address=None):
    """Traite un événement unitaire ADT (Admission ou Décharge de lit)."""
    start_time = time.perf_counter()

    capacity = (
        BedCapacity.objects.select_for_update()
        .filter(facility=facility, category=category)
        .first()
    )
    if not capacity:
        raise NotFound(f"Aucun service « {category} » configuré pour cet établissement.")

    previous_available = capacity.available_beds

    try:
        if action == 'admit':
            if capacity.occupied_beds + delta > capacity.total_beds:
                raise Conflict(
                    f"Capacité saturée pour le service {capacity.get_category_display()} : "
                    f"impossible d'admettre {delta} patient(s). Lits libres : {capacity.available_beds}."
                )
            capacity.occupied_beds += delta
        elif action == 'discharge':
            if capacity.occupied_beds < delta:
                raise Conflict(
                    f"Impossible de libérer {delta} lit(s) dans le service {capacity.get_category_display()} : "
                    f"seulement {capacity.occupied_beds} lit(s) occupé(s)."
                )
            capacity.occupied_beds -= delta
        else:
            raise Conflict(f"Action « {action} » inconnue.")

        capacity.save(update_fields=['occupied_beds', 'updated_at'])
        notify_capacity(capacity, previous_available)

        result_data = {
            'category': capacity.category,
            'category_display': capacity.get_category_display(),
            'total_beds': capacity.total_beds,
            'occupied_beds': capacity.occupied_beds,
            'available_beds': capacity.available_beds,
            'action': action,
            'delta': delta,
            'patient_ref': patient_ref,
        }

        log_sync(
            facility=facility,
            sync_type=HospitalSyncLog.SyncType.BEDS_EVENT,
            status=HospitalSyncLog.Status.SUCCESS,
            items_count=1,
            details=result_data,
            api_key=api_key,
            ip_address=ip_address,
            start_time=start_time,
        )
        return result_data

    except Exception as exc:
        log_sync(
            facility=facility,
            sync_type=HospitalSyncLog.SyncType.BEDS_EVENT,
            status=HospitalSyncLog.Status.ERROR,
            items_count=0,
            details={'category': category, 'action': action, 'delta': delta, 'patient_ref': patient_ref},
            error_message=str(exc),
            api_key=api_key,
            ip_address=ip_address,
            start_time=start_time,
        )
        raise


@transaction.atomic
def sync_blood_stocks_batch(facility, stocks_data, *, target_date=None, api_key=None, ip_address=None):
    """Synchronise les stocks de poches de sang depuis le SIH d'un centre/hôpital."""
    start_time = time.perf_counter()
    target_date = target_date or timezone.localdate()
    results = []

    try:
        source_val = getattr(BloodStockRecord.Source, 'SIH', 'manual')
        for item in stocks_data:
            bg = item['blood_group']
            available = item['units_available']
            donated = item.get('units_donated', 0)
            used = item.get('units_used', 0)
            expired = item.get('units_expired', 0)

            record, _ = BloodStockRecord.objects.update_or_create(
                center_name=facility.name,
                blood_group=bg,
                date=target_date,
                defaults={
                    'region': facility.region,
                    'units_available': available,
                    'units_donated': donated,
                    'units_used': used,
                    'units_expired': expired,
                    'source': source_val,
                },
            )

            results.append({
                'id': record.id,
                'blood_group': record.blood_group,
                'units_available': record.units_available,
                'units_donated': record.units_donated,
                'units_used': record.units_used,
                'units_expired': record.units_expired,
                'date': record.date.isoformat(),
            })

        # Diffusion WebSocket temps réel sur le tableau de bord
        broadcast_dashboard(
            'dashboard',
            {
                'event': 'blood_stock_sih_synced',
                'facility_id': facility.pk,
                'center_name': facility.name,
                'region': facility.region,
                'date': target_date.isoformat(),
                'groups_count': len(results),
            },
            hospital_id=facility.pk,
        )

        log_sync(
            facility=facility,
            sync_type=HospitalSyncLog.SyncType.BLOOD_SYNC,
            status=HospitalSyncLog.Status.SUCCESS,
            items_count=len(results),
            details={'date': str(target_date), 'groups': [r['blood_group'] for r in results]},
            api_key=api_key,
            ip_address=ip_address,
            start_time=start_time,
        )
        return results

    except Exception as exc:
        log_sync(
            facility=facility,
            sync_type=HospitalSyncLog.SyncType.BLOOD_SYNC,
            status=HospitalSyncLog.Status.ERROR,
            items_count=len(results),
            error_message=str(exc),
            api_key=api_key,
            ip_address=ip_address,
            start_time=start_time,
        )
        raise


def get_facility_sih_summary(facility):
    """Retourne la synthèse complète de l'état des ressources synchronisées pour l'établissement."""
    capacities = facility.bed_capacities.all()
    total_installed = sum(c.total_beds for c in capacities)
    total_occupied = sum(c.occupied_beds for c in capacities)
    total_available = total_installed - total_occupied
    global_rate = round((total_occupied / total_installed * 100), 1) if total_installed > 0 else 0.0

    last_log = facility.sih_sync_logs.first()

    return {
        'facility': {
            'id': facility.id,
            'name': facility.name,
            'region': facility.region,
            'city': facility.city,
            'facility_type': facility.facility_type,
            'is_active': facility.is_active,
        },
        'beds_summary': {
            'services_count': capacities.count(),
            'total_installed': total_installed,
            'total_occupied': total_occupied,
            'total_available': total_available,
            'occupancy_rate_percent': global_rate,
            'services': [
                {
                    'category': c.category,
                    'category_display': c.get_category_display(),
                    'total_beds': c.total_beds,
                    'occupied_beds': c.occupied_beds,
                    'available_beds': c.available_beds,
                    'occupancy_rate': c.occupancy_rate,
                    'updated_at': c.updated_at,
                }
                for c in capacities
            ],
        },
        'last_sync': {
            'type': last_log.sync_type if last_log else None,
            'status': last_log.status if last_log else None,
            'timestamp': last_log.created_at if last_log else None,
        } if last_log else None,
    }
