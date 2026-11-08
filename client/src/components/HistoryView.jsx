import { Pencil, Trash2, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { formatDate, slotLabel } from '../lib.js';

export default function HistoryView({ data, onPage, onEdit, onDelete, loading }) {
  const { readings, page, limit, total } = data;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <section aria-labelledby="history-title" aria-busy={loading}>
      <div className="section-heading">
        <div><p className="eyebrow">Your record</p><h2 id="history-title">Reading history</h2><p className="muted">All your readings, with the most recent day first.</p></div>
        <span className="reading-count">{total} {total === 1 ? 'reading' : 'readings'} total</span>
      </div>
      {total === 0 ? (
        <div className="empty-state">
          <ClipboardList size={32} strokeWidth={1.5} aria-hidden="true" />
          <h3>Your history starts with one reading</h3>
          <p className="muted">Add a reading from your daily log. It will appear here so you can revisit it anytime.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="history-table">
              <caption className="sr-only">Your blood glucose reading history</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Time slot</th><th scope="col">Glucose</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {readings.map(reading => (
                  <tr key={reading.id}>
                    <td><time dateTime={reading.date}>{formatDate(reading.date)}</time></td>
                    <td>{slotLabel(reading.slot)}</td>
                    <td><strong>{reading.value}</strong><span className="table-unit"> mg/dl</span></td>
                    <td><div className="table-actions">
                      <button type="button" className="icon-button" disabled={loading} onClick={() => onEdit(reading)} aria-label={`Edit ${slotLabel(reading.slot)} on ${formatDate(reading.date)}`} title="Edit reading"><Pencil size={16} aria-hidden="true" /></button>
                      <button type="button" className="icon-button" disabled={loading} onClick={() => onDelete(reading)} aria-label={`Delete ${slotLabel(reading.slot)} on ${formatDate(reading.date)}`} title="Delete reading"><Trash2 size={16} aria-hidden="true" /></button>
                    </div></td>
                  </tr>
                ))}
                {readings.length === 0 && <tr><td colSpan="4">No readings on this page. Use Previous to go back.</td></tr>}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Reading history pages">
            <span className="muted">{readings.length ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : 'No readings on this page'}</span>
            <div className="pagination-controls">
              <button type="button" className="button secondary" onClick={() => onPage(page - 1)} disabled={page <= 1 || loading}><ChevronLeft size={16} aria-hidden="true" /> Previous</button>
              <span className="muted page-count">Page {page} of {totalPages}</span>
              <button type="button" className="button secondary" onClick={() => onPage(page + 1)} disabled={page >= totalPages || loading}>Next <ChevronRight size={16} aria-hidden="true" /></button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
