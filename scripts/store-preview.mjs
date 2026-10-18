import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {validateState} from '../core.js';
const example=validateState(JSON.parse(await readFile(new URL('../store/example-backups/review-current.json',import.meta.url))));
const before=validateState(JSON.parse(await readFile(new URL('../store/example-backups/review-baseline.json',import.meta.url))));
const allowed=new Set(['app.html','app.js','core.js','storage.js','profile-ui.js','profile.css','style.css','list.css','scan.css','scan-controls.js','scan-launch.js','progress-model.js','ui-refresh.js','list-view.js','icons/icon-48.png']);
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),name=url.pathname.slice(1)||'app.html';
 if(!allowed.has(name)){res.writeHead(404).end();return;}
 let body;
 if(name==='storage.js')body=`let state=${JSON.stringify(example)};export const isExtension=false;export async function readState(){return structuredClone(state)}export async function updateState(fn){fn(state);return structuredClone(state)}`;
 else {body=await readFile(new URL('../'+name,import.meta.url));
  if(name==='app.html')body=body.toString().replace('src="app.js"','src="app.js?view='+(['following','notBack','fansOnly'].includes(url.searchParams.get('view'))?url.searchParams.get('view'):'following')+'"').replace('</head>','<style>body::after{content:"商店展示 · 虚构示例数据，非真实扫描结果";position:fixed;bottom:0;left:0;z-index:999;background:#203f35;color:white;padding:4px 12px;font-size:11px;pointer-events:none}</style></head>');
  if(name==='app.js')body=body.toString().replace("comparisonBackup = null, comparisonFilename = ''",`comparisonBackup = ${JSON.stringify(before)}, comparisonFilename = '示例历史备份.json'`)+`\nswitchView(${JSON.stringify(['following','notBack','fansOnly'].includes(url.searchParams.get('view'))?url.searchParams.get('view'):'following')});`;
 }
 res.writeHead(200,{'Content-Type':(name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html')+(name.endsWith('.png')?'':'; charset=utf-8'),'Cache-Control':'no-store'}).end(body);
}catch(error){res.writeHead(500).end(String(error))}}).listen(4174,'127.0.0.1',()=>console.log('Store-only memory preview: http://127.0.0.1:4174/app.html'));
