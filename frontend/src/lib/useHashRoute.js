// Minimal hash router: #/forms, #/forms/<id>, #/review, #/review/<id>, #/insights, #/insights/<id>.
import { useEffect, useState } from 'react';

function parse() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] ?? '', id: parts[1] ?? null };
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
