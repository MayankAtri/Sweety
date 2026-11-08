import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SLOTS, validDate } from '../lib.js';

export default function ReadingDialog({ reading = null, date, slot, today, onClose, onSave }) {
  const id = useId();
  const dialog = useRef(null);
  const valueInput = useRef(null);
  const [readingDate, setReadingDate] = useState(reading?.date || date);
  const [readingSlot, setReadingSlot] = useState(reading?.slot || slot || SLOTS[0].value);
  const [value, setValue] = useState(reading ? String(reading.value) : '');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    valueInput.current?.focus();
    return () => element.close();
  }, []);

  function invalid(message, field) {
    setError(message);
    setErrorField(field);
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setErrorField('');
    if (!value.trim()) return invalid('Please enter a glucose value.', 'value');
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 40 || numericValue > 600) {
      return invalid('Value must be a whole number between 40 and 600 mg/dl.', 'value');
    }
    if (!validDate(readingDate)) return invalid('Please enter a valid date.', 'date');
    if (readingDate > today) return invalid('Date cannot be in the future.', 'date');
    if (!SLOTS.some(item => item.value === readingSlot)) return invalid('Please select a valid time slot.', 'slot');
    setPending(true);
    try {
      await onSave({ date: readingDate, slot: readingSlot, value: numericValue });
    } catch (failure) {
      setError(failure.message || 'We couldn’t save this reading. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const errors = field => ({ 'aria-invalid': errorField === field || undefined, 'aria-describedby': errorField === field ? `${id}-error` : undefined });
  return <dialog className="dialog" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <div className="dialog-heading"><div><p className="eyebrow">Your daily journal</p><h2 id={`${id}-title`}>{reading ? 'Edit reading' : 'Add a reading'}</h2></div><button type="button" className="icon-button" aria-label="Close reading form" disabled={pending} onClick={onClose}><X size={21} aria-hidden="true" /></button></div>
    <p id={`${id}-description`} className="dialog-description">Record the value shown on your glucose meter.</p>
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <div className="field"><label htmlFor={`${id}-date`}>Date</label><input id={`${id}-date`} name="date" type="date" min="0001-02-01" max={today} value={readingDate} onChange={event => setReadingDate(event.target.value)} disabled={pending} required {...errors('date')} /></div>
      <div className="field"><label htmlFor={`${id}-slot`}>Time slot</label><select id={`${id}-slot`} name="slot" value={readingSlot} onChange={event => setReadingSlot(event.target.value)} disabled={pending} required {...errors('slot')}>{SLOTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      <div className="field"><label htmlFor={`${id}-value`}>Glucose value <span className="field-unit">mg/dl</span></label><input id={`${id}-value`} ref={valueInput} name="value" type="number" inputMode="numeric" min="40" max="600" step="1" value={value} onChange={event => setValue(event.target.value)} disabled={pending} required placeholder="e.g. 110" {...errors('value')} /><p className="field-hint">Enter a whole number between 40 and 600.</p></div>
      {error && <p id={`${id}-error`} className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={onClose}>Cancel</button><button type="submit" className="button" disabled={pending}>{pending ? 'Saving…' : reading ? 'Save changes' : 'Save reading'}</button></div>
    </form>
  </dialog>;
}
