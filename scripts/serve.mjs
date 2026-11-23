import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve(process.argv[2]||'out');
const port=Number(process.argv[3]||3000);
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.map':'application/json'};
if(!fs.existsSync(path.join(directory,'index.html')))throw new Error('Build the app first with npm run build.');
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let filename;
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(directory,'.'+pathname);if(filename!==directory&&!filename.startsWith(directory+path.sep)){res.writeHead(403);res.end();return;}if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');if(!fs.existsSync(filename)&&fs.existsSync(filename+'.html'))filename+='.html';}catch{res.writeHead(400);res.end();return;}
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':contentTypes[path.extname(filename)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(filename).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
