// Reviewer corrections before the decision (US-04, US-10). The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import { buildFieldPayload } from '../FieldEditor.jsx';
import ReviewDetail from '../ReviewDetail.jsx';

const form = {
  id: 'f1', title: 'Apply for this job', status: 'AWAITING_REVIEW', source_url: 'https://job-boards.example.io/embed/job_app',
  source_available: true, categories: [], created_at: '2026-11-03T09:00:00Z', updated_at: '2026-11-03T09:00:00Z', decision: null,
  fields: [
    { id: 'a', position: 1, label: 'First Name', input_type: 'text', required: true, validation: { maxLength: 50 } },
    { id: 'b', position: 2, label: 'Highest Education', input_type: 'select', required: true, validation: { allowedValues: ['High School', 'PhD'] } },
  ],
};

function setup(overrides = {}) {
  const api = {
    getReviewForm: vi.fn().mockResolvedValue(form),
    decideForm: vi.fn(),
    updateFormMetadata: vi.fn((id, changes) => Promise.resolve({ ...form, ...changes })),
    updateField: vi.fn().mockResolvedValue(form),
    addField: vi.fn().mockResolvedValue(form),
    deleteField: vi.fn().mockResolvedValue({ ...form, fields: [form.fields[1]] }),
    reorderFields: vi.fn().mockResolvedValue(form),
    ...overrides,
  };
  render(<ReviewDetail formId="f1" onBack={() => {}} api={api} />);
  return api;
}

describe('ReviewDetail editing', () => {
  it('corrects the title and the source page', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Senior Software Engineer' } });
    fireEvent.change(screen.getByLabelText('Source page'), { target: { value: 'https://careers.datadoghq.com/detail/8052118/?gh_jid=8052118' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.updateFormMetadata).toHaveBeenCalledWith('f1', {
      title: 'Senior Software Engineer',
      source_url: 'https://careers.datadoghq.com/detail/8052118/?gh_jid=8052118',
      source_available: true,
    }));
    expect(await screen.findByRole('heading', { name: 'Senior Software Engineer' })).toBeInTheDocument();
  });

  it('refuses a source that is not a web address', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Source page'), { target: { value: 'careers page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByRole('alert')).toHaveTextContent('full address');
    expect(api.updateFormMetadata).not.toHaveBeenCalled();
  });

  it('edits a field label and the options of a choice list', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Highest Education' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Options')).toHaveValue('High School\nPhD');
    fireEvent.change(within(dialog).getByLabelText('Label'), { target: { value: 'Highest level of education' } });
    fireEvent.change(within(dialog).getByLabelText('Options'), { target: { value: 'High School\n\nBachelor\nPhD\nPhD' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save field' }));
    await waitFor(() => expect(api.updateField).toHaveBeenCalledWith('f1', 'b', {
      label: 'Highest level of education', input_type: 'select', required: true,
      validation: { allowedValues: ['High School', 'Bachelor', 'PhD'] },
    }));
  });

  it('adds a missing number field with a range', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add field' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Label'), { target: { value: 'Years of experience' } });
    fireEvent.change(within(dialog).getByLabelText('Answer type'), { target: { value: 'number' } });
    fireEvent.click(within(dialog).getByLabelText('Required'));
    fireEvent.change(within(dialog).getByLabelText('Minimum value'), { target: { value: '0' } });
    fireEvent.change(within(dialog).getByLabelText('Maximum value'), { target: { value: '50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));
    await waitFor(() => expect(api.addField).toHaveBeenCalledWith('f1', {
      label: 'Years of experience', input_type: 'number', required: true, validation: { min: 0, max: 50 },
    }));
  });

  it('shows the server reason when an edit is refused', async () => {
    setup({ updateField: vi.fn().mockRejectedValue(new ApiError(400, null, 'x', { validation: ['pattern is not a supported rule for a text field.'] })) });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit First Name' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save field' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('pattern is not a supported rule');
  });

  it('removes a field after confirmation', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove First Name' }));
    expect(api.deleteField).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove field' }));
    await waitFor(() => expect(api.deleteField).toHaveBeenCalledWith('f1', 'a'));
    await waitFor(() => expect(screen.queryByText('First Name')).not.toBeInTheDocument());
  });

  it('moves a field down', async () => {
    const api = setup();
    expect(await screen.findByRole('button', { name: 'Move First Name up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move First Name down' }));
    await waitFor(() => expect(api.reorderFields).toHaveBeenCalledWith('f1', ['b', 'a']));
  });

  it('offers no editing once the form has been reviewed', async () => {
    setup({ getReviewForm: vi.fn().mockResolvedValue({ ...form, status: 'APPROVED', decision: { outcome: 'APPROVED', reviewer: 'r', rejection_reason: '', decided_at: form.created_at } }) });
    await screen.findByText('First Name');
    for (const name of ['Edit details', 'Add field', 'Edit First Name', 'Remove First Name']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});

describe('long choice lists', () => {
  const countries = Array.from({ length: 245 }, (_, i) => `Country ${String(i + 1).padStart(3, '0')} +${i + 1}`);
  const withCountries = { ...form, fields: [...form.fields, { id: 'c', position: 3, label: 'Country', input_type: 'select', required: true, validation: { allowedValues: countries } }] };

  it('collapses to a summary and opens a filterable list', async () => {
    render(<ReviewDetail formId="f1" onBack={() => {}} api={{ getReviewForm: vi.fn().mockResolvedValue(withCountries) }} />);
    expect(await screen.findByText('245 options')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Options of Country' })).not.toBeInTheDocument();
    // Short lists stay inline.
    expect(screen.getByText('Options: High School, PhD')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all 245' }));
    const list = screen.getByRole('list', { name: 'Options of Country' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(245);

    fireEvent.change(screen.getByLabelText('Filter options of Country'), { target: { value: '+24' } });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      countries.filter((c) => c.includes('+24')),
    );
    expect(screen.getByText(`${countries.filter((c) => c.includes('+24')).length} of 245 match`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide options' }));
    expect(screen.queryByRole('list', { name: 'Options of Country' })).not.toBeInTheDocument();
  });
});

describe('buildFieldPayload', () => {
  const draft = (over) => ({ label: 'Q', inputType: 'text', required: false, options: '', minLength: '', maxLength: '', min: '', max: '', ...over });
  it('keeps only the rules that fit the type', () => {
    expect(buildFieldPayload(draft({ inputType: 'date', minLength: '3', options: 'A' })).payload.validation).toEqual({});
    expect(buildFieldPayload(draft({ minLength: '2', maxLength: '40' })).payload.validation).toEqual({ minLength: 2, maxLength: 40 });
    expect(buildFieldPayload(draft({ inputType: 'url', maxLength: '255', min: '1' })).payload).toMatchObject({ input_type: 'url', validation: { maxLength: 255 } });
  });
  it('catches mistakes before calling the server', () => {
    expect(buildFieldPayload(draft({ label: '  ' })).error).toMatch(/label/);
    expect(buildFieldPayload(draft({ inputType: 'select' })).error).toMatch(/at least one option/);
    expect(buildFieldPayload(draft({ minLength: '9', maxLength: '3' })).error).toMatch(/larger/);
    expect(buildFieldPayload(draft({ minLength: '1.5' })).error).toMatch(/whole numbers/);
    expect(buildFieldPayload(draft({ inputType: 'number', min: '10', max: '1' })).error).toMatch(/larger/);
  });
});
