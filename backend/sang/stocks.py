"""
Stock de sang et commandes de poches.

Une urgence se traite d'abord avec le **stock** : une poche donnée
aujourd'hui doit encore être qualifiée (analyses, préparation) avant d'être
transfusée. Le parcours d'un hôpital est donc :

1. chercher les poches compatibles en stock autour de lui (``find_stock``) ;
2. les commander au centre qui les détient (``create_order``) ;
3. le centre accepte, puis expédie : son stock baisse (``dispatch``) ;
4. l'hôpital confirme la réception : la demande de sang liée est couverte
   d'autant (``deliver``) ;
5. si aucun stock ne suffit, les donneurs sont alertés (sang/alerts.py).

Les transitions sont atomiques ; un stock ne devient jamais négatif (mise à
jour SQL conditionnelle).
"""

import logging

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from geo.search import nearest
from realtime import escalation
from realtime.broadcast import broadcast_dashboard
from realtime.models import CriticalAlert
from users.exceptions import Conflict
from users.models import HealthFacility

from .compatibility import compatible_supply_groups
from .models import BloodRequest, BloodStock, BloodSupplyOrder

logger = logging.getLogger('jappo_dundu.sang')

OrderStatus = BloodSupplyOrder.Status

STOCK_UPDATED = 'blood_stock_updated'
ORDER_CREATED = 'blood_order_created'
ORDER_UPDATED = 'blood_order_updated'

# Établissements qui tiennent un stock : centres de transfusion et dépôts hospitaliers.
STOCK_FACILITY_TYPES = (
    HealthFacility.FacilityType.BLOOD_BANK,
    HealthFacility.FacilityType.HOSPITAL,
    HealthFacility.FacilityType.CLINIC,
)


# =============================================================
# DIFFUSION
# =============================================================


def _stock_payload(stock):
    return {
        'event': STOCK_UPDATED,
        'facility_id': stock.facility_id,
        'blood_group': stock.blood_group,
        'component': stock.component,
        'units_available': stock.units_available,
        'units_expiring_soon': stock.units_expiring_soon,
    }


def _order_payload(order, event):
    return {
        'event': event,
        'order_id': order.pk,
        'status': order.status,
        'blood_group': order.blood_group,
        'component': order.component,
        'units': order.units,
        'urgency': order.urgency,
        'requester': {'id': order.requester_id, 'name': order.requester.name},
        'supplier': {'id': order.supplier_id, 'name': order.supplier.name},
    }


def _notify_order(order, event):
    payload = _order_payload(order, event)

    def send():
        # Flux des tableaux de bord (personnel) des deux établissements : le
        # flux d'alertes atteint aussi les donneurs, qui n'ont pas à voir les
        # échanges de poches entre établissements.
        for facility_id in {order.requester_id, order.supplier_id}:
            broadcast_dashboard('dashboard', payload, hospital_id=facility_id)

    transaction.on_commit(send)


def _notify_stock(stock):
    payload = _stock_payload(stock)
    transaction.on_commit(lambda: broadcast_dashboard('dashboard', payload, hospital_id=stock.facility_id))


# =============================================================
# STOCK
# =============================================================


@transaction.atomic
def set_stock(facility, *, blood_group, component, units_available, units_expiring_soon=0, updated_by=None):
    """Déclare le stock d'une ligne (inventaire) ; crée la ligne si besoin."""
    if facility.facility_type not in STOCK_FACILITY_TYPES:
        raise Conflict("Cet établissement ne tient pas de stock de sang.")
    if units_expiring_soon > units_available:
        raise Conflict("Les poches périmant bientôt ne peuvent pas dépasser les poches disponibles.")
    stock, _ = BloodStock.objects.select_for_update().get_or_create(
        facility=facility, blood_group=blood_group, component=component
    )
    stock.units_available = units_available
    stock.units_expiring_soon = units_expiring_soon
    stock.updated_by = updated_by
    stock.save()
    _notify_stock(stock)
    return stock


def find_stock(point, *, blood_group, component, units=1, radius_km=100, limit=10, exclude=None):
    """Établissements proches ayant des poches compatibles, ceux qui couvrent tout le besoin d'abord.

    Chaque établissement porte ``distance_m``, ``stock_lines`` (groupe,
    poches, périmant bientôt ; groupe identique d'abord) et ``total_units``.
    """
    groups = compatible_supply_groups(blood_group, component)
    queryset = HealthFacility.objects.filter(
        is_active=True,
        blood_stocks__component=component,
        blood_stocks__blood_group__in=groups,
        blood_stocks__units_available__gt=0,
    ).distinct()
    if exclude is not None:
        queryset = queryset.exclude(pk=exclude.pk)
    facilities = nearest(queryset, point, radius_m=radius_km * 1000, limit=limit)
    rank = {group: index for index, group in enumerate(groups)}
    lines = BloodStock.objects.filter(
        facility__in=facilities, component=component, blood_group__in=groups, units_available__gt=0
    ).values('facility_id', 'blood_group', 'units_available', 'units_expiring_soon')
    by_facility = {}
    for line in lines:
        by_facility.setdefault(line['facility_id'], []).append(line)
    for facility in facilities:
        facility.stock_lines = sorted(by_facility.get(facility.pk, []), key=lambda line: rank[line['blood_group']])
        facility.total_units = sum(line['units_available'] for line in facility.stock_lines)
    # Couvre tout le besoin d'abord, puis le plus proche (ordre de ``nearest``, tri stable).
    return sorted(facilities, key=lambda facility: facility.total_units < units)


def expiring_summary(facility_ids=None):
    """Poches périmant bientôt, par établissement (à transférer ou utiliser en priorité)."""
    queryset = BloodStock.objects.filter(units_expiring_soon__gt=0)
    if facility_ids is not None:
        queryset = queryset.filter(facility_id__in=facility_ids)
    return queryset.values('facility_id', 'facility__name').annotate(units=Sum('units_expiring_soon'))


# =============================================================
# COMMANDES
# =============================================================


def _locked(order):
    # Toute réponse du fournisseur (ou annulation) clôt l'alerte critique éventuelle.
    escalation.resolve(CriticalAlert.Kind.BLOOD_ORDER, order)
    return BloodSupplyOrder.objects.select_for_update().select_related('requester', 'supplier').get(pk=order.pk)


@transaction.atomic
def create_order(*, requester, supplier, blood_group, component, units, created_by, urgency=None, blood_request=None, note=''):
    if requester.pk == supplier.pk:
        raise Conflict("Un établissement ne se commande pas de poches à lui-même.")
    if not (requester.is_active and supplier.is_active):
        raise Conflict("Établissement désactivé.")
    if blood_request is not None:
        if blood_request.facility_id != requester.pk:
            raise Conflict("La demande liée appartient à un autre établissement.")
        if not blood_request.is_open:
            raise Conflict("La demande liée est clôturée.")
        urgency = urgency or blood_request.urgency
        if blood_group not in compatible_supply_groups(blood_request.blood_group, component):
            raise Conflict("Ces poches ne sont pas compatibles avec le receveur de la demande.")
    order = BloodSupplyOrder.objects.create(
        requester=requester,
        supplier=supplier,
        blood_request=blood_request,
        blood_group=blood_group,
        component=component,
        units=units,
        urgency=urgency or BloodRequest.Urgency.URGENT,
        note=note,
        created_by=created_by,
    )
    _notify_order(order, ORDER_CREATED)
    if order.urgency == BloodRequest.Urgency.CRITICAL:
        escalation.raise_alert(
            CriticalAlert.Kind.BLOOD_ORDER,
            order,
            title=f"Commande critique : {order.units} × {order.blood_group}",
            message=f"{supplier.name} : accepter ou refuser la commande de {requester.name}.",
            facility=supplier,
            region=supplier.region,
        )
    logger.info("Commande %s : %d × %s %s, %s → %s", order.pk, units, blood_group, component, requester.pk, supplier.pk)
    return order


@transaction.atomic
def accept_order(order, *, note=''):
    order = _locked(order)
    if order.status != OrderStatus.REQUESTED:
        raise Conflict("Seule une commande envoyée peut être acceptée.")
    order.status = OrderStatus.ACCEPTED
    order.accepted_at = timezone.now()
    order.answer_note = note or order.answer_note
    order.save()
    _notify_order(order, ORDER_UPDATED)
    return order


@transaction.atomic
def refuse_order(order, *, note):
    order = _locked(order)
    if order.status not in (OrderStatus.REQUESTED, OrderStatus.ACCEPTED):
        raise Conflict("Cette commande ne peut plus être refusée.")
    order.status = OrderStatus.REFUSED
    order.answer_note = note
    order.closed_at = timezone.now()
    order.save()
    _notify_order(order, ORDER_UPDATED)
    return order


@transaction.atomic
def dispatch_order(order, *, note='', updated_by=None):
    """Poches parties : le stock du fournisseur baisse (409 s'il n'en a plus assez)."""
    order = _locked(order)
    if order.status not in (OrderStatus.REQUESTED, OrderStatus.ACCEPTED):
        raise Conflict("Seule une commande envoyée ou acceptée peut être expédiée.")
    updated = BloodStock.objects.filter(
        facility=order.supplier,
        blood_group=order.blood_group,
        component=order.component,
        units_available__gte=order.units,
    ).update(units_available=F('units_available') - order.units, updated_by=updated_by, updated_at=timezone.now())
    if not updated:
        raise Conflict("Stock insuffisant pour expédier cette commande : mettez l'inventaire à jour.")
    stock = BloodStock.objects.get(facility=order.supplier, blood_group=order.blood_group, component=order.component)
    if stock.units_expiring_soon > stock.units_available:
        stock.units_expiring_soon = stock.units_available
        stock.save(update_fields=['units_expiring_soon'])
    now = timezone.now()
    order.status = OrderStatus.DISPATCHED
    order.accepted_at = order.accepted_at or now
    order.dispatched_at = now
    order.answer_note = note or order.answer_note
    order.save()
    _notify_stock(stock)
    _notify_order(order, ORDER_UPDATED)
    return order


@transaction.atomic
def deliver_order(order):
    """Poches reçues : la demande de sang liée est couverte d'autant."""
    from . import notifications, services

    order = _locked(order)
    if order.status != OrderStatus.DISPATCHED:
        raise Conflict("Seule une commande en route peut être reçue.")
    now = timezone.now()
    order.status = OrderStatus.DELIVERED
    order.delivered_at = order.closed_at = now
    order.save()
    if order.blood_request_id:
        blood_request = services._locked_request(order.blood_request)
        if blood_request.is_open:
            blood_request.units_collected = min(blood_request.units_needed, blood_request.units_collected + order.units)
            event = notifications.REQUEST_UPDATED
            if blood_request.units_remaining == 0:
                services._close(blood_request, BloodRequest.Status.FULFILLED)
                event = notifications.REQUEST_CLOSED
            blood_request.save()
            notifications.notify_request(blood_request, event)
    _notify_order(order, ORDER_UPDATED)
    return order


@transaction.atomic
def cancel_order(order):
    order = _locked(order)
    if order.status not in (OrderStatus.REQUESTED, OrderStatus.ACCEPTED):
        raise Conflict("Une commande en route ne s'annule plus : confirmez sa réception.")
    order.status = OrderStatus.CANCELLED
    order.closed_at = timezone.now()
    order.save()
    _notify_order(order, ORDER_UPDATED)
    return order
