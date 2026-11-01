"""Client links and comments.

Owner API (session auth + CSRF, JSON errors like api.py):
- GET    /api/projects/<uuid>/shares/                → {"shares": [{token, url, title, summary, allow_comments, created_at, revoked, comments}]}
- POST   /api/projects/<uuid>/shares/                → 201 share (multipart: ``model`` GLB file, ``title``, ``summary`` JSON, ``allow_comments``;
                                                       and the variants a client may choose: ``variant_<i>`` GLB files, named and priced
                                                       by ``summary.variants`` [{name, price?, size?}])
- DELETE /api/projects/<uuid>/shares/<token>/        → share, revoked (the link stops working)
- GET    /api/projects/<uuid>/comments/              → {"comments": [...]}
- POST   /api/projects/<uuid>/comments/              → 201 comment (JSON {body, token?}): the owner's reply
- PATCH  /api/projects/<uuid>/comments/<id>/         → comment (JSON {resolved})

Public, by token (no account): the page /s/<token>/, its model /s/<token>/model.glb (a variant's:
/s/<token>/variants/<i>.glb), and its comments
/s/<token>/comments/ (GET; POST JSON {author, body, position?}, CSRF, rate-limited).
"""
from __future__ import annotations

import json
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Q
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .api import _get_owned_project, _iso
from .http import ApiError, api_view, json_error, read_json_body
from .models import Comment, ShareLink, ShareVariant

MAX_MODEL_BYTES = 20 * 1024 * 1024
MAX_SUMMARY_BYTES = 10_000
AUTHOR_MAX = Comment._meta.get_field("author").max_length
BODY_MAX = Comment._meta.get_field("body").max_length
TITLE_MAX = ShareLink._meta.get_field("title").max_length
COMMENTS_PER_LINK = 300
# At most this many comments from one address on one link in RATE_WINDOW seconds.
RATE_LIMIT = 10
RATE_WINDOW = 600
VARIANTS_MAX = 8


def _share_url(request, link: ShareLink) -> str:
    return request.build_absolute_uri(reverse("share-page", kwargs={"token": link.token}))


def _share_payload(request, link: ShareLink, comments: int = 0) -> dict[str, Any]:
    return {
        "token": link.token,
        "url": _share_url(request, link),
        "title": link.title,
        "summary": link.summary,
        "allow_comments": link.allow_comments,
        "created_at": _iso(link.created_at),
        "revoked": link.revoked_at is not None,
        "comments": comments,
    }


def _comment_payload(comment: Comment) -> dict[str, Any]:
    return {
        "id": comment.id,
        "author": comment.author,
        "body": comment.body,
        "position": comment.position,
        "from_owner": comment.from_owner,
        "resolved": comment.resolved,
        "created_at": _iso(comment.created_at),
        "link": comment.link.title if comment.link_id and comment.link else None,
        "token": comment.link.token if comment.link_id and comment.link else None,
    }


def _clean_text(value: Any, field: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, "Texte invalide.", [f"« {field} » doit être une chaîne non vide."])
    text = value.strip()
    if len(text) > limit:
        raise ApiError(400, "Texte trop long.", [f"« {field} » ne doit pas dépasser {limit} caractères."])
    return text


def _clean_position(value: Any) -> list[float] | None:
    if value is None:
        return None
    if (
        not isinstance(value, list)
        or len(value) != 3
        or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < 1e7 for v in value)
    ):
        raise ApiError(400, "Point invalide.", ["« position » doit être une liste de trois nombres (mm)."])
    return [float(v) for v in value]


# ---- owner API ----------------------------------------------------------------------------------


@api_view(("GET", "POST"))
def share_collection(request, project_id):
    project = _get_owned_project(request, project_id)
    if request.method == "GET":
        links = project.share_links.annotate(n=Count("comments")).order_by("-created_at")
        return JsonResponse({"shares": [_share_payload(request, link, link.n) for link in links]})

    data = _read_glb(request.FILES.get("model"), "model")
    raw_summary = request.POST.get("summary", "{}")
    if len(raw_summary.encode()) > MAX_SUMMARY_BYTES:
        raise ApiError(400, "Résumé trop long.")
    try:
        summary = json.loads(raw_summary)
    except ValueError:
        raise ApiError(400, "Résumé invalide.", ["« summary » doit être un objet JSON."]) from None
    if not isinstance(summary, dict):
        raise ApiError(400, "Résumé invalide.", ["« summary » doit être un objet JSON."])
    title = _clean_text(request.POST.get("title") or project.name, "title", TITLE_MAX)
    variants = _clean_variants(request, summary.get("variants"))
    link = ShareLink.objects.create(
        project=project,
        title=title,
        summary=summary,
        model=data,
        model_size=len(data),
        allow_comments=request.POST.get("allow_comments", "1") not in ("0", "false", ""),
    )
    ShareVariant.objects.bulk_create(
        ShareVariant(link=link, position=i, name=v["name"], price=v["price"], summary=v["summary"], model=v["model"], model_size=len(v["model"]))
        for i, v in enumerate(variants)
    )
    return JsonResponse(_share_payload(request, link), status=201)


def _read_glb(upload, field: str) -> bytes:
    if upload is None:
        raise ApiError(400, "Modèle manquant.", [f"« {field} » doit être un fichier GLB."])
    if upload.size > MAX_MODEL_BYTES:
        raise ApiError(400, "Modèle trop lourd.", [f"Le modèle ne doit pas dépasser {MAX_MODEL_BYTES // (1024 * 1024)} Mo."])
    data = upload.read()
    if data[:4] != b"glTF":
        raise ApiError(400, "Modèle invalide.", [f"« {field} » doit être un fichier glTF binaire (GLB)."])
    return data


def _clean_variants(request, value: Any) -> list[dict[str, Any]]:
    """The variants offered to the client: one GLB file ``variant_<i>`` for each entry of ``summary.variants``."""
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > VARIANTS_MAX:
        raise ApiError(400, "Variantes invalides.", [f"« summary.variants » doit être une liste de {VARIANTS_MAX} variantes au plus."])
    out = []
    for i, entry in enumerate(value):
        if not isinstance(entry, dict):
            raise ApiError(400, "Variante invalide.", ["Chaque variante doit être un objet."])
        price = entry.get("price")
        if price is not None and (isinstance(price, bool) or not isinstance(price, (int, float)) or not 0 <= price < 1e8):
            raise ApiError(400, "Prix invalide.", ["« price » doit être un nombre positif."])
        size = entry.get("size")
        out.append(
            {
                "name": _clean_text(entry.get("name"), "name", TITLE_MAX),
                "price": float(price) if price is not None else None,
                "summary": {"size": size} if isinstance(size, list) and len(size) == 3 and all(isinstance(c, (int, float)) for c in size) else {},
                "model": _read_glb(request.FILES.get(f"variant_{i}"), f"variant_{i}"),
            }
        )
    return out


@api_view(("DELETE",))
def share_detail(request, project_id, token):
    project = _get_owned_project(request, project_id)
    try:
        link = project.share_links.get(token=token)
    except ShareLink.DoesNotExist:
        raise ApiError(404, "Lien introuvable.") from None
    if link.revoked_at is None:
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at"])
    return JsonResponse(_share_payload(request, link))


@api_view(("GET", "POST"))
def comment_collection(request, project_id):
    project = _get_owned_project(request, project_id)
    if request.method == "GET":
        rows = project.comments.select_related("link").order_by("created_at")
        return JsonResponse({"comments": [_comment_payload(c) for c in rows]})
    data = read_json_body(request)
    if not isinstance(data, dict):
        raise ApiError(400, "Requête invalide.")
    body = _clean_text(data.get("body"), "body", BODY_MAX)
    link = None
    if data.get("token"):
        link = project.share_links.filter(token=data["token"]).first()
        if link is None:
            raise ApiError(404, "Lien introuvable.")
    author = request.user.get_full_name() or request.user.get_username()
    comment = Comment.objects.create(project=project, link=link, author=author[:AUTHOR_MAX], body=body, from_owner=True)
    return JsonResponse(_comment_payload(comment), status=201)


@api_view(("PATCH",))
def comment_detail(request, project_id, comment_id):
    project = _get_owned_project(request, project_id)
    try:
        comment = project.comments.get(pk=comment_id)
    except Comment.DoesNotExist:
        raise ApiError(404, "Commentaire introuvable.") from None
    data = read_json_body(request)
    if not isinstance(data, dict) or type(data.get("resolved")) is not bool:
        raise ApiError(400, "Requête invalide.", ["« resolved » doit être un booléen."])
    comment.resolved = data["resolved"]
    comment.save(update_fields=["resolved"])
    return JsonResponse(_comment_payload(comment))


# ---- public pages -------------------------------------------------------------------------------


def _live_link(token: str) -> ShareLink:
    link = ShareLink.objects.select_related("project").filter(token=token, revoked_at__isnull=True).first()
    if link is None:
        raise Http404("Lien introuvable ou révoqué.")
    return link


def _public_comments(link: ShareLink) -> list[dict[str, Any]]:
    rows = link.project.comments.filter(Q(link=link) | Q(link__isnull=True, from_owner=True)).select_related("link")
    return [_public(_comment_payload(c)) for c in rows.order_by("created_at")]


def _public(payload: dict[str, Any]) -> dict[str, Any]:
    """A comment as a client sees it: without the owner's link names and tokens."""
    return {k: v for k, v in payload.items() if k not in ("link", "token")}


@require_http_methods(["GET"])
@ensure_csrf_cookie  # the page posts comments with X-CSRFToken
def share_page(request, token):
    link = _live_link(token)
    data = {
        "title": link.title,
        "summary": link.summary,
        "modelUrl": reverse("share-model", kwargs={"token": token}),
        "commentsUrl": reverse("share-comments", kwargs={"token": token}),
        "pageUrl": _share_url(request, link),
        "allowComments": link.allow_comments,
        "comments": _public_comments(link),
        "variants": [
            {"name": v.name, "price": v.price, "size": v.summary.get("size"), "modelUrl": reverse("share-variant", kwargs={"token": token, "position": v.position})}
            for v in link.variants.only("name", "price", "summary", "position")
        ],
    }
    response = render(request, "projects/share.html", {"link": link, "share_data": data})
    response["X-Robots-Tag"] = "noindex"
    return response


@require_http_methods(["GET"])
def share_model(request, token):
    link = _live_link(token)
    response = HttpResponse(bytes(link.model), content_type="model/gltf-binary")
    response["Content-Disposition"] = 'inline; filename="meuble.glb"'
    response["Cache-Control"] = "private, max-age=300"
    # Scene Viewer (Android AR) fetches the model itself.
    response["Access-Control-Allow-Origin"] = "*"
    return response


@require_http_methods(["GET"])
def share_variant(request, token, position):
    link = _live_link(token)
    variant = link.variants.filter(position=position).first()
    if variant is None:
        raise Http404("Variante introuvable.")
    response = HttpResponse(bytes(variant.model), content_type="model/gltf-binary")
    response["Content-Disposition"] = 'inline; filename="variante.glb"'
    response["Cache-Control"] = "private, max-age=300"
    response["Access-Control-Allow-Origin"] = "*"
    return response


@require_http_methods(["GET", "POST"])
def share_comments(request, token):
    link = _live_link(token)
    if request.method == "GET":
        return JsonResponse({"comments": _public_comments(link)})
    if not link.allow_comments:
        return json_error(403, "Les commentaires sont fermés sur ce lien.")
    address = request.META.get("REMOTE_ADDR", "")
    key = f"share-comments:{link.token}:{address}"
    count = cache.get(key, 0)
    if count >= RATE_LIMIT:
        return json_error(429, "Trop de messages d'un coup : réessayez dans quelques minutes.")
    if link.comments.count() >= COMMENTS_PER_LINK:
        return json_error(403, "Ce lien a reçu le nombre maximal de commentaires.")
    try:
        data = read_json_body(request)
        if not isinstance(data, dict):
            raise ApiError(400, "Requête invalide.")
        author = _clean_text(data.get("author"), "author", AUTHOR_MAX)
        body = _clean_text(data.get("body"), "body", BODY_MAX)
        position = _clean_position(data.get("position"))
    except ApiError as exc:
        return exc.response()
    cache.set(key, count + 1, RATE_WINDOW)
    comment = Comment.objects.create(project=link.project, link=link, author=author, body=body, position=position)
    return JsonResponse(_public(_comment_payload(comment)), status=201)
