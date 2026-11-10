"""Le catalogue en JSON pour l'éditeur (connexion requise, comme le reste de l'API) :

- GET  /api/catalog/        → {"materials": [...], "hardware": [...], "company": {...}, "rates": {...}}
- GET  also says ``canEdit``: whether this account may change the workshop's rates (the staff only)
- POST /api/catalog/rates/  {waste?, band?, cutPerPart?, hoursPerPart?, hourly?, perHole?, margin?, vat?} → {"rates": {...}}
  (the quote's rates changed from the editor's quote: kept for every computer); 403 for an account not of the staff
"""
from __future__ import annotations

from typing import Any

from django.http import JsonResponse

from apps.projects.http import ApiError, api_view, read_json_body

from .models import CompanyProfile, HardwareRule, Material


def material_payload(m: Material) -> dict[str, Any]:
    return {
        "id": f"catalog-{m.pk}",
        "name": m.name,
        "thickness": m.thickness,
        "price": m.price_per_m2,
        "color": m.color,
        "category": m.category,
        "sheet": [m.sheet_width, m.sheet_length],
        "default": m.is_default,
    }


def hardware_payload(r: HardwareRule) -> dict[str, Any]:
    return {
        "name": r.name,
        "description": r.description,
        "unit": r.unit,
        "price": r.unit_price,
        "quantity": r.default_quantity,
        "mode": r.auto_mode,
        "perUnit": r.auto_per_unit,
    }


def company_payload(p: CompanyProfile) -> dict[str, Any]:
    return {
        "name": p.name,
        "slogan": p.slogan,
        "address": p.address,
        "phone": p.phone,
        "email": p.email,
        "website": p.website,
        "logo": p.logo,
    }


def rates_payload(p: CompanyProfile) -> dict[str, float]:
    return {name: getattr(p, field) for field, name in CompanyProfile.RATES.items()}


@api_view(("GET",))
def catalog(request):
    profile = CompanyProfile.load()
    return JsonResponse(
        {
            "materials": [material_payload(m) for m in Material.objects.all()],
            "hardware": [hardware_payload(r) for r in HardwareRule.objects.all()],
            "company": company_payload(profile),
            "rates": rates_payload(profile),
            "canEdit": request.user.is_staff,
        }
    )


@api_view(("POST",))
def rates(request):
    if not request.user.is_staff:
        raise ApiError(403, "Seul le personnel de l'atelier peut changer les tarifs du devis.")
    data = read_json_body(request)
    if not isinstance(data, dict):
        raise ApiError(400, "Tarifs invalides.")
    profile = CompanyProfile.load()
    changed = []
    for field, name in CompanyProfile.RATES.items():
        if name not in data:
            continue
        value = data[name]
        if type(value) not in (int, float) or not 0 <= value <= 1_000_000:
            raise ApiError(400, "Tarifs invalides.", [f"« {name} » doit être un nombre positif."])
        setattr(profile, field, float(value))
        changed.append(field)
    try:
        profile.full_clean(exclude=["logo"])
    except Exception as exc:  # A rate out of its bounds (VAT over 100 %…).
        raise ApiError(400, "Tarifs invalides.", [str(exc)]) from None
    if changed:
        profile.save(update_fields=[*changed, "updated_at"])
    return JsonResponse({"rates": rates_payload(profile)})
