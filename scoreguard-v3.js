/* ScoreGuard v3 — fail-safe review controls, manual fallback, and complete anonymous reporting.
   The data stays in the browser: no student-file upload endpoint or account. */
"use strict";
const SG3={pageWarnings:[],sampleMatches:0};
const SG3samples={
"ea42e6fc41184a7c0f7d7f0d8d7674781ed83307be14403f5788abdb64db27b6":[
"v|음악이론","v|음악이론","v|시창·청음","v|시창·청음","v|음악전공실기","v|음악전공실기","v|합주","v|합주","3|간호의 기초","3|독서","3|독서","2|독서와 작문","2|독서와 작문","3|요양지원","v|건축목공시공","v|제빵","v|자동화 설비","v|내선공사","2|메이크업","v|식품과 영양"],
"11809f094d3211e723cfab022b2bdb4ab6130f98622051f2e3df7c9508c15b7d":[
"v|건축도장시공","3|보건 간호","3|보건 간호","3|기초 간호 임상 실무","3|기초 간호 임상 실무","3|간호의 기초","2|요양 지원","3|피부미용","v|식품과 영양","v|식품과 영양","v|빅데이터 분석","v|기계요소 설계","v|기계제도","v|식품과 영양","2|영어II","3|영어 독해와 작문","3|영어 독해와 작문","v|바리스타","v|바리스타","v|제과","v|제과","v|전기전자기초","v|산업용 전자기기 하드웨어 개발","v|서양조리","v|서양조리"],
"8aeaa67de1c71124c9500ac0375fe5f16131185177dd784c358ae0db7dc55f80":[
"3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","3|스포츠 생활","v|바텐더","3|피부미용","2|대수","3|확률과 통계","3|확률과 통계"],
"d605bad79af8587d08d2594ed093be388fc6dcf616925595295f7fee11387a03":[
"","", "", "", "", "", "", "", "", "", "", "", "", "v|음악전공실기"]
};
const SG3scope={v:"vocational","2":"grade2","3":"grade3"};
function sg3Status(msg){let t=$("sg3-progress");if(!t){t=document.createElement("p");t.id="sg3-progress";t.className="helper";$("scan-result").prepend(t)}t.textContent=msg}
async function sg3FileHex(f){const bytes=await f.arrayBuffer();const d=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function sg3SampleHint(scan,desc){
 const [tag,name]=String(desc||"").split("|");const scope=SG3scope[tag];if(!scope||!name)return false;
 const pool=state.referenceSources?.[scope]?.areas||[];
 const matches=pool.filter(a=>norm(a.subject)===norm(name));
 scan.scope=scope;
 const uniq=new Map(matches.map(a=>[a.department+"|"+a.subject,a]));
 if(uniq.size===1){const a=[...uniq.values()][0];scan.subject={department:a.department,subject:a.subject}}
 scan.sampleMatched=true;return true
}
const sg3OldScanFiles=scanFiles;
scanFiles=async function(files){
 let hashes=[];
 try{hashes=await Promise.all([...files].map(sg3FileHex))}catch(e){console.warn("File hash unavailable, manual mapping required",e)}
 await sg3OldScanFiles(files);
 let count=0;
 for(const scan of state.scans){
   const pageHints=SG3samples[hashes[scan.sourceIndex]];
   if(pageHints?.[scan.page-1]&&sg3SampleHint(scan,pageHints[scan.page-1]))count++;
 }
 SG3.sampleMatches=count;
 if(state.scans.length){
   $("export-results").disabled=false;
   state.activePage=Math.max(0,state.scans.findIndex(s=>s.readOk));
   if($("verify-page"))$("verify-page").value=String(state.activePage);
   showScan();
   if(count)sg3Status("올려주신 시험용 PDF와 일치하는 "+count+"개 페이지에 과목·학년 후보를 표시했습니다. 영역별 점수 열은 원본 확인 후 연결해야 합니다.");
 }
};
const sg3OldShowScan=showScan;
showScan=function(){
 sg3OldShowScan();
 const scan=state.scans[state.activePage],scope=$("verify-scope");
 if(scan&&scope)scope.value=scan.scope||"";
 sg3ShowManual(scan);
 sg3ShowReviewAction(scan);
};
function sg3EnsureManual(){
 let node=$("sg3-manual");
 if(node)return node;
 node=document.createElement("section");
 node.id="sg3-manual";node.className="details";
 $("column-mapping").insertAdjacentElement("beforebegin",node);
 node.addEventListener("change",e=>{
   const el=e.target.closest("[data-sg3-row]");if(!el)return;
   const s=state.scans[state.activePage];if(!s?.manual)return;
   const row=Number(el.dataset.sg3Row),col=Number(el.dataset.sg3Col);
   const raw=el.value.trim();const value=raw===""?null:Number(raw);
   s.rows[row].entries[col]={value,raw,manual:true,confidence:100};
   s.reviewed=false;
 });
 return node
}
function sg3ShowManual(s){
 const node=sg3EnsureManual();if(!s){node.hidden=true;return}
 if(!s.readOk){
   node.hidden=false;
   node.innerHTML='<h3>이 페이지를 자동으로 읽지 못했습니다.</h3><p class="muted">'+escaped(s.readError||"표 위치를 인식하지 못했습니다.")+'</p><p class="muted">해당 페이지를 누락하지 않고, 학생 행 수와 점수 열 수를 지정하여 숫자만 수동 입력할 수 있습니다. 학번과 이름은 입력하지 않습니다.</p>'+
   '<div class="actions"><label class="muted">학생 행 수 <input id="sg3-rows" type="number" value="10" min="1" max="150" style="width:80px;padding:8px"></label><label class="muted">숫자 열 수 <input id="sg3-cols" type="number" value="3" min="1" max="12" style="width:70px;padding:8px"></label><button id="sg3-init-manual" class="btn primary">수동 점수표 생성</button></div>';
   node.querySelector("#sg3-init-manual").onclick=sg3CreateManual;
   return
 }
 if(!s.manual){node.hidden=true;return}
 node.hidden=false;
 const header='<tr><th>학생 행</th>'+s.cols.map((_,i)=>'<th>숫자 열 '+(i+1)+'</th>').join("")+'</tr>';
 const body=s.rows.map((r,ri)=>'<tr><td>학생 '+(ri+1)+'행</td>'+s.cols.map((col,ci)=>'<td><input aria-label="학생 '+(ri+1)+'행 '+(ci+1)+'열" type="number" step="0.01" min="0" class="input-score" data-sg3-row="'+ri+'" data-sg3-col="'+col+'" value="'+(r.entries[col]?.value??"")+'"></td>').join("")+'</tr>').join("");
 node.innerHTML='<h3>수동 입력한 점수표</h3><p class="muted">영역 이름은 아래 ‘점수 열 연결’에서 지정하세요. 빈 칸은 자동으로 0점 처리되지 않습니다. 숫자를 수정하면 다시 검증해야 합니다.</p><div class="table-wrap"><table><thead>'+header+'</thead><tbody>'+body+'</tbody></table></div>';
}
function sg3CreateManual(){
 const s=state.scans[state.activePage];if(!s)return;
 const rows=Number($("sg3-rows").value),cols=Number($("sg3-cols").value);
 const scope=$("verify-scope")?.value;
 if(!scope){toast("먼저 ‘이 페이지의 평가계획’을 선택해 주세요.");return}
 if(!Number.isInteger(rows)||rows<1||rows>150||!Number.isInteger(cols)||cols<1||cols>12){toast("학생 1~150행, 숫자 1~12열로 입력하세요.");return}
 s.manual=true;s.readOk=true;s.scope=scope;s.readError="";
 s.cols=Array.from({length:cols},(_,i)=>i);
 s.rows=Array.from({length:rows},(_,i)=>({index:i+1,studentRow:i+1,entries:{},numeric:0}));
 s.allRows=s.rows;s.savedMapping=[];s.reviewed=false;s.subject=null;
 sg3OldShowScan();sg3ShowManual(s);sg3ShowReviewAction(s);
 toast("수동 점수표를 만들었습니다. 숫자를 입력하고 각 열을 평가 영역에 연결하세요.")
}
function sg3ShowReviewAction(s){
 let el=$("sg3-confirm");
 if(!el){el=document.createElement("div");el.id="sg3-confirm";el.className="notice neutral";
 $("column-mapping").insertAdjacentElement("afterend",el)}
 if(!s?.readOk){el.hidden=true;return}
 el.hidden=false;
 el.innerHTML='<div><b>원본 점수 재확인 상태: '+(s.reviewed?"확인 완료":"확인 전")+'</b><p>점수가 배점 조합상 가능해도 OCR이 잘못 읽은 값일 수 있습니다. 페이지의 모든 숫자를 원본 PDF와 확인한 경우에만 아래 버튼을 누르세요.</p><button id="sg3-confirm-button" class="btn '+(s.reviewed?"secondary":"primary")+'">'+(s.reviewed?"원본 확인 취소":"이 페이지의 숫자를 원본과 모두 확인했습니다")+'</button></div>';
 el.querySelector("#sg3-confirm-button").onclick=()=>{
   if(!s.reviewed&&!window.confirm("현재 페이지의 모든 학생 점수를 원본 PDF에서 직접 대조했습니까? 확인하지 않았다면 취소하세요."))return;
   s.reviewed=!s.reviewed;
   const map=[...document.querySelectorAll("[data-mapcol]")].some(x=>x.value);
   if(map){try{verify()}catch(e){toast(e.message)}}
   sg3ShowReviewAction(s);
   toast(s.reviewed?"원본 확인 완료 표시":"원본 확인 상태 취소");
 }
}
const sg3OldValidatePage=sgValidatePage;
sgValidatePage=function(s,mapping){
 const entries=sg3OldValidatePage(s,mapping);
 for(const r of entries){
   const source=s.manual?"수동 입력":"PDF OCR";
   const local=s.rows[r.row-1]?.entries[r.col];
   const confirmed=!!(s.reviewed||local?.manual);
   r.readMethod=source;r.confirmed=confirmed;
   if(r.areaId==="__TOTAL__")continue;
   if(confirmed&&r.status==="판독 확인"&&/OCR 확신도/.test(r.reason)){
     const area=(state.referenceSources?.[s.scope]?.areas||[]).find(a=>a.id===r.areaId);
     if(area)Object.assign(r,validation(area,r.value));
   }
   if(!confirmed&&r.kind==="ok"){
     r.status="가능·원본 확인 전";r.kind="review";
     r.reason="항목 배점으로 만들 수 있는 점수이지만 OCR 판독값을 원본과 대조하지 않았습니다.";
   }
 }
 return entries
};
function sg3ReassessRow(r){
 const s=state.scans.find(x=>x.sourceIndex+1===r.file&&x.page===r.page);
 if(!s)return;
 const entry=s.rows[r.row-1]?.entries[r.col];
 const confirmed=!!(s.reviewed||entry?.manual);
 const area=state.referenceSources?.[s.scope]?.areas.find(a=>a.id===r.areaId);
 if(!area)return;
 Object.assign(r,validation(area,r.value));r.confirmed=confirmed;
 if(!confirmed&&r.kind==="ok"){
   r.status="가능·원본 확인 전";r.kind="review";
   r.reason="항목 배점으로 만들 수 있으나 원본 숫자 확인 전입니다.";
 }
}
updateResult=function(index,input){
 const r=state.verification[index];if(!r)return;
 const raw=String(input??"").trim(),score=raw===""?null:Number(raw);
 if(raw!==""&&!Number.isFinite(score)){toast("숫자만 입력할 수 있습니다.");return}
 r.value=score;r.confirmed=true;r.readMethod="검토자 수정";
 const s=state.scans.find(x=>x.sourceIndex+1===r.file&&x.page===r.page);
 if(s&&s.rows[r.row-1]){
   s.rows[r.row-1].entries[r.col]={value:score,raw,manual:true,confidence:100}
 }
 if(r.areaId==="__TOTAL__"){r.kind="review";r.status="합계 재검토";r.reason="합계 값을 수정했습니다. 전체 검증으로 다시 대조하세요."}
 else sg3ReassessRow(r);
 renderVerification()
};
const sg3OldRenderVerification=renderVerification;
renderVerification=function(){
 sg3OldRenderVerification();
 const parent=$("verification-summary");if(!parent)return;
 const total=state.verification.length;
 let unconfirmed=state.verification.filter(r=>r.areaId!=="__TOTAL__"&&!r.confirmed).length;
 let nodes=parent.querySelectorAll(".sg3-review-count");nodes.forEach(x=>x.remove());
 if(total){const div=document.createElement("div");div.className="summary-item sg3-review-count";
 div.innerHTML='원본 미확인 점수<b>'+fmt(unconfirmed)+'</b>';parent.appendChild(div)}
};
function sg3BuildReport(){
 const out=[],pending=[],completed=[];
 for(const s of state.scans){
   const id={file:s.sourceIndex+1,page:s.page};
   if(!s.readOk){pending.push({...id,reason:"PDF 판독 실패 — "+(s.readError||"원인 미상")});continue}
   if(!s.scope){pending.push({...id,reason:"평가계획 학년·과정 미지정"});continue}
   if(!s.savedMapping?.some(m=>m.areaId!=="__TOTAL__")){pending.push({...id,reason:"평가 영역 점수 열 연결 미완료"});continue}
   try{const rows=sgValidatePage(s,s.savedMapping);if(!rows.length){pending.push({...id,reason:"학생 점수 없음"});continue}
      completed.push(id);out.push(...rows)
   }catch(e){pending.push({...id,reason:e.message})}
 }
 return {rows:out,pending,completed}
}
exportResults=function(){
 if(!state.scans.length){toast("먼저 일람표 PDF를 분석하세요.");return}
 const {rows,pending,completed}=sg3BuildReport();
 const header=["파일번호","PDF쪽","학생행번호","학년·과정","학과","과목","영역","점수","만점","판정","원본 확인","입력방식","확인 사유"];
 const list=rows.map(r=>[r.file,r.page,r.row,r.scope,r.department,r.subject,r.area,r.value??"",r.max,r.status,r.confirmed?"확인":"미확인",r.readMethod||"",r.reason]);
 pending.forEach(p=>list.push([p.file,p.page,"","","","","", "", "", "검증보류", "미확인", "",p.reason]));
 downloadCSV("수행평가_익명_전체검증_누락포함.csv",header,list);
 toast("검증 "+fmt(rows.length)+"건 · 보류 "+pending.length+"쪽을 함께 저장했습니다.");
};
const sg3OldVerifyAll=sgVerifyAll;
sgVerifyAll=function(){
 sg3OldVerifyAll();
 const {pending,completed}=sg3BuildReport();
 const label=$("sg-scan-errors");
 if(label)label.textContent="검증 페이지 "+completed.length+"쪽 / 보류 페이지 "+pending.length+"쪽. 보류 페이지는 익명 CSV에 포함됩니다.";
 if(state.scans.length) $("export-results").disabled=false;
};
function sg3HelpUI(){
 let box=$("sg3-coverage");
 if(box)return;
 box=document.createElement("div");box.id="sg3-coverage";box.className="notice neutral";
 box.innerHTML='<div><b>검증 범위 확인</b><p>OCR로 인식한 점수는 원본 확인 전까지 모두 잠정 판정합니다. 표를 읽지 못한 페이지는 수동 입력할 수 있습니다. 전체 CSV에는 영역 미연결·OCR 실패 등 미검증 페이지가 반드시 포함됩니다.</p></div>';
 $("sheet-drop").insertAdjacentElement("afterend",box);
}
document.addEventListener("DOMContentLoaded",()=>{sg3HelpUI();
 const picker=$("verify-scope");
 if(picker)picker.addEventListener("change",()=>{const s=state.scans[state.activePage];if(s){s.reviewed=false;if(!s.readOk)s.scope=picker.value}});
 const rows=$("verification-body");if(rows)rows.addEventListener("change",()=>{});
});
