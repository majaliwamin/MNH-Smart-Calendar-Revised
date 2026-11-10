const times=["08:00 – 10:00","10:00 – 12:00","12:00 – 13:30","13:30 – 15:30","15:30 – 17:30","17:30 – 19:00","19:00 – 21:00"];
const dates=["9 Nov","10 Nov","11 Nov","12 Nov","13 Nov","14 Nov"];
const LEGACY_ROW_MAP={0:0,1:1,2:2,3:2,4:3,5:4,6:5,7:6};
const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
let modules={
 "MIPN 8100":{title:"Medical Imaging in Pregnancy and Neonates",facilitator:"Not specified"},
 "ARMN – 8100":{title:"Antimicrobial Resistance in Maternal & Neonatal Health",facilitator:"G Bandawe"},
 "PNIM-8100":{title:"Pregnancy and Neonatal Immunology",facilitator:"D Mzinza"}
};
const JOURNAL={code:"Journal Club",title:"Journal Club",facilitator:"",colour:"#263D5C",recurring:true};
const tbody=document.getElementById("calendar-body");
const thead=document.getElementById("calendar-head");
const statusEl=document.getElementById("status");
const key="phd_mnh_weekly_calendar_v3";
const legacyKey="phd_mnh_weekly_calendar_v2";
let currentRole="student";
let moduleUnsubscribe=null;
let state={theme:"midnight",cells:{}};
let editingUnlocked=false;
let analyticsUnlocked=false;
let securityIntent="edit";
let activeCell=null;
let selectedTime=-1;

function cellKey(r,c){return `${r}_${c}`;}
function isJournal(r,c){return r===2&&c===1;}
function getEntry(r,c){
 if(isJournal(r,c)) return {...JOURNAL,...(state.cells[cellKey(r,c)]||{})};
 return state.cells[cellKey(r,c)]||{};
}
function setEditing(enabled){
 editingUnlocked=enabled;
 updateRoleNav();
 ["save","backup","import","lock","edit-header"].forEach(id=>document.getElementById(id).disabled=!enabled);
 document.getElementById("unlock").disabled=enabled;
 document.getElementById("settings").disabled=false;
 statusEl.className="status "+(enabled?"ok":"");
 statusEl.textContent=enabled?"Editing enabled. Changes can now be made.":"";
}
function showDialog(id){const el=document.getElementById(id);el.classList.add("open");el.setAttribute("aria-hidden","false");}
function hideDialog(id){const el=document.getElementById(id);el.classList.remove("open");el.setAttribute("aria-hidden","true");}
function contrastColour(hex){
 const n=parseInt(hex.replace("#",""),16);
 const lum=(0.299*(n>>16)+0.587*((n>>8)&255)+0.114*(n&255))/255;
 return lum>0.58?"#172033":"#F7F8FA";
}
function applyCellColour(td,area,colour){
 td.style.background=colour;area.style.background=colour;area.style.color=contrastColour(colour);
}
function refreshModuleSelect(){
 const select=document.getElementById("module-select"),chosen=select.value;
 select.innerHTML='<option value="">Choose a module…</option>';
 Object.keys(modules).sort().forEach(code=>{const o=document.createElement("option");o.value=code;o.textContent=code+" — "+modules[code].title;select.appendChild(o);});
 if(chosen&&modules[chosen])select.value=chosen;
}
function onModules(snap){
 const next=Object.create(null);snap.docs.forEach(d=>{const v=d.data()||{};if(d.id&&v.title)next[d.id]={title:String(v.title),facilitator:String(v.facilitator||"Not specified")};});
 if(Object.keys(next).length)modules=next;
 refreshModuleSelect();
 if(currentView==="modules")renderModules();
 build();
}
async function addSharedModule(code,title,facilitator){
 code=String(code||"").trim().slice(0,40);title=String(title||"").trim().slice(0,160);facilitator=String(facilitator||"Not specified").trim().slice(0,120)||"Not specified";
 if(!code||!title){statusEl.className="status error";statusEl.textContent="Enter both a module code and title.";return;}
 if(!/^[A-Za-z0-9][A-Za-z0-9_. –-]{0,39}$/.test(code)){statusEl.className="status error";statusEl.textContent="Use letters, numbers, spaces, dots or hyphens in the module code.";return;}
 if(Object.prototype.hasOwnProperty.call(modules,code)){statusEl.className="status error";statusEl.textContent="That module code already exists.";return;}
 try{
  const data={title,facilitator,updatedAt:Date.now()};
  if(cloud)await cloud.doc("modules/"+code).set(data);
  else await window.mnhApi.request("PUT","/api/doc/modules/"+encodeURIComponent(code),data);
  statusEl.className="status ok";statusEl.textContent="Module added and shared with all users.";
 }catch(e){writeFailed(e);}
}
function updateModuleDetails(code){
 const box=document.getElementById("module-details");
 if(modules[code]){
  const m=modules[code];box.textContent="";const strong=document.createElement("strong");strong.textContent=code;box.append(strong,document.createElement("br"),document.createTextNode(m.title),document.createElement("br"),document.createTextNode("Facilitator: "+m.facilitator));
 }else if(code==="Journal Club"){
  box.innerHTML="<strong>Journal Club</strong><br>Recurring activity · Every Tuesday, 13:00–14:00";
 }else box.textContent="Select a module to view its full details.";
}
function openModuleDialog(r,c){
 if(!editingUnlocked){statusEl.className="status";statusEl.textContent="Tap the pencil icon in the menu to make changes.";return;}
 if(isJournal(r,c)){showEntryDetails(r,c);return;}
 activeCell={r,c};
 const entry=getEntry(r,c);
 document.getElementById("module-select").value=entry.code||"";
 document.getElementById("module-label").value=entry.title||entry.code||entry.text||"";
 document.getElementById("module-colour").value=entry.colour||"#263D5C";
 document.getElementById("module-mode").value=entry.mode||"unspecified";
 document.getElementById("delete-module").style.display=entry.code?"inline-block":"none";
 updateModuleDetails(entry.code||"");
 showDialog("module-dialog");
}
function showEntryDetails(r,c){
 const entry=getEntry(r,c);
 const detail=entry.code==="Journal Club"
  ? `<strong>Journal Club</strong><br>Activity: Journal Club<br>Frequency: Every Tuesday<br>Time: 13:00–14:00`
  : (entry.code&&!modules[entry.code])
  ? `<strong>${esc(entry.title||entry.code)}</strong><br>${days[c]} ${dates[c]}<br>Time: ${esc(entry.timeLabel||times[r])}`
  : `<strong>Module code: ${esc(entry.code||"Activity")}</strong><br>Full title: ${esc(modules[entry.code]?.title||entry.title||entry.text||"")}<br>Facilitator: ${esc(modules[entry.code]?.facilitator||entry.facilitator||"Not specified")}`;
 document.getElementById("details-content").innerHTML=detail;
 document.getElementById("edit-details").style.display=(editingUnlocked&&!isJournal(r,c))?"inline-block":"none";
 document.getElementById("edit-details").onclick=()=>{hideDialog("details-dialog");openModuleDialog(r,c);};
 showDialog("details-dialog");
}
function build(){
 thead.innerHTML="";tbody.innerHTML="";
 const hr=document.createElement("tr");
 const corner=document.createElement("th");corner.className="corner";corner.textContent="Time / Day";hr.appendChild(corner);
 days.forEach((day,c)=>{
  const th=document.createElement("th");th.className="daycell";th.scope="col";
  th.innerHTML=`<span class="day"><span class="dfull">${day}</span><span class="dshort">${day.slice(0,3)}</span></span><span class="date">${dates[c]}</span>`;
  hr.appendChild(th);
 });
 thead.appendChild(hr);
 times.forEach((time,r)=>{
  const tr=document.createElement("tr");
  const th=document.createElement("th");
  th.className="time"+(selectedTime===r?" highlight":"");th.scope="row";
  th.innerHTML=time.split(" – ").map(t=>`<span>${t}</span>`).join('<span class="tsep"> – </span>');
  th.tabIndex=0;th.setAttribute("role","button");th.setAttribute("aria-label",`Highlight ${time}`);
  const toggleTime=()=>{selectedTime=selectedTime===r?-1:r;tbody.querySelectorAll("th.time").forEach((el,i)=>el.classList.toggle("highlight",i===selectedTime));};
  th.addEventListener("click",toggleTime);th.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleTime();}});
  tr.appendChild(th);
  days.forEach((day,c)=>{
   const td=document.createElement("td");td.dataset.cellKey=cellKey(r,c);
   const box=document.createElement("div");box.className="cell";
   const area=document.createElement("textarea");area.className="activity";
   area.readOnly=true;area.placeholder="";
   area.setAttribute("aria-label",`${day}, ${time}`);
   const entry=getEntry(r,c);
   if(entry.code==="Journal Club"){area.value="Journal Club\n13:00–14:00";area.title="Journal Club · Every Tuesday · 13:00–14:00";}
   else if(entry.code){
    area.value=entry.code+"\n"+(entry.timeLabel||time.replace(" – ","–"));
    area.title=`${modules[entry.code]?.title||entry.title||entry.code} · ${modules[entry.code]?.facilitator||entry.facilitator||"Not specified"}`;
   }else if(entry.text){
    area.value=entry.text+"\n"+(entry.timeLabel||time.replace(" – ","–"));area.title=entry.text;
   }
   if(entry.colour)applyCellColour(td,area,entry.colour);
   area.addEventListener("click",()=>{
    if(entry.code)showEntryDetails(r,c);
    else openModuleDialog(r,c);
   });
   box.append(area);td.appendChild(box);tr.appendChild(td);
  });
  tbody.appendChild(tr);
 });
}
function remapLegacyCells(cells){
 const out={};
 Object.entries(cells).forEach(([k,v])=>{
  const [r,c]=k.split("_").map(Number);
  if(!(r in LEGACY_ROW_MAP))return;
  const nr=LEGACY_ROW_MAP[r],nk=cellKey(nr,c);
  if(nk==="2_1"&&r!==3)return;           // Tuesday 12:00–13:30 belongs to the recurring Journal Club
  if(r===3&&nk in out&&nk!=="2_1")return; // old 12:00–13:00 entry wins over old 13:00–14:00
  out[nk]=v;
 });
 return out;
}
function load(){
 try{
  let raw=localStorage.getItem(key);let legacy=false;
  if(!raw){raw=localStorage.getItem(legacyKey);legacy=!!raw;}
  if(raw){
   const parsed=JSON.parse(raw);
   if(legacy)parsed.cells=remapLegacyCells(parsed.cells||{});
   state={...state,...parsed,cells:{...(parsed.cells||{})}};
   // Migrate known legacy free-text module labels into structured entries.
   Object.entries(state.cells).forEach(([k,v])=>{
    if(!v||v.code||!v.text)return;
    const text=v.text.trim();
    if(modules[text])state.cells[k]={...v,code:text};
   });
  }
 }catch(e){statusEl.textContent="Saved browser data could not be read. Existing browser data has not been overwritten.";statusEl.className="status error";}
 try{const tp=localStorage.getItem(themeKey);if(tp)state.theme=tp;}catch(e){}
 if(Object.keys(SEED_CELLS).length&&SEED_STAMP>(state.stamp||0)){state.cells={...SEED_CELLS};state.stamp=SEED_STAMP;}
 document.body.dataset.theme=state.theme||"midnight";
 document.getElementById("theme").value=state.theme||"midnight";
 build();setEditing(false);
}
function saveState(){
 state.theme=document.getElementById("theme").value;state.version=3;state.stamp=Date.now();
 localStorage.setItem(key,JSON.stringify(state));
}
document.getElementById("theme").addEventListener("change",e=>{
 state.theme=e.target.value;document.body.dataset.theme=state.theme;
 try{localStorage.setItem(themeKey,state.theme);}catch(err){}
});
document.getElementById("settings").addEventListener("click",()=>showView("settings"));
function openSecurity(intent){
 securityIntent=intent;
 document.getElementById("security-password").value="";
 document.getElementById("security-message").textContent=intent==="analytics"
  ?"Analytics are for staff and class representatives. Enter the same password used to unlock editing."
  :"";
 document.getElementById("security-title").textContent=intent==="analytics"?"Analytics · Staff access":"Settings · Security";
 document.querySelector("#security-dialog p").textContent=intent==="analytics"
  ?"Programme analytics are restricted to staff and class representatives."
  :"Timetable editing is locked by default. Enter an authorised password to edit the timetable.";
 document.getElementById("security-unlock").textContent=intent==="analytics"?"View analytics":"✏️ Edit timetable";
 showDialog("security-dialog");
}
function requestAnalytics(){
 if(analyticsUnlocked){showView("analytics");return;}
 openSecurity("analytics");
}
document.getElementById("unlock").addEventListener("click",()=>openSecurity("edit"));
document.getElementById("security-unlock").addEventListener("click",()=>{
 (async()=>{
  const message=document.getElementById("security-message");
  try{
   const result=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:document.getElementById("security-password").value.trim()})});
   const data=await result.json();
   if(!result.ok)throw new Error(data.error||"Incorrect password.");
   const intent=securityIntent;
   currentRole=data.role||"lecturer";
   hideDialog("security-dialog");document.getElementById("security-password").value="";
   if(intent==="analytics"){
    analyticsUnlocked=true;updateRoleNav();showView("analytics");
    statusEl.className="status ok";statusEl.textContent="Analytics unlocked for staff and class representatives.";
   }else{
    setEditing(true);
    try{await window.mnhApi.flushQueue(true);}catch(e){}
    statusEl.className="status ok";statusEl.textContent="Editing enabled for your authorised role.";
   }
  }catch(err){message.textContent=err.message||"Unable to verify your access.";}
 })();
});
document.getElementById("security-password").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("security-unlock").click();});
document.getElementById("close-security").addEventListener("click",()=>hideDialog("security-dialog"));
document.getElementById("lock").addEventListener("click",async()=>{try{await fetch("/api/logout",{method:"POST"});}catch(e){}currentRole="student";analyticsUnlocked=false;setEditing(false);hideDialog("module-dialog");if(currentView==="analytics")showView("weekly");statusEl.className="status ok";statusEl.textContent="Timetable locked.";});
document.getElementById("module-select").addEventListener("change",e=>updateModuleDetails(e.target.value));
document.getElementById("cancel-module").addEventListener("click",()=>hideDialog("module-dialog"));
document.getElementById("close-details").addEventListener("click",()=>hideDialog("details-dialog"));
document.getElementById("apply-module").addEventListener("click",()=>{
 if(!editingUnlocked||!activeCell)return;
 const code=document.getElementById("module-select").value;
 const label=document.getElementById("module-label").value.trim().slice(0,80);
 if(!code&&!label){statusEl.className="status error";statusEl.textContent="Select a module or type an activity label before applying.";return;}
 const colour=document.getElementById("module-colour").value;
 const mode=document.getElementById("module-mode").value;
 const key=cellKey(activeCell.r,activeCell.c),prev=state.cells[key]||{};
 const record=code
  ?{code,title:modules[code].title,facilitator:modules[code].facilitator,colour,mode}
  :{code:label,title:label,colour,mode};
 if(prev.timeLabel)record.timeLabel=prev.timeLabel;
 state.cells[key]=record;
 const ak=activeCell;hideDialog("module-dialog");build();pushCell(ak.r,ak.c);
});
document.getElementById("delete-module").addEventListener("click",()=>{
 if(!editingUnlocked||!activeCell)return;
 delete state.cells[cellKey(activeCell.r,activeCell.c)];
 const dk=activeCell;hideDialog("module-dialog");build();pushCell(dk.r,dk.c);
});
document.getElementById("save").addEventListener("click",()=>{if(editingUnlocked)syncAll("Saved for everyone.");});
document.getElementById("backup").addEventListener("click",async()=>{
 if(!editingUnlocked)return;
 try{const response=await fetch("/api/backup",{cache:"no-store"});if(!response.ok)throw new Error("Backup request failed");const payload=await response.json();
  await downloadFile("MNH-Calendar-shared-backup.json",JSON.stringify(payload,null,2));
 }catch(e){statusEl.className="status error";statusEl.textContent="Shared backup could not be downloaded.";}
});
document.getElementById("import").addEventListener("click",()=>{if(editingUnlocked)document.getElementById("import-file").click();});
document.getElementById("import-file").addEventListener("change",async e=>{
 const f=e.target.files&&e.target.files[0];e.target.value="";if(!f||!editingUnlocked)return;
 try{
  const obj=JSON.parse(await f.text());
  if(obj&&obj.format==="mnh-calendar-backup"&&Array.isArray(obj.documents)){
   const response=await fetch("/api/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(obj)});
   const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Restore failed");
   statusEl.className="status ok";statusEl.textContent=`Shared backup restored (${result.restored} records). Reloading shared data…`;
   location.reload();return;
  }
  if(!obj||typeof obj.cells!=="object")throw new Error("bad");
  let cells=obj.cells;if(obj.version!==3)cells=remapLegacyCells(cells);
  const clean={};Object.entries(cells).forEach(([k,v])=>{if(!validKey(k)||k==="2_1")return;const c=cleanCell(v);if(c.code||c.text)clean[k]=c;});
  state.cells=clean;build();await syncAll("Backup restored and saved.");
 }catch(err){statusEl.className="status error";statusEl.textContent=err.message||"That file isn’t a valid timetable backup.";}
});
document.getElementById("print").addEventListener("click",downloadPdf);
async function downloadPdf(){
 const J=window.jspdf&&window.jspdf.jsPDF;
 if(!J){statusEl.className="status error";statusEl.textContent="The PDF tools could not load. Check your connection and try again.";return;}
 statusEl.className="status";statusEl.textContent="Preparing PDF…";
 try{
  const portrait=innerWidth<innerHeight;
  const pdf=new J({orientation:portrait?"p":"l",unit:"mm",format:"a4",compress:true});
  const PW=pdf.internal.pageSize.getWidth(),PH=pdf.internal.pageSize.getHeight(),M=8;
  const rgb=v=>{const m=/rgba?\(([^)]+)\)/.exec(v||"");if(!m)return null;const a=m[1].split(",").map(x=>parseFloat(x));return(a.length>3&&a[3]<.5)?null:a.slice(0,3).map(Math.round);};
  const hex=c=>"#"+c.map(x=>x.toString(16).padStart(2,"0")).join("");
  const cs=(el,p)=>getComputedStyle(el)[p];
  const page=rgb(cs(document.body,"backgroundColor"))||[6,19,38];
  const line=[43,75,124],cyan=[108,195,255],white=[255,255,255];
  const clean=t=>String(t).replace(/[–—]/g,"-");
  const bg=()=>{pdf.setFillColor(...page);pdf.rect(0,0,PW,PH,"F");};
  const txt=(t,x,y,o)=>pdf.text(clean(t),x,y,o);
  bg();
  // title
  pdf.setFont("helvetica","bold");pdf.setFontSize(portrait?11:14);pdf.setTextColor(...white);
  txt(document.getElementById("hd-title").textContent,M,M+5);
  pdf.setFontSize(portrait?8:10);pdf.setTextColor(...cyan);txt("Weekly Schedule · 9–13 Nov 2026",M,M+10.5);
  const top=M+14,foot=9,cw0=portrait?22:30,hh=portrait?13:12;
  const rows=[...tbody.querySelectorAll("tr")],nr=rows.length,nc=days.length;
  const cw=(PW-2*M-cw0)/nc,rh=(PH-top-M-foot-hh)/nr;
  const head=[...thead.querySelectorAll("th")];
  const dayPage=c=>2+c;
  // header row
  const hBg=rgb(cs(head[1],"backgroundColor"))||[14,37,71];
  pdf.setDrawColor(...line);pdf.setLineWidth(.25);
  head.forEach((th,i)=>{
   const x=i===0?M:M+cw0+(i-1)*cw,w=i===0?cw0:cw;
   pdf.setFillColor(...hBg);pdf.rect(x,top,w,hh,"FD");
   if(i===0){pdf.setFont("helvetica","bold");pdf.setFontSize(portrait?7:9);pdf.setTextColor(...(rgb(cs(th,"color"))||[201,166,90]));txt("Time / Day",x+w/2,top+hh/2+1,{align:"center"});}
   else{
    const c=i-1;pdf.setFont("helvetica","bold");pdf.setFontSize(portrait?8:11);pdf.setTextColor(...white);txt(days[c],x+w/2,top+hh/2-.5,{align:"center"});
    pdf.setFont("helvetica","normal");pdf.setFontSize(portrait?7:9);pdf.setTextColor(...cyan);txt(dates[c],x+w/2,top+hh/2+4,{align:"center"});
    try{pdf.link(x,top,w,hh,{pageNumber:dayPage(c)});}catch(e){}
   }
  });
  // rows
  let editable=true;
  rows.forEach((tr,r)=>{
   const y=top+hh+r*rh,cells=[...tr.children];
   const th=cells[0],hl=th.classList.contains("highlight");
   pdf.setFillColor(...(hl?(rgb(cs(th,"backgroundColor"))||[201,166,90]):hBg));pdf.rect(M,y,cw0,rh,"FD");
   pdf.setFont("helvetica","bold");pdf.setFontSize(portrait?7:9);pdf.setTextColor(...(hl?[6,19,38]:white));
   const [a,b]=times[r].split(" – ");txt(a,M+cw0/2,y+rh/2-1,{align:"center"});txt(b,M+cw0/2,y+rh/2+3,{align:"center"});
   cells.slice(1).forEach((td,c)=>{
    const x=M+cw0+c*cw,area=td.querySelector("textarea");
    const base=rgb(cs(td,"backgroundColor"))||[10,29,56];
    pdf.setFillColor(...base);pdf.rect(x,y,cw,rh,"FD");
    const fill=rgb(cs(area,"backgroundColor"))||base,fg=rgb(cs(area,"color"))||white;
    const ix=x+.9,iy=y+.9,iw=cw-1.8,ih=rh-1.8;
    pdf.setFillColor(...fill);pdf.setDrawColor(70,120,180);pdf.roundedRect(ix,iy,iw,ih,1.6,1.6,"FD");pdf.setDrawColor(...line);
    const value=clean(area.value||"");
    let done=false;
    if(editable){
     try{
      const f=new J.AcroForm.TextField();
      f.fieldName="cell_"+r+"_"+c;f.Rect=[ix+.4,iy+.4,iw-.8,ih-.8];f.multiline=true;f.value=value;f.defaultValue=value;
      f.fontSize=portrait?7:9;f.fontName="helvetica";f.color=hex(fg);
      try{f.textAlign="center";}catch(e){}
      pdf.addField(f);done=true;
     }catch(e){editable=false;}
    }
    if(!done&&value){
     pdf.setFont("helvetica","bold");pdf.setFontSize(portrait?7:9);pdf.setTextColor(...fg);
     const ls=pdf.splitTextToSize(value,iw-1.6);txt(ls,x+cw/2,y+rh/2-(ls.length-1)*1.6,{align:"center",baseline:"middle"});
    }
   });
  });
  // footer
  pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(...cyan);
  txt("Penrose ScholarMw · Your academic partner for excellence",M,PH-M+1);
  txt("Tap a day to open its page · cells are editable form fields",PW-M,PH-M+1,{align:"right"});
  // one page per day (navigable)
  days.forEach((dn,c)=>{
   pdf.addPage();bg();
   pdf.setFont("helvetica","bold");pdf.setFontSize(15);pdf.setTextColor(...white);txt(dn+" "+dates[c],M,M+7);
   pdf.setFontSize(9);pdf.setFont("helvetica","normal");pdf.setTextColor(...cyan);
   pdf.textWithLink("< Weekly schedule",M,M+13,{pageNumber:1});
   if(c>0)pdf.textWithLink("< "+days[c-1],PW/2-20,M+13,{pageNumber:dayPage(c-1)});
   if(c<nc-1)pdf.textWithLink(days[c+1]+" >",PW-M-22,M+13,{pageNumber:dayPage(c+1)});
   let y=M+24;const list=dayEntries(c);
   if(!list.length){pdf.setTextColor(...white);txt("Nothing scheduled.",M,y);}
   list.forEach(x=>{
    const fac=(modules[x.label]&&modules[x.label].facilitator)||"";
    pdf.setFillColor(14,37,71);pdf.setDrawColor(...line);pdf.roundedRect(M,y-5,PW-2*M,16,2,2,"FD");
    pdf.setFont("helvetica","bold");pdf.setFontSize(10.5);pdf.setTextColor(...white);txt(x.timeLabel+"   "+x.label,M+3,y+.5);
    pdf.setFont("helvetica","normal");pdf.setFontSize(8.5);pdf.setTextColor(...cyan);
    txt([x.sub,fac&&fac!=="Not specified"?"Facilitator: "+fac:""].filter(Boolean).join(" · "),M+3,y+6);
    y+=19;
   });
  });
  try{pdf.outline.add(null,"Weekly Schedule",{pageNumber:1});days.forEach((dn,c)=>pdf.outline.add(null,dn+" "+dates[c],{pageNumber:dayPage(c)}));}catch(e){}
  pdf.setProperties({title:"PhD in Maternal and Neonatal Health - Weekly Schedule"});
  const blob=pdf.output("blob"),name="MNH-PhD-Weekly-Calendar.pdf";
  const url=URL.createObjectURL(blob),l=document.createElement("a");l.href=url;l.download=name;l.click();setTimeout(()=>URL.revokeObjectURL(url),4000);statusEl.className="status ok";statusEl.textContent="PDF ready.";
 }catch(e){console.error(e);statusEl.className="status error";statusEl.textContent="The PDF could not be created.";}
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"){hideDialog("module-dialog");hideDialog("security-dialog");hideDialog("details-dialog");}});
// ---- Shared cloud storage (published link) with local copy as fallback ----
const SEED_CELLS={
 "1_0":{code:"Biostatistics",title:"Biostatistics",timeLabel:"11:00–13:30",colour:"#2F5D8C"},
 "6_0":{code:"Bioethics",title:"Bioethics",timeLabel:"19:00–21:00",colour:"#7B3F61"},
 "6_1":{code:"Bioethics",title:"Bioethics",timeLabel:"19:00–21:00",colour:"#7B3F61"},
 "0_2":{code:"Immunology",title:"Immunology",timeLabel:"08:00–10:00",colour:"#3C7A5A"},
 "3_2":{code:"Imaging",title:"Imaging",timeLabel:"Afternoon–evening",colour:"#8A6D2F"},
 "1_3":{code:"Seminar in MNH",title:"Seminar in Maternal and Neonatal Health",timeLabel:"10:00–12:00",colour:"#2F5D8C"},
 "2_3":{code:"Biostatistics",title:"Biostatistics",timeLabel:"AM–afternoon",colour:"#2F5D8C"},
 "6_3":{code:"Immunology",title:"Immunology",timeLabel:"19:00–21:00",colour:"#3C7A5A"},
 "0_4":{code:"Immunology",title:"Immunology",timeLabel:"08:00–10:00",colour:"#3C7A5A"},
 "3_4":{code:"Library",title:"Library session",timeLabel:"Afternoon",colour:"#4B5D7A"},
 "1_5":{code:"RMDA-8101 Exams",title:"Research Methods and Bioethics — Examinations",timeLabel:"Examinations",colour:"#7A3B3B"}
};
const SEED_STAMP=1794350000000;   // programme for the teaching week 9–14 November 2026, shown if the cloud cannot be reached
const themeKey="phd_mnh_theme";
const syncEl=document.getElementById("sync");
let cloud=null,syncing=false;
function setSync(t){syncEl.textContent=t;}
function cleanCell(v){const o={};["code","title","facilitator","colour","text","timeLabel","mode"].forEach(k=>{if(v&&typeof v[k]==="string")o[k]=v[k];});return o;}
function validKey(k){const m=/^(\d+)_(\d+)$/.exec(k);return !!m&&+m[1]<times.length&&+m[2]<days.length;}
function writeFailed(e){
 try{saveState();}catch(x){}
 if(e&&e.queued){
  setSync("Offline · changes saved locally and waiting to sync");
  statusEl.className="status ok";
  statusEl.textContent="Saved on this device. This change will sync automatically when the connection returns.";
  return;
 }
 statusEl.className="status error";
 if(e&&e.code==="invalid_argument"){setSync("Shared timetable · read-only for this account");statusEl.textContent="Your account can’t change the shared timetable, so this edit is kept on this device only. Ask the owner for Contributor access.";}
 else{setSync("Shared timetable unreachable · local copy retained");statusEl.textContent="The shared timetable could not be reached. Your local copy is retained; reconnect and try again.";}
}
async function pushCell(r,c){
 try{saveState();}catch(e){}
 const id=cellKey(r,c),v=state.cells[id];
 const path="/api/doc/cells/"+encodeURIComponent(id);
 try{
  if(v){
   const data={...cleanCell(v),updatedAt:Date.now()};
   if(cloud)await cloud.doc("cells/"+id).set(data);
   else await window.mnhApi.request("PUT",path,data);
  }else if(cloud)await cloud.doc("cells/"+id).delete();
  else await window.mnhApi.request("DELETE",path);
  setSync("Shared timetable · saved");statusEl.className="status ok";statusEl.textContent="Saved for everyone.";
 }catch(e){writeFailed(e);}
}
async function syncAll(okMsg){
 try{saveState();}catch(e){statusEl.className="status error";statusEl.textContent="Browser storage is unavailable. Use Download backup to keep a copy.";}
 if(!cloud){statusEl.className="status error";statusEl.textContent="The shared server is unavailable. Your local recovery copy is retained.";return;}
 syncing=true;
 try{
  const want={...state.cells};
  const snap=await cloud.collection("cells").get();
  const existing=snap.docs.map(d=>d.id);
  for(const [id,v] of Object.entries(want)){if(id==="2_1"||!validKey(id))continue;await cloud.doc("cells/"+id).set({...cleanCell(v),updatedAt:Date.now()});}
  for(const id of existing){if(!(id in want))await cloud.doc("cells/"+id).delete();}
  state.fromCloud=true;try{saveState();}catch(e){}
  setSync("Shared timetable · saved");statusEl.className="status ok";statusEl.textContent=okMsg||"Saved for everyone.";
 }catch(e){writeFailed(e);}
 finally{syncing=false;}
}
function onCells(snap){
 if(syncing)return;
 if(snap.metadata&&snap.metadata.fromCache&&snap.empty)return;
 const remote={};
 snap.docs.forEach(d=>{if(!validKey(d.id))return;const v=cleanCell(d.data());if(v.code||v.text)remote[d.id]=v;});
 if(!Object.keys(remote).length&&!state.fromCloud){
  setSync(Object.keys(state.cells).length?"Shared timetable is empty · use Save timetable to publish this copy":"Shared timetable · up to date");
  return;
 }
 state.cells=remote;state.fromCloud=true;
 try{saveState();}catch(e){}
 build();setSync("Shared timetable · up to date");
}
async function downloadFile(filename,text){
 const blob=new Blob([text],{type:"application/json"});
 const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
let cloudInitialising=false;
async function initCloud(){
 if(cloudInitialising||cloud)return;
 cloudInitialising=true;
 setSync("Connecting to the shared timetable…");
 try{
  const db=await window.mnhApi.use("db");
  if(!db){setSync("Shared server unavailable · local recovery copy retained");return;}
  cloud=db;
  try{const session=await fetch("/api/session",{cache:"no-store"}).then(r=>r.json());currentRole=session.role||"student";updateRoleNav();if(session.authenticated){setEditing(true);}}
  catch(e){}
  try{await window.mnhApi.flushQueue();}catch(e){}
  try{subscribeExtras(db);}catch(e){}
  try{db.collection("cells").onSnapshot(onCells,()=>setSync("Shared server unavailable · local recovery copy retained"));}
  catch(e){setSync("Shared server unavailable · local recovery copy retained");}
  try{moduleUnsubscribe=db.collection("modules").onSnapshot(onModules,()=>setSync("Module updates temporarily unavailable"));}catch(e){}
 }catch(e){setSync("Shared server unavailable · local recovery copy retained");}
 finally{cloudInitialising=false;}
}
window.addEventListener("online",()=>{if(!cloud)initCloud();});
setInterval(()=>{if(!cloud&&navigator.onLine)initCloud();},15000);
window.addEventListener("offline",()=>setSync("Offline · local calendar remains available"));
window.addEventListener("mnh:offline-queued",()=>setSync("Offline · changes saved locally and waiting to sync"));
window.addEventListener("mnh:offline-synced",()=>{
 setSync("Shared timetable · offline changes synchronised");
 statusEl.className="status ok";
 statusEl.textContent="Your offline changes have now been synchronised.";
});
// ---- Alarms: ring like an incoming call (per device, only while this page is open) ----
const alarmKey="phd_mnh_alarm_v1",firedKey="phd_mnh_alarm_fired";
const WEEK_START=[2026,10,9];
const baseTitle=document.title;
let alarm={on:false,lead:10},fired=[],snoozed=[],audioCtx=null,ringBus=null,ringTimer=null,ringStopTimer=null,titleTimer=null,ringing=null;
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function pad2(n){return String(n).padStart(2,"0");}
function hhmm(d){return pad2(d.getHours())+":"+pad2(d.getMinutes());}
function loadAlarm(){
 try{const a=JSON.parse(localStorage.getItem(alarmKey)||"null");if(a)alarm={on:!!a.on,lead:[0,5,10,15,30].includes(+a.lead)?+a.lead:10};}catch(e){}
 try{fired=JSON.parse(localStorage.getItem(firedKey)||"[]");if(!Array.isArray(fired))fired=[];}catch(e){fired=[];}
}
function saveAlarm(){try{localStorage.setItem(alarmKey,JSON.stringify(alarm));}catch(e){}}
function ensureAudio(){
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  if(!audioCtx){audioCtx=new AC();ringBus=audioCtx.createGain();ringBus.connect(audioCtx.destination);}
  if(audioCtx.state==="suspended")audioCtx.resume();
  return audioCtx;
 }catch(e){return null;}
}
function eventStart(r,c,entry){
 const d=new Date(WEEK_START[0],WEEK_START[1],WEEK_START[2]+c);
 if(entry.code==="Journal Club"){d.setHours(13,0,0,0);return d;}
 const m=/^(\d\d):(\d\d)/.exec(times[r]);d.setHours(+m[1],+m[2],0,0);return d;
}
function alarmEvents(){
 const out=[];
 times.forEach((t,r)=>days.forEach((dn,c)=>{
  const e=getEntry(r,c);if(!(e.code||e.text))return;
  out.push({r,c,label:e.code||e.text,sub:(modules[e.code]&&modules[e.code].title)||"",start:eventStart(r,c,e)});
 }));
 return out;
}
function playCycle(){
 const ctx=audioCtx;if(!ctx)return;
 if(ctx.state==="suspended")ctx.resume();
 const t0=ctx.currentTime+0.02;
 [0,0.6].forEach(off=>{
  const env=ctx.createGain(),trem=ctx.createGain(),lg=ctx.createGain();
  const lfo=ctx.createOscillator(),o1=ctx.createOscillator(),o2=ctx.createOscillator();
  o1.frequency.value=440;o2.frequency.value=480;lfo.frequency.value=20;
  trem.gain.value=0.5;lg.gain.value=0.5;
  lfo.connect(lg);lg.connect(trem.gain);o1.connect(trem);o2.connect(trem);trem.connect(env);env.connect(ringBus);
  const s=t0+off,e=s+0.45;
  env.gain.setValueAtTime(0,s);env.gain.linearRampToValueAtTime(0.35,s+0.03);
  env.gain.setValueAtTime(0.35,e-0.04);env.gain.linearRampToValueAtTime(0,e);
  [o1,o2,lfo].forEach(o=>{o.start(s);o.stop(e+0.05);});
 });
 try{if(navigator.vibrate)navigator.vibrate([450,150,450]);}catch(e){}
}
function startRing(ev){
 if(ringing)return;
 ringing=ev;ensureAudio();{const cd=document.getElementById("call-day");if(cd)cd.textContent=new Date().getDate();}
 document.getElementById("call-name").textContent=ev.label;
 const mins=Math.round((ev.start.getTime()-Date.now())/60000);
 const when=ev.test?"This is a test of the alarm sound":(mins>0?`Starts at ${hhmm(ev.start)} · in ${mins} min`:`Starting now · ${hhmm(ev.start)}`);
 document.getElementById("call-when").textContent=(ev.sub?ev.sub+" · ":"")+when;
 document.getElementById("call-snooze").style.display=ev.test?"none":"inline-block";
 showDialog("call-dialog");
 playCycle();ringTimer=setInterval(playCycle,3000);
 ringStopTimer=setTimeout(stopRing,60000);
 let flip=false;titleTimer=setInterval(()=>{flip=!flip;document.title=flip?"📞 "+ev.label:baseTitle;},900);
}
function stopRing(){
 clearInterval(ringTimer);clearTimeout(ringStopTimer);clearInterval(titleTimer);ringTimer=ringStopTimer=titleTimer=null;
 if(audioCtx&&ringBus){try{ringBus.disconnect();}catch(e){}ringBus=audioCtx.createGain();ringBus.connect(audioCtx.destination);}
 try{if(navigator.vibrate)navigator.vibrate(0);}catch(e){}
 document.title=baseTitle;hideDialog("call-dialog");ringing=null;
}
function alarmTick(){
 if(!alarm.on||ringing)return;
 const now=Date.now();
 for(const s of snoozed){if(!s.done&&now>=s.at){s.done=true;startRing(s.ev);return;}}
 for(const ev of alarmEvents()){
  const ring=ev.start.getTime()-alarm.lead*60000,id=ev.r+"_"+ev.c+"|"+alarm.lead;
  if(now>=ring&&now<ring+90000&&!fired.includes(id)){
   fired.push(id);try{localStorage.setItem(firedKey,JSON.stringify(fired.slice(-100)));}catch(e){}
   startRing(ev);return;
  }
 }
}
function refreshAlarmUI(){
 const ab=document.getElementById("alarms"),al=alarm.on?`Alarms on (${alarm.lead?alarm.lead+" min before":"at start"})`:"Alarms off";ab.setAttribute("aria-label",al);ab.parentElement.dataset.label=al;ab.classList.toggle("on",alarm.on);
 document.getElementById("alarm-toggle").textContent=alarm.on?"Turn off":"Turn on";
 document.getElementById("alarm-lead").value=String(alarm.lead);
 const box=document.getElementById("alarm-next");
 if(!alarm.on){box.textContent="Alarms are off.";return;}
 const now=Date.now();let next=null;
 alarmEvents().forEach(ev=>{const ring=ev.start.getTime()-alarm.lead*60000;if(ring+90000>now&&(!next||ring<next.ring))next={ev,ring};});
 box.innerHTML=next
  ?`<strong>Next alarm</strong><br>${esc(next.ev.label)}<br>${days[next.ev.c]} ${dates[next.ev.c]} · rings ${hhmm(new Date(next.ring))}, starts ${hhmm(next.ev.start)}`
  :"No more activities this week.";
}
function initAlarms(){
 loadAlarm();refreshAlarmUI();
 document.getElementById("alarms").addEventListener("click",()=>{refreshAlarmUI();showDialog("alarm-dialog");});
 document.getElementById("alarm-close").addEventListener("click",()=>hideDialog("alarm-dialog"));
 document.getElementById("alarm-lead").addEventListener("change",e=>{alarm.lead=+e.target.value;saveAlarm();refreshAlarmUI();});
 document.getElementById("alarm-toggle").addEventListener("click",()=>{
  alarm.on=!alarm.on;
  if(alarm.on&&!ensureAudio()){statusEl.className="status error";statusEl.textContent="This browser can’t play alarm sounds. You will still see the call screen.";}
  saveAlarm();refreshAlarmUI();
 });
 document.getElementById("alarm-test").addEventListener("click",()=>{hideDialog("alarm-dialog");ensureAudio();startRing({r:-1,c:0,label:"Test alarm",sub:"",start:new Date(),test:true});});
 document.getElementById("call-decline").addEventListener("click",stopRing);
 document.getElementById("call-snooze").addEventListener("click",()=>{if(ringing&&!ringing.test)snoozed.push({ev:ringing,at:Date.now()+300000,done:false});stopRing();});
 document.getElementById("call-answer").addEventListener("click",()=>{const ev=ringing;stopRing();if(ev&&!ev.test)showEntryDetails(ev.r,ev.c);});
 document.addEventListener("pointerdown",()=>{if(alarm.on&&(!audioCtx||audioCtx.state!=="running"))ensureAudio();},{passive:true});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(ringing)stopRing();hideDialog("alarm-dialog");}});
 setInterval(alarmTick,1000);
}
// ---- Header (editable + navigable) and extra views ----
const HEADER_DEFAULT={title:"PhD in Maternal and Neonatal Health",subtitle:"Academic Calendar"};
const headerKey="phd_mnh_header",resKey="phd_mnh_resources",resCloudKey="phd_mnh_res_cloud";
const VIEWS=["dashboard","weekly","monthly","upcoming","modules","facilitators","examinations","recurring","communications","analytics","history","export","settings"];
function updateRoleNav(){document.querySelectorAll('.view-tab[data-view="analytics"]').forEach(x=>{x.title=analyticsUnlocked?"Analytics unlocked":"Staff and class representative access";});}
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],WD=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let headerCfg={...HEADER_DEFAULT},resources=[],currentView="weekly";
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function fmtH(m){const h=Math.floor(m/60),mm=m%60;return mm?(h?h+"h "+mm+"m":mm+"m"):h+"h";}
function slotMins(r){const m=/^(\d\d):(\d\d) – (\d\d):(\d\d)/.exec(times[r]);return (+m[3]*60+ +m[4])-(+m[1]*60+ +m[2]);}
function todayIndex(){
 const n=new Date();
 for(let c=0;c<days.length;c++){const d=new Date(WEEK_START[0],WEEK_START[1],WEEK_START[2]+c);if(d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate())return c;}
 return -1;
}
function dayEntries(c){
 const out=[];
 times.forEach((t,r)=>{
  const e=getEntry(r,c);if(!(e.code||e.text))return;
  const j=e.code==="Journal Club",start=eventStart(r,c,e),mins=j?60:slotMins(r);
  out.push({r,c,label:e.code||e.text,sub:(modules[e.code]&&modules[e.code].title)||"",start,end:new Date(start.getTime()+mins*60000),mins,timeLabel:j?"13:00 – 14:00":(e.timeLabel||t)});
 });
 return out.sort((a,b)=>a.start-b.start);
}
function allEntries(){const o=[];days.forEach((d,c)=>dayEntries(c).forEach(x=>o.push(x)));return o;}
// ---- header ----
function applyHeader(h){
 if(!h)return false;
 const t=String(h.title||"").trim().slice(0,80),s=String(h.subtitle||"").trim().slice(0,60);
 if(!t)return false;
 headerCfg={title:t,subtitle:s};
 document.getElementById("hd-title").textContent=t;document.getElementById("hd-sub").textContent=s;
 document.getElementById("hd-sub").hidden=!s;
 try{localStorage.setItem(headerKey,JSON.stringify(headerCfg));}catch(e){}
 return true;
}
function initHeaderFromLocal(){try{const h=JSON.parse(localStorage.getItem(headerKey)||"null");if(h)applyHeader(h);}catch(e){}}
async function saveHeader(h){
 if(!applyHeader(h))return;
 const data={title:headerCfg.title,subtitle:headerCfg.subtitle,updatedAt:Date.now()};
 try{
  if(cloud)await cloud.doc("settings/header").set(data);
  else await window.mnhApi.request("PUT","/api/doc/settings/header",data);
  statusEl.className="status ok";statusEl.textContent="Header saved for everyone.";
 }catch(e){writeFailed(e);}
}
function closeBell(){const p=document.getElementById("bell-panel");p.hidden=true;document.getElementById("hd-bell").setAttribute("aria-expanded","false");}
function refreshHeader(){
 const d=new Date();
 document.getElementById("hd-date").textContent=WD[d.getDay()]+", "+d.getDate()+" "+MONTHS[d.getMonth()]+" "+d.getFullYear();
 {const hd=document.getElementById("hd-day");if(hd)hd.textContent=d.getDate();}
 const c=todayIndex(),now=Date.now();
 const rem=c<0?[]:dayEntries(c).filter(x=>x.end.getTime()>now);
 const badge=document.getElementById("hd-badge");badge.textContent=rem.length;badge.hidden=!rem.length;
 document.getElementById("hd-bell").setAttribute("aria-label","Today’s activities: "+rem.length+" remaining");
 const panel=document.getElementById("bell-panel");panel.textContent="";
 panel.appendChild(el("div","bp-h","Today"));
 if(!rem.length)panel.appendChild(el("div","bp-empty",c<0?"No activities today.":"Nothing left today."));
 rem.forEach(x=>{
  const b=el("button","bp-item");b.type="button";
  b.append(el("span","bp-t",x.timeLabel),el("span","bp-n",x.label));
  b.addEventListener("click",()=>{closeBell();showEntryDetails(x.r,x.c);});
  panel.appendChild(b);
 });
}
// ---- navigation ----
function showView(name){
 if(!VIEWS.includes(name))name="weekly";
 if(name==="analytics"&&!analyticsUnlocked){requestAnalytics();return;}
 currentView=name;
 const weekly=document.getElementById("view-weekly"),home=document.getElementById("view-dashboard"),workspace=document.getElementById("view-workspace"),analytics=document.getElementById("view-analytics");
 home.hidden=name!=="dashboard";weekly.hidden=name!=="weekly";analytics.hidden=name!=="analytics";
 workspace.hidden=!(["modules","monthly","upcoming","facilitators","examinations","recurring","communications","history","export","settings"].includes(name));
 document.querySelectorAll(".menu-nav[data-view]").forEach(t=>t.classList.toggle("active",t.dataset.view===name));
 document.querySelectorAll(".view-tab[data-view],.hd-tab[data-view]").forEach(t=>{const on=t.dataset.view===name;t.classList.toggle("active",on);if(on)t.setAttribute("aria-current","page");else t.removeAttribute("aria-current");});
 renderView(name);
}
function renderView(name){
 if(name==="dashboard")renderDashboard();
 else if(name==="weekly")build();
 else if(name==="modules")renderModules();
 else if(name==="analytics")renderAnalytics();
 else if(name==="monthly")renderMonthly();
 else if(name==="upcoming")renderUpcoming();
 else if(name==="facilitators")renderManaged("facilitators");
 else if(name==="examinations")renderManaged("examinations");
 else if(name==="recurring")renderManaged("recurring");
 else if(name==="communications")renderCommunications();
 else if(name==="history")renderHistoryPage();
 else if(name==="export")renderExportPage();
 else if(name==="settings")renderSettingsPage();
}
const WORKSPACE_META={
 monthly:["Monthly Calendar","Browse the current academic month and its scheduled sessions."],
 modules:["Modules","Manage programme modules and review their scheduled sessions."],
 upcoming:["Upcoming Academic Activities","Timetable sessions, examinations and recurring activities."],
 facilitators:["Facilitators","Shared facilitator directory."],
 examinations:["Examinations","Examination dates, times, venues and notes."],
 recurring:["Recurring Activities","Regular academic activities and their schedules."],
 communications:["WhatsApp & Communications","Shared announcements, communication notes and useful links."],
 history:["Activity History","New timetable sessions and shared activities added by Rep or Staff."],
 export:["Export & Sharing","Download the timetable, shared data and printable calendar."],
 settings:["Settings","Application preferences, access and header controls."]
};
function workspace(title,lead){document.getElementById("workspace-title").textContent=title;document.getElementById("workspace-lead").textContent=lead;const root=document.getElementById("workspace-body");root.textContent="";return root;}
async function apiRequest(method,path,body){return window.mnhApi.request(method,path,body);}
function fieldInput(placeholder,max=180,type="text"){const i=document.createElement("input");i.placeholder=placeholder;i.type=type;if(type==="text")i.maxLength=max;i.setAttribute("aria-label",placeholder);if(type==="date"){const pad=n=>String(n).padStart(2,"0"),iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,now=new Date();i.min=iso(now);i.max=iso(new Date(now.getFullYear()+3,now.getMonth(),now.getDate()));i.title="Choose today or a future date, up to three years ahead.";}if(type==="time")i.step="900";i.style.cssText="display:block;width:100%;margin:6px 0;padding:10px;border:1px solid var(--line);border-radius:7px;background:var(--field);color:var(--text);font:inherit";return i;}
async function loadRows(collection){return apiRequest("GET","/api/col/"+encodeURIComponent(collection));}
async function saveRow(collection,id,data){await apiRequest("PUT","/api/doc/"+encodeURIComponent(collection)+"/"+encodeURIComponent(id),data);}
async function deleteRow(collection,id){await apiRequest("DELETE","/api/doc/"+encodeURIComponent(collection)+"/"+encodeURIComponent(id));}
function makeId(prefix){return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);}
function renderDashboard(){
 const box=document.getElementById("dashboard-overview");box.textContent="";
 const stats=[[Object.keys(modules).length,"Modules"],[allEntries().length,"Scheduled sessions"],[resources.length,"Shared resources"]];
 stats.forEach(([v,l])=>{const c=el("div","card");c.append(el("div","stat",String(v)),el("div","statlabel",l));box.appendChild(c);});
 const upcoming=document.getElementById("dashboard-upcoming");upcoming.textContent="";const entries=allEntries().slice(0,5);
 if(!entries.length)upcoming.appendChild(el("div","muted","No timetable sessions have been published yet."));
 entries.forEach(x=>upcoming.appendChild(itemButton(x)));
 const recent=document.getElementById("dashboard-recent");recent.textContent="";
 apiRequest("GET","/api/history").then(rows=>{recent.textContent="";if(!rows.length)recent.appendChild(el("div","muted","No recent additions."));rows.slice(0,5).forEach(r=>recent.appendChild(el("div","item",`${r.role} · ${r.summary}`)));}).catch(()=>recent.textContent="Recent activity is unavailable.");
}
function renderMonthly(){
 const root=workspace(...WORKSPACE_META.monthly),card=el("div","card"),grid=el("div","month-grid");
 const year=2026,month=10,first=new Date(year,month,1),offset=first.getDay(),daysInMonth=new Date(year,month+1,0).getDate();
 card.appendChild(el("h3",null,"November 2026"));
 ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>grid.appendChild(el("div","month-dow",d)));
 for(let i=0;i<offset;i++)grid.appendChild(el("div","month-empty",""));
 const events=allEntries();
 for(let day=1;day<=daysInMonth;day++){
  const cell=el("div","month-day"),num=el("strong",null,String(day));cell.appendChild(num);
  const col=day>=9&&day<=13?day-9:-1;
  if(col>=0){const list=events.filter(x=>x.c===col);list.forEach(x=>cell.appendChild(el("span","month-event",x.label)));}
  grid.appendChild(cell);
 }
 card.appendChild(grid);root.appendChild(card);
 root.appendChild(el("p","muted","The month view displays the dated teaching week currently configured in the shared timetable. Additional dates appear as dated calendar records are added."));
}
function renderUpcoming(){const root=workspace(...WORKSPACE_META.upcoming);const list=el("div","cards");const entries=allEntries();entries.forEach(x=>{const c=el("div","card");c.append(el("h3",null,x.label),el("div","muted",`${days[x.c]} ${dates[x.c]} · ${x.timeLabel}`));if(x.sub)c.appendChild(el("p","muted",x.sub));list.appendChild(c);});loadRows("examinations").then(rows=>rows.forEach(r=>{const d=r.data||{},c=el("div","card");c.append(el("h3",null,d.title||r.id),el("div","muted",[d.date,d.time,d.venue].filter(Boolean).join(" · ")));list.appendChild(c);})).catch(()=>{});root.appendChild(list);if(!entries.length)root.appendChild(el("p","muted","No upcoming timetable sessions are currently recorded."));}
const MANAGED_FIELDS={facilitators:["name","title","department","email","phone"],examinations:["title","date","time","venue","notes"],recurring:["title","frequency","day","time","venue","notes"]};
const MANAGED_LABELS={facilitators:"Facilitator",examinations:"Examination",recurring:"Recurring activity"};
async function renderManaged(collection){const [title,lead]=WORKSPACE_META[collection],root=workspace(title,lead);if(editingUnlocked){const form=el("div","card res-form");form.appendChild(el("h3",null,"Add "+MANAGED_LABELS[collection].toLowerCase()));const fields={};MANAGED_FIELDS[collection].forEach(k=>{const type=k==="date"?"date":k==="time"?"time":"text";fields[k]=fieldInput(k[0].toUpperCase()+k.slice(1),k==="notes"?500:180,type);form.appendChild(fields[k]);});const add=el("button","primary","Save "+MANAGED_LABELS[collection].toLowerCase());add.type="button";add.addEventListener("click",async()=>{const data={};Object.entries(fields).forEach(([k,v])=>data[k]=v.value.trim());if(!data[MANAGED_FIELDS[collection][0]]){statusEl.className="status error";statusEl.textContent="Please enter a title or name.";return;}if(data.date){const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),max=new Date(now.getFullYear()+3,now.getMonth(),now.getDate()),chosen=new Date(data.date+"T00:00:00");if(isNaN(chosen)||chosen<today||chosen>max){statusEl.className="status error";statusEl.textContent="Choose a date between today and three years from today.";return;}}try{await saveRow(collection,makeId(collection.slice(0,3)),data);statusEl.className="status ok";statusEl.textContent="Saved and shared with all users.";renderManaged(collection);}catch(e){writeFailed(e);}});form.appendChild(add);root.appendChild(form);}const list=el("div","cards");root.appendChild(list);try{const rows=await loadRows(collection);if(!rows.length)list.appendChild(el("p","muted","No records have been added yet."));rows.forEach(row=>{const d=row.data||{},c=el("div","card");c.appendChild(el("h3",null,d.title||d.name||row.id));const detail=MANAGED_FIELDS[collection].filter(k=>d[k]).map(k=>`${k[0].toUpperCase()+k.slice(1)}: ${d[k]}`).join(" · ");if(detail)c.appendChild(el("p","muted",detail));if(editingUnlocked){const del=el("button","res-del","Remove record");del.type="button";del.addEventListener("click",async()=>{if(!confirm("Remove this shared record?"))return;try{await deleteRow(collection,row.id);renderManaged(collection);}catch(e){writeFailed(e);}});c.appendChild(del);}list.appendChild(c);});}catch(e){list.appendChild(el("p","muted","Could not load shared records: "+e.message));}}
async function renderCommunications(){const root=workspace(...WORKSPACE_META.communications);if(editingUnlocked){const form=el("div","card res-form");form.appendChild(el("h3",null,"Publish an announcement or communication"));const title=fieldInput("Announcement title",160),message=fieldInput("Message / communication details",1000),link=fieldInput("Optional WhatsApp or web link",400,"url");form.append(title,message,link);const add=el("button","primary","Publish communication");add.type="button";add.addEventListener("click",async()=>{if(!title.value.trim()||!message.value.trim()){statusEl.className="status error";statusEl.textContent="Enter an announcement title and message.";return;}try{await saveRow("communications",makeId("com"),{title:title.value.trim(),message:message.value.trim(),url:safeUrl(link.value),createdAt:Date.now()});statusEl.className="status ok";statusEl.textContent="Communication published for all users.";renderCommunications();}catch(e){writeFailed(e);}});form.appendChild(add);root.appendChild(form);}const list=el("div","cards");root.appendChild(list);try{const rows=await loadRows("communications");if(!rows.length)list.appendChild(el("p","muted","No communications have been published."));rows.forEach(r=>{const d=r.data||{},c=el("div","card");c.append(el("h3",null,d.title||"Announcement"),el("p",null,d.message||""));if(d.url){const a=el("a","res-link","Open shared link");a.href=d.url;a.target="_blank";a.rel="noopener noreferrer";c.appendChild(a);}const wa=el("a","res-link","Share via WhatsApp");wa.href="https://wa.me/?text="+encodeURIComponent([d.title,d.message,d.url].filter(Boolean).join("\n"));wa.target="_blank";wa.rel="noopener noreferrer";c.appendChild(wa);if(editingUnlocked){const del=el("button","res-del","Remove");del.type="button";del.onclick=async()=>{try{await deleteRow("communications",r.id);renderCommunications();}catch(e){writeFailed(e);}};c.appendChild(del);}list.appendChild(c);});}catch(e){list.appendChild(el("p","muted",e.message));}const resourcesCard=el("div","card");resourcesCard.appendChild(el("h3",null,"Shared resources"));root.appendChild(resourcesCard);renderResources();const existing=document.getElementById("res-list");if(existing)resourcesCard.appendChild(existing);const f=document.getElementById("res-form-wrap");if(f)resourcesCard.appendChild(f);}
async function renderHistoryPage(){const root=workspace(...WORKSPACE_META.history);const card=el("div","card");root.appendChild(card);try{const rows=await apiRequest("GET","/api/history");if(!rows.length)card.appendChild(el("p","muted","No new sessions or activities have been recorded."));rows.forEach(r=>{const when=new Date(r.at).toLocaleString();card.appendChild(el("div","item",`${r.role} · ${r.summary} · ${when}`));});}catch(e){card.appendChild(el("p","muted",e.message));}}
function renderExportPage(){const root=workspace(...WORKSPACE_META.export);const card=el("div","card res-form");card.appendChild(el("h3",null,"Download and share calendar data"));[["Download timetable PDF",()=>document.getElementById("print").click()],["Export timetable CSV",()=>window.exportTimetableCSV()],["Download shared JSON backup",()=>window.downloadSharedBackup()]].forEach(([label,action])=>{const b=el("button",null,label);b.type="button";b.addEventListener("click",action);card.appendChild(b);});const info=el("p","muted","Exports use the shared server data. A downloaded JSON backup can be restored by an authorised editor from Settings.");card.appendChild(info);root.appendChild(card);}
function renderSettingsPage(){const root=workspace(...WORKSPACE_META.settings);const card=el("div","card res-form");card.appendChild(el("h3",null,"Appearance"));const label=el("label",null,"Dashboard theme");const sel=document.getElementById("theme").cloneNode(true);sel.id="theme-visible";sel.hidden=false;sel.style.cssText="padding:10px;background:var(--field);color:var(--text);border:1px solid var(--line);border-radius:7px";sel.value=state.theme||"midnight";sel.onchange=()=>{document.getElementById("theme").value=sel.value;document.getElementById("theme").dispatchEvent(new Event("change"));};card.append(label,sel);root.appendChild(card);
 const access=el("div","card res-form");access.appendChild(el("h3",null,"Access and security"));access.appendChild(el("p","muted",editingUnlocked?`Editing unlocked · ${currentRole}`:"Viewing is open; editing requires an authorised password."));const b=el("button","primary",editingUnlocked?"Lock editing":"Unlock editing");b.type="button";b.onclick=()=>document.getElementById(editingUnlocked?"lock":"unlock").click();access.appendChild(b);const hdr=el("button",null,"Edit calendar title and subtitle");hdr.type="button";hdr.disabled=!editingUnlocked;hdr.onclick=()=>document.getElementById("edit-header").click();access.appendChild(hdr);root.appendChild(access);
 const alarm=el("div","card res-form");alarm.appendChild(el("h3",null,"Alarms and reminders"));const alarmBtn=el("button",null,"Manage alarms and reminders");alarmBtn.type="button";alarmBtn.onclick=()=>document.getElementById("alarms").click();alarm.appendChild(alarmBtn);root.appendChild(alarm);
 const data=el("div","card res-form");data.appendChild(el("h3",null,"Data and backups"));[["Save changes for everyone",()=>document.getElementById("save").click(),true],["Download shared JSON backup",()=>window.downloadSharedBackup(),true],["Restore from JSON backup",()=>document.getElementById("import").click(),true],["Download PDF",()=>document.getElementById("print").click(),false]].forEach(([label,action,locked])=>{const x=el("button",null,label);x.type="button";x.disabled=locked&&!editingUnlocked;x.onclick=action;data.appendChild(x);});root.appendChild(data);}
function itemButton(x){
 const b=el("button","item");b.type="button";
 b.appendChild(el("span","it",x.timeLabel));
 const n=el("span","in",x.label);if(x.sub)n.appendChild(el("span","is",x.sub));b.appendChild(n);
 b.addEventListener("click",()=>showEntryDetails(x.r,x.c));
 return b;
}
function renderSchedule(){
 const root=document.getElementById("schedule-body");root.textContent="";
 const ti=todayIndex();
 days.forEach((dn,c)=>{
  const card=el("div","card"+(c===ti?" today":""));
  const h=el("h3",null,dn+" "+dates[c]);if(c===ti)h.appendChild(el("span","pill","Today"));
  card.appendChild(h);
  const list=dayEntries(c);
  if(!list.length)card.appendChild(el("div","muted","Nothing scheduled."));
  list.forEach(x=>card.appendChild(itemButton(x)));
  root.appendChild(card);
 });
}
function renderModules(){
 const root=workspace(...WORKSPACE_META.modules);const body=el("div","cards");root.appendChild(body);
 if(editingUnlocked){
  const form=el("div","card");form.style.marginBottom="12px";form.appendChild(el("h3",null,"Add a module"));
  const code=document.createElement("input");code.placeholder="Module code";code.maxLength=40;code.setAttribute("aria-label","Module code");
  const title=document.createElement("input");title.placeholder="Full module title";title.maxLength=160;title.setAttribute("aria-label","Full module title");
  const fac=document.createElement("input");fac.placeholder="Facilitator (optional)";fac.maxLength=120;fac.setAttribute("aria-label","Facilitator");
  [code,title,fac].forEach(x=>{x.style.cssText="display:block;width:100%;margin:6px 0;padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--field);color:var(--text);";form.appendChild(x);});
  const add=el("button","primary","Add module");add.type="button";add.addEventListener("click",async()=>{await addSharedModule(code.value,title.value,fac.value);});form.appendChild(add);root.appendChild(form);
 }
 const all=allEntries();
 const sessionsFor=code=>all.filter(x=>x.label===code);
 const addCard=(code,title,fac)=>{
  const card=el("div","card");card.appendChild(el("h3",null,code));
  if(title&&title!==code)card.appendChild(el("div",null,title));
  if(fac)card.appendChild(el("div","muted","Facilitator: "+fac));
  const s=sessionsFor(code),mins=s.reduce((a,x)=>a+x.mins,0);
  card.appendChild(el("div","muted","This week: "+s.length+" session"+(s.length===1?"":"s")+(s.length?" · "+fmtH(mins):"")));
  s.forEach(x=>{const b=el("button","item");b.type="button";b.append(el("span","it",days[x.c]),el("span","in",x.timeLabel));b.addEventListener("click",()=>showEntryDetails(x.r,x.c));card.appendChild(b);});
  body.appendChild(card);
 };
 Object.keys(modules).forEach(code=>addCard(code,modules[code].title,modules[code].facilitator==="Not specified"?"":modules[code].facilitator));
 const others=[];all.forEach(x=>{if(!modules[x.label]&&!others.includes(x.label))others.push(x.label);});
 others.forEach(l=>addCard(l,"",""));
}
async function renderAnalytics(){
 const root=document.getElementById("analytics-body");root.textContent="";
 try{
  const data=await apiRequest("GET","/api/analytics");
  const counts=data.counts||{},modes=data.delivery_modes||{};
  const stats=el("div","cards");[[counts.modules||0,"Modules"],[counts.facilitators||0,"Facilitators"],[counts.cells||0,"Scheduled sessions"],[data.recorded_additions||0,"Recorded additions"]].forEach(([v,l])=>{const c=el("div","card");c.append(el("div","stat",String(v)),el("div","statlabel",l));stats.appendChild(c);});root.appendChild(stats);
  const bars=(title,rows)=>{const card=el("div","card");card.style.marginTop="12px";card.appendChild(el("h3",null,title));const max=Math.max(1,...rows.map(r=>r[1]));rows.forEach(([n,v])=>{const row=el("div","barrow"),bar=el("div","bar"),fill=document.createElement("i");fill.style.width=Math.round(v/max*100)+"%";bar.appendChild(fill);row.append(el("span",null,n),bar,el("span","muted",String(v)));card.appendChild(row);});root.appendChild(card);};
  bars("Session delivery mode",[["Online",modes.online||0],["Face-to-face",modes.face_to_face||0],["Not specified",modes.unspecified||0]]);
  bars("Programme records",Object.entries(counts).map(([k,v])=>[k.replace(/_/g," "),v]));
  const note=el("p","muted",data.note||"Analytics are calculated from shared records.");root.appendChild(note);
  if(!data.recorded_additions)root.appendChild(el("p","muted","No recorded additions are available yet."));
 }catch(e){root.appendChild(el("div","card",e.status===403?"Analytics are restricted to staff and class representatives. Enter the editing password to continue.":"Analytics could not be loaded: "+e.message));}
}
// ---- resources (shared) ----
function safeUrl(u){
 u=String(u||"").trim();if(!u)return "";if(!/^https?:\/\//i.test(u))u="https://"+u;
 try{const x=new URL(u);return(x.protocol==="http:"||x.protocol==="https:")?x.href:"";}catch(e){return "";}
}
function cleanRes(v){return{title:String(v&&v.title||"").trim().slice(0,120),url:safeUrl(v&&v.url),note:String(v&&v.note||"").trim().slice(0,200),createdAt:+(v&&v.createdAt)||0};}
function cacheResources(){try{localStorage.setItem(resKey,JSON.stringify(resources));}catch(e){}}
function loadResources(){try{const r=JSON.parse(localStorage.getItem(resKey)||"[]");if(Array.isArray(r))resources=r.map(x=>({id:String(x.id||""),...cleanRes(x)})).filter(x=>x.id&&x.title&&x.url);}catch(e){}}
async function addResource(t,u,n){
 const rec=cleanRes({title:t,url:u,note:n,createdAt:Date.now()});
 if(!rec.title||!rec.url){statusEl.className="status error";statusEl.textContent="Enter a title and a valid web address.";return false;}
 const r={id:"r"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),...rec};
 resources.push(r);cacheResources();renderResources();
 try{
  const data={title:r.title,url:r.url,note:r.note,createdAt:r.createdAt};
  if(cloud)await cloud.doc("resources/"+r.id).set(data);
  else await window.mnhApi.request("PUT","/api/doc/resources/"+encodeURIComponent(r.id),data);
  statusEl.className="status ok";statusEl.textContent="Saved for everyone.";
 }catch(e){writeFailed(e);}
 return true;
}
async function removeResource(id){
 resources=resources.filter(x=>x.id!==id);cacheResources();renderResources();
 try{
  if(cloud)await cloud.doc("resources/"+id).delete();
  else await window.mnhApi.request("DELETE","/api/doc/resources/"+encodeURIComponent(id));
  statusEl.className="status ok";statusEl.textContent="Removed for everyone.";
 }catch(e){writeFailed(e);}
}
function renderResources(){
 const list=document.getElementById("res-list"),form=document.getElementById("res-form-wrap");
 list.textContent="";
 if(!resources.length)list.appendChild(el("p","muted","No resources have been added yet."));
 resources.forEach(r=>{
  const card=el("div","card res");
  const a=el("a","res-link",r.title);a.href=r.url;a.target="_blank";a.rel="noopener noreferrer";card.appendChild(a);
  if(r.note)card.appendChild(el("div","muted",r.note));
  card.appendChild(el("div","res-url muted",r.url));
  if(editingUnlocked){const d=el("button","res-del","Remove");d.type="button";d.addEventListener("click",()=>removeResource(r.id));card.appendChild(d);}
  list.appendChild(card);
 });
 form.textContent="";
 if(editingUnlocked){
  const f=el("div","res-form");f.appendChild(el("h3",null,"Add a resource"));
  const mk=(ph,max)=>{const i=document.createElement("input");i.type="text";i.placeholder=ph;i.maxLength=max;i.setAttribute("aria-label",ph);return i;};
  const t=mk("Title",120),u=mk("Web address (https://…)",300),n=mk("Short note (optional)",200);
  const b=el("button","primary","Add resource");b.type="button";
  b.addEventListener("click",async()=>{if(await addResource(t.value,u.value,n.value)){t.value=u.value=n.value="";}});
  f.append(t,u,n,b);form.appendChild(f);
 }
}
function subscribeExtras(db){
 db.collection("settings").onSnapshot(snap=>{snap.docs.forEach(d=>{if(d.id==="header"){const v=d.data();applyHeader({title:v.title,subtitle:v.subtitle});}});},()=>{});
 db.collection("resources").onSnapshot(snap=>{
  if(snap.metadata&&snap.metadata.fromCache&&snap.empty)return;
  const remote=snap.docs.map(d=>({id:d.id,...cleanRes(d.data())})).filter(x=>x.title&&x.url).sort((a,b)=>a.createdAt-b.createdAt);
  let seen=false;try{seen=localStorage.getItem(resCloudKey)==="1";}catch(e){}
  if(!remote.length&&!seen&&resources.length)return;   // first run: keep the local copy until saved
  if(remote.length){try{localStorage.setItem(resCloudKey,"1");}catch(e){}}
  resources=remote;cacheResources();renderResources();
 },()=>{});
}
function initHeader(){
 initHeaderFromLocal();loadResources();
 const bell=document.getElementById("hd-bell"),panel=document.getElementById("bell-panel");
 bell.addEventListener("click",e=>{e.stopPropagation();const open=panel.hidden;if(open){closeMenu();refreshHeader();}panel.hidden=!open;bell.setAttribute("aria-expanded",String(open));});
 panel.addEventListener("click",e=>e.stopPropagation());
 document.addEventListener("click",()=>{if(!panel.hidden)closeBell();});
 document.getElementById("menu-btn").addEventListener("click",closeBell);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!panel.hidden){closeBell();bell.focus();}hideDialog("header-dialog");}});
 document.querySelectorAll(".view-tab[data-view],.hd-tab[data-view],.menu-nav[data-view]").forEach(t=>t.addEventListener("click",e=>{e.preventDefault();closeMenu();closeBell();if(t.dataset.view==="analytics"&&!analyticsUnlocked){requestAnalytics();return;}try{location.hash=t.dataset.view;}catch(x){}showView(t.dataset.view);}));
 window.addEventListener("hashchange",()=>showView(location.hash.slice(1)));
 // header editing
 document.getElementById("edit-header").addEventListener("click",()=>{
  if(!editingUnlocked)return;
  document.getElementById("header-title-input").value=headerCfg.title;document.getElementById("header-sub-input").value=headerCfg.subtitle;showDialog("header-dialog");
 });
 document.getElementById("header-cancel").addEventListener("click",()=>hideDialog("header-dialog"));
 document.getElementById("header-reset").addEventListener("click",()=>{document.getElementById("header-title-input").value=HEADER_DEFAULT.title;document.getElementById("header-sub-input").value=HEADER_DEFAULT.subtitle;});
 document.getElementById("header-save").addEventListener("click",()=>{
  const t=document.getElementById("header-title-input").value;
  if(!t.trim()){statusEl.className="status error";statusEl.textContent="The header title can’t be empty.";return;}
  hideDialog("header-dialog");saveHeader({title:t,subtitle:document.getElementById("header-sub-input").value});
 });
 // keep views and header fresh when the timetable or editing state changes
 const _build=build;build=function(){_build();refreshHeader();if(currentView==="dashboard")renderDashboard();else if(currentView==="modules")renderModules();};
 const _se=setEditing;setEditing=function(v){_se(v);if(currentView==="communications")renderCommunications();if(currentView==="modules")renderModules();if(currentView==="facilitators"||currentView==="examinations"||currentView==="recurring")renderView(currentView);};
 setInterval(refreshHeader,30000);
 refreshHeader();showView(location.hash.slice(1)||"weekly");
}
// ---- Hamburger menu ----
const menuBtn=document.getElementById("menu-btn"),menuPanel=document.getElementById("menu-panel");
function openMenu(){menuPanel.hidden=false;menuBtn.setAttribute("aria-expanded","true");menuBtn.setAttribute("aria-label","Close menu");}
function closeMenu(){menuPanel.hidden=true;menuBtn.setAttribute("aria-expanded","false");menuBtn.setAttribute("aria-label","Open menu");}
menuBtn.addEventListener("click",e=>{e.stopPropagation();menuPanel.hidden?openMenu():closeMenu();});
menuPanel.addEventListener("click",e=>{e.stopPropagation();if(e.target.closest("button:not([data-keep])"))closeMenu();});
document.addEventListener("click",()=>{if(!menuPanel.hidden)closeMenu();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!menuPanel.hidden){closeMenu();menuBtn.focus();}});
// Status messages are temporary: they clear themselves so the dashboard stays clean.
let statusTimer;
new MutationObserver(()=>{
 clearTimeout(statusTimer);
 if(statusEl.textContent&&!statusEl.classList.contains("error"))statusTimer=setTimeout(()=>{statusEl.textContent="";statusEl.className="status";},5000);
}).observe(statusEl,{childList:true,characterData:true,subtree:true});
// ---- Tap-to-see-name labels for icon buttons ----
const tipEl=document.createElement("div");tipEl.className="tip";tipEl.setAttribute("role","status");document.body.appendChild(tipEl);let tipT;
function showTip(target,text){
 const r=target.getBoundingClientRect();tipEl.textContent=text;tipEl.classList.add("show");
 const w=tipEl.offsetWidth;tipEl.style.left=Math.min(Math.max(8,r.left+r.width/2-w/2),innerWidth-w-8)+"px";tipEl.style.top=(r.bottom+8+tipEl.offsetHeight>innerHeight?r.top-tipEl.offsetHeight-8:r.bottom+8)+"px";
 clearTimeout(tipT);tipT=setTimeout(()=>tipEl.classList.remove("show"),1800);
}
document.addEventListener("click",e=>{const m=e.target.closest("[data-label]");if(m)showTip(m,m.dataset.label);},true);
document.getElementById("theme-btn").addEventListener("click",e=>{
 const sel=document.getElementById("theme"),i=(sel.selectedIndex+1)%sel.options.length;
 sel.selectedIndex=i;sel.dispatchEvent(new Event("change"));showTip(e.currentTarget,"Theme: "+sel.options[i].textContent);
});
{const cd=document.getElementById("call-day");if(cd)cd.textContent=new Date().getDate();}
load();initCloud();initAlarms();initHeader();

// ---- Calendar quality layer: clash checks, CSV export and shared backup ----
(function(){
 const $=id=>document.getElementById(id);
 const say=(msg,kind)=>{if(typeof statusEl!=="undefined"&&statusEl){statusEl.textContent=msg;statusEl.className="status "+(kind||"");}};
 function exportCSV(){
  const rows=[["Time slot",...days]];
  times.forEach((slot,r)=>{const row=[slot];days.forEach((day,c)=>{
   const v=(state.cells||{})[`${r}_${c}`]||{};
   row.push([v.code||"",v.title||v.text||"",v.facilitator||""].filter(Boolean).join(" — "));
  });rows.push(row);});
  const csv=rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="MNH-Calendar-timetable.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  say("CSV export prepared. It opens in Excel and other spreadsheet applications.","ok");
 }
 window.exportTimetableCSV=exportCSV;
 window.downloadSharedBackup=async()=>{
  if(!editingUnlocked){say("Unlock editing first to download the shared backup.","error");return;}
  say("Creating a consistent database backup…");
  try{const r=await fetch("/api/backup",{cache:"no-store"});if(!r.ok)throw Error("Backup export failed");
   const data=await r.json(),blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="MNH-Calendar-server-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   say("A complete shared-data backup has been downloaded. Automatic daily server snapshots are also enabled.","ok");
  }catch(e){say("Backup could not be created. Check the server connection and try again.","error");}
 };
 // Detect explicit time ranges written into activity labels and flag overlapping
 // ranges on the same weekday; ordinary labels without times are left untouched.
 const rangePattern=/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/ig;
 function minutes(h,m){return Number(h)*60+Number(m);}
 function checkClashes(){
  document.querySelectorAll(".activity").forEach(el=>el.classList.remove("time-clash"));
  const byDay=Array.from({length:days.length},()=>[]);
  Object.entries(state.cells||{}).forEach(([key,v])=>{
   const m=/^(\d+)_(\d+)$/.exec(key);if(!m||!v)return;
   const row=+m[1],day=+m[2],label=[v.code,v.title,v.text].filter(Boolean).join(" ");
   rangePattern.lastIndex=0;let match;
   while((match=rangePattern.exec(label))){
    const start=minutes(match[1],match[2]),end=minutes(match[3],match[4]);
    if(end>start)byDay[day].push({row,start,end,label,key});
   }
  });
  let conflicts=0;
  byDay.forEach(entries=>{
   entries.forEach((a,i)=>entries.slice(i+1).forEach(b=>{
    if(a.row!==b.row&&a.start<b.end&&b.start<a.end){
     conflicts++;[a.key,b.key].forEach(k=>{
      const [r,c]=k.split("_").map(Number);
      const cell=document.querySelector(`[data-cell-key="${r}_${c}"]`);
      if(cell)cell.classList.add("time-clash");
     });
    }
   }));
  });
  if(conflicts){say(`${conflicts} overlapping explicit time range(s) detected. Review the highlighted timetable entries.`,"error");}
  return conflicts;
 }
 const clashStyle=document.createElement("style");
 clashStyle.textContent='.time-clash{outline:2px solid #df6969!important;outline-offset:-2px;position:relative}.time-clash:after{content:"Time overlap";display:block;color:#ff9999;font-size:10px;font-weight:700}';
 document.head.appendChild(clashStyle);
 const body=$("calendar-body");
 if(body){new MutationObserver(()=>{checkClashes();}).observe(body,{childList:true,subtree:true});}
 checkClashes();
})();
