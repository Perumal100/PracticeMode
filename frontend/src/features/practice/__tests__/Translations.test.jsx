// US-09: translated guidance beside the original text. The API is a test double.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PracticeForm from '../PracticeForm.jsx';

const user = { id: 'u1', displayName: 'Alex', role: 'LEARNER' };
const form = {
  id: 'f1', title: 'Fictional housing application', status: 'APPROVED', categories: ['Housing'],
  guidance_languages: [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'zh', name: '中文' }, { code: 'hi', name: 'हिन्दी' }],
  fields: [
    {
      id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {},
      hints: [{ language_code: 'en', text: 'Write your first and last name.' }],
      translations: [
        { language_code: 'es', translated_label: 'Nombre completo', guidance_text: 'Escriba su nombre y apellido.' },
        { language_code: 'zh', translated_label: '全名', guidance_text: '请填写名字和姓氏。' },
      ],
    },
    {
      id: 'email', position: 2, label: 'Email', input_type: 'email', required: false, validation: {},
      hints: [{ language_code: 'en', text: 'An address with an @ sign.' }],
      translations: [{ language_code: 'es', translated_label: 'Correo electrónico', guidance_text: '' }],
    },
  ],
};
const attempt = { id: 'a1', formId: 'f1', status: 'IN_PROGRESS', answers: [], validationFeedback: [] };

async function setup() {
  const api = {
    getForm: vi.fn().mockResolvedValue(form),
    startAttempt: vi.fn().mockResolvedValue(attempt),
    getAttempt: vi.fn().mockResolvedValue(attempt),
    saveAnswer: vi.fn((attemptId, fieldId, value) => Promise.resolve({ fieldId, value, savedAt: '2026-11-10T10:00:00Z' })),
    recordHintView: vi.fn().mockResolvedValue({ hintViewCount: 1 }),
    debounceMs: 0,
  };
  render(<PracticeForm formId="f1" user={user} onBack={() => {}} api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
  await screen.findByLabelText(/Full name/);
  return api;
}

const choose = (code) => fireEvent.change(screen.getByLabelText('Guidance language'), { target: { value: code } });
const openHint = (label) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`hint for ${label}`, 'i') }));

beforeEach(() => window.localStorage.clear());

describe('US-09 translated guidance', () => {
  it('AC-01: shows the translated label and guidance beside the original text', async () => {
    await setup();
    choose('es');
    const translatedLabel = screen.getByText('Nombre completo');
    expect(translatedLabel).toHaveAttribute('lang', 'es');
    expect(screen.getByLabelText(/Full name/)).toBeVisible();
    openHint('Full name');
    expect(screen.getByText('Escriba su nombre y apellido.')).toHaveAttribute('lang', 'es');
    expect(screen.getByText('Write your first and last name.')).toBeVisible();
  });

  it('AC-02: changing the language keeps the original labels and the entered answers', async () => {
    const api = await setup();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Jordan Rivera' } });
    await screen.findByText('Saved ✓');
    choose('es');
    choose('zh');
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Jordan Rivera');
    expect(screen.getByLabelText(/Email/)).toBeVisible();
    expect(screen.getByText('全名')).toBeVisible();
    expect(screen.queryByText('Nombre completo')).not.toBeInTheDocument();
    expect(api.saveAnswer).toHaveBeenCalledTimes(1);
    expect(api.getAttempt).toHaveBeenCalledTimes(1);
  });

  it('AC-03: a language with no content is identified and the original guidance is shown', async () => {
    await setup();
    choose('hi');
    expect(screen.getByText(/This form has no guidance in हिन्दी yet/)).toBeVisible();
    openHint('Full name');
    expect(screen.getByText(/Not available in हिन्दी yet\. This is the original guidance\./)).toBeVisible();
    expect(screen.getByText('Write your first and last name.')).toBeVisible();
  });

  it('AC-03: a field missing from a partly translated form is marked, not filled in', async () => {
    await setup();
    choose('zh');
    expect(screen.queryByText(/This form has no guidance/)).not.toBeInTheDocument();
    expect(screen.getByText('Not translated into 中文')).toBeVisible();
    openHint('Email');
    expect(screen.getByText(/Not available in 中文 yet/)).toBeVisible();
    expect(screen.getByText('An address with an @ sign.')).toBeVisible();
  });

  it('remembers the chosen language in this browser', async () => {
    window.localStorage.setItem('pm_guidance_language_v1', 'es');
    await setup();
    expect(screen.getByLabelText('Guidance language')).toHaveValue('es');
    expect(screen.getByText('Correo electrónico')).toBeVisible();
    choose('en');
    expect(window.localStorage.getItem('pm_guidance_language_v1')).toBe('en');
    expect(screen.queryByText('Correo electrónico')).not.toBeInTheDocument();
  });
});
