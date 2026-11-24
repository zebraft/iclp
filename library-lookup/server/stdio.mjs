import readline from 'node:readline';
import {dispatch} from './rpc.mjs';
import {UI_HTML} from './ui-generated.mjs';
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})) {
 let result;
 if(line.length>96_000)result={jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request too large'}};
 else try{result=await dispatch(JSON.parse(line),process.env,UI_HTML);}catch{result={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
 if(result!==null)process.stdout.write(JSON.stringify(result)+'\n');
}
