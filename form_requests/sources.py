"""One key per source page, so a request, an import and a published form can be matched."""
from urllib.parse import urlsplit, urlunsplit


def clean_url(url):
    """The URL without its fragment, which never identifies a different page."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ""))


def source_key(url):
    """A normalized form URL where query parameters still distinguish separate forms."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), parts.query, ""))
