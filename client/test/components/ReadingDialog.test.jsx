import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReadingDialog from '../../src/components/ReadingDialog.jsx';

const baseProps = { date: '2026-10-15', slot: 'morning', today: '2026-10-15' };
function setup(overrides = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const rendered = render(<ReadingDialog {...baseProps} onSave={onSave} onClose={onClose} {...overrides} />);
  return { user: userEvent.setup(), onSave, onClose, ...rendered };
}
const valueInput = () => screen.getByRole('spinbutton', { name: 'Glucose value mg/dl' });
const submit = () => screen.getByRole('button', { name: 'Save reading', exact: true });

describe('ReadingDialog', () => {
  it('opens a labelled dialog and focuses the glucose input', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Add a reading' })).toHaveAttribute('open');
    expect(valueInput()).toHaveFocus();
    expect(screen.getByLabelText('Date', { exact: true })).toHaveValue('2026-10-15');
    expect(screen.getByRole('combobox', { name: 'Time slot' })).toHaveValue('morning');
  });

  it('announces a required value and associates the error with its input', async () => {
    const { user, onSave } = setup();
    await user.click(submit());
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Please enter a glucose value.');
    expect(valueInput()).toHaveAttribute('aria-invalid', 'true');
    expect(valueInput()).toHaveAttribute('aria-describedby', error.id);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(['39', '601', '100.5'])('rejects invalid value %s without saving', async value => {
    const { user, onSave } = setup();
    await user.type(valueInput(), value);
    await user.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('Value must be a whole number between 40 and 600 mg/dl.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([40, 600])('accepts the inclusive boundary %i and sends a numeric value', async value => {
    const { user, onSave } = setup();
    await user.type(valueInput(), String(value));
    await user.click(submit());
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ date: '2026-10-15', slot: 'morning', value });
  });

  it('rejects a future date even when the native max is bypassed', async () => {
    const { user, onSave } = setup();
    await user.type(valueInput(), '120');
    fireEvent.change(screen.getByLabelText('Date', { exact: true }), { target: { value: '2026-10-16' } });
    await user.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('Date cannot be in the future.');
    expect(screen.getByLabelText('Date', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects an empty date instead of submitting an incomplete reading', async () => {
    const { user, onSave } = setup();
    await user.type(valueInput(), '120');
    fireEvent.change(screen.getByLabelText('Date', { exact: true }), { target: { value: '' } });
    await user.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid date.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits the selected date and slot without using stale defaults', async () => {
    const { user, onSave } = setup();
    await user.type(valueInput(), '123');
    fireEvent.change(screen.getByLabelText('Date', { exact: true }), { target: { value: '2026-09-30' } });
    await user.selectOptions(screen.getByRole('combobox'), 'after_lunch');
    await user.click(submit());
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ date: '2026-09-30', slot: 'after_lunch', value: 123 });
  });

  it('prefills an existing reading and submits edited fields', async () => {
    const { user, onSave } = setup({ reading: { id: '19', date: '2026-09-12', slot: 'after_dinner', value: 142 } });
    expect(screen.getByRole('dialog', { name: 'Edit reading' })).toBeVisible();
    expect(valueInput()).toHaveValue(142);
    expect(screen.getByLabelText('Date', { exact: true })).toHaveValue('2026-09-12');
    expect(screen.getByRole('combobox')).toHaveValue('after_dinner');
    await user.clear(valueInput());
    await user.type(valueInput(), '139');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ date: '2026-09-12', slot: 'after_dinner', value: 139 });
  });

  it('retains entered data after a server conflict and allows a corrected retry', async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('You already have an After lunch reading for this date.'))
      .mockResolvedValueOnce(undefined);
    const { user } = setup({ onSave, slot: 'after_lunch' });
    await user.type(valueInput(), '111');
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have an After lunch reading for this date.');
    expect(valueInput()).toHaveValue(111);
    expect(screen.getByRole('combobox')).toHaveValue('after_lunch');
    await user.selectOptions(screen.getByRole('combobox'), 'after_dinner');
    await user.click(submit());
    expect(onSave).toHaveBeenLastCalledWith({ date: '2026-10-15', slot: 'after_dinner', value: 111 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks repeat submits and dismissal while a save is pending', async () => {
    let finish;
    const onSave = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const { user, onClose } = setup({ onSave });
    await user.type(valueInput(), '110');
    await user.click(submit());
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(valueInput()).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it('routes cancel-button and native cancel events to the parent', async () => {
    const { user, onClose, onSave } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // jsdom does not synthesize the native dialog cancel event from Escape.
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('wraps explicit Tab/Shift+Tab boundaries inside the dialog', async () => {
    const { user } = setup();
    const first = screen.getByRole('button', { name: 'Close reading form' });
    const last = submit();
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });
});
