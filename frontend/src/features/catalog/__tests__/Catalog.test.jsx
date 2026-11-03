// US-02 catalog search. The API is a test double; listForms is checked separately.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import { listForms } from '../../../api/catalog.js';
import Catalog from '../Catalog.jsx';

const forms = [
  { id: 'f1', title: 'Housing application', status: 'APPROVED', categories: ['Housing', 'Government'] },
  { id: 'f2', title: 'Job application', status: 'APPROVED', categories: ['Employment'] },
];

afterEach(() => vi.restoreAllMocks());

describe('Catalog', () => {
  it('lists approved forms and opens one', async () => {
    const onOpen = vi.fn();
    render(<Catalog onOpen={onOpen} listForms={vi.fn().mockResolvedValue(forms)} />);
    expect(await screen.findByText('Housing application')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Practise: Job application' }));
    expect(onOpen).toHaveBeenCalledWith('f2');
  });

  it('AC-01/AC-02: searches by keyword and several categories', async () => {
    const list = vi.fn().mockResolvedValueOnce(forms).mockResolvedValueOnce([forms[0]]);
    render(<Catalog onOpen={() => {}} listForms={list} />);
    fireEvent.change(await screen.findByLabelText('Search by title'), { target: { value: 'application' } });
    fireEvent.click(screen.getByLabelText('Housing'));
    fireEvent.click(screen.getByLabelText('Employment'));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ keyword: 'application', categories: ['Housing', 'Employment'] }));
  });

  it('AC-03: shows a clear message when nothing matches', async () => {
    const list = vi.fn().mockResolvedValueOnce(forms).mockResolvedValueOnce([]);
    render(<Catalog onOpen={() => {}} listForms={list} />);
    fireEvent.change(await screen.findByLabelText('Search by title'), { target: { value: 'passport' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No practice forms match your search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryByText('Housing application')).not.toBeInTheDocument();
  });

  it('offers Continue or View result for attempts started in this browser', async () => {
    window.localStorage.setItem('pm_attempts_v1', JSON.stringify({ 'u1:f1': { id: 'a1', status: 'IN_PROGRESS' }, 'u1:f2': { id: 'a2', status: 'COMPLETED' } }));
    render(<Catalog user={{ id: 'u1' }} onOpen={() => {}} listForms={vi.fn().mockResolvedValue(forms)} />);
    expect(await screen.findByRole('button', { name: 'Continue: Housing application' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View result: Job application' })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('explains a rejected search (400)', async () => {
    render(<Catalog onOpen={() => {}} listForms={vi.fn().mockRejectedValue(new ApiError(400, null, 'x'))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid');
  });

  it('listForms sends keyword and repeated category parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    await listForms({ keyword: ' housing ', categories: ['Housing', 'Local Government'] });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/forms?keyword=housing&category=Housing&category=Local+Government');
  });
});
