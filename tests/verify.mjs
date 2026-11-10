import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const d=JSON.parse(fs.readFileSync('data/reference_2026.json','utf8'));
assert.equal(d.areas.length,145);
assert.equal(new Set(d.areas.map(a=>a.department+'/'+a.subject)).size,41);
assert.equal(d.areas.reduce((n,a)=>n+a.allowed.length,0),3188);
let added=0;
for(const a of d.areas){
 assert.equal(Math.max(...a.allowed),a.max,a.id+' maximum');
 if(!a.items?.length)continue;
 added++;
 let sums=new Set([0]);
 for(const it of a.items){
  const nxt=new Set();
  for(const s of sums)for(const p of it.choices)nxt.add(s+p);
  sums=nxt;
 }
 assert.deepEqual([...sums].sort((x,y)=>x-y),a.allowed,a.id+' combination');
}
assert.equal(added,118);
const extras=[
 ['data/reference_grade2_enrolled_2026.json',30,10,509],
 ['data/reference_grade3_enrolled_2026.json',28,10,539]
];
let allCount=d.areas.length,allScores=d.areas.reduce((s,a)=>s+a.allowed.length,0),allCourses=41;
for(const [file,areaCount,courseCount,allowedCount] of extras){
 const ref=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(ref.areas.length,areaCount,file+' area count');
 assert.equal(new Set(ref.areas.map(a=>a.subject)).size,courseCount,file+' subjects');
 assert.equal(ref.areas.reduce((s,a)=>s+a.allowed.length,0),allowedCount,file+' totals');
 const ids=new Set();
 for(const a of ref.areas){
   assert(!ids.has(a.id),file+' duplicate id '+a.id);ids.add(a.id);
   assert.equal(Math.max(...a.allowed),a.max,a.id+' maximum');
   assert.equal(Math.min(...a.allowed),a.base,a.id+' basic score');
   if(a.items?.length){
    let sums=new Set([0]);
    for(const item of a.items){const next=new Set();for(const x of sums)for(const y of item.choices)next.add(x+y);sums=next}
    assert.deepEqual([...sums].sort((x,y)=>x-y),a.allowed,a.id+' computed totals');
   }
 }
 allCount+=ref.areas.length;allScores+=allowedCount;allCourses+=courseCount;
}
assert.equal(allCount,203);assert.equal(allScores,4236);assert.equal(allCourses,61);

const html=fs.readFileSync('index.html','utf8');
for(const path of ['app.js','scanner-v2.js','plan-import-v2.js']){
 new vm.Script(fs.readFileSync(path,'utf8'),{filename:path});
 assert(html.includes('./'+path),path+' must be loaded');
}
const src=fs.readFileSync('scanner-v2.js','utf8');
const context={document:{addEventListener(){}},console,Uint8Array,Uint8ClampedArray};
vm.createContext(context);vm.runInContext(src+';this.verifyGrid=sgGrid;',context);
const w=1200,h=1600,pixels=new Uint8ClampedArray(w*h*4);
for(let i=0;i<pixels.length;i+=4){pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=255}
function plot(x,y,v=244){const i=(y*w+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=v}
for(let y=420;y<=900;y+=30)for(let x=80;x<=700;x++){plot(x,y);plot(x,y+1)}
for(const x of [80,176,270,360,460,560,650,700])for(let y=420;y<=900;y++)plot(x,y);
const canvas={width:w,height:h,getContext:()=>({getImageData:()=>({data:pixels})})};
const grid=context.verifyGrid(canvas);
assert(grid.cols.length>=4&&grid.ys.length>=10);
console.log('PASS: 61 plans / 203 areas / 4,236 allowed scores / recomputed item-summed rubrics');
console.log('PASS: JS source and HTML script links / synthetic scanned table');
