// App shell: restores the session, then shows the workspace for the user's
// role. The server enforces every permission; hiding screens is only a
// convenience (Sprint 2, Rule 3).
import { Activity, BarChart3, CalendarClock, ClipboardCheck, FileText, Flag, History, Inbox, LifeBuoy, Send, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell.jsx';
import { BrandMark } from '@/components/brand.jsx';
import { getSession as defaultGetSession, signOut as defaultSignOut } from './api/session.js';
import Insights, { FormInsights } from './features/analytics/Insights.jsx';
import LearnerProgress from './features/assistance/LearnerProgress.jsx';
import MySessions from './features/assistance/MySessions.jsx';
import RequestDetail from './features/assistance/RequestDetail.jsx';
import ChangeRequests from './features/instructors/ChangeRequests.jsx';
import InstructorForms from './features/instructors/InstructorForms.jsx';
import InstructorSignUp from './features/instructors/InstructorSignUp.jsx';
import ManageInstructors from './features/instructors/ManageInstructors.jsx';
import RequestQueue from './features/assistance/RequestQueue.jsx';
import SignIn from './features/auth/SignIn.jsx';
import Catalog from './features/catalog/Catalog.jsx';
import PracticeHistory from './features/history/PracticeHistory.jsx';
import RequestForm from './features/requests/RequestForm.jsx';
import ReviewRequests from './features/requests/ReviewRequests.jsx';
import PracticeForm from './features/practice/PracticeForm.jsx';
import ReviewDetail from './features/review/ReviewDetail.jsx';
import ReviewQueue from './features/review/ReviewQueue.jsx';
import { navigate, useHashRoute } from './lib/useHashRoute.js';

const HOME = { LEARNER: '/forms', FORM_REVIEWER: '/review', INSTRUCTOR: '/instructor' };
const SECTION_ROLE = { forms: 'LEARNER', history: 'LEARNER', requests: 'LEARNER', sessions: 'LEARNER', intake: 'FORM_REVIEWER', instructors: 'FORM_REVIEWER', changes: 'FORM_REVIEWER', published: 'INSTRUCTOR', review: 'FORM_REVIEWER', insights: 'FORM_REVIEWER', instructor: 'INSTRUCTOR', progress: 'INSTRUCTOR' };
const NAV = {
  LEARNER: [
    { key: 'forms', path: '/forms', label: 'Practice forms', icon: FileText },
    { key: 'history', path: '/history', label: 'My practice', icon: History },
    { key: 'sessions', path: '/sessions', label: 'My sessions', icon: CalendarClock },
    { key: 'requests', path: '/requests', label: 'Request a form', icon: Send },
  ],
  FORM_REVIEWER: [
    { key: 'review', path: '/review', label: 'Form review', icon: ClipboardCheck },
    { key: 'intake', path: '/intake', label: 'Learner requests', icon: Inbox },
    { key: 'changes', path: '/changes', label: 'Change requests', icon: Flag },
    { key: 'instructors', path: '/instructors', label: 'Instructors', icon: Users },
    { key: 'insights', path: '/insights', label: 'Practice insights', icon: BarChart3 },
  ],
  INSTRUCTOR: [
    { key: 'instructor', path: '/instructor', label: 'Assistance requests', icon: LifeBuoy },
    { key: 'progress', path: '/progress', label: 'Learner progress', icon: Activity },
    { key: 'published', path: '/published', label: 'Forms', icon: FileText },
  ],
};

function withQuery(query) {
  const search = new URLSearchParams(query).toString();
  return search ? `?${search}` : '';
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
    content = route.section === 'instructor-signup'
      ? <InstructorSignUp onSignIn={() => navigate('/')} />
      : <SignIn onSignedIn={(signedIn) => setSession({ state: 'ready', user: signedIn })} onInstructorSignUp={() => navigate('/instructor-signup')} />;
  } else {
    let page;
    if (user.role === 'LEARNER' && route.section === 'sessions') {
      page = <MySessions user={user} onBrowse={() => navigate('/forms')} />;
    } else if (user.role === 'LEARNER' && route.section === 'requests') {
      page = <RequestForm onOpenForm={(id) => navigate(`/forms/${id}`)} />;
    } else if (user.role === 'LEARNER' && route.section === 'history') {
      page = <PracticeHistory onOpen={(attempt) => navigate(`/forms/${attempt.formId}?attempt=${attempt.id}`)} onBrowse={() => navigate('/forms')} />;
    } else if (user.role === 'LEARNER') {
      page = route.id
        ? <PracticeForm key={`${route.id}:${route.query.attempt ?? ''}`} formId={route.id} attemptId={route.query.attempt} user={user} onBack={() => navigate('/forms')} onOpenForm={(id) => navigate(`/forms/${id}`)} />
        : <Catalog onOpen={(id) => navigate(`/forms/${id}`)} onRequest={() => navigate('/requests')} />;
    } else if (user.role === 'FORM_REVIEWER' && route.section === 'instructors') {
      page = <ManageInstructors status={route.query.status} onStatusChange={(status) => navigate(`/instructors?status=${status}`)} />;
    } else if (user.role === 'FORM_REVIEWER' && route.section === 'changes') {
      page = <ChangeRequests status={route.query.status} onStatusChange={(status) => navigate(`/changes?status=${status}`)} onOpenForm={(id) => navigate(`/review/${id}`)} />;
    } else if (user.role === 'FORM_REVIEWER' && route.section === 'intake') {
      page = <ReviewRequests status={route.query.status} onStatusChange={(status) => navigate(`/intake?status=${status}`)} onOpenForm={(id) => navigate(`/review/${id}`)} />;
    } else if (user.role === 'FORM_REVIEWER' && route.section === 'insights') {
      page = route.id
        ? <FormInsights key={route.id} formId={route.id} onBack={() => navigate('/insights')} onReview={(id) => navigate(`/review/${id}`)} />
        : <Insights onOpen={(id) => navigate(`/insights/${id}`)} />;
    } else if (user.role === 'FORM_REVIEWER') {
      page = route.id
        ? <ReviewDetail key={route.id} formId={route.id} onBack={() => navigate('/review')} onInsights={(id) => navigate(`/insights/${id}`)} onOpenForm={(id) => navigate(`/review/${id}`)} />
        : <ReviewQueue onOpen={(id) => navigate(`/review/${id}`)} />;
    } else if (route.section === 'published') {
      page = <InstructorForms />;
    } else if (route.section === 'progress') {
      page = <LearnerProgress query={route.query} onQueryChange={(query) => navigate(`/progress${withQuery(query)}`)} />;
    } else {
      page = route.id
        ? <RequestDetail key={route.id} requestId={route.id} user={user} onBack={() => navigate('/instructor')} onProgress={(code) => navigate(`/progress?learnerCode=${encodeURIComponent(code)}`)} />
        : <RequestQueue status={route.query.status} onStatusChange={(status) => navigate(`/instructor?status=${status}`)} onOpen={(id) => navigate(`/instructor/${id}`)} />;
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
