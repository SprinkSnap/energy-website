"use strict";
/* HOT2000-style Full House Report (House with standard operating conditions).
   Layout follows HOT2000 Desktop: Report → Full house report → House with standard operating conditions.
   Values come from the calculated .h2k (AllResults SOC + house model). Not the HOT2000 print engine. */

const FHR_MONTHS=["january","february","march","april","may","june","july","august","september","october","november","december"];
const FHR_MONTH_LABELS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fhrEsc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function fhrNum(v,d=1){ const n=Number(v); return Number.isFinite(n)?n.toFixed(d):"—"; }
function fhrText(el){ return el?.querySelector?.(":scope > English")?.textContent?.trim() || el?.textContent?.trim() || ""; }
function fhrLabel(el){ return el?.querySelector?.(":scope > Label")?.textContent?.trim() || ""; }
function fhrAttr(el,name){ return el?.getAttribute?.(name) ?? ""; }
function fhrAttrNum(el,name){ const n=Number(fhrAttr(el,name)); return Number.isFinite(n)?n:null; }
function fhrMonthly(el){
  if(!el) return null;
  const out={};
  for(const m of FHR_MONTHS){ const n=Number(el.getAttribute(m)); out[m]=Number.isFinite(n)?n:0; }
  out.ann=FHR_MONTHS.reduce((s,m)=>s+(out[m]||0),0);
  return out;
}
function fhrParentFacing(win){
  let p=win.parentElement;
  while(p){
    if(p.tagName==="Wall"||p.tagName==="Basement"||p.tagName==="Crawlspace"||p.tagName==="Door"){
      const fd=p.querySelector(":scope > FacingDirection > English")?.textContent?.trim();
      if(fd && fd!=="N/A") return fd;
      const lab=fhrLabel(p);
      if(lab) return lab;
    }
    p=p.parentElement;
  }
  return "—";
}
function fhrParentLabel(el){
  let p=el.parentElement;
  while(p){
    if(["Wall","Basement","Crawlspace","Door","Floor","Ceiling"].includes(p.tagName)) return fhrLabel(p)||p.tagName;
    p=p.parentElement;
  }
  return "—";
}
function fhrCollectWindows(){
  const comps=xp("/HouseFile/House/Components");
  if(!comps) return [];
  return [...comps.querySelectorAll("Window")].map(w=>{
    const m=w.querySelector(":scope > Measurements");
    const t=w.querySelector(":scope > Construction > Type");
    const sh=w.querySelector(":scope > Shading");
    const hMm=fhrAttrNum(m,"height"), wMm=fhrAttrNum(m,"width");
    const h=hMm!=null?hMm/1000:null, wd=wMm!=null?wMm/1000:null;
    return {
      label:fhrLabel(w),
      location:fhrParentLabel(w),
      facing:w.querySelector(":scope > FacingDirection > English")?.textContent?.trim() || fhrParentFacing(w),
      type:t?.textContent?.trim()||"—",
      rValue:fhrAttrNum(t,"rValue") ?? fhrAttrNum(w,"rValue"),
      shgc:fhrAttrNum(w,"shgc"),
      er:fhrAttrNum(w,"er"),
      height:h, width:wd,
      area:(h!=null&&wd!=null)?h*wd:null,
      overhang:fhrAttrNum(m,"overhangWidth"),
      header:fhrAttrNum(m,"headerHeight"),
      tilt:fhrAttrNum(m?.querySelector(":scope > Tilt"),"value") ?? 90,
      curtain:fhrAttrNum(sh,"curtain") ?? 1,
      shutter:fhrAttrNum(sh,"shutterRValue") ?? 0
    };
  });
}
function fhrCollectCeilings(){
  return [...(xp("/HouseFile/House/Components")?.querySelectorAll(":scope > Ceiling")||[])].map(c=>{
    const ctype=c.querySelector(":scope > Construction > CeilingType");
    const typeEn=c.querySelector(":scope > Construction > Type > English")?.textContent?.trim();
    const m=c.querySelector(":scope > Measurements");
    return {
      label:fhrLabel(c),
      type:typeEn || "—",
      code:ctype?.textContent?.trim()||"—",
      rValue:fhrAttrNum(ctype,"rValue"),
      area:fhrAttrNum(m,"area"),
      heel:fhrAttrNum(m,"heelHeight"),
      slope:fhrAttrNum(m?.querySelector(":scope > Slope"),"value")
    };
  });
}
function fhrCollectWalls(){
  return [...(xp("/HouseFile/House/Components")?.querySelectorAll(":scope > Wall")||[])].map(w=>{
    const t=w.querySelector(":scope > Construction > Type");
    const m=w.querySelector(":scope > Measurements");
    const h=fhrAttrNum(m,"height"), p=fhrAttrNum(m,"perimeter");
    return {
      label:fhrLabel(w),
      code:t?.textContent?.trim()||"—",
      rValue:fhrAttrNum(t,"rValue"),
      height:h, perimeter:p,
      area:(h!=null&&p!=null)?h*p:null,
      corners:fhrAttrNum(w.querySelector(":scope > Construction"),"corners"),
      intersections:fhrAttrNum(w.querySelector(":scope > Construction"),"intersections"),
      facing:w.querySelector(":scope > FacingDirection > English")?.textContent?.trim()||"—",
      adjacent:fhrAttr(w,"adjacentEnclosedSpace")==="true"
    };
  });
}
function fhrCollectFloors(){
  return [...(xp("/HouseFile/House/Components")?.querySelectorAll(":scope > Floor")||[])].map(f=>{
    const t=f.querySelector(":scope > Construction > Type");
    const m=f.querySelector(":scope > Measurements");
    return {
      label:fhrLabel(f),
      code:t?.textContent?.trim()||"—",
      rValue:fhrAttrNum(t,"rValue"),
      area:fhrAttrNum(m,"area"),
      adjacent:fhrAttr(f,"adjacentEnclosedSpace")==="true"
    };
  });
}
function fhrCollectDoors(){
  const comps=xp("/HouseFile/House/Components");
  if(!comps) return [];
  return [...comps.querySelectorAll("Door")].map(d=>{
    const m=d.querySelector(":scope > Measurements");
    const t=d.querySelector(":scope > Construction > Type");
    const h=fhrAttrNum(m,"height"), w=fhrAttrNum(m,"width");
    return {
      label:fhrLabel(d),
      location:fhrParentLabel(d),
      type:t?.textContent?.trim()||"—",
      rValue:fhrAttrNum(d,"rValue") ?? fhrAttrNum(t,"rValue"),
      height:h, width:w,
      area:(h!=null&&w!=null)?h*w:fhrAttrNum(m,"area"),
      adjacent:fhrAttr(d,"adjacentEnclosedSpace")==="true"
    };
  });
}
function fhrCollectBasements(){
  return [...(xp("/HouseFile/House/Components")?.querySelectorAll(":scope > Basement")||[])].map(b=>{
    const m=b.querySelector(":scope > Floor > Measurements") || b.querySelector(":scope > Measurements");
    return {
      label:fhrLabel(b),
      configuration:b.querySelector(":scope > Configuration > English")?.textContent?.trim()
        || b.querySelector(":scope > Construction > Type")?.textContent?.trim()
        || "—",
      perimeter:fhrAttrNum(m,"perimeter") ?? fhrAttrNum(b.querySelector(":scope > Floor > Measurements"),"perimeter"),
      adjacent:fhrAttr(b,"adjacentEnclosedSpace")==="true"
    };
  });
}
function fhrFuelRateTable(fuelEl, unitLabel){
  if(!fuelEl) return "";
  const fuel=fuelEl.querySelector(":scope > Fuel") || fuelEl;
  const label=fhrLabel(fuel)||"—";
  const comment=fuel.querySelector(":scope > Comment")?.textContent?.trim()||"";
  const min=fuel.querySelector(":scope > Minimum");
  const blocks=fuel.querySelector(":scope > RateBlocks");
  let rows=`<tr><td>Minimum</td><td>${fhrEsc(fhrAttr(min,"units")||"0")}</td><td>${fhrEsc(fhrAttr(min,"charge")||"0")}</td></tr>`;
  if(blocks){
    for(const b of [...blocks.children]){
      rows+=`<tr><td>${fhrEsc(b.tagName)}</td><td>${fhrEsc(fhrAttr(b,"units"))}</td><td>${fhrEsc(fhrAttr(b,"costPerUnit"))}</td></tr>`;
    }
  }
  return `<h3>Fuel: ${fhrEsc(label)}</h3><p class="note">${fhrEsc(comment)} (${fhrEsc(unitLabel)})</p>
    <table class="grid"><thead><tr><th>Rate block</th><th>Units</th><th>$ / unit</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function fhrPair(label, value){
  return `<div class="pair"><span class="k">${fhrEsc(label)}</span><span class="v">${value}</span></div>`;
}
function fhrSection(title, body, pageBreak=false){
  return `<section class="sec${pageBreak?" break":""}"><h2>${fhrEsc(title)}</h2>${body}</section>`;
}
function fhrMonthTable(headers, rows, foot){
  const head=`<tr><th>Month</th>${headers.map(h=>`<th>${fhrEsc(h)}</th>`).join("")}</tr>`;
  const body=rows.map(r=>`<tr><td>${fhrEsc(r[0])}</td>${r.slice(1).map(c=>`<td class="num">${c}</td>`).join("")}</tr>`).join("");
  const footer=foot?`<tr class="ann"><td>${fhrEsc(foot[0])}</td>${foot.slice(1).map(c=>`<td class="num">${c}</td>`).join("")}</tr>`:"";
  return `<table class="grid tight"><thead>${head}</thead><tbody>${body}${footer}</tbody></table>`;
}
function buildHot2000FullHouseReportHTML(report){
  const id=report.identity||{};
  const occ=id.occupants||{};
  const temp=id.temperatures||{};
  const sys=report.systems||{};
  const egh=report.egh||{};
  const fuel=report.fuelUse||{};
  const costs=report.costs||{};
  const hl=report.heatLossGJ||{};
  const ghg=report.ghg||{};
  const soc=xp("/HouseFile/AllResults/Results[@houseCode='SOC']");
  const fileName=($("#exportName")?.value||"house-model.h2k");
  const company=getPath("/HouseFile/ProgramInformation/File/Company")||"—";
  const builder=getPath("/HouseFile/ProgramInformation/File/BuilderName") || tsvValue("Builder") || "—";
  const enteredBy=getPath("/HouseFile/ProgramInformation/File/EnteredBy")||id.enteredBy||"—";
  const clientLast=getPath("/HouseFile/ProgramInformation/Client/Name/Last")||"";
  const clientFirst=getPath("/HouseFile/ProgramInformation/Client/Name/First")||"";
  const clientName=(clientLast||clientFirst)?`${clientLast}${clientLast&&clientFirst?", ":""}${clientFirst}`:(id.client||"—");
  const baseload=xp("/HouseFile/House/BaseLoads");
  const summary=baseload?.querySelector(":scope > Summary");
  const water=baseload?.querySelector(":scope > WaterUsage");
  const sensibleGain=2.0; // HOT2000 report shows Sensible Internal Heat Gain from occupants
  const windows=fhrCollectWindows();
  const ceilings=fhrCollectCeilings();
  const walls=fhrCollectWalls();
  const floors=fhrCollectFloors();
  const doors=fhrCollectDoors();
  const basements=fhrCollectBasements();
  const winsByFacing={};
  for(const w of windows){
    const key=w.facing||"—";
    (winsByFacing[key]=winsByFacing[key]||[]).push(w);
  }
  const facingOrder=["South","SouthEast","East","NorthEast","North","NorthWest","West","SouthWest","Horizontal","—"];
  const facingKeys=[...facingOrder.filter(k=>winsByFacing[k]), ...Object.keys(winsByFacing).filter(k=>!facingOrder.includes(k))];
  const mLoad=fhrMonthly(soc?.querySelector(":scope > Monthly > Load > GrossThermal"));
  const mInt=fhrMonthly(soc?.querySelector(":scope > Monthly > Gains > UtilizedInternal"));
  const mSol=fhrMonthly(soc?.querySelector(":scope > Monthly > Gains > UtilizedSolar"));
  const mAux=fhrMonthly(soc?.querySelector(":scope > Monthly > UtilizedAuxiliaryHeatRequired"));
  const mBsmt=fhrMonthly(soc?.querySelector(":scope > Monthly > Load > Basement > Heating"));
  const mNat=fhrMonthly(soc?.querySelector(":scope > Monthly > AirChangeRate > Natural"));
  const mTot=fhrMonthly(soc?.querySelector(":scope > Monthly > AirChangeRate > Total"));
  const mAirHL=fhrMonthly(soc?.querySelector(":scope > Monthly > HeatLoss > Basement > AirLeakageAndMechanicalVentilation"));
  const mBsmtTemp=fhrMonthly(soc?.querySelector(":scope > Monthly > Temperatures > Basement"))
    || fhrMonthly(soc?.querySelector(":scope > Monthly > Temperatures > CrawlSpace"));
  // Approximate furnace input from aux / seasonal efficiency when monthly device table unavailable
  const seas=(report.design?.seasonalEff||98)/100;
  const furnaceMonthly=mAux?FHR_MONTHS.map(m=>(mAux[m]||0)/(seas||1)):null;

  const weatherLib=id.weatherLibrary||"—";
  const weatherLine=`Weather Library: ${fhrEsc(weatherLib)} &nbsp; Weather Data for: ${fhrEsc(id.weather||"—")}, ${fhrEsc(id.region||"—")}`;

  let winOverhangRows="";
  for(const [facing,list] of Object.entries(winsByFacing)){
    winOverhangRows+=`<tr class="group"><td colspan="7"><strong>${fhrEsc(facing)}</strong></td></tr>`;
    for(const w of list){
      winOverhangRows+=`<tr>
        <td>${fhrEsc(w.label)}</td><td>${fhrEsc(w.location)}</td><td class="num">1</td>
        <td class="num">${fhrNum(w.overhang,2)}</td><td class="num">${fhrNum(w.header,2)}</td>
        <td class="num">${fhrNum(w.tilt,1)}</td><td class="num">${fhrNum(w.curtain,2)} / ${fhrNum(w.shutter,2)}</td></tr>`;
    }
  }
  let winSizeRows="";
  for(const [facing,list] of Object.entries(winsByFacing)){
    winSizeRows+=`<tr class="group"><td colspan="8"><strong>${fhrEsc(facing)}</strong></td></tr>`;
    for(const w of list){
      winSizeRows+=`<tr>
        <td>${fhrEsc(w.label)}</td><td>${fhrEsc(w.type)}</td><td class="num">1</td>
        <td class="num">${fhrNum(w.width,2)}</td><td class="num">${fhrNum(w.height,2)}</td>
        <td class="num">${fhrNum(w.area,2)}</td><td class="num">${fhrNum(w.rValue,3)}</td>
        <td class="num">${fhrNum(w.shgc,4)} / ${fhrNum(w.er,1)}</td></tr>`;
    }
  }

  const ceilingRows=ceilings.map(c=>`<tr>
    <td>${fhrEsc(c.label)}</td><td>${fhrEsc(c.type)}</td><td>${fhrEsc(c.code)}</td>
    <td class="num">${fhrNum(c.slope,3)}</td><td class="num">${fhrNum(c.heel,2)}</td>
    <td class="num">${fhrNum(c.area,2)}</td><td class="num">${fhrNum(c.rValue,2)}</td></tr>`).join("")||`<tr><td colspan="7">None</td></tr>`;

  const wallRows=walls.map(w=>`<tr>
    <td>${fhrEsc(w.label)}${w.adjacent?" &gt;":""}</td><td>${fhrEsc(w.code)}</td>
    <td>${fhrEsc(w.facing||"—")}</td>
    <td class="num">${fhrNum(w.corners,0)}</td><td class="num">${fhrNum(w.intersections,0)}</td>
    <td class="num">${fhrNum(w.height,2)}</td><td class="num">${fhrNum(w.perimeter,2)}</td>
    <td class="num">${fhrNum(w.area,2)}</td><td class="num">${fhrNum(w.rValue,2)}</td></tr>`).join("")||`<tr><td colspan="9">None</td></tr>`;

  const floorRows=floors.map(f=>`<tr>
    <td>${fhrEsc(f.label)}${f.adjacent?" &gt;":""}</td><td>${fhrEsc(f.code)}</td>
    <td class="num">${fhrNum(f.area,2)}</td><td class="num">${fhrNum(f.rValue,2)}</td></tr>`).join("")||`<tr><td colspan="4">None</td></tr>`;

  const doorRows=doors.map(d=>`<tr>
    <td>${fhrEsc(d.label)}${d.adjacent?" &gt;":""}</td><td>${fhrEsc(d.location)}</td><td>${fhrEsc(d.type)}</td>
    <td class="num">${fhrNum(d.height,2)}</td><td class="num">${fhrNum(d.width,2)}</td>
    <td class="num">${fhrNum(d.area,2)}</td><td class="num">${fhrNum(d.rValue,2)}</td></tr>`).join("")||`<tr><td colspan="7">None</td></tr>`;

  const basementRows=basements.map(b=>`<tr>
    <td>${fhrEsc(b.label)}</td><td>${fhrEsc(b.configuration)}</td>
    <td class="num">${fhrNum(b.perimeter,2)} m</td></tr>`).join("")||`<tr><td colspan="3">None</td></tr>`;

  const monthEnergyRows=mLoad?FHR_MONTH_LABELS.map((lab,i)=>{
    const m=FHR_MONTHS[i];
    return [lab, fhrNum(mLoad[m],1), fhrNum(mInt?.[m],1), fhrNum(mSol?.[m],1), fhrNum(mAux?.[m],1)];
  }):[];
  const monthEnergyFoot=mLoad?["Ann", fhrNum(mLoad.ann,1), fhrNum(mInt?.ann,1), fhrNum(mSol?.ann,1), fhrNum(mAux?.ann,1)]:null;

  const foundationRows=mBsmt?FHR_MONTH_LABELS.map((lab,i)=>{
    const m=FHR_MONTHS[i];
    return [lab, "0.0", "0.0", fhrNum(mBsmt[m],1), "0.0", fhrNum(mBsmt[m],1)];
  }):[];
  const foundationFoot=mBsmt?["Ann","0.0","0.0",fhrNum(mBsmt.ann,1),"0.0",fhrNum(mBsmt.ann,1)]:null;

  const ventTempRows=(mNat&&mTot)?FHR_MONTH_LABELS.map((lab,i)=>{
    const m=FHR_MONTHS[i];
    return [lab, fhrNum(mBsmtTemp?.[m],1), fhrNum(mNat[m],3), fhrNum(mTot[m],3), fhrNum(mAirHL?.[m],1)];
  }):[];
  const ventTempFoot=(mNat&&mTot)?["Ann", fhrNum(mBsmtTemp?.ann?mBsmtTemp.ann/12:null,1), fhrNum(mNat.ann/12,3), fhrNum(mTot.ann/12,3), fhrNum(mAirHL?.ann,1)]:null;

  const spacePerfRows=furnaceMonthly?FHR_MONTH_LABELS.map((lab,i)=>{
    const m=FHR_MONTHS[i];
    const load=mAux?.[m]||0;
    const input=furnaceMonthly[i]||0;
    const fans=0;
    const total=input+fans;
    const cop=total>0.01?load/total:0;
    return [lab, fhrNum(load,1), fhrNum(input,1), "0.0", fhrNum(fans,1), "0.0", fhrNum(total,1), fhrNum(cop,3)];
  }):[];
  const spacePerfFoot=furnaceMonthly?["Ann",
    fhrNum(mAux?.ann,1), fhrNum(furnaceMonthly.reduce((a,b)=>a+b,0),1), "0.0", "0.0", "0.0",
    fhrNum(furnaceMonthly.reduce((a,b)=>a+b,0),1), fhrNum(seas,3)]:null;

  const fuelCosts=xp("/HouseFile/FuelCosts");
  const fuelCostHTML=[
    fhrFuelRateTable(fuelCosts?.querySelector(":scope > Electricity"), "kWh"),
    fhrFuelRateTable(fuelCosts?.querySelector(":scope > NaturalGas"), "m3"),
    fhrFuelRateTable(fuelCosts?.querySelector(":scope > Oil"), "Litre"),
    fhrFuelRateTable(fuelCosts?.querySelector(":scope > Propane"), "Litre"),
    fhrFuelRateTable(fuelCosts?.querySelector(":scope > Wood"), "Cord")
  ].join("");

  const spaceMj=egh.spaceHeatingMJ;
  const ventMj=egh.ventHeatingMJ;
  const dhwMj=egh.dhwMJ;
  const spacePlus=egh.spacePlusDhwMJ;
  const genDate=new Date().toISOString().slice(0,10);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>HOT2000 Full House Report — House with standard operating conditions</title>
<style>
  @page { size: letter; margin: 14mm 12mm; }
  :root { color: #000; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10pt Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .banner { font-size: 8.5pt; margin-bottom: 8px; }
  .brand { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 10px; }
  .brand h1 { margin: 0; font-size: 18pt; letter-spacing: 0.02em; }
  .brand .sub { font-size: 9pt; line-height: 1.35; }
  .run-title { font-weight: 700; margin: 4px 0 10px; }
  h2 { font-size: 11pt; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 1px solid #000; text-transform: uppercase; }
  h3 { font-size: 10pt; margin: 12px 0 4px; }
  .pairs { display: grid; grid-template-columns: 1fr; gap: 2px 12px; }
  @media (min-width: 700px){ .pairs.two { grid-template-columns: 1fr 1fr; } }
  .pair { display: grid; grid-template-columns: minmax(180px, 48%) 1fr; gap: 6px; }
  .pair .k { color: #222; }
  .pair .v { font-weight: 600; }
  table.grid { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 8.5pt; }
  table.grid th, table.grid td { border-bottom: 1px solid #c8c8c8; padding: 3px 4px; text-align: left; vertical-align: top; }
  table.grid th { border-bottom: 1px solid #000; font-weight: 700; }
  table.grid td.num, table.grid th.num { text-align: right; white-space: nowrap; }
  table.tight td, table.tight th { padding: 2px 3px; }
  tr.group td { background: #f3f3f3; border-bottom: 1px solid #000; }
  tr.ann td { font-weight: 700; border-top: 1px solid #000; }
  .note { font-size: 8.5pt; color: #333; margin: 4px 0 8px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
  .actions button { min-height: 40px; padding: 8px 12px; font-weight: 700; border: 1px solid #333; background: #1769aa; color: #fff; border-radius: 6px; cursor: pointer; }
  .actions button.secondary { background: #fff; color: #111; }
  .foot-note { font-size: 8pt; color: #444; margin-top: 18px; line-height: 1.35; border-top: 1px solid #999; padding-top: 8px; }
  .page-foot { margin-top: 18px; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  .sec.break { break-before: page; page-break-before: always; }
  @media print {
    .actions { display: none !important; }
    body { font-size: 9.5pt; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head><body>
  <div class="actions">
    <button type="button" onclick="window.print()">Save as PDF / Print</button>
    <button type="button" class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="banner">${weatherLine}</div>
  <div class="brand">
    <div>
      <h1>HOT2000</h1>
      <div class="sub">Natural Resources Canada<br>Version ${fhrEsc((id.h2kVersion||"").replace(/^b/,"") || id.programName || "11.x")}</div>
    </div>
    <div class="sub" style="text-align:right">
      File: ${fhrEsc(fileName)}<br>
      <span class="run-title">House with standard operating conditions</span>
    </div>
  </div>

  ${fhrSection("General house characteristics", `
    <div class="pairs two">
      ${fhrPair("Builder Code:", fhrEsc(builder))}
      ${fhrPair("Data Entry by:", fhrEsc(enteredBy))}
      ${fhrPair("Date of entry:", fhrEsc(id.evalDate||"—"))}
      ${fhrPair("Company:", fhrEsc(company))}
      ${fhrPair("Client name:", fhrEsc(clientName))}
      ${fhrPair("Street address:", fhrEsc(id.street||"—"))}
      ${fhrPair("City / Region:", `${fhrEsc(id.city||"—")} / ${fhrEsc(id.province||"—")}`)}
      ${fhrPair("Postal code / Telephone:", `${fhrEsc(id.postal||"—")} / ${fhrEsc(id.phone||"—")}`)}
      ${fhrPair("House type:", fhrEsc(id.houseType||"—"))}
      ${fhrPair("Number of storeys:", fhrEsc(id.storeys||"—"))}
      ${fhrPair("Plan shape:", fhrEsc(id.planShape||"—"))}
      ${fhrPair("Front orientation:", fhrEsc(id.facing||"—"))}
      ${fhrPair("Year House Built:", fhrEsc(id.yearBuilt||"—"))}
      ${fhrPair("Wall colour / Absorptivity:", `${fhrEsc(id.wallColour||"—")} / ${fhrNum(id.wallAbs,2)}`)}
      ${fhrPair("Roof colour / Absorptivity:", `${fhrEsc(id.roofColour||"—")} / ${fhrNum(id.roofAbs,2)}`)}
      ${fhrPair("Soil Condition:", fhrEsc(id.soil||"—"))}
      ${fhrPair("Water Table Level:", fhrEsc(id.waterTable||"—"))}
      ${fhrPair("House Thermal Mass Level:", fhrEsc(id.thermalMass||"—"))}
      ${fhrPair("Occupants:", `${fhrNum(occ.adults,0)} Adults for ${fhrNum(occ.adultsAtHome,1)}% of the time; ${fhrNum(occ.children,0)} Children for ${fhrNum(occ.childrenAtHome,1)}%; ${fhrNum(occ.infants,0)} Infants for ${fhrNum(occ.infantsAtHome,1)}%`)}
      ${fhrPair("Sensible Internal Heat Gain From Occupants:", `${fhrNum(sensibleGain,2)} kWh/day`)}
    </div>`)}

  ${fhrSection("House temperatures", `
    <h3>Heating Temperatures</h3>
    <div class="pairs two">
      ${fhrPair("Main Floor Daytime Setpoint:", `${fhrNum(temp.mainDay,1)} °C`)}
      ${fhrPair("Nightime Setpoint:", `${fhrNum(temp.mainNight,1)} °C`)}
      ${fhrPair("Basement Setpoint:", `${fhrNum(temp.basementHeat,1)} °C`)}
      ${fhrPair("Basement is- Heated / Cooled / Separate T/S:", `${temp.basementHeated?"Yes":"No"} / ${temp.basementCooled?"Yes":"No"} / No`)}
      ${fhrPair("Fraction of internal gains released in basement:", fhrEsc(fhrAttr(baseload,"basementFractionOfInternalGains")||"0.15"))}
      ${fhrPair("Indoor design heating / cooling:", `${fhrNum(temp.equipHeat,1)} °C / ${fhrNum(temp.equipCool,1)} °C`)}
    </div>`)}

  ${fhrSection("Window characteristics", `
    <p class="note">Label, location, overhang, header height, tilt. Curtain factor / shutter shown as 1.00 / 0.00 when not stored separately.</p>
    <table class="grid tight"><thead><tr>
      <th>Label</th><th>Location</th><th class="num">#</th><th class="num">Overhang (m)</th><th class="num">Header (m)</th><th class="num">Tilt</th><th class="num">Curtain / Shutter</th>
    </tr></thead><tbody>${winOverhangRows||`<tr><td colspan="7">No windows</td></tr>`}</tbody></table>
    <table class="grid tight"><thead><tr>
      <th>Label</th><th>Type</th><th class="num">#</th><th class="num">Width (m)</th><th class="num">Height (m)</th><th class="num">Area (m²)</th><th class="num">RSI</th><th class="num">SHGC / ER*</th>
    </tr></thead><tbody>${winSizeRows||`<tr><td colspan="8">No windows</td></tr>`}</tbody></table>
    <p class="note">*ER Window Energy Rating estimated from values stored on each window in the house file.</p>`)}

  ${fhrSection("Building parameter details", `
    <h3>Ceiling components</h3>
    <table class="grid tight"><thead><tr><th>Label</th><th>Construction type</th><th>Code</th><th class="num">Slope</th><th class="num">Heel (m)</th><th class="num">Area (m²)</th><th class="num">RSI</th></tr></thead>
    <tbody>${ceilingRows}</tbody></table>
    <h3>Main wall components</h3>
    <p class="note">&gt; Indicates adjacent to an enclosed unconditioned space.</p>
    <table class="grid tight"><thead><tr><th>Label</th><th>Code</th><th>Facing</th><th class="num">Corners</th><th class="num">Inter.</th><th class="num">Height</th><th class="num">Perim.</th><th class="num">Area</th><th class="num">RSI</th></tr></thead>
    <tbody>${wallRows}</tbody></table>
    <h3>Exposed floors</h3>
    <table class="grid tight"><thead><tr><th>Label</th><th>Code</th><th class="num">Area (m²)</th><th class="num">RSI</th></tr></thead><tbody>${floorRows}</tbody></table>
    <h3>Doors</h3>
    <table class="grid tight"><thead><tr><th>Label</th><th>Location</th><th>Type</th><th class="num">Height</th><th class="num">Width</th><th class="num">Area</th><th class="num">RSI</th></tr></thead><tbody>${doorRows}</tbody></table>
    <h3>Foundations</h3>
    <table class="grid tight"><thead><tr><th>Label</th><th>Configuration</th><th class="num">Exposed perimeter</th></tr></thead><tbody>${basementRows}</tbody></table>
  `, true)}

  ${fhrSection("Air leakage and mechanical ventilation summary", `
    <div class="pairs two">
      ${fhrPair("Air tightness @ 50 Pa:", `${fhrNum(report.airChange?.air50,2)} ACH`)}
      ${fhrPair("Natural / total ACH:", `${fhrNum(report.airChange?.natural,3)} / ${fhrNum(report.airChange?.total,3)}`)}
      ${fhrPair("Building envelope surface area:", `${fhrNum(sys.surfaceArea,2)} m²`)}
      ${fhrPair("Equivalent leakage area:", `${fhrNum(sys.ela,4)} m²`)}
      ${fhrPair("Central ventilation system:", fhrEsc(sys.ventType||"—"))}
      ${fhrPair("Central ventilation supply / exhaust:", `${fhrNum(sys.ventSupply,3)} L/s / ${fhrNum(sys.ventExhaust,3)} L/s`)}
      ${fhrPair("F326 required continuous ventilation:", `${fhrNum(sys.roomVentCapacity,3)} L/s`)}
      ${fhrPair("Air distribution type:", fhrEsc(xp("/HouseFile/House/Ventilation/WholeHouse/AirDistributionType/English")?.textContent||"—"))}
    </div>`)}

  ${fhrSection("Space heating system", `
    <div class="pairs two">
      ${fhrPair("PRIMARY Heating Fuel:", fhrEsc(sys.furnaceFuel||"—"))}
      ${fhrPair("Equipment:", fhrEsc(sys.furnaceType||"—"))}
      ${fhrPair("Steady State Efficiency:", `${fhrNum(sys.furnaceEff,2)}`)}
      ${fhrPair("AFUE / seasonal efficiency:", `${fhrNum(sys.furnaceEff,2)} / ${fhrNum(report.design?.seasonalEff,1)} %`)}
      ${fhrPair("Heat pump:", fhrEsc(sys.heatPump||"—"))}
      ${fhrPair("Design heat loss / cool loss:", `${fhrNum(report.design?.heatLoss,0)} W / ${fhrNum(report.design?.coolLoss,0)} W`)}
    </div>`)}

  ${fhrSection("Domestic water heating system", `
    <div class="pairs two">
      ${fhrPair("PRIMARY Water Heating Fuel:", fhrEsc(sys.dhwFuel||"—"))}
      ${fhrPair("Water Heating Equipment:", fhrEsc(sys.dhwType||"—"))}
      ${fhrPair("Energy Factor:", fhrNum(sys.dhwEf,3))}
      ${fhrPair("Tank Capacity:", `${fhrNum(sys.dhwVolume,1)} Litres`)}
      ${fhrPair("Hot Water Temperature:", `${fhrNum(fhrAttrNum(water,"temperature"),1)} °C`)}
      ${fhrPair("Estimated Domestic Water Heating Load / Consumption:", `${fhrNum(gjToMJ(report.endUses?.hotWater),0)} MJ / ${fhrNum(dhwMj,0)} MJ`)}
    </div>`)}

  ${fhrSection("Annual space heating summary", `
    <div class="pairs two">
      ${fhrPair("Gross Space Heat Loss:", `${fhrNum(gjToMJ(hl.total),0)} MJ`)}
      ${fhrPair("Gross Space Heating Load:", `${fhrNum(mLoad?.ann ?? gjToMJ(report.load?.grossHeating),0)} MJ`)}
      ${fhrPair("Usable Internal Gains:", `${fhrNum(mInt?.ann,0)} MJ`)}
      ${fhrPair("Usable Solar Gains:", `${fhrNum(mSol?.ann ?? gjToMJ(report.load?.solarGains),0)} MJ`)}
      ${fhrPair("Auxiliary Energy Required:", `${fhrNum(mAux?.ann ?? report.load?.auxiliaryEnergy,0)} MJ`)}
      ${fhrPair("Furnace/Boiler Annual Energy Consumption:", `${fhrNum(egh.furnaceAecMJ,0)} MJ`)}
      ${fhrPair("Furnace/Boiler Seasonal efficiency:", `${fhrNum(report.design?.seasonalEff,1)} %`)}
    </div>
    <h3>Design space heating and cooling loads</h3>
    <div class="pairs two">
      ${fhrPair("Design Heat Loss:", `${fhrNum(report.design?.heatLoss,0)} Watts`)}
      ${fhrPair("Design Cooling Load:", `${fhrNum(report.design?.coolLoss,0)} Watts`)}
    </div>
    <h3>Base loads summary</h3>
    <table class="grid"><thead><tr><th></th><th class="num">kWh/day</th><th class="num">Annual kWh</th></tr></thead>
    <tbody>
      <tr><td>Interior Lighting</td><td class="num">${fhrNum(fhrAttrNum(summary,"lighting"),2)}</td><td class="num">${fhrNum((fhrAttrNum(summary,"lighting")||0)*365,2)}</td></tr>
      <tr><td>Appliances</td><td class="num">${fhrNum(fhrAttrNum(summary,"electricalAppliances"),2)}</td><td class="num">${fhrNum((fhrAttrNum(summary,"electricalAppliances")||0)*365,2)}</td></tr>
      <tr><td>Other</td><td class="num">${fhrNum(fhrAttrNum(summary,"otherElectric"),2)}</td><td class="num">${fhrNum((fhrAttrNum(summary,"otherElectric")||0)*365,2)}</td></tr>
      <tr><td>Exterior Use</td><td class="num">${fhrNum(fhrAttrNum(summary,"exteriorUse"),2)}</td><td class="num">${fhrNum((fhrAttrNum(summary,"exteriorUse")||0)*365,2)}</td></tr>
      <tr class="ann"><td>Electricity total (from results)</td><td class="num"></td><td class="num">${fhrNum(fuel.elecKWh,2)}</td></tr>
    </tbody></table>
  `, true)}

  ${fhrSection("Energy consumption summary report", `
    <div class="pairs">
      ${fhrPair("Estimated Annual Space Heating Energy Consumption:", `${fhrNum(spaceMj,2)} MJ = ${fhrNum(mjToKWh(spaceMj),2)} kWh`)}
      ${fhrPair("Ventilator Electrical Consumption: Heating Hours:", `${fhrNum(ventMj,2)} MJ = ${fhrNum(mjToKWh(ventMj),2)} kWh`)}
      ${fhrPair("Estimated Annual DHW Heating Energy Consumption:", `${fhrNum(dhwMj,2)} MJ = ${fhrNum(mjToKWh(dhwMj),2)} kWh`)}
      ${fhrPair("ESTIMATED ANNUAL SPACE + DHW ENERGY CONSUMPTION:", `${fhrNum(spacePlus,2)} MJ = ${fhrNum(mjToKWh(spacePlus),2)} kWh`)}
      ${fhrPair("Net annual energy (SOC):", `${fhrNum(report.netMJ,2)} MJ = ${fhrNum(report.netGJa,3)} GJ/a`)}
      ${fhrPair("Estimated Greenhouse Gas Emissions:", `${fhrNum(ghg.total,3)} tonnes/year`)}
      ${fhrPair("EnerGuide Rating (0 to 100):", fhrNum(id.ersRating,0))}
      ${fhrPair("ERS energy intensity:", `${fhrNum(id.ersIntensity,2)} GJ/m²`)}
    </div>
    <h3>Estimated annual fuel consumption summary</h3>
    <table class="grid"><thead><tr><th>Fuel</th><th class="num">Total</th></tr></thead>
    <tbody>
      <tr><td>Natural Gas (m³)</td><td class="num">${fhrNum(fuel.gasM3,1)}</td></tr>
      <tr><td>Electricity (kWh)</td><td class="num">${fhrNum(fuel.elecKWh,1)}</td></tr>
      <tr><td>Oil (L)</td><td class="num">${fhrNum(fuel.oilL,1)}</td></tr>
      <tr><td>Propane (L)</td><td class="num">${fhrNum(fuel.propaneL,1)}</td></tr>
      <tr><td>Wood</td><td class="num">${fhrNum(fuel.wood,1)}</td></tr>
    </tbody></table>
    <h3>Estimated annual fuel consumption costs</h3>
    <table class="grid"><thead><tr><th>Fuel</th><th class="num">$</th></tr></thead>
    <tbody>
      <tr><td>Electricity</td><td class="num">${fhrNum(costs.electrical,2)}</td></tr>
      <tr><td>Natural Gas</td><td class="num">${fhrNum(costs.naturalGas,2)}</td></tr>
      <tr><td>Oil</td><td class="num">${fhrNum(costs.oil,2)}</td></tr>
      <tr><td>Propane</td><td class="num">${fhrNum(costs.propane,2)}</td></tr>
      <tr><td>Wood</td><td class="num">${fhrNum(costs.wood,2)}</td></tr>
      <tr class="ann"><td>Total</td><td class="num">${fhrNum(costs.total,2)}</td></tr>
    </tbody></table>
    <h3>Fuel costs library listing</h3>
    ${fuelCostHTML}
  `)}

  ${fhrSection("Monthly energy profile", `
    ${mLoad?fhrMonthTable(["Energy Load (MJ)","Internal Gains (MJ)","Solar Gains (MJ)","Aux. Energy (MJ)"], monthEnergyRows, monthEnergyFoot):"<p>Monthly SOC profile not present in this file.</p>"}
    <h3>Foundation energy profile — heat loss (MJ)</h3>
    ${mBsmt?fhrMonthTable(["Crawl Space","Slab","Basement","Walkout","Total"], foundationRows, foundationFoot):"<p>No foundation monthly profile.</p>"}
    <h3>Foundation temperatures &amp; ventilation profile</h3>
    ${ventTempRows.length?fhrMonthTable(["Basement °C","Natural ACH","Total ACH","Air leakage heat loss (MJ)"], ventTempRows, ventTempFoot):"<p>No monthly air-change profile.</p>"}
  `, true)}

  ${fhrSection("Space heating system performance", `
    <p class="note">Monthly furnace input estimated from auxiliary energy and seasonal efficiency when device-level monthly tables are not exported separately in the .h2k.</p>
    ${spacePerfRows.length?fhrMonthTable(["Space Heating Load (MJ)","Furnace Input (MJ)","Pilot (MJ)","Indoor Fans (MJ)","Heat Pump (MJ)","Total Input (MJ)","System COP"], spacePerfRows, spacePerfFoot):"<p>No monthly heating performance data.</p>"}
  `)}

  ${fhrSection("Annual heat loss by component (SOC)", `
    <table class="grid"><thead><tr><th>Component</th><th class="num">GJ/a</th><th class="num">MJ</th></tr></thead>
    <tbody>
      <tr><td>Ceiling</td><td class="num">${fhrNum(hl.ceiling,2)}</td><td class="num">${fhrNum(gjToMJ(hl.ceiling),0)}</td></tr>
      <tr><td>Main walls</td><td class="num">${fhrNum(hl.mainWalls,2)}</td><td class="num">${fhrNum(gjToMJ(hl.mainWalls),0)}</td></tr>
      <tr><td>Windows</td><td class="num">${fhrNum(hl.windows,2)}</td><td class="num">${fhrNum(gjToMJ(hl.windows),0)}</td></tr>
      <tr><td>Doors</td><td class="num">${fhrNum(hl.doors,2)}</td><td class="num">${fhrNum(gjToMJ(hl.doors),0)}</td></tr>
      <tr><td>Exposed floors</td><td class="num">${fhrNum(hl.exposedFloors,2)}</td><td class="num">${fhrNum(gjToMJ(hl.exposedFloors),0)}</td></tr>
      <tr><td>Foundation</td><td class="num">${fhrNum(hl.foundation,2)}</td><td class="num">${fhrNum(gjToMJ(hl.foundation),0)}</td></tr>
      <tr><td>Air leakage &amp; ventilation</td><td class="num">${fhrNum(hl.air,2)}</td><td class="num">${fhrNum(gjToMJ(hl.air),0)}</td></tr>
      <tr class="ann"><td>Total</td><td class="num">${fhrNum(hl.total,2)}</td><td class="num">${fhrNum(gjToMJ(hl.total),0)}</td></tr>
    </tbody></table>
  `)}

  <p class="foot-note">The calculated heat losses and energy consumptions are only estimates, based upon the data entered and assumptions within the program. Actual energy consumption and heat losses will be influenced by construction practices, localized weather, equipment characteristics and the lifestyle of the occupants.</p>
  <p class="foot-note">Report generated ${fhrEsc(genDate)} by H2K Web Editor ${fhrEsc(typeof APP_VERSION!=="undefined"?APP_VERSION:"")} from calculated HOT2000 .h2k results (AllResults houseCode=SOC). Layout follows HOT2000 Desktop <em>Report → Full house report → House with standard operating conditions</em>. Some Desktop-only schedules (detailed code libraries, every monthly device column, proprietary paging) may differ.</p>
  <div class="page-foot"><span>${fhrEsc(genDate)} H2K</span><span>House with standard operating conditions</span></div>
  <script>
    window.addEventListener("load", function(){
      setTimeout(function(){ try{ window.focus(); window.print(); }catch(e){} }, 450);
    });
  </script>
</body></html>`;
}

function downloadSocPdfReport(){
  const v=runValidation();
  if(v.errors.length){ toast("Fix validation errors first"); return; }
  const report=lastSocReport || generateSocNetGJa();
  if(!report) return;
  try{
    const html=buildHot2000FullHouseReportHTML(report);
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    // Open printable HOT2000-style Full House Report (no noopener — needed to script print).
    const win=window.open(url, "_blank", "width=900,height=700");
    if(!win){
      // Fallback: download HTML if pop-ups blocked
      const a=document.createElement("a");
      a.href=url;
      a.download=reportPdfFilename(report).replace(/\.pdf$/i,"-full-house-report.html");
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Pop-up blocked — downloaded HTML report (open it and Print → Save as PDF)");
    }else{
      toast("Full House Report opened — choose Save as PDF in the print dialog");
    }
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  }catch(err){
    console.error(err);
    toast("Could not create Full House Report");
  }
}
