// App shell: the signed-in role decides the workspace.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';

vi.mock('../api/catalog.js', () => ({ listForms: vi.fn().mockResolvedValue([]), getForm: vi.fn() }));
vi.mock('../api/assistance.js', () => ({ listRequests: vi.fn().mockResolvedValue([]) }));
vi.mock('../api/review.js', () => ({ listReviewForms: vi.fn().mockResolvedValue([]), listNotifications: vi.fn().mockResolvedValue([]) }));

beforeEach(() => { window.location.hash = ''; });

describe('App', () => {
  it('shows the sign-in page when nobody is signed in', async () => {
    render(<App getSession={vi.fn().mockResolvedValue(null)} />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('opens the catalog for a learner', async () => {
    render(<App getSession={vi.fn().mockResolvedValue({ id: '1', displayName: 'Alex', role: 'LEARNER' })} />);
    expect(await screen.findByRole('heading', { name: 'Practice forms' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/forms');
  });

  it('AC-03 (UI): a learner sent to the review area is redirected to the catalog', async () => {
    window.location.hash = '#/review';
    render(<App getSession={vi.fn().mockResolvedValue({ id: '1', displayName: 'Alex', role: 'LEARNER' })} />);
    expect(await screen.findByRole('heading', { name: 'Practice forms' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Form review' })).not.toBeInTheDocument();
  });

  it('opens the review queue for a Form Reviewer', async () => {
    render(<App getSession={vi.fn().mockResolvedValue({ id: '2', displayName: 'Rita', role: 'FORM_REVIEWER' })} />);
    expect(await screen.findByRole('heading', { name: 'Form review' })).toBeInTheDocument();
  });

  it('opens the assistance queue for an Instructor and keeps the chosen tab in the address', async () => {
    window.location.hash = '#/instructor?status=SCHEDULED';
    render(<App getSession={vi.fn().mockResolvedValue({ id: '3', displayName: 'Ines Ortega', role: 'INSTRUCTOR' })} />);
    expect(await screen.findByRole('heading', { name: 'Assistance requests' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /Accepted by me/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('You have no sessions booked')).toBeInTheDocument();
  });
});
