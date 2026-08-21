/* 开发用静态服务器 */
const http = require('http'), fs = require('fs'), path = require('path');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  let p = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const d = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  } catch (e) { res.writeHead(404); res.end('404: ' + p); }
}).listen(8090, () => console.log('Mistvale dev server on http://localhost:8090'));
