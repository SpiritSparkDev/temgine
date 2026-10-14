// Vergleichslogik dafür, ob dem Nutzer das "Was ist neu"-Fenster (siehe
// components/ChangelogPopup.js) gezeigt werden soll: nur bei einem
// Minor-(oder Major-)Sprung gegenüber der zuletzt gesehenen Version, nicht
// bei reinen Patch-Releases (Bugfixes).
export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

// true, wenn `a` eine neuere Minor- (oder Major-)Version als `b` ist —
// reine Patch-Unterschiede (gleiche major.minor) zählen nicht.
export function hasNewerMinor(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return false;
  if (pa.major !== pb.major) return pa.major > pb.major;
  return pa.minor > pb.minor;
}

// true, wenn `a` eine in jeder Hinsicht höhere Version als `b` ist (inkl.
// Patch) — für die Auswahl, welche Changelog-Einträge seit `b` angezeigt
// werden.
export function isNewerVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return false;
  if (pa.major !== pb.major) return pa.major > pb.major;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor;
  return pa.patch > pb.patch;
}
