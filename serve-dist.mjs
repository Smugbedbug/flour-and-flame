// Zero-dependency static server for the built app (the "dist" folder).
// Usage:  node serve-dist.mjs            → http://localhost:4173
//         node serve-dist.mjs 5000       → http://localhost:5000
// localhost counts as a secure origin, so offline support and "Install app" work in Chrome/Edge.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

try { await stat(join(root, 'index.html')); } catch {
  console.error('\n  The "dist" folder is missing. Run "npm run build" first (or use the prebuilt ZIP).\n');
  process.exit(1);
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) { file = join(root, 'index.html'); info = await stat(file); }
    const body = await readFile(file);
    const name = file.slice(root.length);
    const cache = name.startsWith(sep + 'assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(body);
  } catch {
    res.writeHead(500).end('Server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`\n  Flour and Flame Bakery is running at:  http://localhost:${port}\n`);
  console.log('  Keep this window open while using the app. Press Ctrl+C to stop.\n');
});
