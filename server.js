import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = process.env.PORT || 3000;
const root = process.cwd();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const serveFile = async (filePath, response) => {
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    });
    response.end(data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
};

createServer((request, response) => {
  const requestPath = request.url === '/' ? '/index.html' : request.url;
  const safePath = normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, safePath);

  serveFile(filePath, response);
}).listen(port, () => {
  console.log(`padelApp running at http://localhost:${port}`);
});
