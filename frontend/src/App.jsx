// App shell: restores the session, then shows the workspace for the user's
// role. The server enforces every permission; hiding screens is only a
// convenience (Sprint 2, Rule 3).
import { useEffect, useState } from 'react';
import { getSession as defaultGetSession, signOut as defaultSignOut } from './api/session.js';
import SignIn from './features/auth/SignIn.jsx';
import Catalog from './features/catalog/Catalog.jsx';
import PracticeForm from './features/practice/PracticeForm.jsx';
import ReviewDetail from './features/review/ReviewDetail.jsx';
import ReviewQueue from './features/review/ReviewQueue.jsx';
import { navigate, useHashRoute } from './lib/useHashRoute.js';

const HOME = { LEARNER: '/forms', FORM_REVIEWER: '/review', INSTRUCTOR: '/instructor' };
const SECTION_ROLE = { forms: 'LEARNER', review: 'FORM_REVIEWER', instructor: 'INSTRUCTOR' };

export default function App({ getSession = defaultGetSession, signOut = defaultSignOut }) {
  const [session, setSession] = useState({ state: 'loading', user: null });
  const route = useHashRoute();

  useEffect(() => {
    getSession().then(
      (user) => setSession({ state: 'ready', user }),
      () => setSession({ state: 'ready', user: null }),
    );
  }, [getSession]);

  const user = session.user;
  useEffect(() => {
    if (user && SECTION_ROLE[route.section] !== user.role) navigate(HOME[user.role] ?? '/');
  }, [user, route.section]);

  async function leave() {
    try {
      await signOut();
    } finally {
      setSession({ state: 'ready', user: null });
      navigate('/');
    }
  }

  let page = null;
  if (session.state === 'loading') page = <p className="muted">Loading…</p>;
  else if (!user) page = <SignIn onSignedIn={(signedIn) => setSession({ state: 'ready', user: signedIn })} />;
  else if (user.role === 'LEARNER') {
    page = route.id
      ? <PracticeForm key={route.id} formId={route.id} user={user} onBack={() => navigate('/forms')} />
      : <Catalog onOpen={(id) => navigate(`/forms/${id}`)} />;
  } else if (user.role === 'FORM_REVIEWER') {
    page = route.id
      ? <ReviewDetail key={route.id} formId={route.id} onBack={() => navigate('/review')} />
      : <ReviewQueue onOpen={(id) => navigate(`/review/${id}`)} />;
  } else {
    page = <p className="card">Instructor tools (assistance requests and learner progress) arrive in a later sprint.</p>;
  }

  return (
    <>
      <header className="topbar">
        <h1>PracticeMode</h1>
        {user && (
          <div className="who">
            <span>{user.displayName || 'Signed in'} · {user.role.replace('_', ' ').toLowerCase()}</span>
            <button type="button" onClick={leave}>Sign out</button>
          </div>
        )}
      </header>
      <main>{page}</main>
    </>
  );
}
