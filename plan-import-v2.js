/* Evaluation-plan importer v2. In-browser extraction; human verification required. */
"use strict";
const sgPlan={candidates:[],sourceFile:"",pages:0,scanned:0,rejected:0,running:false,lastDept:"",lastSubject:"",pdfDoc:null,ocrWorker:null};
function sgPlanWordsFromTSV(tsv,scale,pageHeight){return sgTSVPlan(tsv).map(a=>({text:a.text,x:a.left/scale,y:a.top/scale+2,width:a.width/scale,height:a.h/scale})).sort((a,b)=>a.y-b.y||a.x-b.x)}
function sgTSVPlan(tsv){return String(tsv||"").split(/\r?\n/).slice(1).map(x=>x.split("\t")).filter(a=>a.length>=12&&a[0]==="5"&&a[11].trim()).map(a=>({text:a.slice(11).join("\t").trim(),left:Number(a[6]),top:Number(a[7]),width:Number(a[8]),h:Number(a[9]),conf:Number(a[10])})).filter(x=>x.conf>20)}
async function sgPlanOCR(page){if(!window.Tesseract)throw Error("스캔형 평가계획을 읽으려면 OCR 라이브러리가 필요합니다.");if(!sgPlan.ocrWorker){sgPlan.ocrWorker=await Tesseract.createWorker(["kor","eng"],1);await sgPlan.ocrWorker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.AUTO})}
 const scale=2.15;const canvas=await pdfPageCanvas(page,scale);const {data}=await sgPlan.ocrWorker.recognize(canvas,{}, {tsv:true});return {words:sgPlanWordsFromTSV(data.tsv,scale,canvas.height/scale),text:data.text||""}
}
function sgPlanWords(page,textContent){
 const height=page.view[3]||page.getViewport({scale:1}).height;
 return textContent.items.filter(x=>typeof x.str==="string"&&x.str.trim()&&x.transform).map(item=>({text:item.str.trim(),x:item.transform[4],y:height-item.transform[5],width:item.width||0,height:item.height||0})).sort((a,b)=>a.y-b.y||a.x-b.x)
}
function sgPlanClusters(words,epsilon=5){const groups=[];for(const word of words){const g=groups.at(-1);if(g&&Math.abs(g.y-word.y)<=epsilon){g.items.push(word);g.y=(g.y*(g.items.length-1)+word.y)/g.items.length}else groups.push({y:word.y,items:[word]})}return groups.map(g=>({y:g.y,items:g.items.sort((a,b)=>a.x-b.x)}))}
function sgPlanHeader(groups){const all=groups.map(g=>g.items.map(it=>it.text).join(" ")).join(" ");
 const heads=groups.filter(g=>g.items.some(w=>norm(w.text)==="만점")&&g.items.some(w=>norm(w.text)==="기본점수"));
 return heads.map(g=>{
  const words=g.items,at=words.findIndex(w=>norm(w.text)==="만점"),b=words.findIndex(w=>norm(w.text)==="기본점수");
  const maxwords=words.slice(at+1,b),basewords=words.slice(b+1);
  const digit=t=>{const m=String(t).match(/(\d{1,3})\s*점?/);return m?Number(m[1]):null};
  const valMax=digit(maxwords.map(w=>w.text).join(" ")),valBase=digit(basewords.map(w=>w.text).join(" "));
  return {y:g.y,max:valMax,base:valBase}
 }).filter(h=>h.max!==null&&h.base!==null)
}
function sgFindSubject(text,old=""){const joined=text.replace(/\s+/g," ");const patterns=[/202\d학년도\s*\(\s*([가-힣A-Za-z0-9·\s]{2,35})\s*\)\s*\(\s*2\s*\)학기/,/\(\s*([가-힣A-Za-z0-9·\s]{2,35})\s*\)\s*평가\s*세부\s*계획/,/교과목\s*:\s*([가-힣A-Za-z0-9·\s]{2,32})/];for(const re of patterns){const m=joined.match(re);if(m){const q=m[1].trim().replace(/\s+/g," ");if(q.length>1)return q}}return old}
function sgFindDept(text,old=""){const m=text.match(/(?:3학년|2학년|1학년)\s*(?:[\/\s]*)\s*([가-힣0-9]+과)/);return m?m[1]:old}
function sgPlanName(words,lo,hi,w){const selected=words.filter(x=>x.x<w*.135&&x.y>lo+15&&x.y<hi-10&&/^[가-힣0-9·\s()점]+$/.test(x.text)).filter(x=>!/^(평가|방법|영역|기준|만점|기본점수|점수|성취기준|AI활용|점)$/.test(norm(x.text)));let group=[];const fragments=[];for(const x of selected){if(/\(\s*\d+\s*점\s*\)/.test(x.text)){const name=group.join("").replace(/\s+/g,"").replace(/\(\d+점\)/g,"");if(name.length>1)fragments.push(name);group=[]}else if(/^[가-힣·\s]{1,15}$/.test(x.text)){group.push(x.text)}}
 if(fragments.length)return fragments[0];const result=group.join("").replace(/\s+/g,"");return result.length>1?result:"평가 영역명 확인 필요"}
function sgExtractPlanRegion(words,w,head,tail,dept,subject,pageno){
 let scoreWords=words.filter(x=>x.y>head.y+13&&x.y<tail-12&&x.x>w*.69&&/^\d{1,3}(?:\.0+)?$/.test(x.text)).map(x=>({...x,num:Number(x.text)}));
 const clusters=sgPlanClusters(scoreWords,3.4).filter(g=>g.items.length>=2&&g.items.length<=16);
 const items=clusters.map((g,i)=>({label:(i+1)+"번 평가 항목 (원문 확인)",choices:g.items.map(x=>x.num).filter(n=>n>=0&&n<=head.max)})).filter(x=>x.choices.length>=2);
 let allowed=[];let note="";
 if(items.length){try{allowed=calcAllowed(items)}catch(e){note=e.message}}
 const values=allowed.length?[Math.min(...allowed),Math.max(...allowed)]:[null,null];
 const matched=values[0]===head.base&&values[1]===head.max;
 if(items.length&&!matched)note="항목 합계가 기본점수/만점과 일치하지 않습니다. 누락·겹침 확인 필요.";
 if(!items.length)note="배점표를 자동으로 식별하지 못했습니다. 원문에서 항목별 배점 또는 영역 총점표를 입력해야 합니다.";
 const name=sgPlanName(words,head.y,tail,w);
 return {id:"P-"+pageno+"-"+Math.round(head.y),department:dept||"학과 확인 필요",subject:subject||"과목 확인 필요",unit:"",area:name,max:head.max,base:head.base,items,allowed,method:"항목별 배점 조합",source_page:pageno,notes:note,reviewed:false,matched,confidence:matched?"정합성 확인(미승인)":"검토 필요",rawRows:clusters.length}
}
function sgCandidateCard(c,i){const status=c.matched?'<span class="status ok">합계 일치 · 승인 전</span>':'<span class="status review">검토 필요</span>';const label=c.area||"영역명 확인 필요";
 return '<div class="mapping-card" style="min-width:260px"><b>'+escaped(c.department)+' · '+escaped(c.subject)+'</b><div style="margin:8px 0">'+escaped(label)+'</div><div class="muted">원문 '+c.source_page+'쪽 · 만점 '+c.max+' · 기본 '+c.base+' · 항목 '+c.items.length+'개 · 가능 점수 '+c.allowed.length+'개</div><div style="margin:9px 0">'+status+'</div>'+(c.notes?'<p class="muted">'+escaped(c.notes)+'</p>':'')+'<button class="btn secondary" data-edit-candidate="'+i+'">점수 확인 · 수정 · 승인</button></div>'}
function sgPlanPanel(){let node=$("sg-plan-panel");if(node)return node;node=document.createElement("div");node.id="sg-plan-panel";node.className="details";node.innerHTML='<div class="section-top"><div><h2>새 평가계획 분석 결과</h2><p class="muted" id="sg-plan-summary"></p></div><div class="actions"><button class="btn secondary" id="sg-export-approved">승인된 기준 JSON 저장</button><label for="sg-import-json" class="btn secondary">기준 JSON 불러오기</label><input type="file" id="sg-import-json" accept=".json,application/json" hidden></div></div><div class="notice neutral"><div><b>자동 추출은 잠정 결과입니다.</b><p>다른 평가계획은 과목·영역·항목 배점이 바뀔 수 있습니다. 원본 페이지와 점수를 확인하고 승인한 영역만 학생 일람표 검증에 사용합니다. 승인하지 않은 영역은 검증하지 않습니다.</p></div></div><div id="sg-candidate-list" class="mapping-grid"></div><div id="sg-edit-box"></div>';
 const strip=$("plan-status");strip.insertAdjacentElement("afterend",node);
 node.querySelector("#sg-candidate-list").addEventListener("click",e=>{const btn=e.target.closest("[data-edit-candidate]");if(btn)sgEditCandidate(Number(btn.dataset.editCandidate))});
 node.querySelector("#sg-export-approved").onclick=sgExportApproved;
 node.querySelector("#sg-import-json").onchange=async ev=>{if(ev.target.files[0])await sgImportJSON(ev.target.files[0]);ev.target.value=""};
 return node
}
function sgRenderCandidates(){const panel=sgPlanPanel();const all=sgPlan.candidates;const good=all.filter(x=>x.matched).length;panel.querySelector("#sg-plan-summary").textContent="문서 "+sgPlan.pages+"쪽 · 텍스트 스캔 "+sgPlan.scanned+"쪽 · 추출 영역 "+all.length+"개 · 만점·기본점수 합산 일치 "+good+"개 · 승인 "+all.filter(x=>x.reviewed).length+"개";
 panel.querySelector("#sg-candidate-list").innerHTML=all.length?all.slice(0,500).map(sgCandidateCard).join(""):'<div class="empty">자동 추출 영역이 없습니다. 원문을 확인하여 기준을 수동 등록하세요.</div>';
}
function sgEditCandidate(i){const c=sgPlan.candidates[i];if(!c)return;const box=$("sg-edit-box");box.className="details";box.innerHTML='<h3>PDF '+c.source_page+'쪽 · 수행평가 영역 기준 확인</h3><p class="muted">원본 PDF를 따로 펼쳐 실제 영역명과 단계별 점수가 맞는지 대조하세요. 수정 시 가능한 총점을 다시 계산합니다.</p><div class="filter-row"><label>학과<input id="sgp-dept" value="'+escaped(c.department)+'"></label><label>과목<input id="sgp-subject" value="'+escaped(c.subject)+'"></label><label>능력단위<input id="sgp-unit" value="'+escaped(c.unit||"")+'"></label></div><div class="filter-row"><label>수행평가 영역<input id="sgp-area" value="'+escaped(c.area)+'"></label><label>만점<input id="sgp-max" type="number" min="1" value="'+c.max+'"></label><label>기본점수<input id="sgp-base" type="number" min="0" value="'+c.base+'"></label></div><label class="muted">항목별 배점 (한 줄당 한 개 항목, 쉼표로 단계별 점수 구분)</label><textarea id="sgp-items" rows="6" style="width:100%;padding:11px;border:1px solid #dbe5ef;border-radius:9px;display:block;margin:9px 0 14px">'+escaped(c.items.map(x=>x.choices.join(", ")).join("\n"))+'</textarea><label class="muted">또는 총점 환산형: 가능한 전체 점수 입력 (항목 배점이 없을 때)</label><textarea id="sgp-direct" rows="2" style="width:100%;padding:11px;border:1px solid #dbe5ef;border-radius:9px;display:block;margin:9px 0 14px" placeholder="예: 30, 40, 50, 60, 70, 80, 90, 100"></textarea><div class="actions"><button class="btn secondary" id="sgp-preview">원본 PDF 해당 쪽 미리보기</button><button class="btn primary" id="sgp-approve">원문 대조 완료 · 기준 승인</button><button class="btn secondary" id="sgp-dismiss">닫기</button></div><p class="helper" id="sgp-message"></p>';
 box.querySelector("#sgp-dismiss").onclick=()=>box.replaceChildren();
 box.querySelector("#sgp-preview").onclick=async()=>{if(!sgPlan.pdfDoc){toast("해당 PDF가 열려 있지 않습니다.");return}try{const page=await sgPlan.pdfDoc.getPage(c.source_page),canvas=await pdfPageCanvas(page,1.35);canvas.style.maxWidth="100%";canvas.style.height="auto";canvas.style.border="1px solid #dce5ee";const old=box.querySelector(".sgp-preview");if(old)old.remove();const view=document.createElement("div");view.className="sgp-preview";view.style.cssText="max-height:680px;overflow:auto;margin-top:15px";view.appendChild(canvas);box.appendChild(view)}catch(e){toast(e.message)}};
 box.querySelector("#sgp-approve").onclick=()=>sgApprove(i);
 box.scrollIntoView({behavior:"smooth",block:"center"})
}
function sgApprove(i){const c=sgPlan.candidates[i];try{
 const dept=$("sgp-dept").value.trim(),subject=$("sgp-subject").value.trim(),unit=$("sgp-unit").value.trim(),area=$("sgp-area").value.trim(),max=Number($("sgp-max").value),base=Number($("sgp-base").value);
 if(!dept||!subject||!area||area.includes("확인 필요")||dept.includes("확인 필요")||subject.includes("확인 필요"))throw Error("실제 학과·과목·영역 이름을 입력하세요.");
 if(!Number.isFinite(max)||max<=0||max>2000||!Number.isFinite(base)||base<0||base>max)throw Error("만점·기본점수를 확인하세요.");
 let items=$("sgp-items").value.trim().split(/\n+/).map((line,j)=>({label:(j+1)+"번 평가 항목",choices:line.split(/[,\s]+/).filter(Boolean).map(Number)})).filter(x=>x.choices.length);
 if(items.some(x=>x.choices.some(n=>!Number.isFinite(n)||n<0)))throw Error("유효한 숫자 배점만 입력하세요.");
 let allowed=items.length?calcAllowed(items):[];
 const direct=$("sgp-direct").value.trim();if(direct){if(items.length)throw Error("항목별 배점과 총점 환산표를 동시에 입력할 수 없습니다. 하나를 선택하세요.");allowed=[...new Set(direct.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b)}
 if(!allowed.length)throw Error("항목별 배점 또는 총점 환산표를 입력하세요.");
 if(allowed.some(x=>!Number.isFinite(x)||x<0||x>max))throw Error("배점 범위를 벗어난 점수가 있습니다.");
 if(!allowed.includes(max)||!allowed.includes(base))throw Error("가능한 점수에 만점 또는 기본점수가 포함되지 않습니다. 원본 PDF를 확인하세요.");
 const original={...c,department:dept,subject,unit,area,max,base,items,allowed,notes:"교사가 원문과 대조하여 승인함",method:items.length?"항목별 배점 조합":"영역총점 환산",reviewed:true,matched:true};
 const at=state.areas.findIndex(x=>x.id===original.id);if(at>=0)state.areas[at]=original;else state.areas.push(original);
 sgPlan.candidates[i]=original;state.source="approved-import";initSubjects();renderAreaTable();sgRenderCandidates();$("sg-edit-box").replaceChildren();toast(area+" — 원문 대조된 점수 기준 등록 완료")
 }catch(e){$("sgp-message").textContent="기준 승인 실패: "+e.message;toast(e.message)}}
function sgExportApproved(){const safe={schema:2,source:sgPlan.sourceFile,approved:true,areas:state.areas.filter(a=>!isBad(a)).map(a=>({id:a.id,department:a.department,subject:a.subject,unit:a.unit,area:a.area,max:a.max,base:a.base,allowed:a.allowed,items:a.items,method:a.method,source_page:a.source_page,notes:a.notes}))};if(!safe.areas.length){toast("승인된 기준이 없습니다.");return}const blob=new Blob([JSON.stringify(safe,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="수행평가_승인기준.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function sgImportJSON(f){try{const obj=JSON.parse(await f.text());if(!Array.isArray(obj.areas)||obj.areas.length>1000||!obj.areas.length)throw Error("유효한 기준 JSON 형식이 아닙니다.");const validated=obj.areas.map((a,i)=>{const fields=["department","subject","area","max","base","allowed"];if(fields.some(k=>a[k]===undefined))throw Error("필수 입력이 누락된 영역 "+(i+1));if(!Array.isArray(a.allowed)||!a.allowed.length||!a.allowed.includes(a.max)||!a.allowed.includes(a.base))throw Error("만점/기본점수 확인 실패 "+(i+1));if(a.items?.length){const v=calcAllowed(a.items);if(v.join(",")!==a.allowed.join(","))throw Error("항목별 배점 합계가 불일치하는 영역 "+(i+1))}return {...a,id:a.id||"J-"+i,notes:a.notes||"승인된 JSON에서 복원"}});state.areas=validated;state.source="imported-json";initSubjects();renderAreaTable();sgPlan.candidates=[];sgPlan.pages=0;sgPlan.scanned=0;sgPlan.sourceFile=f.name;sgRenderCandidates();$("plan-status").textContent="승인된 기준 JSON 불러오기: "+validated.length+"개 영역";toast("검증 기준 "+validated.length+"개를 복원했습니다.")}catch(e){toast("JSON 불러오기 실패: "+e.message)}}
async function importPlan(file){
 if(sgPlan.running){toast("다른 평가계획을 분석 중입니다.");return}sgPlan.running=true;
 const label=$("plan-status");label.textContent="평가계획 확인 중…";
 try{
  if(file.size>100*1024*1024)throw Error("100MB 초과 PDF는 지원하지 않습니다.");
  const hash=await hashHex(file);
  if(hash===state.defaultData.source_sha256){state.areas=structuredClone(state.defaultAreas);state.source="builtin";initSubjects();renderAreaTable();label.textContent="원본 평가계획 해시가 일치합니다. 41개 과목·145개 영역의 검증 기준을 적용했습니다.";sgPlan.candidates=[];if($("sg-plan-panel"))$("sg-plan-panel").remove();toast("2026 평가계획 원본이 확인됐습니다.");return}
  const pdf=await openPDF(file);
  if(pdf.numPages>600)throw Error("600쪽 초과 평가계획은 처리할 수 없습니다.");
  state.areas=[];state.source="pending-plan";initSubjects();renderAreaTable();sgPlan.pdfDoc=pdf;sgPlan.candidates=[];sgPlan.pages=pdf.numPages;sgPlan.scanned=0;sgPlan.sourceFile=file.name;sgPlan.lastSubject="";sgPlan.lastDept="";
  sgRenderCandidates();
  let subject="",dept="",isRubric=false;
  for(let pno=1;pno<=pdf.numPages;pno++){
   const page=await pdf.getPage(pno),text=await page.getTextContent(),w=page.getViewport({scale:1}).width;
   let words=sgPlanWords(page,text);let all=words.map(x=>x.text).join(" ");
   if(words.length<12){label.textContent="스캔형 평가계획 OCR 분석 중… "+pno+"/"+pdf.numPages+"쪽";const recognized=await sgPlanOCR(page);words=recognized.words;all=recognized.text+" "+words.map(x=>x.text).join(" ");}

   label.textContent="새 평가계획 분석 중… "+pno+"/"+pdf.numPages+"쪽 · 자동 추출 "+sgPlan.candidates.length+"개 영역";
   if(pno%4===0)await delay(0);
   const s=sgFindSubject(all,"");if(s)subject=s;
   const d=sgFindDept(all,"");if(d)dept=d;
   const start=/4\.\s*영역별\s*성취기준\s*및\s*평가\s*척도/.test(all);
   const stop=/5\.\s*수행평가\s*미응시자/.test(all)||/5\.\s*성취도\s*평가/.test(all);
   if(start)isRubric=true;
   if(stop&&!start)isRubric=false;
   const groups=sgPlanClusters(words,5),heads=sgPlanHeader(groups);
   const rubricLike=heads.length>0&&(/평가척도|평가\s*척도|평가요소|채점기준|배점/.test(all));
   if(rubricLike&&!isRubric&&words.length>30&&/성취기준/.test(all))isRubric=true;
   if(isRubric&&rubricLike){
    sgPlan.scanned++;for(let hi=0;hi<heads.length;hi++){
     const upper=heads[hi],lower=heads[hi+1]?.y||page.getViewport({scale:1}).height*.91;
     const cand=sgExtractPlanRegion(words,w,upper,lower,dept,subject,pno);
     sgPlan.candidates.push(cand);
    }
    if(pno%3===0)sgRenderCandidates()
   }
   if(stop)isRubric=false;
  }
  sgRenderCandidates();
  const total=sgPlan.candidates.length;
  label.innerHTML="새 PDF 분석 완료: <b>"+escaped(file.name)+"</b> · "+pdf.numPages+"쪽 · 영역 후보 "+total+"개. <b>원본 대조 후 승인한 영역만 검증 기준으로 등록됩니다.</b>";
  if(!total)label.innerHTML+=' <button class="text-btn" id="sg-manual-plan">영역별 배점 수동 등록</button>';
  if($("sg-manual-plan"))$("sg-manual-plan").onclick=showPlanEditor;
  toast("새 평가계획: "+total+"개 영역의 배점 후보 분석 완료"); 
 }catch(e){label.textContent="평가계획 분석 실패: "+e.message;toast(e.message);console.error(e)}finally{sgPlan.running=false;if(sgPlan.ocrWorker){await sgPlan.ocrWorker.terminate();sgPlan.ocrWorker=null}}
}
document.addEventListener("DOMContentLoaded",()=>{const input=document.createElement("button");input.className="btn secondary";input.textContent="기준 JSON 불러오기";input.onclick=()=>{sgPlanPanel().querySelector("#sg-import-json").click()};$("download-reference").insertAdjacentElement("afterend",input);});
