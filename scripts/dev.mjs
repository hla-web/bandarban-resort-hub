import { spawn } from 'node:child_process';
const children=['@bandarban/backend','@bandarban/clientend','@bandarban/adminend','@bandarban/hotelend'].map(workspace=>spawn('npm',['run',process.argv.includes('--built')?'start':'dev',`--workspace=${workspace}`],{stdio:'inherit',env:process.env,detached:process.platform!=='win32'}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children){try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{}}setTimeout(()=>process.exit(code),400);}
for(const child of children){child.on('exit',code=>{if(!stopping)stop(code||1);});child.on('error',error=>{console.error(error.message);stop(1);});}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
