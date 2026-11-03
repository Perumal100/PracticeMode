import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AutosaveStatus from '../AutosaveStatus.jsx';
import { SAVE_MESSAGES } from '../messages.js';

describe('AutosaveStatus', () => {
  it('renders nothing before the learner edits the field', () => {
    const { container } = render(<AutosaveStatus status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['pending', SAVE_MESSAGES.pending],
    ['saving', SAVE_MESSAGES.saving],
    ['saved', SAVE_MESSAGES.saved],
  ])('shows the %s state', (state, text) => {
    render(<AutosaveStatus status={{ state }} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('AC-03: shows a clear warning with a Retry button when saving fails', () => {
    const onRetry = vi.fn();
    render(<AutosaveStatus status={{ state: 'error', message: SAVE_MESSAGES.failed }} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(SAVE_MESSAGES.failed);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
