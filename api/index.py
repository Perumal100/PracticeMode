"""Vercel entry point: runs the Django app as a Python serverless function.

vercel.json rewrites /api/* and /admin/* here; Django still sees the original
path, so practicemode/urls.py routes it as usual.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "practicemode.settings")

from django.core.wsgi import get_wsgi_application  # noqa: E402

app = get_wsgi_application()
