"""Le catalogue en JSON pour l'éditeur (connexion requise, comme le reste de l'API) :

- GET /api/catalog/ → {"materials": [...], "hardware": [...], "company": {...}}
"""
from __future__ import annotations

from typing import Any

from django.http import JsonResponse

from apps.projects.http import api_view

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


@api_view(("GET",))
def catalog(request):
    return JsonResponse(
        {
            "materials": [material_payload(m) for m in Material.objects.all()],
            "hardware": [hardware_payload(r) for r in HardwareRule.objects.all()],
            "company": company_payload(CompanyProfile.load()),
        }
    )
