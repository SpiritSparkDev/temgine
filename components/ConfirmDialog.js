import React from 'react';

export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <>
      <div className="confirm-overlay" onClick={onCancel} />
      <div className="confirm-dialog">
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="primary" onClick={onConfirm}>
            Bestätigen
          </button>
          <button className="icon-btn" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </>
  );
}
