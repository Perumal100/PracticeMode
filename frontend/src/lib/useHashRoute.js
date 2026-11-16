// Minimal hash router: #/forms, #/forms/<id>, #/review/<id>, #/instructor?status=SCHEDULED.
// Filters and tabs live in the query, so a reload or a shared link keeps them.
import { useEffect, useState } from 'react';

function parse() {
  const [path, search = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  return { section: parts[0] ?? '', id: parts[1] ?? null, query: Object.fromEntries(new URLSearchParams(search)) };
}

export function navigate(path) {
  window.location.hash = path;
}

export function useHashRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
