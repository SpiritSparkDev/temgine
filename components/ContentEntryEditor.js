import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, Save, X, Trash2 } from 'lucide-react';
import Toast from './Toast';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

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

    const commonProps = {
      value,
      onChange: e => handleFieldChange(field.key, e.target.value),
      className: `form-input ${hasError ? 'error' : ''}`,
      disabled: isSaving,
    };

    const containerClass = `form-field ${hasError ? 'has-error' : ''}`;

    switch (field.type) {
      case 'text':
      case 'email':
      case 'slug':
      case 'url':
        return (
          <div key={field.key} className={containerClass}>
            <label className="form-label">
              {field.name}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <input
              type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
              {...commonProps}
              placeholder={field.placeholder || `Geben Sie ${field.name.toLowerCase()} ein`}
              pattern={field.type === 'slug' ? '[a-z0-9-]*' : undefined}
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

      case 'number':
        return (
          <div key={field.key} className={containerClass}>
            <label className="form-label">
              {field.name}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <input
              type="number"
              {...commonProps}
              min={field.min}
              max={field.max}
              step={field.step || '1'}
              placeholder={field.placeholder || `Geben Sie eine Zahl ein`}
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
          <div key={field.key} className={containerClass}>
            <label className="form-label">
              {field.name}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <textarea
              {...commonProps}
              rows={field.rows || 4}
              placeholder={field.placeholder || `Geben Sie Text ein`}
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

      case 'richtext':
        return (
          <div key={field.key} className={containerClass}>
            <label className="form-label">
              {field.name}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <div className="form-richtext-wrapper">
              <ReactQuill
                value={value}
                onChange={v => handleFieldChange(field.key, v)}
                theme="snow"
                readOnly={isSaving}
                modules={{
                  toolbar: [
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['blockquote', 'code-block'],
                    ['link'],
                    ['clean'],
                  ],
                }}
              />
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
      <div className="content-entry-editor-empty">
        <p>Kein Content Model ausgewählt</p>
      </div>
    );
  }

  return (
    <div className="content-entry-editor">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="editor-header">
        <div>
          <h2>{model.name}</h2>
          <p className="editor-subtitle">
            {entry?.id ? `Bearbeiten: ${entry.title || entry.name || entry.id}` : 'Neuer Eintrag'}
          </p>
        </div>
        <div className="editor-actions">
          {entry?.id && onDelete && (
            <button
              type="button"
              className="btn-modern-small red hollow"
              onClick={handleDelete}
              disabled={isSaving}
              title="Eintrag löschen"
            >
              <Trash2 size={14} /> Löschen
            </button>
          )}
          <button
            type="button"
            className="btn-modern-small"
            onClick={onCancel}
            disabled={isSaving}
            title="Abbrechen"
          >
            <X size={14} /> Abbrechen
          </button>
          <button
            type="button"
            className="btn-modern-small green"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            title={isDirty ? 'Änderungen speichern' : 'Keine Änderungen'}
          >
            <Save size={14} /> {isSaving ? 'Speichert...' : 'Speichern'}
          </button>
        </div>
      </div>

      <div className="editor-form">
        {(model.fields || []).map(field => renderFieldInput(field))}
      </div>

      <style jsx>{`
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
