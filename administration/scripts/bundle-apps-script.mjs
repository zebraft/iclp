import {readFile,writeFile} from 'node:fs/promises';
const core=await readFile(new URL('../lib/reconciliation.mjs',import.meta.url),'utf8');
const bridge=await readFile(new URL('../google-workspace/apps-script/Bridge.gs',import.meta.url),'utf8');
const output='// Generated from the shared reconciliation engine. Do not edit this copy.\n'+bridge+'\n'+core.replace(/^export /gm,'');
await writeFile(new URL('../public/setup/Code.gs',import.meta.url),output);
