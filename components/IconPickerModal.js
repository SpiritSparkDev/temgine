import React, { useState, useMemo } from 'react';
import { Search, X } from '../lib/muiIcons';
import { FONT_AWESOME_ICONS, getIconHtml } from '../lib/fontAwesomeIcons';

export default function IconPickerModal({ isOpen, onClose, onInsert }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredIcons = useMemo(() => {
    if (!searchTerm.trim()) return FONT_AWESOME_ICONS;
    
    const term = searchTerm.toLowerCase();
    return FONT_AWESOME_ICONS.filter(icon => 
      icon.name.includes(term) || icon.label.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleIconClick = (iconName) => {
    const iconHtml = getIconHtml(iconName);
    onInsert(iconHtml);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="icon-picker-overlay" onClick={onClose}>
      <div className="icon-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="icon-picker-header">
          <h3>Font Awesome Icons</h3>
          <button className="icon-picker-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="icon-picker-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Icons suchen... (z.B. plus, trash, arrow)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        <div className="icon-picker-grid">
          {filteredIcons.length > 0 ? (
            filteredIcons.map(icon => (
              <button
                key={icon.name}
                className="icon-picker-item"
                onClick={() => handleIconClick(icon.name)}
                title={icon.label}
              >
                <i className={`fas fa-${icon.name}`}></i>
                <span className="icon-name">{icon.name}</span>
              </button>
            ))
          ) : (
            <div className="icon-picker-empty">
              <p>Keine Icons gefunden für "{searchTerm}"</p>
            </div>
          )}
        </div>

        <div className="icon-picker-info">
          {filteredIcons.length} Icons gefunden
        </div>
      </div>
    </div>
  );
}
