const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const http = require('http');

const base = path.join(os.tmpdir(), 'temphelix-folder-test');
fs.rmSync(base, { recursive: true, force: true });
fs.mkdirSync(path.join(base, 'demo', 'nested'), { recursive: true });
fs.writeFileSync(path.join(base, 'demo', 'a.txt'), 'A');
fs.writeFileSync(path.join(base, 'demo', 'nested', 'b.txt'), 'B');

const form = new FormData();
form.append('file', fs.createReadStream(path.join(base, 'demo', 'a.txt')));
form.append('relativePath', 'demo/a.txt');
form.append('file', fs.createReadStream(path.join(base, 'demo', 'nested', 'b.txt')));
form.append('relativePath', 'demo/nested/b.txt');

const req = http.request('http://localhost:3000/api/files', {
  method: 'POST',
  headers: form.getHeaders(),
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(body);
    process.exit(0);
  });
});
req.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
form.pipe(req);
