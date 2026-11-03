// App shell: restores the session, then shows the workspace for the user's
// role. The server enforces every permission; hiding screens is only a
// convenience (Sprint 2, Rule 3).
import { ClipboardCheck, FileText, LayoutDashboard, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell.jsx';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { BrandMark } from '@/components/brand.jsx';
import { getSession as defaultGetSession, signOut as defaultSignOut } from './api/session.js';
import SignIn from './features/auth/SignIn.jsx';
import Catalog from './features/catalog/Catalog.jsx';
import PracticeForm from './features/practice/PracticeForm.jsx';
import ReviewDetail from './features/review/ReviewDetail.jsx';
import ReviewQueue from './features/review/ReviewQueue.jsx';
import { navigate, useHashRoute } from './lib/useHashRoute.js';

const HOME = { LEARNER: '/forms', FORM_REVIEWER: '/review', INSTRUCTOR: '/instructor' };
const SECTION_ROLE = { forms: 'LEARNER', review: 'FORM_REVIEWER', instructor: 'INSTRUCTOR' };
const NAV = {
  LEARNER: [{ key: 'forms', path: '/forms', label: 'Practice forms', icon: FileText }],
  FORM_REVIEWER: [{ key: 'review', path: '/review', label: 'Form review', icon: ClipboardCheck }],
  INSTRUCTOR: [{ key: 'instructor', path: '/instructor', label: 'Overview', icon: LayoutDashboard }],
};

function InstructorHome() {
  return (
    <>
      <PageHeader title="Instructor overview" description="Assistance requests and learner progress will appear here." />
      <EmptyState
        icon={Users}
        title="Instructor tools arrive in a later sprint"
        description="Learners' assistance requests (US-03, US-05) and progress filters (US-22) are in the product backlog."
      />
    </>
  );
}

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

  let content;
  if (session.state === 'loading') {
    content = (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <BrandMark className="size-9 animate-pulse" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  } else if (!user) {
    content = <SignIn onSignedIn={(signedIn) => setSession({ state: 'ready', user: signedIn })} />;
  } else {
    let page;
    if (user.role === 'LEARNER') {
      page = route.id
        ? <PracticeForm key={route.id} formId={route.id} user={user} onBack={() => navigate('/forms')} />
        : <Catalog user={user} onOpen={(id) => navigate(`/forms/${id}`)} />;
    } else if (user.role === 'FORM_REVIEWER') {
      page = route.id
        ? <ReviewDetail key={route.id} formId={route.id} onBack={() => navigate('/review')} />
        : <ReviewQueue onOpen={(id) => navigate(`/review/${id}`)} />;
    } else {
      page = <InstructorHome />;
    }
    content = (
      <AppShell user={user} nav={NAV[user.role] ?? []} active={route.section} onNavigate={navigate} onSignOut={leave}>
        {page}
      </AppShell>
    );
  }

  return (
    <>
      {content}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
