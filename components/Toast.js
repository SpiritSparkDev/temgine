import React, { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose, duration = 5000 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`toast ${type}`} role="alert" aria-live="assertive">
      <span className="toast-message">{message}</span>
      <button onClick={onClose} className="toast-close" aria-label="Benachrichtigung schließen">
        ✖
      </button>
    </div>
  );
}
