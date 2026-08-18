// Diagnostic script: zeigt welche ENV-Variablen verfügbar sind
const vars = [
  'DATABASE_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'SETUP_TOKEN',
  'NODE_ENV',
  'DEV_MODE',
  'NEXT_PUBLIC_DEV_MODE',
];

console.log('=== ENV Check ===');
console.log('NODE Version:', process.version);
console.log('CWD:', process.cwd());
console.log('');

for (const key of vars) {
  const val = process.env[key];
  if (val) {
    // Mask secrets, show first 6 chars only
    const masked = val.length > 6 ? val.slice(0, 6) + '...' : '(kurz)';
    console.log(`✓ ${key} = ${masked}`);
  } else if (key === 'SETUP_TOKEN') {
    console.log(`- ${key} = (nicht gesetzt, wird beim Serverstart automatisch generiert)`);
  } else {
    console.log(`✗ ${key} = (nicht gesetzt)`);
  }
}

console.log('');
console.log('=== Alle gesetzten ENV-Variablen (Namen) ===');
console.log(Object.keys(process.env).sort().join('\n'));
