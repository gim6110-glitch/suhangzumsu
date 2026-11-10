/* ScoreGuard scanning engine v2. Browser-only; OCR is restricted to score columns. */
"use strict";
const sg2 = { worker:null, headerWorker:null, busy:false, runId:0 };
function sgCluster(nums,gap=4){const chunks=[];for(const n of nums){const last=chunks.at(-1);if(last&&n-last.at(-1)<=gap)last.push(n);else chunks.push([n])}return chunks.map(c=>Math.round(c.reduce((s,n)=>s+n,0)/c.length))}
function sgGray(canvas){const {width:w,height:h}=canvas;const rgba=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,w,h).data;const gray=new Uint8Array(w*h);for(let i=0,j=0;i<rgba.length;i+=4,j++)gray[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;return {w,h,gray}}
function sgRuns(line,threshold,minLength,bridge=4){let count=0,run=0,gap=0;for(let i=0;i<line.length;i++){if(line[i]<threshold){run+=1+gap;gap=0}else if(run&&gap<bridge){gap++}else{if(run>=minLength)count+=run;run=0;gap=0}}if(run>=minLength)count+=run;return count}
function sgGrid(canvas){
 const {w,h,gray}=sgGray(canvas);const ys=[];
 const x0=Math.floor(w*.025),x1=Math.floor(w*.92),minLength=Math.max(45,Math.floor(w*.055));
 for(let y=Math.floor(h*.11);y<Math.floor(h*.9);y+=2){const row=gray.subarray(y*w+x0,y*w+x1);if(sgRuns(row,247,minLength)>Math.max(70,w*.06))ys.push(y)}
 let grouped=sgCluster(ys,5);const segments=[];let seq=[];
 for(const y of grouped){if(seq.length&&y-seq.at(-1)>Math.max(105,h*.07)){if(seq.length>=6)segments.push(seq);seq=[]}seq.push(y)}
 if(seq.length>=6)segments.push(seq);
 if(!segments.length)throw Error("학생 점수 표의 가로선을 충분히 찾지 못했습니다. PDF 방향·스캔 품질을 확인하세요.");
 segments.sort((a,b)=>b.length-a.length);let rows=segments[0];
 const y0=rows[0],y1=rows.at(-1),tall=Math.max(50,Math.floor(h*.028));const colXs=[];
 for(let x=Math.floor(w*.025);x<Math.floor(w*.9);x+=2){
   const col=new Uint8Array(y1-y0+1);for(let j=0,y=y0;y<=y1;y++,j++)col[j]=gray[y*w+x];
   if(sgRuns(col,247,tall)>Math.max(58,(y1-y0)*.27))colXs.push(x)
 }
 let xs=sgCluster(colXs,5).filter((x,i,a)=>i===0||x-a[i-1]>10);
 if(xs.length<3)throw Error("세로 점수 열을 찾지 못했습니다. 선명한 PDF를 사용하거나 수동 검증을 이용하세요.");
 const gaps=xs.slice(1).map((v,i)=>v-xs[i]).filter(n=>n>24).sort((a,b)=>a-b);let pitch=gaps[Math.floor((gaps.length-1)/2)]||Math.max(30,w*.07);pitch=Math.min(Math.max(pitch,30),w*.15);
 let repaired=[xs[0]];let inferred=0;
 for(let i=1;i<xs.length;i++){const now=xs[i],prev=repaired.at(-1);const missing=Math.max(0,Math.round((now-prev)/pitch)-1);if(missing&&missing<=7&&now-prev>pitch*1.65){for(let j=1;j<=missing;j++){repaired.push(Math.round(prev+(now-prev)*j/(missing+1)));inferred++}}repaired.push(now)}
 xs=repaired;
 if(xs.length<=4&&xs[0]>w*.16){xs.unshift(Math.max(3,Math.round(xs[0]-pitch)));inferred++}
 const looksComplete=xs[0]<w*.155;
 const colIndices=[];for(let j=looksComplete?2:0;j<xs.length-1;j++)if(xs[j+1]-xs[j]>=22)colIndices.push(j);
 if(!colIndices.length)throw Error("숫자 점수 열을 확정할 수 없습니다.");
 const widths=rows.slice(1).map((y,i)=>y-rows[i]).filter(v=>v>10&&v<130).sort((a,b)=>a-b);const rh=widths[Math.floor(widths.length/2)]||28;
 return {xs,ys:rows,cols:colIndices,canvasWidth:w,canvasHeight:h,inferred,looksComplete,rowHeight:rh}
}
function sgCropColumn(canvas,g,col,scale=2.7){
 const x0=Math.round(g.xs[col]+4),x1=Math.round(g.xs[col+1]-4),y0=g.ys[0]+2,y1=g.ys.at(-1)-2;
 const width=Math.max(4,x1-x0),height=Math.max(4,y1-y0);
 const c=document.createElement("canvas");c.width=Math.ceil(width*scale);c.height=Math.ceil(height*scale);
 const ctx=c.getContext("2d",{willReadFrequently:true});ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=true;
 ctx.drawImage(canvas,x0,y0,width,height,0,0,c.width,c.height);
 const image=ctx.getImageData(0,0,c.width,c.height);
 for(let k=0;k<image.data.length;k+=4){const v=(image.data[k]*77+image.data[k+1]*150+image.data[k+2]*29)>>8;const binary=v<222?0:255;image.data[k]=image.data[k+1]=image.data[k+2]=binary}
 ctx.putImageData(image,0,0);return {canvas:c,y0,scale}
}
function sgTSV(t){return String(t||"").trim().split(/\r?\n/).slice(1).map(l=>l.split("\t")).filter(a=>a.length>=12&&a[0]==="5").map(a=>({text:a.slice(11).join("\t").trim(),conf:Number(a[10]),top:Number(a[7]),h:Number(a[9])})).filter(a=>a.text)}
async function sgGetOCR(){if(!window.Tesseract)throw Error("OCR 라이브러리가 연결되지 않았습니다. 광고차단·학교망 CDN 차단을 확인하세요.");if(!sg2.worker){sg2.worker=await Tesseract.createWorker("eng",1);await sg2.worker.setParameters({tessedit_char_whitelist:"0123456789.,",tessedit_pageseg_mode:Tesseract.PSM.SINGLE_BLOCK,preserve_interword_spaces:"1"})}return sg2.worker}
async function sgGetHeaderOCR(){if(!window.Tesseract)return null;try{if(!sg2.headerWorker){sg2.headerWorker=await Tesseract.createWorker("kor",1);await sg2.headerWorker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SINGLE_BLOCK})}return sg2.headerWorker}catch(e){console.warn("Korean header OCR unavailable",e);return null}}
async function sgHeaderSubject(canvas){try{const worker=await sgGetHeaderOCR();if(!worker)return null;const c=document.createElement("canvas");c.width=canvas.width;c.height=Math.round(canvas.height*.205);const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="white";x.fillRect(0,0,c.width,c.height);x.drawImage(canvas,0,0,Math.round(canvas.width*.77),c.height,0,0,Math.round(canvas.width*.77),c.height);const {data}=await worker.recognize(c);return matchSubject(data.text||"")}catch(e){console.warn("Header detection",e);return null}}
function sgValueAt(row,col){return row.entries[col]?.value??null}
function sgGuessStudentEnd(rows,cols){if(rows.length<=3)return rows.length;let summary=rows.length;
 for(let i=2;i<rows.length;i++){const vals=cols.map(c=>sgValueAt(rows[i],c)).filter(v=>v!==null);if(vals.length<2)continue;
   const large=vals.filter(v=>v>=135).length,decimal=vals.filter(v=>Math.abs(v-Math.round(v))>.001).length;
   if(large>=1||decimal>=2){summary=i;if(i>0){const prev=cols.map(c=>sgValueAt(rows[i-1],c)).filter(v=>v!==null);if(prev.length>=2&&prev.every(v=>v<=40)&&new Set(prev).size<=2)summary=i-1}break}
 }
 return Math.max(1,summary)
}
async function sgOcrGrid(canvas,g,onProgress){
 const worker=await sgGetOCR();const entries=Array.from({length:g.ys.length-1},()=>({}));
 for(const [ci,col] of g.cols.entries()){const clip=sgCropColumn(canvas,g,col);const {data}=await worker.recognize(clip.canvas,{}, {tsv:true});
 for(const wd of sgTSV(data.tsv)){const value=parseNumber(wd.text);if(value===null)continue;
 const cy=clip.y0+(wd.top+wd.h/2)/clip.scale;let row=-1;for(let i=0;i<g.ys.length-1;i++){if(cy>=g.ys[i]-2&&cy<=g.ys[i+1]+2){row=i;break}}
 if(row<0)continue;const old=entries[row][col];if(!old||wd.conf>old.confidence)entries[row][col]={value,raw:wd.text,confidence:wd.conf}
 }
 onProgress("점수 열 "+(ci+1)+"/"+g.cols.length+" 판독 완료");await delay(0)
 }
 let rows=entries.map((e,i)=>({index:i+1,entries:e,studentRow:i+1,numeric:Object.values(e).filter(x=>x?.value!==null).length}));
 const numericCols=g.cols.filter(col=>entries.filter(e=>e[col]?.value!==null).length>=Math.max(2,Math.floor(entries.length*.18)));
 const colUse=numericCols.length?numericCols:g.cols;
 const candidate=rows.map((r,i)=>colUse.filter(col=>r.entries[col]?.value!==null).length>=Math.min(2,colUse.length)?i:-1).filter(i=>i>=0);
 if(!candidate.length)throw Error("숫자 칸에서 점수를 판독하지 못했습니다. 스캔 해상도를 높여 주세요.");
 const allRecognizedRows=rows;
 const denseMin=Math.min(3,colUse.length);
 const density=rows.map(r=>colUse.filter(c=>r.entries[c]?.value!==null).length);
 let start=candidate[0];
 for(let i=0;i<rows.length;i++){
   if(density[i]<denseMin)continue;
   const following=[density[i+1]||0,density[i+2]||0,density[i+3]||0].filter(n=>n>=denseMin).length;
   if(following>=1){if(i-start<=7)start=Math.max(start,i);break}
 }
 rows=rows.slice(start);
 const allRows=rows;let end=sgGuessStudentEnd(allRows,colUse);rows=allRows.slice(0,end);
 rows.forEach((r,i)=>r.studentRow=i+1);
 const warnings=g.inferred?["일부 열 경계가 추정되었습니다. 점수 열 연결을 확인하세요."]:[];
 if(start>0)warnings.push("표의 앞쪽 "+start+"개 구간을 머리글 후보로 제외했습니다. 학생 첫 행이 누락되지 않았는지 확인하세요.");
 return {rows,allRows,allRecognizedRows,startOffset:start,cols:colUse,grid:g,ocrWarnings:warnings}
}
async function scanFiles(files){
 if(sg2.busy){toast("다른 PDF를 분석하는 중입니다.");return}
 if(!files.length)return;sg2.busy=true;sg2.runId++;const thisRun=sg2.runId;
 $("processing").hidden=false;$("scan-result").hidden=true;$("processing-title").textContent="일람표를 분석하고 있습니다";state.scans=[];state.pdfs=[];state.verification=[];
 let successful=0,failed=[];
 try{
  if(files.length>8)throw Error("한 번에 최대 8개 PDF 파일을 선택할 수 있습니다.");
  for(let fi=0;fi<files.length;fi++){
   const f=files[fi];const doc=await openPDF(f);state.pdfs.push(doc);
   if(doc.numPages>150)throw Error("파일당 최대 150쪽까지 분석할 수 있습니다.");
   for(let pi=1;pi<=doc.numPages;pi++){
    $("processing-detail").textContent="파일 "+(fi+1)+"/"+files.length+" · "+pi+"/"+doc.numPages+"쪽 표 위치 분석";
    await delay(0);
    try{
     const page=await doc.getPage(pi),pdfSubject=await maybePageHeader(page);
     const canvas=await pdfPageCanvas(page,2.2);const grid=sgGrid(canvas);
     $("processing-detail").textContent="파일 "+(fi+1)+" · "+pi+"쪽 점수 열 판독 중";
     const found=await sgOcrGrid(canvas,grid,t=>{$("processing-detail").textContent="파일 "+(fi+1)+" · "+pi+"쪽: "+t});
     let subject=pdfSubject;
     if(!subject)subject=await sgHeaderSubject(canvas);
     state.scans.push({...found,sourceIndex:fi,fileName:f.name,page:pi,subject,readOk:true});
     successful++;
    }catch(e){failed.push({file:fi+1,page:pi,reason:e.message});state.scans.push({sourceIndex:fi,fileName:f.name,page:pi,rows:[],cols:[],grid:null,subject:null,readOk:false,readError:e.message});console.warn("Page read failed",fi+1,pi,e.message)}
   }
  }
  if(!successful)throw Error("점수표를 읽은 페이지가 없습니다. 스캔 상태와 표 형식을 확인하세요.");
  state.activePage=state.scans.findIndex(s=>s.readOk);
  sgRefreshPageSelect();showScan();$("scan-result").hidden=false;
  const elem=sgControlBar();elem.querySelector("#sg-scan-errors").textContent=failed.length?"판독 실패 "+failed.length+"쪽: "+failed.slice(0,6).map(x=>x.file+"번 파일 "+x.page+"쪽").join(", "):"전체 "+successful+"쪽에서 점수 열을 찾았습니다.";
  toast("스캔 "+successful+"쪽 완료 · 검토할 페이지 "+state.scans.length+"쪽");
 }catch(e){console.error(e);toast("일람표 처리 실패: "+e.message);$("processing-title").textContent="분석 실패";$("processing-detail").textContent=e.message}finally{
  sg2.busy=false;setTimeout(()=>{$("processing").hidden=true},1400);
  if(sg2.worker){await sg2.worker.terminate();sg2.worker=null}
  if(sg2.headerWorker){await sg2.headerWorker.terminate();sg2.headerWorker=null}
 }
}
function sgRefreshPageSelect(){options($("verify-page"),state.scans.map((s,i)=>({value:String(i),label:"파일 "+(s.sourceIndex+1)+" / "+s.page+"쪽"+(s.readOk?" · "+s.rows.length+"행":" · 판독 실패")})));$("verify-page").value=String(state.activePage)}
function sgControlBar(){let el=$("sg-multipage");if(el)return el;
 el=document.createElement("div");el.id="sg-multipage";el.className="details";el.innerHTML='<div class="actions"><button class="btn secondary" id="sg-prev">← 이전 페이지</button><button class="btn secondary" id="sg-next">다음 페이지 →</button><button class="btn primary" id="sg-verify-all">매핑 확인된 모든 페이지 검증</button><button class="btn secondary" id="sg-export-mapping">기준 연결표 CSV</button></div><div class="actions"><label class="check">학생 점수 행 수 <input id="sg-student-count" type="number" min="1" max="200" style="width:75px;padding:8px;border:1px solid #ccdce9;border-radius:8px"></label><button class="btn secondary" id="sg-apply-count">학생 행 수 적용</button><button class="btn secondary" id="sg-copy-mapping">동일 과목·동일 열 구조에 매핑 적용</button><button class="btn secondary" id="sg-preview-score">숫자 열만 미리보기</button></div><p id="sg-scan-errors" class="muted"></p><p class="muted">일람표는 파일마다 과목이 다를 수 있습니다. 각 페이지에서 영역 연결을 확인한 뒤 검증하세요. 누락되거나 판독이 불분명한 페이지는 ‘확인 필요’로 남깁니다.</p>';
 $("scan-result").insertBefore(el,$("scan-result").children[1]);
 el.querySelector("#sg-prev").onclick=()=>sgTurn(-1);el.querySelector("#sg-next").onclick=()=>sgTurn(1);
 el.querySelector("#sg-verify-all").onclick=sgVerifyAll;
 el.querySelector("#sg-apply-count").onclick=sgApplyStudentCount;
 el.querySelector("#sg-copy-mapping").onclick=sgCopyMappings;
 el.querySelector("#sg-preview-score").onclick=sgPreviewScores;
 el.querySelector("#sg-export-mapping").onclick=()=>downloadCSV("수행평가_페이지별_영역연결_익명.csv",["파일번호","쪽","판독상태","학과","과목","영역ID","점수열"],state.scans.flatMap(s=>!s.readOk?[[s.sourceIndex+1,s.page,"실패", "","", "", ""]]: (s.savedMapping||[]).map(m=>[s.sourceIndex+1,s.page,"완료",s.subject?.department||"",s.subject?.subject||"",m.areaId,m.col])));
 return el
}
function sgApplyStudentCount(){const scan=state.scans[state.activePage];if(!scan?.allRows)return;const n=Number($("sg-student-count").value);if(!Number.isInteger(n)||n<1||n>scan.allRows.length){toast("1~"+scan.allRows.length+" 사이의 행 수를 입력하세요.");return}scan.rows=scan.allRows.slice(0,n).map((r,i)=>({...r,studentRow:i+1}));scan.rowsManuallySet=true;showScan();toast("학생 점수 행 "+n+"개로 적용했습니다.")}
function sgCopyMappings(){const s=state.scans[state.activePage];if(!s?.readOk)return;const mapping=sgMapping().filter(m=>m.areaId!=="__TOTAL__"||m.areaId==="__TOTAL__");if(!s.scope){toast("먼저 학년·과정 평가계획을 선택하세요.");return}if(!mapping.length){toast("먼저 점수 열을 연결하세요.");return}s.savedMapping=mapping;s.subject={department:$("verify-dept").value,subject:$("verify-subject").value};let count=0;for(const other of state.scans){if(other===s||!other.readOk||other.cols.length!==s.cols.length)continue;const same=other.scope===s.scope&&other.subject&&other.subject.department===s.subject.department&&other.subject.subject===s.subject.subject;if(!same)continue;const indexMapping=mapping.map(m=>{const ix=s.cols.indexOf(m.col);return {col:other.cols[ix],areaId:m.areaId}});if(indexMapping.some(x=>x.col===undefined))continue;other.savedMapping=indexMapping;count++}toast("동일 학과·과목에 "+count+"쪽의 점수 열 연결을 복사했습니다.")}
async function sgPreviewScores(){
 const s=state.scans[state.activePage];if(!s?.readOk||!s.grid){toast("이 페이지의 점수 칸이 아직 분석되지 않았습니다.");return}
 try{
 const doc=state.pdfs[s.sourceIndex],page=await doc.getPage(s.page),canvas=await pdfPageCanvas(page,2.2);
 const g=s.grid;const x0=Math.max(0,Math.floor(g.xs[s.cols[0]]+2)),x1=Math.min(canvas.width,Math.ceil(g.xs[Math.max(...s.cols)+1]-2)),y0=Math.max(0,g.ys[0]),y1=Math.min(canvas.height,g.ys.at(-1));
 if(x1<=x0||y1<=y0)throw Error("안전한 숫자 열 범위를 표시할 수 없습니다.");
 let box=$("sg-score-preview");if(!box){box=document.createElement("div");box.id="sg-score-preview";box.className="details";$("column-mapping").insertAdjacentElement("afterend",box)}
 box.innerHTML='<h3>개인정보를 제외한 점수 열 확인</h3><p class="muted">원본 PDF에서 성명·학번 영역을 제외하고 점수 열만 보여줍니다. 원본 PDF는 외부로 전송되지 않습니다.</p>';
 const crop=document.createElement("canvas");crop.width=x1-x0;crop.height=y1-y0;
 crop.getContext("2d").drawImage(canvas,x0,y0,crop.width,crop.height,0,0,crop.width,crop.height);
 crop.style.cssText="max-width:100%;height:auto;border:1px solid #dee8f0";box.appendChild(crop);box.scrollIntoView({behavior:"smooth"});
 }catch(e){toast("미리보기 실패: "+e.message)}
}
function sgTurn(delta){if(!state.scans.length)return;state.activePage=Math.min(state.scans.length-1,Math.max(0,state.activePage+delta));$("verify-page").value=String(state.activePage);showScan()}
function sgAreasForScan(scan){return state.referenceSources?.[scan?.scope]?.areas||[]}
function sgRefreshSubjectForPage(){
 const scan=state.scans[state.activePage];if(!scan?.readOk||!scan.scope)return;
 const pool=sgAreasForScan(scan);
 const subjects=[...new Set(pool.filter(x=>x.department===$("verify-dept").value).map(x=>x.subject))];
 const selected=scan.subject?.subject;
 options($("verify-subject"),subjects,subjects.includes(selected)?selected:subjects[0]);
 scan.savedMapping=[];renderMappings();
}
function sgRefreshVerifyControls(){
 const scan=state.scans[state.activePage];if(!scan?.readOk)return;
 const pool=sgAreasForScan(scan);
 if(!pool.length){options($("verify-dept"),[]);options($("verify-subject"),[]);$("column-mapping").innerHTML='<p class="muted">이 페이지에 적용할 학년·과정 평가계획을 먼저 선택하세요.</p>';return}
 const depts=[...new Set(pool.map(x=>x.department))];const desired=scan.subject?.department;
 options($("verify-dept"),depts,depts.includes(desired)?desired:depts[0]);
 const subjects=[...new Set(pool.filter(x=>x.department===$("verify-dept").value).map(x=>x.subject))];
 options($("verify-subject"),subjects,subjects.includes(scan.subject?.subject)?scan.subject.subject:subjects[0]);
 renderMappings();
}
function showScan(){const scan=state.scans[state.activePage];if(!scan)return;sgControlBar();$("scan-info").textContent="파일 "+(scan.sourceIndex+1)+" / PDF "+scan.page+"쪽"+(scan.readOk?" · 학생 행 "+scan.rows.length+"개 · 숫자 열 "+scan.cols.length+"개":" · 판독 실패: "+scan.readError);
 if(!scan.readOk){$("column-mapping").innerHTML='<div class="notice neutral">이 페이지의 점수를 읽지 못했습니다. 선명한 파일로 다시 스캔하거나 원본에서 직접 확인해 주세요.</div>';$("run-verification").disabled=true;return}
 $("run-verification").disabled=false;
 $("verify-scope").value=scan.scope||"";
 sgRefreshVerifyControls();$("verify-page").value=String(state.activePage);const countEl=$("sg-student-count");if(countEl){countEl.max=String(scan.allRows?.length||scan.rows.length);countEl.value=String(scan.rows.length)}
}
function renderMappings(){const scan=state.scans[state.activePage];if(!scan?.readOk)return;const dept=$("verify-dept").value,subject=$("verify-subject").value;const areas=sgAreasForScan(scan).filter(a=>a.department===dept&&a.subject===subject);
 const boxes=scan.cols.map((col,i)=>{const samples=scan.rows.map(r=>r.entries[col]?.value).filter(n=>n!==null).slice(0,6);const sel=(scan.savedMapping||[]).find(m=>m.col===col);
 return '<div class="mapping-card"><label>점수 열 '+(i+1)+' <select data-mapcol="'+col+'"><option value="">검증 제외 (소계/합계/불필요 열)</option>'+areas.map(a=>'<option value="'+escaped(a.id)+'" '+(sel?.areaId===a.id?"selected":"")+'>'+escaped(a.area)+' ('+a.max+'점)</option>').join("")+'<option value="__TOTAL__" '+(sel?.areaId==="__TOTAL__"?"selected":"")+'>전체 합계 열 (산술검증)</option></select></label><div class="hint">판독 예: '+escaped(samples.join(", ")||"인식 실패")+' · 자동 매핑하지 않음</div></div>'}).join("");
 $("column-mapping").innerHTML=boxes+(scan.ocrWarnings?.length?'<p class="muted">'+escaped(scan.ocrWarnings.join(" · "))+'</p>':"");
 $("verification-summary").innerHTML="";$("verification-body").innerHTML='<tr><td colspan="6" class="empty">실제 평가 영역을 연결하고 검증을 시작하세요. 이름·학번은 표시하지 않습니다.</td></tr>';
}
function sgMapping(){return [...document.querySelectorAll("[data-mapcol]")].map(e=>({col:Number(e.dataset.mapcol),areaId:e.value})).filter(m=>m.areaId)}
function sgValidatePage(scan,mapping){
 if(!scan.scope||!state.referenceSources?.[scan.scope])throw Error("해당 PDF 페이지의 학년·과정 기준을 선택하지 않았습니다.");
 const ids=mapping.filter(m=>m.areaId!=="__TOTAL__").map(m=>m.areaId);
 if(!ids.length)throw Error("영역 점수 열을 한 개 이상 선택하세요.");
 if(new Set(ids).size!==ids.length)throw Error("같은 영역이 여러 점수 열에 중복 연결됐습니다.");
 let results=[];for(const row of scan.rows){
  const values={};for(const m of mapping){values[m.areaId]=row.entries[m.col]?.value??null}
  for(const m of mapping){
   if(m.areaId==="__TOTAL__")continue;
   const area=sgAreasForScan(scan).find(a=>a.id===m.areaId);if(!area)continue;
   const entry=row.entries[m.col];const score=entry?.value??null;let assessment=validation(area,score);
   if(entry&&Number.isFinite(entry.confidence)&&entry.confidence<75&&assessment.kind==="ok")assessment={status:"판독 확인",kind:"review",reason:"OCR 확신도 "+Math.round(entry.confidence)+"%: 원문 숫자를 확인해야 합니다."};
   results.push({scope:scan.scope,file:scan.sourceIndex+1,page:scan.page,row:row.studentRow,areaId:area.id,area:area.area,department:area.department,subject:area.subject,value:score,max:area.max,raw:entry?.raw||"",confidence:entry?.confidence??null,status:assessment.status,kind:assessment.kind,reason:assessment.reason,col:m.col})
  }
  const total=mapping.find(m=>m.areaId==="__TOTAL__");if(total){const actual=row.entries[total.col]?.value??null;const scores=mapping.filter(m=>m.areaId!=="__TOTAL__").map(m=>row.entries[m.col]?.value??null);if(actual!==null&&scores.every(Number.isFinite)){const sum=scores.reduce((a,b)=>a+b,0);let d=Math.round((actual-sum)*100)/100;const ok=Math.abs(d)<.011;results.push({scope:scan.scope,file:scan.sourceIndex+1,page:scan.page,row:row.studentRow,areaId:"__TOTAL__",area:"전체 합계 검산",department:scan.subject?.department||"",subject:scan.subject?.subject||"",value:actual,max:"—",raw:row.entries[total.col]?.raw||"",status:ok?"정상":"합계 확인",kind:ok?"ok":"review",reason:ok?"선택 영역 합계와 일치":"기록 합계 "+actual+"점, 선택 영역 합계 "+sum+"점. 소계 포함 여부 확인",col:total.col})}}
 }
 return results
}
function verify(){try{const scan=state.scans[state.activePage];if(!scan?.readOk)throw Error("이 페이지는 점수 판독에 실패했습니다.");const mapping=sgMapping();if(!scan.scope)throw Error("이 페이지의 평가계획을 먼저 선택하세요.");scan.savedMapping=mapping;scan.subject={department:$("verify-dept").value,subject:$("verify-subject").value};state.verification=sgValidatePage(scan,mapping);$("export-results").disabled=!state.verification.length;refreshStats();renderVerification();toast("해당 페이지 "+state.verification.length+"건 점수 검증 완료")}catch(e){toast(e.message)}}
function sgVerifyAll(){let collected=[],missed=[];for(const s of state.scans){if(!s.readOk){missed.push({file:s.sourceIndex+1,page:s.page,reason:s.readError});continue}if(!s.savedMapping?.some(x=>x.areaId!=="__TOTAL__")){missed.push({file:s.sourceIndex+1,page:s.page,reason:"영역 연결 미확인"});continue}try{collected.push(...sgValidatePage(s,s.savedMapping))}catch(e){missed.push({file:s.sourceIndex+1,page:s.page,reason:e.message})}}
 state.verification=collected;state.unverifiedPages=missed;$("export-results").disabled=!collected.length;refreshStats();renderVerification();const el=$("sg-scan-errors");el.textContent="전체 페이지 중 검증 완료 "+state.scans.length+"쪽, 보류 "+missed.length+"쪽 ("+missed.slice(0,5).map(x=>x.file+"번 파일 "+x.page+"쪽: "+x.reason).join(" / ")+")";toast("검증 "+collected.length+"건 · 미검증 페이지 "+missed.length+"쪽")}
function renderVerification(){const data=state.verification;const count={ok:0,error:0,review:0};for(const r of data)count[r.kind]=(count[r.kind]||0)+1;$("verification-summary").innerHTML='<div class="summary-item">점수 검증<b>'+fmt(data.length)+'</b></div><div class="summary-item">정상<b>'+fmt(count.ok)+'</b></div><div class="summary-item">오류 의심<b>'+fmt(count.error)+'</b></div><div class="summary-item">확인 필요<b>'+fmt(count.review)+'</b></div>';
 const shown=$("only-problems").checked?data.filter(r=>r.kind!=="ok"):data;
 $("verification-body").innerHTML=shown.slice(0,1500).map(r=>'<tr><td>파일 '+r.file+' / '+r.page+'쪽 / '+r.row+'행</td><td>'+escaped(r.area)+'</td><td><input class="input-score '+(r.kind==="ok"?"":"flag")+'" data-result-index="'+data.indexOf(r)+'" type="number" step="0.01" min="0" value="'+(r.value??"")+'"></td><td>'+r.max+'</td><td><span class="status '+r.kind+'">'+escaped(r.status)+'</span></td><td style="white-space:normal;min-width:200px">'+escaped(r.reason)+'</td></tr>').join("")||'<tr><td class="empty" colspan="6">검증할 기록이 없습니다.</td></tr>';
 if(shown.length>1500){const note=document.createElement("p");note.className="muted";note.textContent="화면은 처음 1,500건만 표시합니다. 전체 기록은 CSV로 저장하세요.";$("verification-body").parentElement.after(note)}
}
function exportResults(){if(!state.verification.length){toast("검증된 기록이 없습니다.");return}downloadCSV("수행평가_익명_검증결과.csv",["평가기준","파일번호","PDF쪽","학생행번호","학과","과목","영역","점수","만점","OCR신뢰도","판정","사유"],state.verification.map(r=>[r.scope,r.file,r.page,r.row,r.department,r.subject,r.area,r.value??"",r.max,r.confidence??"",r.status,r.reason]));toast("개인정보를 포함하지 않는 CSV를 저장했습니다.")}
document.addEventListener("DOMContentLoaded",()=>{$("verify-scope").addEventListener("change",e=>{const scan=state.scans[state.activePage];if(!scan)return;scan.scope=e.target.value;scan.subject=null;scan.savedMapping=[];sgRefreshVerifyControls()});$("verify-dept").addEventListener("change",()=>{const s=state.scans[state.activePage];if(s?.readOk)s.savedMapping=[]});$("verify-subject").addEventListener("change",()=>{const s=state.scans[state.activePage];if(s?.readOk)s.savedMapping=[]});});
