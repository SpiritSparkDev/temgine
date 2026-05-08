import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Save, X, Trash2 } from '../lib/muiIcons';
import Toast from './Toast';
import RichTextEditor from './RichTextEditor';

/**
 * ContentEntryEditor - Form-based editor for content entries based on a content model
 * Supports various field types with proper validation and UI controls
 */
export default function ContentEntryEditor({
  model = null,
  entry = null,
  onSave = null,
  onCancel = null,
  onDelete = null,
  showToast = null,
}) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Load entry data on mount
  useEffect(() => {
    if (model) {
      const initialValues = {};
      (model.fields || []).forEach(field => {
        initialValues[field.key] = entry?.[field.key] || field.default || '';
      });
      setValues(initialValues);
      setIsDirty(false);
      setErrors({});
    }
  }, [model, entry]);

  const showLocalToast = (message, type = 'info') => {
    if (showToast) {
      showToast(message, type);
    } else {
      setToast({ message, type });
    }
  };

  /**
   * Validate a single field value based on field config
   */
  const validateField = (field, value) => {
    const errors = [];

    // Required validation
    if (field.required) {
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`${field.name} ist erforderlich`);
      }
    }

    // Type-specific validation
    if (value && field.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push(`${field.name} muss eine gültige E-Mail sein`);
      }
    }

    if (value && field.type === 'slug') {
      const slugRegex = /^[a-z0-9-]*$/;
      if (!slugRegex.test(value)) {
        errors.push(`${field.name} darf nur Kleinbuchstaben, Zahlen und Bindestrich enthalten`);
      }
    }

    if (value && field.type === 'number') {
      if (isNaN(Number(value))) {
        errors.push(`${field.name} muss eine Zahl sein`);
      }
      if (field.min !== undefined && Number(value) < field.min) {
        errors.push(`${field.name} muss mindestens ${field.min} sein`);
      }
      if (field.max !== undefined && Number(value) > field.max) {
        errors.push(`${field.name} darf maximal ${field.max} sein`);
      }
    }

    if (value && field.type === 'url') {
      try {
        new URL(value);
      } catch {
        errors.push(`${field.name} muss eine gültige URL sein`);
      }
    }

    return errors;
  };

  /**
   * Validate all fields
   */
  const validateAll = () => {
    const newErrors = {};
    let hasErrors = false;

    (model.fields || []).forEach(field => {
      const fieldErrors = validateField(field, values[field.key]);
      if (fieldErrors.length > 0) {
        newErrors[field.key] = fieldErrors;
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    return !hasErrors;
  };

  /**
   * Handle field change
   */
  const handleFieldChange = (fieldKey, newValue) => {
    setValues(prev => ({ ...prev, [fieldKey]: newValue }));
    setIsDirty(true);

    // Clear error for this field when user starts editing
    if (errors[fieldKey]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  };

  /**
   * Handle save
   */
  const handleSave = async () => {
    if (!validateAll()) {
      showLocalToast('Bitte füllen Sie alle erforderlichen Felder korrekt aus', 'error');
      return;
    }

    try {
      setIsSaving(true);
      const savedEntry = {
        ...entry,
        ...values
      };

      const success = onSave ? await onSave(savedEntry) : true;
      if (success) {
        setIsDirty(false);
        showLocalToast('Eintrag erfolgreich gespeichert', 'success');
      } else {
        showLocalToast('Speichern fehlgeschlagen', 'error');
      }
    } catch (error) {
      showLocalToast(`Fehler beim Speichern: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle delete
   */
  const handleDelete = async () => {
    if (!entry?.id) {
      showLocalToast('Kann neuen Eintrag nicht löschen', 'error');
      return;
    }

    if (!window.confirm('Diesen Eintrag wirklich löschen?')) {
      return;
    }

    try {
      const success = onDelete ? await onDelete(entry.id) : true;
      if (success) {
        showLocalToast('Eintrag erfolgreich gelöscht', 'success');
      } else {
        showLocalToast('Löschen fehlgeschlagen', 'error');
      }
    } catch (error) {
      showLocalToast(`Fehler beim Löschen: ${error.message}`, 'error');
    }
  };

  /**
   * Render field input based on type
   */
  const renderFieldInput = (field) => {
    const value = values[field.key] || '';
    const hasError = Boolean(errors[field.key]);
    const errorMessages = errors[field.key] || [];

    const inputCls = `cee-input${hasError ? ' cee-input-error' : ''}`;
    const containerCls = `cee-field${hasError ? ' cee-field-has-error' : ''}`;

    const FieldLabel = () => (
      <label className="cee-field-label">
        {field.name}
        {field.required && <span className="cee-field-required">*</span>}
        <span className="cee-field-type-badge">{field.type}</span>
      </label>
    );

    const FieldErrors = () => hasError ? (
      <div className="cee-field-errors">
        {errorMessages.map((msg, i) => (
          <div key={i} className="cee-field-error-item">
            <AlertCircle size={12} /> {msg}
          </div>
        ))}
      </div>
    ) : null;

    const FieldHelp = () => field.helpText ? (
      <div className="cee-field-help">{field.helpText}</div>
    ) : null;

    switch (field.type) {
      case 'text':
      case 'email':
      case 'slug':
      case 'url':
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <input
              type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
              className={inputCls}
              value={value}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              disabled={isSaving}
              placeholder={field.placeholder || field.name}
              pattern={field.type === 'slug' ? '[a-z0-9-]*' : undefined}
            />
            <FieldErrors />
            <FieldHelp />
          </div>
        );

      case 'number':
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <input
              type="number"
              className={inputCls}
              value={value}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              disabled={isSaving}
              min={field.min}
              max={field.max}
              step={field.step || '1'}
              placeholder={field.placeholder || '0'}
            />
            {hasError && (
              <div className="field-errors">
                {errorMessages.map((msg, i) => (
                  <div key={i} className="error-message">
                    <AlertCircle size={14} /> {msg}
                  </div>
                ))}
              </div>
            )}
            {field.helpText && <div className="field-help">{field.helpText}</div>}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <textarea
              className={`${inputCls} cee-textarea`}
              value={value}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              disabled={isSaving}
              rows={field.rows || 4}
              placeholder={field.placeholder || field.name}
            />
            <FieldErrors />
            <FieldHelp />
          </div>
        );

      case 'richtext':
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <div className="cee-richtext-wrap">
              <RichTextEditor
                value={value}
                onChange={v => handleFieldChange(field.key, v)}
                readOnly={isSaving}
                toolbar={['bold', 'italic', 'strike', 'ol', 'ul', 'blockquote', 'code', 'link', 'clear']}
              />
            </div>
            <FieldErrors />
            <FieldHelp />
          </div>
        );

      case 'date':
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <input
              type="date"
              className={inputCls}
              value={value}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              disabled={isSaving}
            />
            <FieldErrors />
            <FieldHelp />
          </div>
        );

      case 'select':
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <select
              className={inputCls}
              value={value}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              disabled={isSaving}
            >
              <option value="">-- Bitte auswählen --</option>
              {(field.options || []).map(opt => {
                const v = typeof opt === 'string' ? opt : (opt.value ?? opt);
                const l = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? opt);
                return <option key={v} value={v}>{l}</option>;
              })}
            </select>
            <FieldErrors />
            <FieldHelp />
          </div>
        );

      case 'checkbox':
      case 'boolean':
        return (
          <div key={field.key} className={containerCls}>
            <label className="cee-field-label">
              {field.name}
              {field.required && <span className="cee-field-required">*</span>}
              <span className="cee-field-type-badge">{field.type}</span>
            </label>
            <label className="cee-checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={e => handleFieldChange(field.key, e.target.checked)}
                disabled={isSaving}
              />
              <span>{value ? 'Ja' : 'Nein'}</span>
            </label>
            <FieldErrors />
            <FieldHelp />
          </div>
        );

      default:
        return (
          <div key={field.key} className={containerCls}>
            <FieldLabel />
            <input
              type="text"
              className={inputCls}
              value={value}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              disabled={isSaving}
              placeholder={field.placeholder || field.name}
            />
            <FieldErrors />
            <FieldHelp />
          </div>
        );
    }
  };
            </div>
            {hasError && (
              <div className="field-errors">
                {errorMessages.map((msg, i) => (
                  <div key={i} className="error-message">
                    <AlertCircle size={14} /> {msg}
                  </div>
                ))}
              </div>
            )}
            {field.helpText && <div className="field-help">{field.helpText}</div>}
          </div>
        );

      case 'date':
        return (
          <div key={field.key} className={containerClass}>
            <label className="form-label">
              {field.name}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <input
              type="date"
              {...commonProps}
            />
            {hasError && (
              <div className="field-errors">
                {errorMessages.map((msg, i) => (
                  <div key={i} className="error-message">
                    <AlertCircle size={14} /> {msg}
                  </div>
                ))}
              </div>
            )}
            {field.helpText && <div className="field-help">{field.helpText}</div>}
          </div>
        );

      case 'select':
        return (
          <div key={field.key} className={containerClass}>
            <label className="form-label">
              {field.name}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <select
              {...commonProps}
            >
              <option value="">-- Bitte auswählen --</option>
              {(field.options || []).map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {hasError && (
              <div className="field-errors">
                {errorMessages.map((msg, i) => (
                  <div key={i} className="error-message">
                    <AlertCircle size={14} /> {msg}
                  </div>
                ))}
              </div>
            )}
            {field.helpText && <div className="field-help">{field.helpText}</div>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.key} className={`${containerClass} checkbox-container`}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={e => handleFieldChange(field.key, e.target.checked ? 1 : 0)}
                disabled={isSaving}
              />
              <span>{field.name}</span>
            </label>
            {hasError && (
              <div className="field-errors">
                {errorMessages.map((msg, i) => (
                  <div key={i} className="error-message">
                    <AlertCircle size={14} /> {msg}
                  </div>
                ))}
              </div>
            )}
            {field.helpText && <div className="field-help">{field.helpText}</div>}
          </div>
        );

      default:
        return (
          <div key={field.key} className={containerClass}>
            <label className="form-label">{field.name}</label>
            <input
              type="text"
              {...commonProps}
              placeholder={`Feld-Typ ${field.type} nicht unterstützt`}
              disabled
            />
          </div>
        );
    }
  };

  if (!model) {
    return (
      <div className="cee-root cee-empty">
        <p>Kein Content Model ausgewählt</p>
      </div>
    );
  }

  return (
    <div className="cee-root">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* ── Header ── */}
      <div className="cee-header">
        <div className="cee-header-info">
          <h2 className="cee-header-title">
            {entry?.id
              ? (entry.title || entry.name || 'Eintrag bearbeiten')
              : `Neuer ${model.name}`}
          </h2>
          <p className="cee-header-sub">
            {entry?.id ? `${model.name} · bearbeiten` : `${model.name} · neuer Eintrag`}
          </p>
        </div>
        <div className="cee-header-actions">
          {entry?.id && onDelete && (
            <button
              type="button"
              className="cee-btn cee-btn-danger"
              onClick={handleDelete}
              disabled={isSaving}
            >
              <Trash2 size={14} /> Löschen
            </button>
          )}
          <button
            type="button"
            className="cee-btn cee-btn-ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            <X size={14} /> Abbrechen
          </button>
          <button
            type="button"
            className="cee-btn cee-btn-primary"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            title={!isDirty ? 'Keine Änderungen' : undefined}
          >
            <Save size={14} /> {isSaving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="cee-form">
        {(model.fields || []).length === 0 ? (
          <div className="cee-form-empty">
            Dieses Modell hat keine Felder.
          </div>
        ) : (
          (model.fields || []).map(field => renderFieldInput(field))
        )}
      </div>

      <style jsx>{`
        .cee-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          overflow: hidden;
        }

        .cee-empty {
          align-items: center;
          justify-content: center;
          opacity: 0.5;
          font-size: 0.9rem;
        }

        /* ── Header ── */
        .cee-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .cee-header-info {
          min-width: 0;
        }

        .cee-header-title {
          margin: 0 0 3px;
          font-size: 1.1rem;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cee-header-sub {
          margin: 0;
          font-size: 0.8rem;
          opacity: 0.5;
        }

        .cee-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        /* ── Form ── */
        .cee-form {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .cee-form-empty {
          text-align: center;
          padding: 40px;
          opacity: 0.5;
          font-size: 0.9rem;
        }

        /* ── Field shared styles (applied via global to child renderFieldInput output) ── */
        .cee-root :global(.cee-field) {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .cee-root :global(.cee-field-label) {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .cee-root :global(.cee-field-required) {
          color: #ef4444;
          font-size: 0.8rem;
        }

        .cee-root :global(.cee-field-type-badge) {
          font-size: 0.7rem;
          padding: 1px 7px;
          border-radius: 10px;
          background: rgba(99,102,241,0.1);
          color: #6366f1;
          font-weight: 500;
          margin-left: auto;
        }

        .cee-root :global(.cee-input) {
          padding: 9px 12px;
          font-size: 0.9rem;
          border: 1.5px solid var(--border-color);
          border-radius: 7px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
          width: 100%;
          box-sizing: border-box;
        }

        .cee-root :global(.cee-input:focus) {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }

        .cee-root :global(.cee-input.cee-input-error) {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.1);
        }

        .cee-root :global(.cee-input:disabled) {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .cee-root :global(.cee-textarea) {
          resize: vertical;
          min-height: 100px;
        }

        .cee-root :global(.cee-richtext-wrap) {
          border: 1.5px solid var(--border-color);
          border-radius: 7px;
          overflow: hidden;
          transition: border-color 0.15s;
        }

        .cee-root :global(.cee-richtext-wrap:focus-within) {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }

        .cee-root :global(.cee-richtext-wrap .ql-toolbar) {
          background: var(--bg-secondary);
          border: none;
          border-bottom: 1px solid var(--border-color);
        }

        .cee-root :global(.cee-richtext-wrap .ql-container) {
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 0.9rem;
        }

        .cee-root :global(.cee-richtext-wrap .ql-editor) {
          min-height: 180px;
          padding: 12px;
        }

        .cee-root :global(.cee-richtext-wrap .ql-editor.ql-blank::before) {
          color: #9ca3af;
          font-style: italic;
        }

        .cee-root :global(.cee-checkbox-row) {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border: 1.5px solid var(--border-color);
          border-radius: 7px;
          background: var(--bg-secondary);
          cursor: pointer;
          transition: border-color 0.15s;
          user-select: none;
        }

        .cee-root :global(.cee-checkbox-row:hover) {
          border-color: #6366f1;
        }

        .cee-root :global(.cee-checkbox-row input[type="checkbox"]) {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #6366f1;
        }

        .cee-root :global(.cee-field-errors) {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .cee-root :global(.cee-field-error-item) {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          color: #ef4444;
          padding: 4px 8px;
          background: rgba(239,68,68,0.06);
          border-radius: 5px;
        }

        .cee-root :global(.cee-field-help) {
          font-size: 0.78rem;
          color: #9ca3af;
          padding: 0 2px;
        }

        /* ── Error state on field container ── */
        .cee-root :global(.cee-field.cee-field-has-error .cee-field-label) {
          color: #ef4444;
        }

        /* ── Buttons ── */
        .cee-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 7px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          border: 1.5px solid transparent;
        }

        .cee-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .cee-btn-primary {
          background: #6366f1;
          color: #fff;
          border-color: #6366f1;
        }

        .cee-btn-primary:not(:disabled):hover {
          background: #4f46e5;
          border-color: #4f46e5;
        }

        .cee-btn-ghost {
          background: transparent;
          color: var(--text-primary);
          border-color: var(--border-color);
        }

        .cee-btn-ghost:not(:disabled):hover {
          background: var(--hover-bg, rgba(0,0,0,0.05));
          border-color: #9ca3af;
        }

        .cee-btn-danger {
          background: transparent;
          color: #ef4444;
          border-color: rgba(239,68,68,0.35);
        }

        .cee-btn-danger:not(:disabled):hover {
          background: rgba(239,68,68,0.08);
          border-color: #ef4444;
        }
      `}</style>
    </div>
  );
}
        .content-entry-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          gap: 16px;
          padding: 16px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell;
        }

        .content-entry-editor-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          opacity: 0.5;
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 16px;
        }

        .editor-header h2 {
          margin: 0 0 4px 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .editor-subtitle {
          margin: 0;
          font-size: 0.875rem;
          opacity: 0.7;
        }

        .editor-actions {
          display: flex;
          gap: 8px;
        }

        .editor-form {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-field.has-error {
          background: rgba(198, 40, 40, 0.04);
          padding: 12px;
          border-radius: 4px;
          border-left: 3px solid #c62828;
        }

        .form-label {
          font-weight: 500;
          font-size: 0.95rem;
          color: var(--text-primary);
        }

        .required-mark {
          color: #c62828;
          margin-left: 4px;
        }

        .form-input,
        .form-input select,
        .form-input textarea {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.95rem;
          font-family: inherit;
          background: var(--bg-secondary);
          color: var(--text-primary);
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-input:focus,
        .form-input select:focus,
        .form-input textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-input.error,
        .form-input.error:focus {
          border-color: #c62828;
          box-shadow: 0 0 0 3px rgba(198, 40, 40, 0.1);
        }

        .form-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .form-richtext-wrapper {
          border: 1px solid var(--border-color);
          border-radius: 4px;
          overflow: hidden;
        }

        .form-richtext-wrapper :global(.ql-container) {
          font-size: 0.95rem;
          font-family: inherit;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .form-richtext-wrapper :global(.ql-toolbar) {
          border-top: 1px solid var(--border-color);
          background: var(--bg-tertiary);
          border: none;
        }

        .form-richtext-wrapper :global(.ql-editor) {
          min-height: 200px;
          padding: 12px;
        }

        .form-richtext-wrapper :global(.ql-editor.ql-blank::before) {
          color: #999;
          font-style: italic;
        }

        .checkbox-container {
          gap: 0;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: normal;
          margin: 0;
        }

        .checkbox-label input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .field-errors {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 4px;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          color: #c62828;
        }

        .field-help {
          font-size: 0.8rem;
          color: #999;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
