import http from 'node:http';
import { readFile } from 'node:fs/promises';
const script = new URL('../codeforces-video-solutions.user.js', import.meta.url);
const port = Number(process.env.CF_VIDEO_PORT || 8766);
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Install Codeforces Video Solutions</title>
<style>body{font:17px/1.6 system-ui;max-width:680px;margin:10vh auto;padding:24px;color:#17223b;background:#f6f8fc}a{color:#275ddd}h1{line-height:1.2}main{background:white;padding:32px;border:1px solid #dce2ed;border-radius:16px}.install{display:inline-block;background:#275ddd;color:white;padding:12px 20px;border-radius:8px;text-decoration:none}</style>
<main><p>CODEFORCES · YOUTUBE</p><h1>Video walkthroughs,<br>right beside the problem.</h1><p>A dropdown with matching videos, a built-in player, refresh, and a home-page library. No API key or backend.</p>
<p><a class="install" href="/codeforces-video-solutions.user.js">Install in Tampermonkey</a></p><ol><li>Open this page in Comet with Tampermonkey enabled.</li><li>Click Install above, then Install in Tampermonkey.</li><li>Open <a href="https://codeforces.com/problemset/problem/4/A">4A · Watermelon</a> and expand Solution videos in the right sidebar.</li></ol>
<p>If you see source code instead, use Tampermonkey → Dashboard → Utilities → Import from URL and paste this script’s URL.</p><p>The library is available on the <a href="https://codeforces.com/">Codeforces home page</a>. Search results are cached locally for six hours; Refresh skips the cache.</p></main>`;
http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url?.split('?')[0] === '/codeforces-video-solutions.user.js') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.end(await readFile(script));
  } else if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  } else res.writeHead(404).end('Not found');
}).listen(port, '127.0.0.1', () => console.log(`Installer: http://127.0.0.1:${port}`));
