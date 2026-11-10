import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { spawn } from "node:child_process";
const server=spawn("python3",["-m","http.server","4174","--bind","127.0.0.1"],{stdio:"ignore"});
let browser;
try{
 await new Promise(r=>setTimeout(r,1200));
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:4174/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#stat-areas")?.textContent.trim()==="145",{timeout:30000});
 const png=await page.evaluate(()=>{
  const c=document.createElement("canvas");c.width=1400;c.height=1600;
  const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle="#111";ctx.font="bold 32px Arial";ctx.fillText("SCORE SHEET - synthetic test only",60,140);
  const xs=[70,260,465,690,925,1170,1330],ys=Array.from({length:10},(_,i)=>300+i*82);
  ctx.lineWidth=3;ctx.strokeStyle="#222";
  for(const x of xs){ctx.beginPath();ctx.moveTo(x,300);ctx.lineTo(x,1038);ctx.stroke()}
  for(const y of ys){ctx.beginPath();ctx.moveTo(70,y);ctx.lineTo(1330,y);ctx.stroke()}
  const heads=["ID","NAME","SCORE 1","SCORE 2","TOTAL","NOTES"];
  ctx.textAlign="center";ctx.font="bold 24px Arial";
  heads.forEach((h,i)=>ctx.fillText(h,(xs[i]+xs[i+1])/2,352));
  const a=[30,28,25,22,18,19,24,27],b=[20,20,20,20,20,20,20,20];
  ctx.font="bold 30px Arial";
  for(let r=0;r<8;r++){
   const mid=300+(r+1)*82+50;
   ctx.fillText(String(r+1),(xs[0]+xs[1])/2,mid);
   ctx.fillText("X",(xs[1]+xs[2])/2,mid);
   ctx.fillText(a[r].toFixed(2),(xs[2]+xs[3])/2,mid);
   ctx.fillText(b[r].toFixed(2),(xs[3]+xs[4])/2,mid);
   ctx.fillText((a[r]+b[r]).toFixed(2),(xs[4]+xs[5])/2,mid);
  }
  return c.toDataURL("image/png").split(",")[1]
 });
 const pdf=await PDFDocument.create();
 const bytes=Buffer.from(png,"base64");
 const embedded=await pdf.embedPng(bytes);
 const p=pdf.addPage([700,800]);p.drawImage(embedded,{x:0,y:0,width:700,height:800});
 const data=Buffer.from(await pdf.save());
 await page.click('[data-tab="verify"]');
 await page.locator("#sheet-input").setInputFiles({name:"synthetic_no_student_data.pdf",mimeType:"application/pdf",buffer:data});
 await page.waitForFunction(()=>state.scans.length>0&&!sg2.busy,{timeout:130000});
 const scan=await page.evaluate(()=>state.scans.map(s=>({readOk:s.readOk,rows:s.rows?.length,cols:s.cols?.length,err:s.readError||"",sample:s.rows?.slice(0,3).map(r=>Object.values(r.entries).map(x=>x?.value))})));
 console.log("SCAN_RESULT",JSON.stringify(scan));
 const diag=await page.evaluate(()=>{const s=state.scans[0];return {xs:s.grid?.xs,ys:s.grid?.ys,cols:s.cols,rows:s.rows?.map(r=>({row:r.studentRow,entries:Object.entries(r.entries).map(([c,v])=>[c,v.value,v.raw,v.confidence])}))}});
 console.log("SCAN_DEBUG",JSON.stringify(diag));
 assert.equal(scan.length,1);
 assert(scan[0].readOk,"Synthetic PDF OCR should succeed: "+scan[0].err);
 assert.equal(scan[0].rows,8,"Expected exactly 8 student rows, not header/summary rows: "+scan[0].rows);
 assert(scan[0].cols>=2,"Too few OCR score columns");
 const values=diag.rows.flatMap(r=>r.entries.map(([c,v])=>v));
 assert(values.includes(30)&&values.includes(20)&&values.includes(50),"Expected real numeric scores were not recognized");
 assert.equal(errors.length,0,"Uncaught browser errors: "+JSON.stringify(errors));
 console.log("PASS: Synthetic image-only PDF -> in-browser numeric OCR and row mapping");
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
