"""One key per source page, so a request, an import and a published form can be matched."""
from urllib.parse import urlsplit, urlunsplit


def clean_url(url):
    """The URL without its fragment, which never identifies a different page."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ""))


def source_key(url):
    """Scheme, host and path: query strings and trailing slashes do not make a different form."""
    parts = urlsplit(url.strip())
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}{parts.path.rstrip('/')}"
