"""Settings for the local PracticeMode implementation.

PostgreSQL is the production target. SQLite keeps the shared foundation easy to run
locally and is overridden when DATABASE_URL is supplied by deployment tooling.
"""
from pathlib import Path
import os
from urllib.parse import parse_qsl, urlparse

from .env import load_env_file

BASE_DIR = Path(__file__).resolve().parent.parent
# Local overrides live in an untracked .env file; see .env.example.
load_env_file(BASE_DIR / ".env")
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "development-only-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [host for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "accounts",
    "reviewer",
    "catalog",
    "attempts",
    "guidance",
    "assistance",
    "form_requests",
    "instructors",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "practicemode.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "practicemode.wsgi.application"
ASGI_APPLICATION = "practicemode.asgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    parsed = urlparse(DATABASE_URL)
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username,
        "PASSWORD": parsed.password,
        "HOST": parsed.hostname,
        "PORT": parsed.port or 5432,
        # Hosted Postgres (Neon, Render) puts sslmode and similar in the query string.
        "OPTIONS": dict(parse_qsl(parsed.query)),
        # Poolers in transaction mode (Neon's -pooler host, PgBouncer) cannot keep
        # a server-side cursor open between queries.
        "DISABLE_SERVER_SIDE_CURSORS": True,
    }}
else:
    # IMMEDIATE takes the write lock when a transaction starts. SQLite's default
    # (DEFERRED) fails concurrent answer saves with "database is locked" (503).
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        "OPTIONS": {"transaction_mode": "IMMEDIATE", "timeout": 20},
    }}

AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Staff credentials use bcrypt (cost 12 by Django's bcrypt implementation).
PASSWORD_HASHERS = ["django.contrib.auth.hashers.BCryptSHA256PasswordHasher"]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = os.environ.get("DJANGO_FORCE_HTTPS", "false").lower() == "true"
# Hosts such as Vercel end TLS at their proxy and forward plain HTTP. Without this,
# Django thinks requests are http:// and the CSRF origin check rejects every POST
# from the https:// page. Only enable it behind a proxy that sets this header.
if os.environ.get("DJANGO_BEHIND_HTTPS_PROXY", "false").lower() == "true":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# The browser extension posts imports (API-15) from chrome-extension://<id>;
# list that origin here so Django's CSRF origin check accepts it.
CSRF_TRUSTED_ORIGINS = [origin for origin in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if origin]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["reviewer.authentication.SessionAuthenticationWith401"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}
