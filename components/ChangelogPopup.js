import React, { useEffect, useMemo, useState } from 'react';
import { X } from '../lib/muiIcons';
import pkg from '../package.json';
import { USER_CHANGELOG } from '../lib/userChangelog';
import { hasNewerMinor, isNewerVersion } from '../lib/changelogGate';

const STORAGE_KEY = 'temgine-changelog-seen-version';
// Basis für Nutzer, die noch keinen gespeicherten Stand haben (neuer
// Browser, oder dieses Feature existiert hier zum ersten Mal) — die letzte
// Version vor Einführung dieses Fensters, damit die aktuellen Einträge beim
// ersten Laden einmal angezeigt werden, statt stillschweigend übersprungen
// zu werden. Spätere Besuche nutzen danach nur noch den echten Stand aus
// localStorage.
const FALLBACK_SEEN_VERSION = '0.46.1';

// "Was ist neu"-Hinweisfenster: öffnet sich automatisch, wenn die aktuelle
// Version gegenüber der zuletzt gesehenen (pro Browser in localStorage
// gemerkt) einen Minor- oder Major-Sprung darstellt — reine Patch-Releases
// (Bugfixes) lösen es nicht aus. Nur im Admin-Bereich gemountet (siehe
// components/AdminPageClient.js), nicht auf der öffentlichen Website.
export default function ChangelogPopup() {
  const [seenVersion, setSeenVersion] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const currentVersion = pkg.version;

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (_e) {
      // localStorage nicht verfügbar (z. B. gesperrte Seiteneinstellungen) — Fenster bleibt einfach aus.
    }
    if (!stored) {
      stored = FALLBACK_SEEN_VERSION;
      try {
        window.localStorage.setItem(STORAGE_KEY, stored);
      } catch (_e) {}
    }
    setSeenVersion(stored);
    setLoaded(true);
  }, []);

  const entriesToShow = useMemo(() => {
    if (!seenVersion) return [];
    return USER_CHANGELOG.filter((entry) => isNewerVersion(entry.version, seenVersion));
  }, [seenVersion]);

  const shouldShow = loaded && hasNewerMinor(currentVersion, seenVersion) && entriesToShow.length > 0;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, currentVersion);
    } catch (_e) {}
    setSeenVersion(currentVersion);
  }

  useEffect(() => {
    if (!shouldShow) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div className="changelog-overlay" onClick={dismiss}>
      <div
        className="changelog-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-popup-title"
      >
        <div className="changelog-modal-header">
          <h2 id="changelog-popup-title">Was ist neu</h2>
          <button type="button" className="changelog-close-btn" onClick={dismiss} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="changelog-modal-body">
          {entriesToShow.map((entry) => (
            <div key={entry.version} className="changelog-entry">
              <h3 className="changelog-entry-title">{entry.title}</h3>
              <ul className="changelog-entry-list">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="changelog-modal-footer">
          <button type="button" className="btn-modern" onClick={dismiss}>Verstanden</button>
        </div>
      </div>
    </div>
  );
}
