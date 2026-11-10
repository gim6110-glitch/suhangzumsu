import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('scoreguard-v3.js','utf8');
new vm.Script(source,{filename:'scoreguard-v3.js'});
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('./scoreguard-v3.js'),'V3 script linked');
const area={id:'A1',max:50,base:18,allowed:[18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50],subject:'예제',department:'학과',area:'실습'};
const scan={sourceIndex:0,page:1,scope:'vocational',readOk:true,rows:[{studentRow:1,entries:{2:{value:36,confidence:99,raw:'36'}}}],savedMapping:[{col:2,areaId:'A1'}],subject:{department:'학과',subject:'예제'}};
const state={referenceSources:{vocational:{areas:[area]}},scans:[scan],verification:[],activePage:0};
const ctx={state,console,
 document:{addEventListener(){}},window:{confirm:()=>true},URL,Set,Math,Number,
 getPDFJS:async()=>({}),openPDF:async()=>({}),sgGetOCR:async()=>({}),sgGetHeaderOCR:async()=>({}),sgPlanOCR:async()=>({}),
 scanFiles:async()=>{},showScan:()=>{},sgValidatePage:(_s,m)=>[{file:1,page:1,row:1,col:2,areaId:'A1',area:'실습',value:36,max:50,kind:'ok',status:'정상',reason:'가능 점수'}],
 updateResult:()=>{},exportResults:()=>{},sgVerifyAll:()=>{},renderVerification:()=>{},renderMappings:()=>{},validation:(a,v)=>({kind:a.allowed.includes(v)?'ok':'error',status:a.allowed.includes(v)?'정상':'오류 의심',reason:''}),
 $,norm:s=>String(s||'').replace(/\\s/g,''),fmt:n=>String(n),escaped:x=>String(x),
 toast(){},downloadCSV(){},crypto:{subtle:{digest:async()=>new Uint8Array(32)}}
};
function $(x){return null}
vm.createContext(ctx);
vm.runInContext(source,ctx);
let rows=ctx.sgValidatePage(scan,scan.savedMapping);
assert.equal(rows[0].kind,'review','unreviewed OCR must never be marked correct');
assert.equal(rows[0].confirmed,false);
scan.reviewed=true;
rows=ctx.sgValidatePage(scan,scan.savedMapping);
assert.equal(rows[0].kind,'ok','user confirmed allowed point is correct');
assert.equal(rows[0].confirmed,true);
scan.reviewed=false;scan.manual=true;scan.rows[0].entries[2].manual=true;
rows=ctx.sgValidatePage(scan,scan.savedMapping);
assert.equal(rows[0].kind,'ok','manually entered values are confirmed');
const result=ctx.sg3BuildReport();
assert.equal(result.completed.length,1);
assert.equal(result.pending.length,0);
state.scans.push({sourceIndex:0,page:2,readOk:false,readError:'OCR fail'});
const incomplete=ctx.sg3BuildReport();
assert.equal(incomplete.pending.length,1);
assert.equal(incomplete.pending[0].page,2);
console.log('PASS: OCR provisional status / human verification / manual entry / unverified page export');
