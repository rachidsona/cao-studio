"""Static URLs with a cache-busting version for assets whose file name never changes.

The editor bundle (js/editor.js) and the Tailwind output (css/app.css) keep a
fixed name; appending the file's modification time makes browsers fetch the
new build instead of a stale cached copy.
"""
import os

from django import template
from django.contrib.staticfiles import finders
from django.templatetags.static import static

register = template.Library()


@register.simple_tag
def versioned_static(path: str) -> str:
    url = static(path)
    found = finders.find(path)
    if isinstance(found, str) and os.path.exists(found):
        url = f"{url}?v={int(os.path.getmtime(found))}"
    return url
