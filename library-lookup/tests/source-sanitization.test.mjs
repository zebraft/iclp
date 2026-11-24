import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','dist','node_modules'].includes(e.name)||e.name.endsWith('-generated.mjs'))continue;const p=path.join(dir,e.name);assert.equal(e.isSymbolicLink(),false,'No symlinks in source');if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
test('published source contains no original identities or deployment bindings',async()=>{
 const patterns=[/appgprj_[a-f0-9]{20,}/i,/asdk_app_sites_[a-f0-9]{20,}/i,/plugin_asdk_app_sites_[a-f0-9]{20,}/i,/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,/https?:\/\/[a-z0-9-]+\.[a-z0-9-]+\.chatgpt\.site/i,/https:\/\/docs\.google\.com\/[^\s]+\/d\/[\w-]{25,}/i,/[\w.+-]+@(?:gmail\.com|as\.edu\.tw)/i];
 for(const p of await files(root)){const text=await readFile(p,'utf8');for(const pattern of patterns)assert.equal(pattern.test(text),false,path.relative(root,p)+' contains an identifying value');}
 const hosting=JSON.parse(await readFile(path.join(root,'.openai/hosting.json'),'utf8'));assert.equal(Object.hasOwn(hosting,'project_id'),false);
 const plugin=JSON.parse(await readFile(path.join(root,'plugin/plugin.json'),'utf8'));assert.equal(plugin.extensions['com.openai'].apps,undefined);
 const mcp=JSON.parse(await readFile(path.join(root,'plugin/mcp.json'),'utf8'));assert.equal(new URL(mcp.mcpServers['library-lookup'].url).hostname,'library.example.invalid');
});
