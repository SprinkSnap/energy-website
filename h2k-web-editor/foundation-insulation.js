/* Foundation / basement insulation configuration — loaded after app.js */
(function(){
"use strict";

const FOUNDATION_CONSTRUCTION = {
  concrete:["Concrete","Béton"],
  wood:["Wood","Bois"],
  concrete_wood:["Concrete & Wood","Béton et bois"]
};
const FOUNDATION_INSULATION = {
  uninsulated:["Uninsulated","Non isolé"],
  interior_wall:["Interior Wall Insulation","Isolation intérieure"],
  exterior_wall:["Exterior Wall Insulation","Isolation extérieure"],
  combination_wall:["Combination Wall Insulation","Isolation combinée"],
  interior_wall_slab:["Interior Wall & Slab Insulation","Isolation int. mur et dalle"],
  exterior_wall_slab:["Exterior Wall & Slab Insulation","Isolation ext. mur et dalle"],
  combination_wall_slab:["Combination wall & slab insulation","Isolation combinée mur et dalle"]
};
const FOUNDATION_INSULATION_BY_CONSTRUCTION = {
  concrete:["uninsulated","interior_wall","exterior_wall","combination_wall","interior_wall_slab","exterior_wall_slab","combination_wall_slab"],
  wood:["uninsulated","interior_wall","exterior_wall","interior_wall_slab","exterior_wall_slab","combination_wall_slab"],
  concrete_wood:["interior_wall","exterior_wall","interior_wall_slab","exterior_wall_slab","combination_wall_slab"]
};
const FOUNDATION_SLAB_LOCATION = {
  above:["Above Slab","Au-dessus de la dalle"],
  below:["Below Slab","Sous la dalle"]
};
const DEFAULT_FOUNDATION_CONSTRUCTION = "concrete";
const DEFAULT_FOUNDATION_INSULATION = "combination_wall_slab";
const DEFAULT_FOUNDATION_SLAB_LOCATION = "below";
const DEFAULT_FOUNDATION_CONFIG = {type:"BCCB", subtype:"4", label:"BCCB_4"};
const FOUNDATION_CONFIG_TYPE = {concrete:"BCCB", wood:"BFWB", concrete_wood:"BCWB"};
const BASEMENT_WALL_MODE_USER = "__user__";
const BASEMENT_WALL_MODE_NEW = "__new__";
const FLOORS_ABOVE_MODE_USER = "__fa_user__";
const FLOORS_ABOVE_MODE_NEW = "__fa_new__";
const DEFAULT_BASEMENT_WALL_CODE = "000000";
const DEFAULT_FLOORS_ABOVE_CODE = "4000000000";
const CORE_WALL_TYPES = {concrete:["Concrete","Béton"]};
const CORE_WALL_RSI = {concrete:"0.658679"};
const PONY_WALL_MODE_USER = "__pw_user__";
const PONY_WALL_MODE_NEW = "__pw_new__";

const BASEMENT_WALL_FRAMING = {
  "0":["None","Aucun"],
  "1":["38x64 mm (2x3 in) wood","38x64 (2x3) bois"],
  "2":["38x89 mm (2x4 in) wood","38x89 (2x4) bois"],
  "3":["38x140 mm (2x6 in) wood","38x140 (2x6) bois"],
  "4":["38x184 mm (2x8 in) wood","38x184 (2x8) bois"],
  "5":["38x235 mm (2x10 in) wood","38x235 (2x10) bois"],
  "6":["38x286 mm (2x12 in) wood","38x286 (2x12) bois"],
  "7":["30x92 mm (1.2x3.6 in) steel","30x92 (1.2x3.6) acier"],
  "8":["40x92 mm (1.6x3.6 in) steel","40x92 (1.6x3.6) acier"]
};
const BASEMENT_WALL_SPACING = {
  "0":["305 mm (12 in)","305 mm (12 po)"],
  "1":["400 mm (16 in)","400 mm (16 po)"],
  "2":["487 mm (19 in)","487 mm (19 po)"],
  "3":["600 mm (24 in)","600 mm (24 po)"]
};
const BASEMENT_WALL_STUDS = {
  "0":["2 studs","2 montants"],
  "1":["3 studs","3 montants"],
  "2":["4 studs","4 montants"]
};
const BASEMENT_WALL_FRAMING_INS = {
  "0":["None","Aucun"],
  "1":["RSI 1.41 @ 64 mm (R 8 @ 2.5\") batt","RSI 1.41 @ 64 mm mat."],
  "K":["RSI 1.76 @ 89 mm (R 10 @ 3.5\") batt","RSI 1.76 @ 89 mm mat."],
  "2":["RSI 2.11 @ 89 mm (R 12 @ 3.5\") batt","RSI 2.11 @ 89 mm mat."],
  "X":["RSI 2.46 @ 89 mm (R 14 @ 3.5\") batt","RSI 2.46 @ 89 mm mat."],
  "Y":["RSI 3.34 @ 140 mm (R 19 @ 5.5\") batt","RSI 3.34 @ 140 mm mat."],
  "3":["RSI 3.52 @ 152 mm (R 20 @ 6.0\") batt","RSI 3.52 @ 152 mm mat."],
  "4":["RSI 3.87 @ 140 mm (R 22 @ 5.5\") batt","RSI 3.87 @ 140 mm mat."],
  "Z":["RSI 4.23 @ 140 mm (R 24 @ 5.5\") batt","RSI 4.23 @ 140 mm mat."],
  "a":["RSI 4.93 @ 178 mm (R 28 @ 7.0\") batt","RSI 4.93 @ 178 mm mat."],
  "5":["RSI 4.93 @ 216 mm (R 28 @ 8.5\") batt","RSI 4.93 @ 216 mm mat."],
  "L":["RSI 5.46 @ 241 mm (R 31 @ 9.5\") batt","RSI 5.46 @ 241 mm mat."],
  "c":["RSI 6.16 @ 267 mm (R 35 @ 10.5\") batt","RSI 6.16 @ 267 mm mat."],
  "J":["RSI 7.04 @ 279 mm (R 40 @ 11.0\") batt","RSI 7.04 @ 279 mm mat."],
  "b":["RSI 7.04 @ 300 mm (R 40 @ 11.8\") batt","RSI 7.04 @ 300 mm mat."],
  "d":["RSI 10.57 (R 60) Blown cellulose","RSI 10.57 cell. injecté"],
  "9":["23.7 RSI/m (R 3.4/in) Blown cell.","23.7 RSI/m cell. injecté"],
  "A":["25.3 RSI/m (R 3.6/in) Blown cell.","25.3 RSI/m cell. injecté"],
  "E":["18.6 RSI/m (R 2.7/in) min. fibre","18.6 RSI/m fibre min."],
  "F":["25.9 RSI/m (R 3.6/in) Low density spray foam","25.9 RSI/m mousse faible densité"],
  "U":["36.0 RSI/m (R 5.19/in) Medium density spray foam","36.0 RSI/m mousse moyenne densité"],
  "V":["RSI 0.9 25 mm (1 in) Medium density spray foam","RSI 0.9 25 mm mousse moyenne densité"],
  "W":["RSI 1.8 51 mm (2 in) Medium density spray foam","RSI 1.8 51 mm mousse moyenne densité"],
  "G":["RSI 2.2 (R 12.6) Low density spray foam","RSI 2.2 mousse faible densité"],
  "H":["RSI 3.5 (R 19.6) Low density spray foam","RSI 3.5 mousse faible densité"],
  "e":["RSI 0.18 (R 1.0) Seaweed batt","RSI 0.18 mat. d'algues"],
  "M":["Wood shavings","Copeaux de bois"],
  "N":["Newspaper","Papier journal"],
  "O":["Wood pieces","Morceaux de bois"],
  "P":["Vermiculite","Vermiculite"],
  "Q":["Straw","Paille"],
  "R":["Expanded Polystyrene(EPS I)","Polystyrène expansé (EPS I)"],
  "S":["Expanded Polystyrene(EPS II)","Polystyrène expansé (EPS II)"],
  "T":["Extruded Polystyrene(XTPS IV)","Polystyrène extrudé (XTPS IV)"]
};
const BASEMENT_WALL_FRAMING_INS_ORDER=["0","1","K","2","X","Y","3","4","Z","a","5","L","c","J","b","d","9","A","E","F","U","V","W","G","H","e","M","N","O","P","Q","R","S","T"];
const LEGACY_BASEMENT_FRAMING_INS={"2":"K","4":"X","5":"Y","7":"4","8":"Z","9":"a","10":"5","11":"L","12":"c","13":"J","14":"b","15":"d","16":"9","17":"A","18":"E","19":"F","20":"U","21":"V","22":"W","23":"G","24":"H","25":"e","26":"M","27":"N","28":"O","29":"P","30":"Q","31":"R","32":"S","33":"T"};
const BASEMENT_WALL_EXTRA_INS = {
  "0":["None","Aucun"],
  "1":["RSI 1.41 (R 8) Batt","RSI 1.41 (R 8) Natte"],
  "2":["RSI 2.11 (R 12) Batt","RSI 2.11 (R 12) Natte"],
  "3":["RSI 3.52 (R 20) Batt","RSI 3.52 (R 20) Natte"],
  "4":["RSI 3.87 (R 22) Batt","RSI 3.87 (R 22) Natte"],
  "5":["RSI 4.93 (R 28) Batt","RSI 4.93 (R 28) Natte"],
  "P":["13 mm (0.5 in) EPS I","13 mm EPS I"],
  "Q":["19 mm (0.75 in) EPS I","19 mm EPS I"],
  "R":["25 mm (1 in) EPS I","25 mm EPS I"],
  "S":["38 mm (1.5 in) EPS I","38 mm EPS I"],
  "6":["50 mm (2 in) EPS I","50 mm EPS I"],
  "T":["76 mm (3 in) EPS I","76 mm EPS I"],
  "U":["13 mm (0.5 in) EPS II","13 mm EPS II"],
  "H":["25 mm (1 in) EPS II","25 mm EPS II"],
  "7":["38 mm (1.5 in) EPS II","38 mm EPS II"],
  "F":["50 mm (2 in) EPS II","50 mm EPS II"],
  "8":["76 mm (3 in) EPS II","76 mm EPS II"],
  "M":["13 mm (0.5 in) XTPS IV","13 mm XTPS IV"],
  "9":["19 mm (0.75 in) XTPS IV","19 mm XTPS IV"],
  "G":["25 mm (1 in) XTPS IV","25 mm XTPS IV"],
  "A":["38 mm (1.5 in) XTPS IV","38 mm XTPS IV"],
  "N":["51 mm (2 in) XTPS IV","51 mm XTPS IV"],
  "B":["64 mm (2.5 in) XTPS IV","64 mm XTPS IV"],
  "O":["76 mm (3 in) XTPS IV","76 mm XTPS IV"],
  "C":["25 mm (1 in) Semi-rigid","25 mm semi-rigide"],
  "E":["50 mm (2 in) Rigid glass fibre","50 mm fibre de verre rigide"],
  "I":["25 mm (1 in) Medium density spray foam","25 mm mousse moyenne densité"],
  "J":["51 mm (2 in) Medium density spray foam","51 mm mousse moyenne densité"],
  "K":["76 mm (3 in) Medium density spray foam","76 mm mousse moyenne densité"],
  "L":["89 mm (3.5 in) Medium density spray foam","89 mm mousse moyenne densité"],
  "V":["13 mm (0.5 in) isocyanurate","13 mm isocyanurate"],
  "D":["19 mm (0.75 in) isocyanurate","19 mm isocyanurate"],
  "W":["25 mm (1 in) isocyanurate","25 mm isocyanurate"],
  "X":["38 mm (1.5 in) isocyanurate","38 mm isocyanurate"],
  "Y":["51 mm (2 in) isocyanurate","51 mm isocyanurate"]
};
const BASEMENT_WALL_EXTRA_INS_ORDER=["0","1","2","3","4","5","P","Q","R","S","6","T","U","H","7","F","8","M","9","G","A","N","B","O","C","E","I","J","K","L","V","D","W","X","Y"];
const LEGACY_BASEMENT_EXTRA_INS={"6":"P","7":"Q","8":"R","9":"S","10":"6","11":"T","12":"U","13":"H","14":"7","15":"F","16":"8","17":"M","18":"9","19":"G","20":"A","21":"N","22":"B","23":"O","24":"C","25":"E","26":"I","27":"J","28":"K","29":"L","30":"V","31":"D","32":"W","33":"X","34":"Y"};
const BASEMENT_WALL_INTERIOR = {
  "0":["None","Aucun"],
  "1":["12 mm (0.5 in) gypsum board","12 mm plaque de plâtre"],
  "2":["Gypsum + Non insul. strapping","Plâtre + lattes non isolées"],
  "3":["Gypsum + RSI 1.4 (R8) insul. strapping","Plâtre + lattes RSI 1.4"],
  "4":["tile-linoleum","Carrelage-linoléum"],
  "5":["Gypsum + Tile-linoleum","Plâtre + carrelage-linoléum"],
  "6":["Wood","Bois"],
  "7":["Gypsum + Wood","Plâtre + bois"],
  "9":["Lath & plaster","Lattis et plâtre"]
};
const BASEMENT_WALL_INTERIOR_ORDER=["0","1","2","3","4","5","6","7","9"];
const LEGACY_BASEMENT_INTERIOR={"8":"9"};
const BASEMENT_WALL_FRAMING_ORDER=["0","1","2","3","4","5","6","7","8"];
const BASEMENT_WALL_SPACING_ORDER=["0","1","2","3"];
const BASEMENT_WALL_STUDS_ORDER=["0","1","2"];
const SLAB_INSULATION = {
  user:["User specified","Spécifié par l'util.",""],
  eps1_50:["50mm EPS I (2 in)","50 mm EPS I (2 po)","7.29657"],
  eps2_38:["38 mm EPS II (1.5 in)","38 mm EPS II (1,5 po)","5.97694"],
  eps2_50:["50 mm EPS II (2 in)","50 mm EPS II (2 po)","7.96944"],
  eps2_76:["76 mm EPS II (3 in)","76 mm EPS II (3 po)","11.9539"],
  xtps_19:["19 mm XTPS IV (0.75 in)","19 mm XTPS IV (0,75 po)","3.74368"],
  xtps_38:["38 mm XTPS IV (1.5 in)","38 mm XTPS IV (1,5 po)","7.48736"],
  xtps_64:["64 mm XTPS IV (2.5 in)","64 mm XTPS IV (2,5 po)","12.6103"],
  semi_25:["25 mm semi-rigid (1 in)","25 mm semi-rigide (1 po)","4.32968"],
  poly_19:["19 mm polyisocyan.(0.75 in)","19 mm polyisocyan. (0,75 po)","4.41258"],
  glass_50:["50 mm rig. glass fib.(2 in)","50 mm fibre de verre rig. (2 po)","8.5174"]
};
const FLOORS_ABOVE_SHEATHING = {
  "0":["None","Aucun"],
  "1":["Waferboard/OSB 9.5 mm (3/8 in)","OSB 9.5 mm"],
  "2":["Waferboard/OSB 11.1 mm (7/16 in)","OSB 11.1 mm"],
  "3":["Waferboard/OSB 15.9 mm (5/8 in)","OSB 15.9 mm"],
  "4":["Plywood/Particle board 9.5 mm (3/8 in)","Contreplaqué 9.5 mm"],
  "5":["Plywood/Particle board 12.7 mm (1/2 in)","Contreplaqué 12.7 mm"],
  "6":["Plywood/Particle board 15.5 mm (5/8 in)","Contreplaqué 15.5 mm"],
  "7":["Plywood/Particle board 18.5 mm (3/4 in)","Contreplaqué 18.5 mm"],
  "8":["Fibreboard 9.5 mm (3/8 in)","Panneau de fibres 9.5 mm"],
  "9":["Fibreboard 11.1 mm (7/16 in)","Panneau de fibres 11.1 mm"],
  "10":["Gypsum sheathing 9.5 mm (3/8 in)","Plâtre 9.5 mm"],
  "11":["Gypsum sheathing 12.7 mm (1/2 in)","Plâtre 12.7 mm"],
  "12":["Concrete slab 50.8 mm (2 in)","Dalle béton 50.8 mm"]
};
const FLOORS_ABOVE_EXTERIOR = {
  "0":["None","Aucun"],
  "1":["12 mm (0.5 in) Gypsum board","12 mm plaque de plâtre"],
  "2":["Gypsum + Non insul. strapping","Plâtre + lattes non isolées"],
  "3":["Gypsum + RSI 1.4 (R8) insul. strapping","Plâtre + lattes RSI 1.4"],
  "4":["Tile-linoleum","Carrelage-linoléum"],
  "5":["Gypsum + Tile-linoleum","Plâtre + carrelage-linoléum"],
  "6":["Wood","Bois"],
  "7":["Gypsum + Wood","Plâtre + bois"],
  "8":["Carpet & underpad","Tapis & sous-tapis"]
};
const FLOORS_ABOVE_DROP = {
  "0":["No","Non"],
  "1":["Yes","Oui"]
};
const FLOORS_ABOVE_INTERIOR = {
  "0":["None","Aucun"],
  "1":["12 mm (0.5 in) gypsum board","12 mm plaque de plâtre"],
  "2":["Gypsum + Non insul. strapping","Plâtre + lattes non isolées"],
  "3":["Gypsum + RSI 1.4 (R8) insul. strapping","Plâtre + lattes RSI 1.4"],
  "4":["Tile-linoleum","Carrelage-linoléum"],
  "5":["Gypsum + Tile-linoleum","Plâtre + carrelage-linoléum"],
  "6":["Wood","Bois"],
  "7":["Gypsum + Wood","Plâtre + bois"],
  "8":["Carpet & underpad","Tapis & sous-tapis"],
  "9":["Lath & plaster","Lattis et plâtre"]
};

function basementWallCodeChar(v){
  const s=String(v??"0").trim();
  if(!s) return "0";
  return s.slice(-1);
}
function basementWallCodedOptions(dict,order){
  return (order||Object.keys(dict)).filter(k=>dict[k]).map(id=>({id,label:dict[id][0]}));
}
function normalizeBasementLayerCode(code,dict,legacy=null){
  const c=String(code??"").trim();
  if(dict[c]) return c;
  if(legacy?.[c]&&dict[legacy[c]]) return legacy[c];
  return "0";
}
function isBasementWallCode(s){return /^[0-9A-Za-z]{6}$/.test(String(s||"").trim());}
function isBasementNumericCode(s){return isBasementWallCode(s);}
function isBasementAutoCodeLabel(s){return isBasementWallCode(s);}
function isFloorsAboveNumericCode(s){return /^\d{10}$/.test(String(s||"").trim());}
function buildBasementWallCodeLabel({framing="0",spacing="0",studs="0",framingInsulation="0",extraInsulation="0",interior="0"}={}){
  return basementWallCodeChar(framing)
    +basementWallCodeChar(spacing)
    +basementWallCodeChar(studs)
    +basementWallCodeChar(framingInsulation)
    +basementWallCodeChar(extraInsulation)
    +basementWallCodeChar(interior);
}
function buildFloorsAboveCodeLabel({structureType="2",componentSize="0",spacing="0",insulation1="0",insulation2="0",interior="0",sheathing="0",exterior="0",dropFraming="0"}={}){
  const part=v=>{const d=String(v??"0").replace(/\D/g,"");return d===""?"0":d;};
  const size=String(componentSize).replace(/\D/g,"").padStart(2,"0").slice(-2);
  const raw="4"+part(structureType)+size+part(spacing)+part(insulation1)+part(insulation2)+part(interior)+part(sheathing)+part(exterior)+part(dropFraming);
  return (raw+"0000000000").slice(0,10);
}
function foundationInsulationOptions(construction){
  const keys=FOUNDATION_INSULATION_BY_CONSTRUCTION[construction]||FOUNDATION_INSULATION_BY_CONSTRUCTION.concrete;
  return keys.map(id=>({id,label:FOUNDATION_INSULATION[id][0]}));
}
function foundationConfigLabel(type,subtype){return `${type||"BCCB"}_${subtype||"4"}`;}
function readFoundationConfig(n){
  const cfg=direct(n,"Configuration");
  const storedConstruction=cfg?.getAttribute("data-construction")||"";
  const storedInsulation=cfg?.getAttribute("data-insulation")||"";
  const storedSlab=cfg?.getAttribute("data-slab-location")||"";
  if(storedConstruction && storedInsulation && storedSlab){
    return {construction:storedConstruction,insulation:storedInsulation,slabLocation:storedSlab,
      type:cfg?.getAttribute("type")||DEFAULT_FOUNDATION_CONFIG.type,
      subtype:cfg?.getAttribute("subtype")||DEFAULT_FOUNDATION_CONFIG.subtype,
      label:cfg?.textContent?.trim()||foundationConfigLabel(cfg?.getAttribute("type"),cfg?.getAttribute("subtype"))};
  }
  return {
    construction:DEFAULT_FOUNDATION_CONSTRUCTION,
    insulation:DEFAULT_FOUNDATION_INSULATION,
    slabLocation:DEFAULT_FOUNDATION_SLAB_LOCATION,
    type:cfg?.getAttribute("type")||DEFAULT_FOUNDATION_CONFIG.type,
    subtype:cfg?.getAttribute("subtype")||DEFAULT_FOUNDATION_CONFIG.subtype,
    label:cfg?.textContent?.trim()||DEFAULT_FOUNDATION_CONFIG.label
  };
}
function foundationDiagramSVG(label){
  const t=esc(label||"BCCB_4");
  return `<svg class="foundation-diagram-svg" viewBox="0 0 200 120" role="img" aria-label="Foundation configuration ${t}">
    <rect x="10" y="70" width="180" height="40" fill="#b8c4ce" stroke="#5a6a78" stroke-width="1.5"/>
    <rect x="10" y="30" width="12" height="40" fill="#9aa8b4" stroke="#5a6a78"/>
    <rect x="178" y="30" width="12" height="40" fill="#9aa8b4" stroke="#5a6a78"/>
    <rect x="22" y="30" width="156" height="40" fill="#d4dce4" stroke="#5a6a78" stroke-width="1"/>
    <rect x="22" y="70" width="156" height="8" fill="#f4a460" opacity=".85"/>
    <rect x="22" y="78" width="156" height="6" fill="#87ceeb" opacity=".7"/>
    <text x="100" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="#31516f">${t}</text>
    <text x="100" y="105" text-anchor="middle" font-size="8" fill="#536170">Tap to configure insulation</text>
  </svg>`;
}
function basementWallFavourites(){
  try{
    const raw=JSON.parse(localStorage.getItem("h2kBasementWallFavourites")||"[]");
    if(!Array.isArray(raw)) return [];
    return raw.map(x=>typeof x==="string"?{id:x,label:x}:{id:String(x?.id||""),label:String(x?.label||x?.id||"")}).filter(x=>x.id);
  }catch(_){return[];}
}
function floorsAboveFavourites(){
  try{
    const raw=JSON.parse(localStorage.getItem("h2kFloorsAboveFavourites")||"[]");
    if(!Array.isArray(raw)) return [];
    return raw.map(x=>typeof x==="string"?{id:x,label:x}:{id:String(x?.id||""),label:String(x?.label||x?.id||"")}).filter(x=>x.id);
  }catch(_){return[];}
}
function saveBasementWallFavourite(id,label){
  if(!id||id===BASEMENT_WALL_MODE_USER||id===BASEMENT_WALL_MODE_NEW) return;
  const next=basementWallFavourites().filter(f=>f.id!==String(id));
  next.unshift({id:String(id),label:String(label||id).trim()||String(id)});
  localStorage.setItem("h2kBasementWallFavourites",JSON.stringify(next));
}
function saveFloorsAboveFavourite(id,label){
  if(!id||id===FLOORS_ABOVE_MODE_USER||id===FLOORS_ABOVE_MODE_NEW) return;
  const next=floorsAboveFavourites().filter(f=>f.id!==String(id));
  next.unshift({id:String(id),label:String(label||id).trim()||String(id)});
  localStorage.setItem("h2kFloorsAboveFavourites",JSON.stringify(next));
}
function basementWallCodeNode(id){
  if(!id||id===BASEMENT_WALL_MODE_USER||id===BASEMENT_WALL_MODE_NEW) return null;
  return xp(`/HouseFile/Codes/BasementWall//Code[@id='${String(id).trim()}']`)
    ||(isBasementNumericCode(id)?xp(`/HouseFile/Codes/BasementWall//Code[@value='${String(id).trim()}']`):null);
}
function floorsAboveCodeNode(id){
  if(!id||id===FLOORS_ABOVE_MODE_USER||id===FLOORS_ABOVE_MODE_NEW) return null;
  return xp(`/HouseFile/Codes/FloorsAbove//Code[@id='${String(id).trim()}']`)
    ||(isFloorsAboveNumericCode(id)?xp(`/HouseFile/Codes/FloorsAbove//Code[@value='${String(id).trim()}']`):null);
}
function matchLayerEl(el,dict,fallback="0"){
  if(!el) return fallback;
  const code=String(av(el,"code")||"");
  if(dict[code]) return code;
  const en=(el.querySelector(":scope > English")?.textContent||"").replace(/\s+/g," ").trim();
  if(en){
    const hit=Object.entries(dict).find(([,v])=>v[0].replace(/\s+/g," ")===en);
    if(hit) return hit[0];
  }
  return code||fallback;
}
function readBasementWallCodeState(codeNode,assemblyId=null){
  if(!codeNode) return null;
  const id=assemblyId||codeNode.getAttribute("id")||"";
  const layers=codeNode.querySelector(":scope > Layers");
  const framing=normalizeBasementLayerCode(matchLayerEl(layers?.querySelector("Framing"),BASEMENT_WALL_FRAMING,"0"),BASEMENT_WALL_FRAMING);
  const spacing=normalizeBasementLayerCode(matchLayerEl(layers?.querySelector("Spacing"),BASEMENT_WALL_SPACING,"0"),BASEMENT_WALL_SPACING);
  const studs=normalizeBasementLayerCode(matchLayerEl(layers?.querySelector("Studs"),BASEMENT_WALL_STUDS,"0"),BASEMENT_WALL_STUDS);
  const framingInsulation=normalizeBasementLayerCode(matchLayerEl(layers?.querySelector("InsulationInFramingLayer"),BASEMENT_WALL_FRAMING_INS,"0"),BASEMENT_WALL_FRAMING_INS,LEGACY_BASEMENT_FRAMING_INS);
  const extraInsulation=normalizeBasementLayerCode(matchLayerEl(layers?.querySelector("ExtraInsulationLayer"),BASEMENT_WALL_EXTRA_INS,"0"),BASEMENT_WALL_EXTRA_INS,LEGACY_BASEMENT_EXTRA_INS);
  const interior=normalizeBasementLayerCode(matchLayerEl(layers?.querySelector("InteriorFinish"),BASEMENT_WALL_INTERIOR,"0"),BASEMENT_WALL_INTERIOR,LEGACY_BASEMENT_INTERIOR);
  const computedLabel=buildBasementWallCodeLabel({framing,spacing,studs,framingInsulation,extraInsulation,interior});
  const storedLabel=codeNode.querySelector("Label")?.textContent?.trim()||"";
  const storedValue=codeNode.getAttribute("value")?.trim()||"";
  const fav=basementWallFavourites().find(f=>f.id===id||f.id===storedValue);
  const numericCode=storedValue&&isBasementNumericCode(storedValue)?storedValue:(isBasementNumericCode(storedLabel)?storedLabel:computedLabel);
  const displayLabel=(fav?.label&&!isBasementNumericCode(fav.label))?fav.label:(storedLabel&&!isBasementNumericCode(storedLabel)?storedLabel:computedLabel);
  return {framing,spacing,studs,framingInsulation,extraInsulation,interior,computedLabel,numericCode,displayLabel,
    labelCustomized:displayLabel!==computedLabel&&displayLabel!==numericCode,
    nominalR:codeNode.getAttribute("nominalRValue")||"0"};
}
function floorsAboveComponentSizes(structureType){
  return ceilingComponentSizes(structureType);
}
function floorsAboveFramingOptions(structureType){
  return ceilingFramingOptions(structureType);
}
function floorsAboveSolidLocksAll(structure,componentSize){
  const s=String(structure),c=String(componentSize);
  if(s!=="6") return false;
  if(c==="5") return "framing";
  if(["6","7","8","9","10","11","12"].includes(c)) return "all";
  if(["13","14","15","16","17"].includes(c)) return "framing_ins";
  return false;
}
function readFloorsAboveCodeState(codeNode,assemblyId=null){
  if(!codeNode) return null;
  const id=assemblyId||codeNode.getAttribute("id")||"";
  const layers=codeNode.querySelector(":scope > Layers");
  const structure=matchLayerEl(layers?.querySelector("StructureType"),CEILING_STRUCTURE_TYPES,"2");
  const sizeDict=floorsAboveComponentSizes(structure);
  const framingDict=floorsAboveFramingOptions(structure);
  const componentSize=matchLayerEl(layers?.querySelector("ComponentTypeSize"),sizeDict,firstDictCode(sizeDict)||"0");
  const spacing=matchLayerEl(layers?.querySelector("Spacing"),framingDict,firstDictCode(framingDict)||"0");
  const insulation1=matchLayerEl(layers?.querySelector("InsulationLayer1"),CEILING_INSULATION_1,"0");
  const insulation2=matchLayerEl(layers?.querySelector("InsulationLayer2"),CEILING_INSULATION_2,"0");
  const interior=matchLayerEl(layers?.querySelector("Interior"),FLOORS_ABOVE_INTERIOR,"0");
  const sheathing=matchLayerEl(layers?.querySelector("Sheathing"),FLOORS_ABOVE_SHEATHING,"0");
  const exterior=matchLayerEl(layers?.querySelector("Exterior"),FLOORS_ABOVE_EXTERIOR,"0");
  const dropFraming=matchLayerEl(layers?.querySelector("DropFraming"),FLOORS_ABOVE_DROP,"0");
  const computedLabel=buildFloorsAboveCodeLabel({structureType:structure,componentSize,spacing,insulation1,insulation2,interior,sheathing,exterior,dropFraming});
  const storedLabel=codeNode.querySelector("Label")?.textContent?.trim()||"";
  const storedValue=codeNode.getAttribute("value")?.trim()||"";
  const fav=floorsAboveFavourites().find(f=>f.id===id||f.id===storedValue);
  const numericCode=storedValue&&isFloorsAboveNumericCode(storedValue)?storedValue:(isFloorsAboveNumericCode(storedLabel)?storedLabel:computedLabel);
  const displayLabel=(fav?.label&&!isFloorsAboveNumericCode(fav.label))?fav.label:(storedLabel&&!isFloorsAboveNumericCode(storedLabel)?storedLabel:computedLabel);
  return {structureType:structure,componentSize,spacing,insulation1,insulation2,interior,sheathing,exterior,dropFraming,computedLabel,numericCode,displayLabel,
    labelCustomized:displayLabel!==computedLabel&&displayLabel!==numericCode,
    nominalR:codeNode.getAttribute("nominalRValue")||"0"};
}
function basementWallAssemblyShowsSelector(mode){
  if(!mode||mode===BASEMENT_WALL_MODE_USER) return false;
  if(mode===BASEMENT_WALL_MODE_NEW) return true;
  if(basementWallFavourites().some(f=>f.id===String(mode))) return true;
  return !!basementWallCodeNode(mode);
}
function shouldPersistBasementWallCode(assembly,displayLabel){
  if(!assembly||assembly===BASEMENT_WALL_MODE_USER) return false;
  if(assembly===BASEMENT_WALL_MODE_NEW) return true;
  if(displayLabel&&!isBasementWallCode(displayLabel)) return true;
  return basementWallAssemblyShowsSelector(assembly);
}
function basementWallAssemblyOptions(preferredOnly=true){
  const favs=basementWallFavourites();
  const favIds=new Set(favs.map(f=>f.id));
  const items=[];
  favs.forEach(f=>{
    const node=basementWallCodeNode(f.id);
    const id=node?.getAttribute("id")||f.id;
    items.push({id,label:f.label,fav:true,user:true});
  });
  xpa("/HouseFile/Codes/BasementWall//Code").forEach(c=>{
    const id=c.getAttribute("id");
    if(!id||favIds.has(id)) return;
    if(preferredOnly&&c.closest("UserDefined")) return;
    items.push({id,label:c.querySelector("Label")?.textContent||c.getAttribute("value")||id,fav:false});
  });
  // Create New Code is a separate button CTA — not listed in the dropdown.
  return items;
}
/** Dropdown lists existing codes only. When creating, a status placeholder keeps form value = MODE_NEW. */
function basementWallAssemblySelectHTML(items,current){
  const codes=items.filter(i=>i.id!==BASEMENT_WALL_MODE_NEW);
  const creating=current===BASEMENT_WALL_MODE_NEW;
  const placeholder=creating
    ?`<option value="${esc(BASEMENT_WALL_MODE_NEW)}" selected class="basement-creating-option">New code (editing…)</option>`
    :(codes.length?"":`<option value="" disabled selected>Select existing code…</option>`);
  const codeOpts=optionHTML(codes,creating?"":current);
  if(!codes.length) return `${placeholder}${codeOpts}`;
  return `${placeholder}<optgroup label="Codes">${codeOpts}</optgroup>`;
}
function floorsAboveAssemblyOptions(preferredOnly=true){
  const favs=floorsAboveFavourites();
  const favIds=new Set(favs.map(f=>f.id));
  const items=[];
  favs.forEach(f=>{
    const node=floorsAboveCodeNode(f.id);
    const id=node?.getAttribute("id")||f.id;
    items.push({id,label:f.label,fav:true,user:true});
  });
  xpa("/HouseFile/Codes/FloorsAbove//Code").forEach(c=>{
    const id=c.getAttribute("id");
    if(!id||favIds.has(id)) return;
    if(preferredOnly&&c.closest("UserDefined")) return;
    items.push({id,label:c.querySelector("Label")?.textContent||c.getAttribute("value")||id,fav:false});
  });
  items.push({id:FLOORS_ABOVE_MODE_USER,label:"User specified"});
  // Create New Code is a separate button CTA — not listed in the dropdown.
  return items;
}
function floorsAboveAssemblySelectHTML(items,current){
  const codes=items.filter(i=>i.id!==FLOORS_ABOVE_MODE_NEW);
  const creating=current===FLOORS_ABOVE_MODE_NEW;
  const placeholder=creating
    ?`<option value="${esc(FLOORS_ABOVE_MODE_NEW)}" selected class="basement-creating-option">New code (editing…)</option>`
    :"";
  const codeOpts=optionHTML(codes,creating?"":current);
  return `${placeholder}${codeOpts}`;
}
function slabInsulationKeyFromNode(el){
  const text=(el?.textContent||"").trim().toLowerCase();
  for(const [k,v] of Object.entries(SLAB_INSULATION)){
    if(k==="user") continue;
    if(text.includes(v[0].slice(0,12).toLowerCase())) return k;
  }
  return "user";
}
function fromRDisplay5(rsi){
  if(rsi===""||rsi==null) return "";
  const n=Number(rsi);
  if(!Number.isFinite(n)) return rsi;
  const disp=unitMode==="imperial"?n*RSI_TO_R:n;
  return Number(disp).toFixed(5);
}
function toRsi5(display){
  const n=Number(display);
  if(!Number.isFinite(n)) return display;
  return unitMode==="imperial"?num(n/RSI_TO_R,5):num(n,5);
}
function fromRDisplay4(rsi){
  if(rsi===""||rsi==null) return "";
  const n=Number(rsi);
  if(!Number.isFinite(n)) return rsi;
  const disp=unitMode==="imperial"?n*RSI_TO_R:n;
  return Number(disp).toFixed(4);
}

function ensureBasementWallCodesRoot(){
  let root=xp("/HouseFile/Codes/BasementWall");
  if(!root){const codes=ensureEl("/HouseFile/Codes");root=xmlDoc.createElement("BasementWall");codes.appendChild(root);}
  let user=root.querySelector(":scope > UserDefined");
  if(!user){user=xmlDoc.createElement("UserDefined");root.appendChild(user);}
  return user;
}
function ensureFloorsAboveCodesRoot(){
  let root=xp("/HouseFile/Codes/FloorsAbove");
  if(!root){const codes=ensureEl("/HouseFile/Codes");root=xmlDoc.createElement("FloorsAbove");codes.appendChild(root);}
  let user=root.querySelector(":scope > UserDefined");
  if(!user){user=xmlDoc.createElement("UserDefined");root.appendChild(user);}
  return user;
}
function nextCodeId(kind){
  const ids=xpa(`/HouseFile/Codes/${kind}//Code[@id]`).map(c=>c.getAttribute("id"));
  let max=0;
  ids.forEach(id=>{const m=String(id).match(/(\d+)\s*$/);if(m)max=Math.max(max,Number(m[1]));});
  return `Code ${max+1}`;
}
function setBasementLayer(layers,tag,code,dict){
  const el=ensureChild(layers,tag);
  if(!dict||!Object.keys(dict).length){el.setAttribute("code","0");return el;}
  const use=dict[code]?code:Object.keys(dict)[0];
  setCodedElement(el,use,dict);
  return el;
}
function setFloorsAboveLayer(layers,tag,code,dict){
  return setBasementLayer(layers,tag,code,dict);
}
function createOrUpdateBasementWallCode(opts){
  const userRoot=ensureBasementWallCodesRoot();
  let codeNode=opts.id?codeChildById(userRoot,opts.id):null;
  if(!codeNode&&opts.id) codeNode=basementWallCodeNode(opts.id);
  if(!codeNode){codeNode=xmlDoc.createElement("Code");codeNode.setAttribute("id",opts.id||nextCodeId("BasementWall"));userRoot.appendChild(codeNode);}
  const label=String(opts.displayLabel||opts.codeValue||DEFAULT_BASEMENT_WALL_CODE).trim();
  const numeric=String(opts.codeValue||buildBasementWallCodeLabel(opts)).trim();
  codeNode.setAttribute("value",numeric);
  if(opts.nominal!=null) codeNode.setAttribute("nominalRValue",String(opts.nominal));
  childText(codeNode,"Label",label);
  childText(codeNode,"Description",label);
  const layers=ensureChild(codeNode,"Layers");
  setBasementLayer(layers,"Framing",opts.framing,BASEMENT_WALL_FRAMING);
  setBasementLayer(layers,"Spacing",opts.spacing,BASEMENT_WALL_SPACING);
  setBasementLayer(layers,"Studs",opts.studs,BASEMENT_WALL_STUDS);
  setBasementLayer(layers,"InsulationInFramingLayer",opts.framingInsulation,BASEMENT_WALL_FRAMING_INS);
  setBasementLayer(layers,"ExtraInsulationLayer",opts.extraInsulation,BASEMENT_WALL_EXTRA_INS);
  setBasementLayer(layers,"InteriorFinish",opts.interior,BASEMENT_WALL_INTERIOR);
  return codeNode;
}
function createOrUpdateFloorsAboveCode(opts){
  const userRoot=ensureFloorsAboveCodesRoot();
  let codeNode=opts.id?codeChildById(userRoot,opts.id):null;
  if(!codeNode&&opts.id) codeNode=floorsAboveCodeNode(opts.id);
  if(!codeNode){codeNode=xmlDoc.createElement("Code");codeNode.setAttribute("id",opts.id||nextCodeId("FloorsAbove"));userRoot.appendChild(codeNode);}
  const label=String(opts.displayLabel||opts.codeValue||DEFAULT_FLOORS_ABOVE_CODE).trim();
  const numeric=String(opts.codeValue||buildFloorsAboveCodeLabel(opts)).trim();
  codeNode.setAttribute("value",numeric);
  if(opts.nominal!=null) codeNode.setAttribute("nominalRValue",String(opts.nominal));
  childText(codeNode,"Label",label);
  childText(codeNode,"Description",label);
  const layers=ensureChild(codeNode,"Layers");
  const structure=String(opts.structureType||"2");
  const sizeDict=floorsAboveComponentSizes(structure);
  const framingDict=floorsAboveFramingOptions(structure);
  const lock=floorsAboveSolidLocksAll(structure,opts.componentSize);
  setFloorsAboveLayer(layers,"StructureType",structure,CEILING_STRUCTURE_TYPES);
  setFloorsAboveLayer(layers,"ComponentTypeSize",opts.componentSize,sizeDict);
  setFloorsAboveLayer(layers,"Spacing",lock?"0":opts.spacing,framingDict);
  setFloorsAboveLayer(layers,"InsulationLayer1",lock==="all"?"0":opts.insulation1,CEILING_INSULATION_1);
  setFloorsAboveLayer(layers,"InsulationLayer2",lock==="all"?"0":opts.insulation2,CEILING_INSULATION_2);
  setFloorsAboveLayer(layers,"Interior",opts.interior,FLOORS_ABOVE_INTERIOR);
  setFloorsAboveLayer(layers,"Sheathing",opts.sheathing,FLOORS_ABOVE_SHEATHING);
  setFloorsAboveLayer(layers,"Exterior",opts.exterior,FLOORS_ABOVE_EXTERIOR);
  setFloorsAboveLayer(layers,"DropFraming",opts.dropFraming,FLOORS_ABOVE_DROP);
  return codeNode;
}
function applyFoundationInsulationDefaults(n){
  const cfg=ensureChild(n,"Configuration");
  cfg.setAttribute("type",DEFAULT_FOUNDATION_CONFIG.type);
  cfg.setAttribute("subtype",DEFAULT_FOUNDATION_CONFIG.subtype);
  cfg.setAttribute("overlap","0");
  cfg.setAttribute("data-construction",DEFAULT_FOUNDATION_CONSTRUCTION);
  cfg.setAttribute("data-insulation",DEFAULT_FOUNDATION_INSULATION);
  cfg.setAttribute("data-slab-location",DEFAULT_FOUNDATION_SLAB_LOCATION);
  cfg.textContent=DEFAULT_FOUNDATION_CONFIG.label;
}
function foundationConfigLabelFor(construction){
  return FOUNDATION_CONFIG_TYPE[construction]||"BCCB";
}

function basementEditorTabNavHTML(){
  return `<nav class="basement-editor-tabs" role="tablist" aria-label="Foundation editor">
    <button type="button" class="basement-tab-btn is-active" role="tab" id="basement-tab-foundation" aria-selected="true" aria-controls="basement-panel-foundation" data-basement-tab="foundation">Foundation</button>
    <button type="button" class="basement-tab-btn" role="tab" id="basement-tab-construction" aria-selected="false" aria-controls="basement-panel-construction" data-basement-tab="construction"><span class="basement-tab-long">Wall / Floor Construction</span><span class="basement-tab-short">Wall / Floor</span></button>
  </nav>`;
}

function basementEditorHTML(n){
  const opening=direct(n,"OpeningUpstairs");
  const room=direct(n,"RoomType");
  const fm=q(n,"Floor > Measurements");
  const floorConstr=q(n,"Floor > Construction");
  const wall=direct(n,"Wall");
  const wm=wall?direct(wall,"Measurements"):null;
  const ins=q(n,"Wall > Construction > InteriorAddedInsulation");
  const addedSlab=q(n,"Floor > Construction > AddedToSlab");
  const floorsAbove=q(n,"Floor > Construction > FloorsAbove");
  const fndCfg=readFoundationConfig(n);
  let openingCode=String(av(opening,"code","1")||"1");
  if(!OPENING_UPSTAIRS[openingCode]) openingCode="1";
  const openingVal=openingCode==="4"?av(opening,"value",openingUpstairsSi("1","1.56")):openingUpstairsSi(openingCode,"1.56");
  const roomCode=av(room,"code","6");
  const rectangular=String(av(fm,"isRectangular","false")||"false").toLowerCase()==="true";
  const area=av(fm,"area"),perimeter=av(fm,"perimeter");
  let length=av(fm,"length"),width=av(fm,"width");
  if(rectangular&&(!length||!width)){const sides=rectSidesFromAreaPerimeter(area,perimeter);length=length||sides.length;width=width||sides.width;}
  const pony=String(av(wall,"hasPonyWall","false")).toLowerCase()==="true";
  const openingItems=Object.entries(OPENING_UPSTAIRS).map(([id,v])=>({id,label:v[0]}));
  const roomItems=Object.entries(FOUNDATION_ROOM_TYPES).map(([id,v])=>({id,label:v[0]}));
  const wallAssemblyId=av(ins,"idref")||BASEMENT_WALL_MODE_NEW;
  const wallCodeNode=wallAssemblyId&&wallAssemblyId!==BASEMENT_WALL_MODE_NEW?basementWallCodeNode(wallAssemblyId):null;
  const wallState=wallCodeNode?readBasementWallCodeState(wallCodeNode,wallAssemblyId):null;
  const showWallSelector=basementWallAssemblyShowsSelector(wallAssemblyId);
  const wallAssemblyItems=basementWallAssemblyOptions(true);
  if(wallAssemblyId&&wallAssemblyId!==BASEMENT_WALL_MODE_NEW&&!wallAssemblyItems.some(i=>i.id===wallAssemblyId)){
    const node=basementWallCodeNode(wallAssemblyId);
    wallAssemblyItems.unshift({id:wallAssemblyId,label:node?.querySelector("Label")?.textContent||wallAssemblyId});
  }
  const faAssemblyId=av(floorsAbove,"idref")||FLOORS_ABOVE_MODE_USER;
  const faCodeNode=faAssemblyId&&faAssemblyId!==FLOORS_ABOVE_MODE_USER&&faAssemblyId!==FLOORS_ABOVE_MODE_NEW?floorsAboveCodeNode(faAssemblyId):null;
  const faState=faCodeNode?readFloorsAboveCodeState(faCodeNode,faAssemblyId):null;
  const showFaSelector=faAssemblyId===FLOORS_ABOVE_MODE_NEW;
  const faAssemblyItems=floorsAboveAssemblyOptions(true);
  if(faAssemblyId&&faAssemblyId!==FLOORS_ABOVE_MODE_USER&&faAssemblyId!==FLOORS_ABOVE_MODE_NEW&&!faAssemblyItems.some(i=>i.id===faAssemblyId)){
    const node=floorsAboveCodeNode(faAssemblyId);
    faAssemblyItems.unshift({id:faAssemblyId,label:node?.querySelector("Label")?.textContent||faAssemblyId});
  }
  const slabKey=slabInsulationKeyFromNode(addedSlab);
  const slabR=fromRDisplay5(av(addedSlab,"rValue","0"));
  const faR=fromRDisplay5(av(floorsAbove,"rValue","0"));
  const interiorR=fromRDisplay4(wallState?.nominalR||av(ins,"nominalInsulation","0"));
  const coreWallR=fromRDisplay4(CORE_WALL_RSI.concrete);
  const belowFrost=String(av(floorConstr,"isBelowFrostline","true")).toLowerCase()==="true";
  const heatedFloor=String(av(floorConstr,"heatedFloor","false")).toLowerCase()==="true";
  const comp1=q(ins,"Composite > Section[rank='1']");
  const comp2=q(ins,"Composite > Section[rank='2']");
  const comp3=q(ins,"Composite > Section[rank='3']");
  const wc=q(n,"Wall > Construction");
  const wallCorners=av(wc,"corners","14");
  const lintelsEl=q(wc,"Lintels");
  const lintelsText=lintelsEl?.textContent?.trim()||lintelsEl?.getAttribute("idref")||"";
  const wFraming=wallState?.framing||"0",wSpacing=wallState?.spacing||"0",wStuds=wallState?.studs||"0";
  const wFrIns=wallState?.framingInsulation||"0",wExtra=wallState?.extraInsulation||"0",wInt=wallState?.interior||"0";
  const wallLabel=wallState?.displayLabel||DEFAULT_BASEMENT_WALL_CODE;
  const wallNumeric=wallState?.numericCode||DEFAULT_BASEMENT_WALL_CODE;
  const bwCodePartAttr="data-bw-code-part";
  const faStructure=faState?.structureType||"2",faSize=faState?.componentSize||"0";
  const faSpacing=faState?.spacing||"0",faIns1=faState?.insulation1||"0",faIns2=faState?.insulation2||"0";
  const faInterior=faState?.interior||"0",faSheath=faState?.sheathing||"0",faExt=faState?.exterior||"0",faDrop=faState?.dropFraming||"0";
  const faLabel=faState?.displayLabel||DEFAULT_FLOORS_ABOVE_CODE;
  const faNumeric=faState?.numericCode||DEFAULT_FLOORS_ABOVE_CODE;
  const faSizeDict=floorsAboveComponentSizes(faStructure);
  const faFramingDict=floorsAboveFramingOptions(faStructure);

  const foundationTab=`
    <div class="basement-tab-stack">
      <button type="button" class="foundation-diagram-btn span-all" data-foundation-diagram-toggle aria-expanded="false">
        ${foundationDiagramSVG(fndCfg.label)}
        <span class="foundation-diagram-name">${esc(fndCfg.label)}</span>
      </button>
      <section class="editor-group foundation-insulation-panel" data-foundation-insulation hidden>
        <h4>Insulation Configuration</h4>
        <div class="editor-row foundation-insulation-grid">
          ${selectField("foundationConstruction","Construction",Object.entries(FOUNDATION_CONSTRUCTION).map(([id,v])=>({id,label:v[0]})),fndCfg.construction,"class=\"span-all\" data-foundation-construction")}
          ${selectField("foundationInsulation","Insulation",foundationInsulationOptions(fndCfg.construction),fndCfg.insulation,"class=\"span-all\" data-foundation-insulation")}
          ${selectField("slabInsulationLocation","Slab Insulation Location",Object.entries(FOUNDATION_SLAB_LOCATION).map(([id,v])=>({id,label:v[0]})),fndCfg.slabLocation,"class=\"span-all\"")}
        </div>
      </section>
      ${editorGroup("Foundation",`
        ${inputField("label","Foundation Label",nodeLabel(n))}
        ${selectField("openingUpstairs","Opening to upstairs",openingItems,openingCode)}
        ${inputField("openingValue","Value",openingVal,"number","area",openingCode==="4"?"":"disabled")}
        ${selectField("roomType","Foundation Room Type",roomItems,roomCode)}
      `,"basement-foundation-grid")}
      ${editorGroup("Floor Dimensions",`
        <div class="shape-toggle span-all" role="radiogroup" aria-label="Floor shape">
          <label class="check"><input type="radio" name="floorShape" value="rectangular" ${rectangular?"checked":""}> Rectangular</label>
          <label class="check"><input type="radio" name="floorShape" value="nonRectangular" ${rectangular?"":"checked"}> Non-Rectangular</label>
        </div>
        <div class="editor-shape-fields span-all" data-shape="rectangular" ${rectangular?"":"hidden"}>
          <div class="editor-row basement-dim-grid">${inputField("floorLength","Length",length,"number","length")}${inputField("floorWidth","Width",width,"number","length")}</div>
        </div>
        <div class="editor-shape-fields span-all" data-shape="nonRectangular" ${rectangular?"hidden":""}>
          <div class="editor-row basement-dim-grid">${inputField("perimeter","Perimeter",perimeter,"number","length")}${inputField("area","Total Area",area,"number","area")}</div>
        </div>
        <label class="check span-all"><input name="isBelowFrostline" type="checkbox" ${belowFrost?"checked":""}> Floor Below Frostline</label>
        <label class="check span-all"><input name="heatedFloor" type="checkbox" ${heatedFloor?"checked":""}> Heated floor</label>
      `,"basement-floor-dim-grid")}
      ${editorGroup("Wall Dimensions",`
        ${inputField("wallHeight","Total Height",av(wm,"height"),"number","length")}
        ${inputField("depth","Depth Below Grade",av(wm,"depth"),"number","length",pony?"disabled":"")}
        ${inputField("ponyWall","Pony wall",av(wall,"hasPonyWall","false"),"checkbox")}
        ${inputField("ponyWallHeight","Pony Wall Height",av(wm,"ponyWallHeight","0"),"number","length",pony?"":"disabled")}
        <div class="pony-construction-block span-all">
          <label class="field pony-construction-select">
            <span>Pony Wall Construction Type</span>
            <select name="ponyWallConstruction" ${pony?"":"disabled"}>
              <option value="${esc(PONY_WALL_MODE_USER)}" selected>User specified</option>
              <option value="${esc(PONY_WALL_MODE_NEW)}">Create New Code</option>
            </select>
          </label>
          <button type="button" class="button secondary basement-composite-btn" data-composite-open ${pony?"":"disabled"}>Composite</button>
        </div>
        <p class="editor-hint span-all" data-pony-depth-hint hidden></p>
      `,"basement-wall-dim-grid")}
    </div>`;

  const constructionTab=`
    <div class="basement-tab-stack">
      <p class="basement-tab-lead">Wall insulation, slab, and floors above the foundation. Select a code or use Create New Code to open the Code Selector.</p>
      ${editorGroup("Wall Construction",`
        <div class="assembly-create-block span-all">
          <span class="assembly-create-heading">Interior Added Insulation</span>
          <div class="assembly-create-controls">
            <label class="field assembly-create-select">
              <span class="sr-only">Interior Added Insulation code</span>
              <select name="interiorInsulation" class="basement-assembly-select" data-interior-insulation aria-label="Interior Added Insulation code">${basementWallAssemblySelectHTML(wallAssemblyItems,wallAssemblyId)}</select>
            </label>
            <button type="button" class="button secondary basement-create-code-btn${wallAssemblyId===BASEMENT_WALL_MODE_NEW?" is-active":""}" data-bw-create-new aria-pressed="${wallAssemblyId===BASEMENT_WALL_MODE_NEW?"true":"false"}">Create New Code</button>
          </div>
          <label class="field assembly-create-r">
            <span>${esc(rValueFieldLabel())}</span>
            <input name="interiorInsulationR" type="number" inputmode="decimal" step="0.0001" value="${esc(interiorR)}" readonly>
          </label>
        </div>
        ${selectField("coreWallType","Core Wall Type",Object.entries(CORE_WALL_TYPES).map(([id,v])=>({id,label:v[0]})),"concrete","disabled")}
        <label class="field"><span>Core Wall ${esc(rValueFieldLabel())}</span><input name="coreWallR" type="number" inputmode="decimal" step="0.0001" value="${esc(coreWallR)}" readonly></label>
        <label class="field"><span>Corners</span><input name="wallCorners" type="number" inputmode="numeric" step="1" min="0" pattern="[0-9]*" value="${esc(String(wallCorners).replace(/[^\d]/g,"")||"0")}" data-integer-only></label>
        <label class="field"><span>Lintels</span><input name="wallLintels" type="text" value="${esc(lintelsText)}" autocomplete="off"></label>
        <button type="button" class="button secondary span-all basement-composite-btn" data-composite-open>Composite</button>
      `,"basement-wall-grid")}
      <section class="editor-group code-selector-group" data-basement-wall-selector${showWallSelector?"":" hidden"}>
        <div class="code-selector-head"><h4>Code Selector</h4></div>
        <div class="editor-row basement-wall-code-grid">
          <label class="check span-all"><input name="bwShowPreferred" type="checkbox" checked> Show Preferred Only</label>
          <input type="hidden" name="bwCodeValue" value="${esc(wallNumeric)}" data-bw-code-value>
          <label class="field field-wide span-all"><span>Code Label</span><input name="bwCodeLabel" type="text" maxlength="64" value="${esc(wallLabel)}" data-bw-code-label data-customized="${wallState?.labelCustomized?"true":"false"}" placeholder="Auto code or custom name (e.g. R20 Blanket)"></label>
          <p class="editor-hint span-all" data-bw-code-breakdown></p>
          ${selectField("bwFraming","Framing",basementWallCodedOptions(BASEMENT_WALL_FRAMING,BASEMENT_WALL_FRAMING_ORDER),wFraming,bwCodePartAttr)}
          ${selectField("bwSpacing","Spacing",basementWallCodedOptions(BASEMENT_WALL_SPACING,BASEMENT_WALL_SPACING_ORDER),wSpacing,bwCodePartAttr)}
          ${selectField("bwStuds","Studs/Corner or Intersection",basementWallCodedOptions(BASEMENT_WALL_STUDS,BASEMENT_WALL_STUDS_ORDER),wStuds,bwCodePartAttr)}
          ${selectField("bwFramingIns","Insulation in Framing Layer",basementWallCodedOptions(BASEMENT_WALL_FRAMING_INS,BASEMENT_WALL_FRAMING_INS_ORDER),wFrIns,"class=\"span-all\" "+bwCodePartAttr)}
          ${selectField("bwExtraIns","Extra Insulation Layer",basementWallCodedOptions(BASEMENT_WALL_EXTRA_INS,BASEMENT_WALL_EXTRA_INS_ORDER),wExtra,"class=\"span-all\" "+bwCodePartAttr)}
          ${selectField("bwInterior","Interior Finish",basementWallCodedOptions(BASEMENT_WALL_INTERIOR,BASEMENT_WALL_INTERIOR_ORDER),wInt,"class=\"span-all\" "+bwCodePartAttr)}
          <label class="check span-all"><input name="bwSaveFavourite" type="checkbox"> Save As Favourite on Close</label>
        </div>
      </section>
      ${editorGroup("Floor Construction",`
        ${selectField("slabInsulation","Insulation Added to Slab",Object.entries(SLAB_INSULATION).map(([id,v])=>({id,label:v[0]})),slabKey,"class=\"span-all\"")}
        <label class="field"><span>Slab ${esc(rValueFieldLabel())}</span><input name="slabRValue" type="number" inputmode="decimal" step="0.00001" value="${esc(slabR)}"${slabKey==="user"?"":" readonly"}></label>
        <div class="assembly-create-block span-all">
          <span class="assembly-create-heading">Floors Above Foundation</span>
          <div class="assembly-create-controls">
            <label class="field assembly-create-select">
              <span class="sr-only">Floors Above Foundation code</span>
              <select name="floorsAbove" class="basement-fa-select" data-floors-above aria-label="Floors Above Foundation code">${floorsAboveAssemblySelectHTML(faAssemblyItems,faAssemblyId)}</select>
            </label>
            <button type="button" class="button secondary basement-create-code-btn${faAssemblyId===FLOORS_ABOVE_MODE_NEW?" is-active":""}" data-fa-create-new aria-pressed="${faAssemblyId===FLOORS_ABOVE_MODE_NEW?"true":"false"}">Create New Code</button>
          </div>
          <label class="field assembly-create-r">
            <span>${esc(rValueFieldLabel())}</span>
            <input name="floorsAboveR" type="number" inputmode="decimal" step="0.00001" value="${esc(faR)}"${faAssemblyId===FLOORS_ABOVE_MODE_USER?"":" readonly"}>
          </label>
        </div>
      `,"basement-floor-grid")}
      <section class="editor-group code-selector-group" data-floors-above-selector${showFaSelector?"":" hidden"}>
        <div class="code-selector-head"><h4>Code Selector</h4></div>
        <div class="editor-row floors-above-code-grid">
          <label class="check span-all"><input name="faShowPreferred" type="checkbox" checked> Show Preferred Only</label>
          <input type="hidden" name="faCodeValue" value="${esc(faNumeric)}" data-fa-code-value>
          <label class="field field-wide span-all"><span>Code Label</span><input name="faCodeLabel" type="text" maxlength="64" value="${esc(faLabel)}" data-fa-code-label data-customized="${faState?.labelCustomized?"true":"false"}"></label>
          <p class="editor-hint span-all" data-fa-code-breakdown></p>
          ${selectField("faStructure","Structure Type",codedOptions(CEILING_STRUCTURE_TYPES,["2","3","4","5","6","7"]),faStructure,"data-fa-code-part")}
          ${selectField("faSize","Component Type/Size",codedOptions(faSizeDict),faSize,"data-fa-code-part")}
          ${selectField("faSpacing","Framing",codedOptions(faFramingDict),faSpacing,"data-fa-code-part")}
          ${selectField("faIns1","Insulation Layer 1",codedOptions(CEILING_INSULATION_1),faIns1,"class=\"span-all\" data-fa-code-part")}
          ${selectField("faIns2","Insulation Layer 2",codedOptions(CEILING_INSULATION_2),faIns2,"class=\"span-all\" data-fa-code-part")}
          ${selectField("faInterior","Interior",codedOptions(FLOORS_ABOVE_INTERIOR),faInterior,"data-fa-code-part")}
          ${selectField("faSheathing","Sheathing",codedOptions(FLOORS_ABOVE_SHEATHING),faSheath,"data-fa-code-part")}
          ${selectField("faExterior","Exterior",codedOptions(FLOORS_ABOVE_EXTERIOR),faExt,"data-fa-code-part")}
          ${selectField("faDrop","Drop Framing",codedOptions(FLOORS_ABOVE_DROP),faDrop,"data-fa-code-part")}
          <label class="check span-all"><input name="faSaveFavourite" type="checkbox"> Save as Favourite on Close</label>
        </div>
      </section>
    </div>`;

  return `
    <div class="basement-editor" data-basement-editor>
      ${basementEditorTabNavHTML()}
      <div class="basement-tab-panels">
        <div class="basement-tab-panel is-active" id="basement-panel-foundation" role="tabpanel" aria-labelledby="basement-tab-foundation" data-basement-tab-panel="foundation">
          ${foundationTab}
        </div>
        <div class="basement-tab-panel" id="basement-panel-construction" role="tabpanel" aria-labelledby="basement-tab-construction" data-basement-tab-panel="construction" hidden>
          ${constructionTab}
        </div>
      </div>
      <dialog class="composite-dialog" data-composite-dialog>
        <div class="composite-dialog-inner">
          <h4>Composite RSI/R Calculator</h4>
          <div class="composite-grid">
            <label class="field"><span>Section 1 % of</span><input name="compPct1" type="number" step="0.01" value="${esc(av(comp1,"percentage","100"))}"></label>
            <label class="field"><span>Section 1 R</span><input name="compR1" type="number" step="0.01" value="${esc(fromRValueDisplay(av(comp1,"nominalRsi","0")))}"></label>
            <label class="field"><span>Section 2 % of</span><input name="compPct2" type="number" step="0.01" value="${esc(av(comp2,"percentage","0"))}"></label>
            <label class="field"><span>Section 2 R</span><input name="compR2" type="number" step="0.01" value="${esc(fromRValueDisplay(av(comp2,"nominalRsi","0")))}"></label>
            <label class="field"><span>Section 3 % of</span><input name="compPct3" type="number" step="0.01" value="${esc(av(comp3,"percentage","0"))}"></label>
            <label class="field"><span>Section 3 R</span><input name="compR3" type="number" step="0.01" value="${esc(fromRValueDisplay(av(comp3,"nominalRsi","0")))}"></label>
            <label class="field"><span>Remainder % of</span><input name="compRemainder" type="number" readonly></label>
            <label class="field"><span>Total</span><input name="compTotal" type="number" readonly></label>
            <label class="field span-all"><span>Effective R</span><input name="compEffectiveR" type="number" readonly></label>
          </div>
          <div class="dialog-actions"><button type="button" class="button secondary" data-composite-close>Close</button></div>
        </div>
      </dialog>
    </div>`;
}

// Expose globals for app.js
window.basementEditorHTML=basementEditorHTML;
window.foundationInsulation={
  FOUNDATION_CONSTRUCTION,FOUNDATION_INSULATION,FOUNDATION_SLAB_LOCATION,
  DEFAULT_FOUNDATION_CONSTRUCTION,DEFAULT_FOUNDATION_INSULATION,DEFAULT_FOUNDATION_SLAB_LOCATION,
  BASEMENT_WALL_MODE_USER,BASEMENT_WALL_MODE_NEW,FLOORS_ABOVE_MODE_USER,FLOORS_ABOVE_MODE_NEW,
  PONY_WALL_MODE_USER,PONY_WALL_MODE_NEW,
  BASEMENT_WALL_FRAMING,BASEMENT_WALL_SPACING,BASEMENT_WALL_STUDS,BASEMENT_WALL_FRAMING_INS,
  BASEMENT_WALL_EXTRA_INS,BASEMENT_WALL_INTERIOR,SLAB_INSULATION,
  FLOORS_ABOVE_SHEATHING,FLOORS_ABOVE_EXTERIOR,FLOORS_ABOVE_DROP,FLOORS_ABOVE_INTERIOR,
  CORE_WALL_TYPES,CORE_WALL_RSI,DEFAULT_BASEMENT_WALL_CODE,DEFAULT_FLOORS_ABOVE_CODE,
  isBasementWallCode,isBasementNumericCode,isBasementAutoCodeLabel,isFloorsAboveNumericCode,buildBasementWallCodeLabel,buildFloorsAboveCodeLabel,
  basementWallCodedOptions,normalizeBasementLayerCode,
  foundationInsulationOptions,foundationConfigLabel,readFoundationConfig,foundationDiagramSVG,
  basementWallFavourites,floorsAboveFavourites,saveBasementWallFavourite,saveFloorsAboveFavourite,
  basementWallCodeNode,floorsAboveCodeNode,readBasementWallCodeState,readFloorsAboveCodeState,
  basementWallAssemblyOptions,basementWallAssemblySelectHTML,basementWallAssemblyShowsSelector,shouldPersistBasementWallCode,floorsAboveAssemblyOptions,floorsAboveAssemblySelectHTML,slabInsulationKeyFromNode,
  floorsAboveComponentSizes,floorsAboveFramingOptions,floorsAboveSolidLocksAll,
  fromRDisplay5,toRsi5,fromRDisplay4,matchLayerEl,
  applyFoundationInsulationDefaults,createOrUpdateBasementWallCode,createOrUpdateFloorsAboveCode
};

function resolveLintelIdref(text){
  const t=String(text||"").trim();
  if(!t) return "";
  const codes=xpa("/HouseFile/Codes/Lintel//Code");
  const hit=codes.find(c=>{
    const val=c.getAttribute("value")?.trim();
    const label=c.querySelector("Label")?.textContent?.trim();
    const id=c.getAttribute("id");
    return val===t||label===t||id===t;
  });
  return hit?.getAttribute("id")||codes[0]?.getAttribute("id")||"";
}
function sanitizeWholeNumber(v,fallback="0"){
  const cleaned=String(v??"").trim();
  if(cleaned==="") return fallback;
  const n=Math.max(0,Math.round(Number(cleaned)));
  return Number.isFinite(n)?String(n):fallback;
}

function bindBasementEditor(root){
  const form=root.closest("form")||root;
  const openingSel=form.querySelector('[name="openingUpstairs"]');
  const openingVal=form.querySelector('[name="openingValue"]');
  const pony=form.querySelector('[name="ponyWall"]');
  const ponyHeight=form.querySelector('[name="ponyWallHeight"]');
  const ponyConstr=form.querySelector('[name="ponyWallConstruction"]');
  const wallHeight=form.querySelector('[name="wallHeight"]');
  const depth=form.querySelector('[name="depth"]');
  const hint=form.querySelector("[data-pony-depth-hint]");
  const diagramBtn=form.querySelector("[data-foundation-diagram-toggle]");
  const insulationPanel=form.querySelector("[data-foundation-insulation]");
  const fConstruction=form.querySelector('[name="foundationConstruction"]');
  const fInsulation=form.querySelector('[name="foundationInsulation"]');
  const wallAssembly=form.querySelector('[name="interiorInsulation"]');
  const createCodeBtn=form.querySelector("[data-bw-create-new]");
  const faAssembly=form.querySelector('[name="floorsAbove"]');
  const faCreateCodeBtn=form.querySelector("[data-fa-create-new]");
  const slabSel=form.querySelector('[name="slabInsulation"]');
  const slabR=form.querySelector('[name="slabRValue"]');
  const faR=form.querySelector('[name="floorsAboveR"]');
  const bwSelector=form.querySelector("[data-basement-wall-selector]");
  const faSelector=form.querySelector("[data-floors-above-selector]");
  const bwLabel=form.querySelector('[name="bwCodeLabel"]');
  const bwValue=form.querySelector('[name="bwCodeValue"]');
  const bwBreakdown=form.querySelector("[data-bw-code-breakdown]");
  const faLabel=form.querySelector('[name="faCodeLabel"]');
  const faValue=form.querySelector('[name="faCodeValue"]');
  const faBreakdown=form.querySelector("[data-fa-code-breakdown]");
  let bwLabelCustomized=bwLabel?.dataset.customized==="true";
  let faLabelCustomized=faLabel?.dataset.customized==="true";
  const interiorR=form.querySelector('[name="interiorInsulationR"]');
  const wallCorners=form.querySelector('[name="wallCorners"]');
  const compositeDlg=form.querySelector("[data-composite-dialog]");
  const tabBtns=[...form.querySelectorAll("[data-basement-tab]")];
  const tabPanels=[...form.querySelectorAll("[data-basement-tab-panel]")];
  const ponyAboveGrade=unitMode==="imperial"?0.5:num(0.5/3.280839895,4);

  function setBasementTab(id){
    tabBtns.forEach(btn=>{
      const active=btn.dataset.basementTab===id;
      btn.classList.toggle("is-active",active);
      btn.setAttribute("aria-selected",active?"true":"false");
    });
    tabPanels.forEach(panel=>{
      const show=panel.dataset.basementTabPanel===id;
      panel.classList.toggle("is-active",show);
      panel.hidden=!show;
    });
    const panel=form.querySelector(`[data-basement-tab-panel="${id}"]`);
    panel?.querySelector("input:not([type=hidden]),select,textarea,button:not([data-basement-tab])")?.focus({preventScroll:true});
  }

  function syncWallCorners(){
    if(!wallCorners) return;
    wallCorners.value=sanitizeWholeNumber(wallCorners.value,wallCorners.value||"0");
  }
  function syncOpeningValue(){
    const code=OPENING_UPSTAIRS[openingSel?.value]?openingSel.value:"1";
    if(openingSel&&openingSel.value!==code) openingSel.value=code;
    const user=code==="4";
    if(openingVal){openingVal.disabled=!user;if(!user) openingVal.value=fromSI(openingUpstairsSi(code,"1.56"),"area");}
  }
  function syncShape(){
    const rectangular=form.querySelector('[name="floorShape"][value="rectangular"]')?.checked;
    form.querySelectorAll(".editor-shape-fields").forEach(el=>{
      el.hidden=(el.dataset.shape==="rectangular")!==!!rectangular;
    });
  }
  function syncPonyDepth(){
    if(!ponyHeight||!depth) return;
    const enabled=!!pony?.checked;
    ponyHeight.disabled=!enabled;
    depth.disabled=enabled;
    if(ponyConstr) ponyConstr.disabled=!enabled;
    form.querySelectorAll("[data-composite-open][data-pony-composite], .pony-construction-block [data-composite-open]").forEach(btn=>{
      btn.disabled=!enabled;
    });
    if(!enabled){
      ponyHeight.value=fromSI(0,"length");
      if(hint){hint.hidden=true;hint.textContent="";hint.classList.remove("error");}
      return;
    }
    const total=Number(wallHeight?.value), ponyH=Number(ponyHeight.value);
    if(!Number.isFinite(total)||!Number.isFinite(ponyH)){
      if(hint){hint.hidden=false;hint.classList.add("error");hint.textContent="Enter Total Height and Pony Wall Height to calculate Depth Below Grade.";}
      return;
    }
    const calc=num(total-ponyH-ponyAboveGrade,3);
    if(calc<0){depth.value="";if(hint){hint.hidden=false;hint.classList.add("error");hint.textContent=`Depth Below Grade must be Total Height − Pony Wall Height − ${ponyAboveGrade} ${unitLabel("length")}.`;}return;}
    depth.value=String(calc);
    if(hint){hint.hidden=false;hint.classList.remove("error");hint.textContent=`Depth Below Grade = Total Height − Pony Wall Height − ${ponyAboveGrade} ${unitLabel("length")}.`;}
  }
  function refreshInsulationOptions(){
    if(!fInsulation||!fConstruction) return;
    const cur=fInsulation.value;
    const items=foundationInsulationOptions(fConstruction.value);
    fInsulation.innerHTML=optionHTML(items,cur);
    if(!items.some(i=>i.id===fInsulation.value)&&items.length) fInsulation.value=items[0].id;
  }
  function syncDiagramName(){
    const type=foundationConfigLabelFor(fConstruction?.value||DEFAULT_FOUNDATION_CONSTRUCTION);
    const subtype="4";
    const label=`${type}_${subtype}`;
    const nameEl=diagramBtn?.querySelector(".foundation-diagram-name");
    const svgText=diagramBtn?.querySelector(".foundation-diagram-svg text");
    if(nameEl) nameEl.textContent=label;
    if(svgText) svgText.textContent=label;
  }
  function bwParts(){
    return {
      framing:form.querySelector('[name="bwFraming"]')?.value||"0",
      spacing:form.querySelector('[name="bwSpacing"]')?.value||"0",
      studs:form.querySelector('[name="bwStuds"]')?.value||"0",
      framingInsulation:form.querySelector('[name="bwFramingIns"]')?.value||"0",
      extraInsulation:form.querySelector('[name="bwExtraIns"]')?.value||"0",
      interior:form.querySelector('[name="bwInterior"]')?.value||"0"
    };
  }
  function setBwLabelCustomized(custom){
    bwLabelCustomized=!!custom;
    if(bwLabel) bwLabel.dataset.customized=bwLabelCustomized?"true":"false";
  }
  function setFaLabelCustomized(custom){
    faLabelCustomized=!!custom;
    if(faLabel) faLabel.dataset.customized=faLabelCustomized?"true":"false";
  }
  function syncBwInteriorR(){
    const extra=form.querySelector('[name="bwExtraIns"]')?.value||"0";
    const extraNominals={"1":"1.41","2":"2.11","3":"3.52","4":"3.87","5":"4.93"};
    if(interiorR&&extraNominals[extra]) interiorR.value=fromRDisplay4(extraNominals[extra]);
  }
  function updateBwCodeBreakdown(parts,built){
    if(!bwBreakdown) return;
    const display=String(bwLabel?.value||built).trim();
    const bits=[
      `Framing <strong>${esc(parts.framing)}</strong>`,
      `Spacing <strong>${esc(parts.spacing)}</strong>`,
      `Studs <strong>${esc(parts.studs)}</strong>`,
      `Framing ins. <strong>${esc(parts.framingInsulation)}</strong>`,
      `Extra ins. <strong>${esc(parts.extraInsulation)}</strong>`,
      `Interior <strong>${esc(parts.interior)}</strong>`
    ];
    if(bwLabelCustomized){
      bwBreakdown.innerHTML=`Numeric code <strong>${esc(built)}</strong> · Display label <strong>${esc(display||"—")}</strong> · ${bits.join(" · ")}`;
    }else{
      bwBreakdown.innerHTML=`Active codes → ${bits.join(" · ")} → <strong>${esc(built)}</strong>`;
    }
  }
  function syncBwNumericOnly(){
    const parts=bwParts();
    const built=buildBasementWallCodeLabel(parts);
    if(bwValue) bwValue.value=built;
    syncBwInteriorR();
    updateBwCodeBreakdown(parts,built);
  }
  function syncBwCodeLabel(){
    const parts=bwParts();
    const built=buildBasementWallCodeLabel(parts);
    if(bwValue) bwValue.value=built;
    if(bwLabel&&!bwLabelCustomized){
      const cur=String(bwLabel.value||"").trim();
      if(!cur||isBasementAutoCodeLabel(cur)) bwLabel.value=built;
    }
    syncBwInteriorR();
    updateBwCodeBreakdown(parts,built);
  }
  function onBwCodeLabelFocus(){
    setBwLabelCustomized(true);
  }
  function onBwCodeLabelInput(){
    setBwLabelCustomized(true);
    syncBwNumericOnly();
  }
  function onBwCodeLabelBlur(){
    const built=buildBasementWallCodeLabel(bwParts());
    const cur=String(bwLabel?.value||"").trim();
    if(cur&&!isBasementAutoCodeLabel(cur)) setBwLabelCustomized(true);
    else if(cur&&cur===built) setBwLabelCustomized(false);
    if(bwLabelCustomized) syncBwNumericOnly();
    else syncBwCodeLabel();
  }
  function syncBwFramingDeps(){
    const framing=form.querySelector('[name="bwFraming"]')?.value||"0";
    const none=String(framing)==="0";
    ["bwSpacing","bwStuds","bwFramingIns"].forEach(name=>{
      const el=form.querySelector(`[name="${name}"]`);
      if(!el) return;
      el.disabled=none;
      if(none) el.value="0";
    });
    syncBwCodeLabel();
  }
  function resetBasementWallCodeSelectorDefaults(){
    setBwLabelCustomized(false);
    ["bwFraming","bwSpacing","bwStuds","bwFramingIns","bwExtraIns","bwInterior"].forEach(name=>{
      const el=form.querySelector(`[name="${name}"]`);
      if(el) el.value="0";
    });
    syncBwFramingDeps();
    if(bwLabel) bwLabel.value=DEFAULT_BASEMENT_WALL_CODE;
    if(bwValue) bwValue.value=DEFAULT_BASEMENT_WALL_CODE;
  }
  function faParts(){
    const structure=form.querySelector('[name="faStructure"]')?.value||"2";
    const lock=floorsAboveSolidLocksAll(structure,form.querySelector('[name="faSize"]')?.value||"0");
    return {
      structureType:structure,
      componentSize:form.querySelector('[name="faSize"]')?.value||"0",
      spacing:lock?"0":(form.querySelector('[name="faSpacing"]')?.value||"0"),
      insulation1:lock==="all"?"0":(form.querySelector('[name="faIns1"]')?.value||"0"),
      insulation2:lock==="all"?"0":(form.querySelector('[name="faIns2"]')?.value||"0"),
      interior:form.querySelector('[name="faInterior"]')?.value||"0",
      sheathing:form.querySelector('[name="faSheathing"]')?.value||"0",
      exterior:form.querySelector('[name="faExterior"]')?.value||"0",
      dropFraming:form.querySelector('[name="faDrop"]')?.value||"0"
    };
  }
  function updateFaCodeBreakdown(parts,built){
    if(!faBreakdown) return;
    const display=String(faLabel?.value||built).trim();
    const bits=[
      `Structure <strong>${esc(parts.structureType)}</strong>`,
      `Size <strong>${esc(parts.componentSize)}</strong>`,
      `Framing <strong>${esc(parts.spacing)}</strong>`,
      `Ins1 <strong>${esc(parts.insulation1)}</strong>`,
      `Ins2 <strong>${esc(parts.insulation2)}</strong>`,
      `Interior <strong>${esc(parts.interior)}</strong>`,
      `Sheathing <strong>${esc(parts.sheathing)}</strong>`,
      `Exterior <strong>${esc(parts.exterior)}</strong>`,
      `Drop <strong>${esc(parts.dropFraming)}</strong>`
    ];
    if(faLabelCustomized){
      faBreakdown.innerHTML=`Numeric code <strong>${esc(built)}</strong> · Display label <strong>${esc(display||"—")}</strong> · ${bits.join(" · ")}`;
    }else{
      faBreakdown.innerHTML=`Active codes → ${bits.join(" · ")} → <strong>${esc(built)}</strong>`;
    }
  }
  function syncFaNumericOnly(){
    const parts=faParts();
    const built=buildFloorsAboveCodeLabel(parts);
    if(faValue) faValue.value=built;
    updateFaCodeBreakdown(parts,built);
  }
  function syncFaCodeLabel(){
    const parts=faParts();
    const built=buildFloorsAboveCodeLabel(parts);
    if(faValue) faValue.value=built;
    if(faLabel&&!faLabelCustomized){
      const cur=String(faLabel.value||"").trim();
      if(!cur||isFloorsAboveNumericCode(cur)) faLabel.value=built;
    }
    updateFaCodeBreakdown(parts,built);
  }
  function onFaCodeLabelFocus(){
    setFaLabelCustomized(true);
  }
  function onFaCodeLabelInput(){
    setFaLabelCustomized(true);
    syncFaNumericOnly();
  }
  function onFaCodeLabelBlur(){
    const built=buildFloorsAboveCodeLabel(faParts());
    const cur=String(faLabel?.value||"").trim();
    if(cur&&!isFloorsAboveNumericCode(cur)) setFaLabelCustomized(true);
    else if(cur&&cur===built) setFaLabelCustomized(false);
    if(faLabelCustomized) syncFaNumericOnly();
    else syncFaCodeLabel();
  }
  function resetFloorsAboveCodeSelectorDefaults(){
    setFaLabelCustomized(false);
    const structureEl=form.querySelector('[name="faStructure"]');
    if(structureEl) structureEl.value="2";
    syncFaStructureDeps();
    ["faIns1","faIns2","faInterior","faSheathing","faExterior","faDrop"].forEach(name=>{
      const el=form.querySelector(`[name="${name}"]`);
      if(el&&!el.disabled) el.value="0";
    });
    if(faLabel) faLabel.value=DEFAULT_FLOORS_ABOVE_CODE;
    syncFaCodeLabel();
  }
  function fillSelect(el,dict,preferred){
    if(!el) return;
    const keys=Object.keys(dict||{});
    const keep=keys.includes(String(preferred))?String(preferred):(keys[0]||"");
    el.innerHTML=optionHTML(codedOptions(dict),keep);
    el.value=keep;
  }
  function syncFaStructureDeps(){
    const structure=form.querySelector('[name="faStructure"]')?.value||"2";
    const sizeEl=form.querySelector('[name="faSize"]');
    const spacingEl=form.querySelector('[name="faSpacing"]');
    const ins1El=form.querySelector('[name="faIns1"]');
    const ins2El=form.querySelector('[name="faIns2"]');
    const sizeDict=floorsAboveComponentSizes(structure);
    const framingDict=floorsAboveFramingOptions(structure);
    fillSelect(sizeEl,sizeDict,sizeEl?.value);
    fillSelect(spacingEl,framingDict,spacingEl?.value);
    const lock=floorsAboveSolidLocksAll(structure,sizeEl?.value||"0");
    if(spacingEl){spacingEl.disabled=!!lock; if(lock) spacingEl.value="0";}
    if(ins1El){ins1El.disabled=lock==="all"; if(lock==="all") ins1El.value="0";}
    if(ins2El){ins2El.disabled=lock==="all"; if(lock==="all") ins2El.value="0";}
    syncFaCodeLabel();
  }
  function syncCreateCodeBtn(active){
    if(!createCodeBtn) return;
    const on=!!active;
    createCodeBtn.classList.toggle("is-active",on);
    createCodeBtn.setAttribute("aria-pressed",on?"true":"false");
  }
  function syncFaCreateCodeBtn(active){
    if(!faCreateCodeBtn) return;
    const on=!!active;
    faCreateCodeBtn.classList.toggle("is-active",on);
    faCreateCodeBtn.setAttribute("aria-pressed",on?"true":"false");
  }
  function revealCodeSelector(panel){
    if(!panel) return;
    panel.hidden=false;
    try{panel.scrollIntoView({behavior:"smooth",block:"nearest"});}catch(_){/* ignore */}
  }
  function basementWallShowsSelector(id){
    return typeof basementWallAssemblyShowsSelector==="function"?basementWallAssemblyShowsSelector(id):id===BASEMENT_WALL_MODE_NEW;
  }
  function setBwSelectorOpen(open){
    const id=wallAssembly?.value;
    const canShow=basementWallShowsSelector(id);
    const show=!!open&&canShow;
    if(bwSelector) bwSelector.hidden=!show;
    if(show){
      if(bwLabelCustomized) syncBwNumericOnly();
      else syncBwCodeLabel();
    }
  }
  function syncBwSelectorVisibility({forceOpen=false}={}){
    const id=wallAssembly?.value;
    if(!basementWallShowsSelector(id)){
      if(bwSelector) bwSelector.hidden=true;
      return;
    }
    if(forceOpen) setBwSelectorOpen(true);
    else if(bwSelector) bwSelector.hidden=false;
  }
  function activateCreateNewCode(){
    setBasementTab("construction");
    if(wallAssembly){
      const items=basementWallAssemblyOptions(!!form.querySelector('[name="bwShowPreferred"]')?.checked);
      wallAssembly.innerHTML=basementWallAssemblySelectHTML(items,BASEMENT_WALL_MODE_NEW);
      wallAssembly.value=BASEMENT_WALL_MODE_NEW;
      wallAssembly.classList.remove("is-fav-selected");
    }
    syncCreateCodeBtn(true);
    resetBasementWallCodeSelectorDefaults();
    setBwSelectorOpen(true);
    try{bwSelector?.scrollIntoView({behavior:"smooth",block:"nearest"});}catch(_){/* ignore */}
  }
  function activateFaCreateNewCode(){
    setBasementTab("construction");
    if(faAssembly){
      const items=floorsAboveAssemblyOptions(!!form.querySelector('[name="faShowPreferred"]')?.checked);
      faAssembly.innerHTML=floorsAboveAssemblySelectHTML(items,FLOORS_ABOVE_MODE_NEW);
      faAssembly.value=FLOORS_ABOVE_MODE_NEW;
      faAssembly.classList.remove("is-fav-selected");
    }
    if(faR) faR.readOnly=true;
    syncFaCreateCodeBtn(true);
    resetFloorsAboveCodeSelectorDefaults();
    revealCodeSelector(faSelector);
  }
  function refreshWallAssembly(keep){
    if(!wallAssembly) return;
    const preferred=!!form.querySelector('[name="bwShowPreferred"]')?.checked;
    const cur=keep||wallAssembly.value;
    const items=basementWallAssemblyOptions(preferred);
    if(cur && cur!==BASEMENT_WALL_MODE_NEW && !items.some(i=>i.id===cur)){
      const node=basementWallCodeNode(cur);
      items.unshift({id:cur,label:node?.querySelector("Label")?.textContent||cur,fav:false});
    }
    wallAssembly.innerHTML=basementWallAssemblySelectHTML(items,cur);
    if(cur) wallAssembly.value=cur;
    const opt=wallAssembly.selectedOptions?.[0];
    wallAssembly.classList.toggle("is-fav-selected",!!opt?.classList?.contains("ceiling-type-fav"));
    syncCreateCodeBtn(cur===BASEMENT_WALL_MODE_NEW);
  }
  function refreshFaAssembly(keep){
    if(!faAssembly) return;
    const preferred=!!form.querySelector('[name="faShowPreferred"]')?.checked;
    const cur=keep||faAssembly.value;
    const items=floorsAboveAssemblyOptions(preferred);
    if(cur && cur!==FLOORS_ABOVE_MODE_NEW && cur!==FLOORS_ABOVE_MODE_USER && !items.some(i=>i.id===cur)){
      const node=floorsAboveCodeNode(cur);
      items.unshift({id:cur,label:node?.querySelector("Label")?.textContent||cur,fav:false});
    }
    faAssembly.innerHTML=floorsAboveAssemblySelectHTML(items,cur);
    if(cur) faAssembly.value=cur;
    const opt=faAssembly.selectedOptions?.[0];
    faAssembly.classList.toggle("is-fav-selected",!!opt?.classList?.contains("ceiling-type-fav"));
    syncFaCreateCodeBtn(cur===FLOORS_ABOVE_MODE_NEW);
  }
  function loadBwFromAssembly(id){
    if(id===BASEMENT_WALL_MODE_NEW){resetBasementWallCodeSelectorDefaults();return;}
    const state=readBasementWallCodeState(basementWallCodeNode(id),id);
    if(!state) return;
    setBwLabelCustomized(state.labelCustomized);
    if(bwLabel) bwLabel.value=state.displayLabel;
    if(bwValue) bwValue.value=state.numericCode;
    ["bwFraming","bwSpacing","bwStuds","bwFramingIns","bwExtraIns","bwInterior"].forEach((name,i)=>{
      const el=form.querySelector(`[name="${name}"]`);
      const vals=[state.framing,state.spacing,state.studs,state.framingInsulation,state.extraInsulation,state.interior];
      if(el) el.value=vals[i];
    });
    syncBwFramingDeps();
    if(interiorR) interiorR.value=fromRDisplay4(state.nominalR);
    if(bwLabelCustomized) syncBwNumericOnly();
    else syncBwCodeLabel();
  }
  function loadFaFromAssembly(id){
    if(id===FLOORS_ABOVE_MODE_NEW){syncFaStructureDeps();return;}
    if(id===FLOORS_ABOVE_MODE_USER){if(faR){faR.readOnly=false;faR.disabled=false;}return;}
    const state=readFloorsAboveCodeState(floorsAboveCodeNode(id),id);
    if(!state) return;
    setFaLabelCustomized(state.labelCustomized);
    if(faLabel) faLabel.value=state.displayLabel;
    const map={faStructure:state.structureType,faSize:state.componentSize,faSpacing:state.spacing,faIns1:state.insulation1,faIns2:state.insulation2,faInterior:state.interior,faSheathing:state.sheathing,faExterior:state.exterior,faDrop:state.dropFraming};
    Object.entries(map).forEach(([n,v])=>{const el=form.querySelector(`[name="${n}"]`);if(el) el.value=v;});
    syncFaStructureDeps();
    if(faR){faR.value=fromRDisplay5(state.nominalR);faR.readOnly=true;faR.disabled=false;}
  }
  function syncSlabR(){
    if(!slabSel||!slabR) return;
    const rec=SLAB_INSULATION[slabSel.value];
    const user=slabSel.value==="user";
    slabR.disabled=!user;
    if(!user&&rec&&rec[2]!=="") slabR.value=Number(rec[2]).toFixed(5);
  }
  function syncComposite(){
    const p1=Number(form.querySelector('[name="compPct1"]')?.value||0);
    const p2=Number(form.querySelector('[name="compPct2"]')?.value||0);
    const p3=Number(form.querySelector('[name="compPct3"]')?.value||0);
    const r1=Number(form.querySelector('[name="compR1"]')?.value||0);
    const r2=Number(form.querySelector('[name="compR2"]')?.value||0);
    const r3=Number(form.querySelector('[name="compR3"]')?.value||0);
    const remainder=Math.max(0,num(100-p1-p2-p3,2));
    const remEl=form.querySelector('[name="compRemainder"]');
    const totalEl=form.querySelector('[name="compTotal"]');
    const effEl=form.querySelector('[name="compEffectiveR"]');
    if(remEl) remEl.value=String(remainder);
    const total=p1+p2+p3+remainder;
    if(totalEl) totalEl.value=String(num(total,2));
    let denom=0;
    [[p1,r1],[p2,r2],[p3,r3]].forEach(([p,r])=>{if(p>0&&r>0) denom+=p/r;});
    const eff=denom>0?num(100/denom,2):0;
    if(effEl) effEl.value=String(eff);
  }
  wallCorners?.addEventListener("input",syncWallCorners);
  wallCorners?.addEventListener("blur",syncWallCorners);
  diagramBtn?.addEventListener("click",()=>{
    setBasementTab("foundation");
    const open=!insulationPanel?.hidden;
    if(insulationPanel) insulationPanel.hidden=open;
    diagramBtn.setAttribute("aria-expanded",open?"false":"true");
  });
  tabBtns.forEach(btn=>btn.addEventListener("click",()=>setBasementTab(btn.dataset.basementTab)));
  fConstruction?.addEventListener("change",()=>{refreshInsulationOptions();syncDiagramName();});
  fInsulation?.addEventListener("change",syncDiagramName);
  openingSel?.addEventListener("change",syncOpeningValue);
  form.querySelectorAll('[name="floorShape"]').forEach(el=>el.addEventListener("change",syncShape));
  pony?.addEventListener("change",syncPonyDepth);
  wallHeight?.addEventListener("input",syncPonyDepth);
  ponyHeight?.addEventListener("input",syncPonyDepth);
  wallAssembly?.addEventListener("change",()=>{
    const id=wallAssembly.value;
    syncCreateCodeBtn(id===BASEMENT_WALL_MODE_NEW);
    setBasementTab("construction");
    if(id===BASEMENT_WALL_MODE_NEW){
      resetBasementWallCodeSelectorDefaults();
    }else if(basementWallShowsSelector(id)){
      loadBwFromAssembly(id);
    }
    syncBwSelectorVisibility({forceOpen:basementWallShowsSelector(id)});
    try{if(basementWallShowsSelector(id)) bwSelector?.scrollIntoView({behavior:"smooth",block:"nearest"});}catch(_){/* ignore */}
    refreshWallAssembly(id);
  });
  createCodeBtn?.addEventListener("click",activateCreateNewCode);
  faAssembly?.addEventListener("change",()=>{
    const id=faAssembly.value;
    if(faSelector) faSelector.hidden=id!==FLOORS_ABOVE_MODE_NEW;
    syncFaCreateCodeBtn(id===FLOORS_ABOVE_MODE_NEW);
    if(id===FLOORS_ABOVE_MODE_NEW){
      setBasementTab("construction");
      resetFloorsAboveCodeSelectorDefaults();
      revealCodeSelector(faSelector);
    }else loadFaFromAssembly(id);
    refreshFaAssembly(id);
  });
  faCreateCodeBtn?.addEventListener("click",activateFaCreateNewCode);
  form.querySelector('[name="faStructure"]')?.addEventListener("change",syncFaStructureDeps);
  form.querySelector('[name="faSize"]')?.addEventListener("change",syncFaStructureDeps);
  form.addEventListener("change",e=>{
    if(e.target?.matches?.('[name="bwFraming"]')) syncBwFramingDeps();
    else if(e.target?.matches?.("[data-bw-code-part]")) syncBwCodeLabel();
    if(e.target?.matches?.("[data-fa-code-part]")) syncFaCodeLabel();
  });
  bwLabel?.addEventListener("focus",onBwCodeLabelFocus);
  bwLabel?.addEventListener("input",onBwCodeLabelInput);
  bwLabel?.addEventListener("blur",onBwCodeLabelBlur);
  faLabel?.addEventListener("focus",onFaCodeLabelFocus);
  faLabel?.addEventListener("input",onFaCodeLabelInput);
  faLabel?.addEventListener("blur",onFaCodeLabelBlur);
  form.querySelector('[name="bwShowPreferred"]')?.addEventListener("change",()=>refreshWallAssembly(wallAssembly?.value));
  form.querySelector('[name="faShowPreferred"]')?.addEventListener("change",()=>refreshFaAssembly(faAssembly?.value));
  slabSel?.addEventListener("change",syncSlabR);
  form.querySelectorAll("[data-composite-open]").forEach(btn=>{
    btn.addEventListener("click",()=>{if(btn.disabled) return;syncComposite();compositeDlg?.showModal();});
  });
  form.querySelector("[data-composite-close]")?.addEventListener("click",()=>compositeDlg?.close());
  ["compPct1","compPct2","compPct3","compR1","compR2","compR3"].forEach(n=>form.querySelector(`[name="${n}"]`)?.addEventListener("input",syncComposite));
  syncOpeningValue();syncShape();syncPonyDepth();syncWallCorners();refreshInsulationOptions();syncDiagramName();syncSlabR();
  if(wallAssembly?.value) loadBwFromAssembly(wallAssembly.value);
  else syncBwFramingDeps();
  syncBwSelectorVisibility({forceOpen:basementWallShowsSelector(wallAssembly?.value)});
  if(faAssembly?.value) loadFaFromAssembly(faAssembly.value);
  refreshWallAssembly(wallAssembly?.value);
  refreshFaAssembly(faAssembly?.value);
  syncCreateCodeBtn(wallAssembly?.value===BASEMENT_WALL_MODE_NEW);
  syncFaCreateCodeBtn(faAssembly?.value===FLOORS_ABOVE_MODE_NEW);
}

function captureBasementSaveSnapshot(formEl){
  if(!formEl?.querySelector("[data-basement-editor]")) return null;
  const bwLabel=formEl.querySelector('[name="bwCodeLabel"]');
  const faLabel=formEl.querySelector('[name="faCodeLabel"]');
  return {
    bwDisplayLabel:String(bwLabel?.value||"").trim(),
    bwCustomized:bwLabel?.dataset.customized==="true",
    faDisplayLabel:String(faLabel?.value||"").trim(),
    faCustomized:faLabel?.dataset.customized==="true"
  };
}

function saveBasementFromForm(n,formEl,val,ck){
  const floor=ensureChild(n,"Floor");
  const fm=ensureChild(floor,"Measurements");
  const floorConstr=ensureChild(floor,"Construction");
  const wall=ensureChild(n,"Wall");
  const wm=ensureChild(wall,"Measurements");
  const wc=ensureChild(wall,"Construction");
  const ins=ensureChild(wc,"InteriorAddedInsulation");
  const opening=ensureChild(n,"OpeningUpstairs");
  const room=ensureChild(n,"RoomType");
  const cfg=ensureChild(n,"Configuration");
  const construction=String(val("foundationConstruction")||DEFAULT_FOUNDATION_CONSTRUCTION);
  const insulation=String(val("foundationInsulation")||DEFAULT_FOUNDATION_INSULATION);
  const slabLoc=String(val("slabInsulationLocation")||DEFAULT_FOUNDATION_SLAB_LOCATION);
  const cfgType=foundationConfigLabelFor(construction);
  cfg.setAttribute("type",cfgType);
  cfg.setAttribute("subtype","4");
  cfg.setAttribute("overlap","0");
  cfg.setAttribute("data-construction",construction);
  cfg.setAttribute("data-insulation",insulation);
  cfg.setAttribute("data-slab-location",slabLoc);
  cfg.textContent=`${cfgType}_4`;
  const openingCode=String(val("openingUpstairs")||"1");
  const openingSi=openingCode==="4"?toSI(val("openingValue")||"0","area"):openingUpstairsSi(openingCode,"0");
  setCodedElement(opening,openingCode,OPENING_UPSTAIRS,{value:openingSi});
  setCodedElement(room,val("roomType")||"6",FOUNDATION_ROOM_TYPES);
  const rectangular=formEl.elements.floorShape?.value==="rectangular";
  let areaSi,perimeterSi,lengthSi="",widthSi="";
  if(rectangular){
    lengthSi=toSI(val("floorLength")||"0","length");
    widthSi=toSI(val("floorWidth")||"0","length");
    const l=Number(lengthSi),w=Number(widthSi);
    areaSi=String(num(l*w,4));perimeterSi=String(num(2*(l+w),4));
    fm.setAttribute("length",lengthSi);fm.setAttribute("width",widthSi);
  }else{
    areaSi=toSI(val("area")||"0","area");perimeterSi=toSI(val("perimeter")||"0","length");
    fm.removeAttribute("length");fm.removeAttribute("width");
  }
  fm.setAttribute("isRectangular",rectangular?"true":"false");
  fm.setAttribute("area",areaSi);fm.setAttribute("perimeter",perimeterSi);
  n.setAttribute("exposedSurfacePerimeter",perimeterSi);
  floorConstr.setAttribute("isBelowFrostline",ck("isBelowFrostline"));
  floorConstr.setAttribute("heatedFloor",ck("heatedFloor"));
  wm.setAttribute("height",toSI(val("wallHeight")||"0","length"));
  const hasPony=ck("ponyWall")==="true";
  wall.setAttribute("hasPonyWall",hasPony?"true":"false");
  let depthDisplay=val("depth");
  if(hasPony){
    const ponyAboveGrade=unitMode==="imperial"?0.5:num(0.5/3.280839895,4);
    const total=Number(val("wallHeight")||0),ponyH=Number(val("ponyWallHeight")||0);
    const calc=num(total-ponyH-ponyAboveGrade,3);
    if(!(total>0)||!Number.isFinite(ponyH)||calc<0){
      toast(`Depth Below Grade must equal Total Height − Pony Wall Height − ${ponyAboveGrade} ${unitLabel("length")}.`);
      return false;
    }
    depthDisplay=String(calc);
    wm.setAttribute("ponyWallHeight",toSI(val("ponyWallHeight")||"0","length"));
  }else wm.setAttribute("ponyWallHeight","0");
  wm.setAttribute("depth",toSI(depthDisplay||"0","length"));
  wc.setAttribute("corners",sanitizeWholeNumber(val("wallCorners"),"14"));
  const lintelsText=String(val("wallLintels")||"").trim();
  const lintelsEl=ensureChild(wc,"Lintels");
  lintelsEl.textContent=lintelsText;
  const lintelRef=resolveLintelIdref(lintelsText);
  if(lintelRef) lintelsEl.setAttribute("idref",lintelRef);
  else lintelsEl.removeAttribute("idref");
  let wallAssembly=String(val("interiorInsulation")||"");
  const bwDisplay=String(val("bwCodeLabel")||"").trim();
  const bwNumeric=String(val("bwCodeValue")||buildBasementWallCodeLabel({
    framing:val("bwFraming"),spacing:val("bwSpacing"),studs:val("bwStuds"),
    framingInsulation:val("bwFramingIns"),extraInsulation:val("bwExtraIns"),interior:val("bwInterior")
  })).trim();
  const bwNominal=toRsiValue(val("interiorInsulationR")||"0");
  const bwCustomized=formEl.querySelector('[name="bwCodeLabel"]')?.dataset.customized==="true";
  if(shouldPersistBasementWallCode(wallAssembly,bwDisplay)||formEl.querySelector('[name="bwSaveFavourite"]')?.checked||bwCustomized){
    const codeNode=createOrUpdateBasementWallCode({
      id:wallAssembly===BASEMENT_WALL_MODE_NEW?null:wallAssembly,
      displayLabel:bwDisplay||bwNumeric,
      codeValue:bwNumeric,
      nominal:bwNominal,
      framing:val("bwFraming"),spacing:val("bwSpacing"),studs:val("bwStuds"),
      framingInsulation:val("bwFramingIns"),extraInsulation:val("bwExtraIns"),interior:val("bwInterior")
    });
    wallAssembly=codeNode.getAttribute("id");
    if(formEl.querySelector('[name="bwSaveFavourite"]')?.checked) saveBasementWallFavourite(wallAssembly,bwDisplay||bwNumeric);
  }
  if(wallAssembly&&wallAssembly!==BASEMENT_WALL_MODE_NEW){
    ins.setAttribute("idref",wallAssembly);
    ins.setAttribute("nominalInsulation",String(bwNominal));
    const d=ensureChild(ins,"Description");d.textContent=bwNumeric;
    const comp=ensureChild(ins,"Composite");
    comp.replaceChildren();
    [1,2,3].forEach(rank=>{
      const pct=Number(val(`compPct${rank}`)||0);
      const rDisp=Number(val(`compR${rank}`)||0);
      if(pct<=0) return;
      const sec=xmlDoc.createElement("Section");
      sec.setAttribute("rank",String(rank));
      sec.setAttribute("percentage",String(pct));
      const rsi=toRsiValue(String(rDisp));
      sec.setAttribute("rsi",rsi);sec.setAttribute("nominalRsi",rsi);
      comp.appendChild(sec);
    });
    if(!comp.children.length){
      const sec=xmlDoc.createElement("Section");
      sec.setAttribute("rank","1");sec.setAttribute("percentage","100");
      sec.setAttribute("rsi",String(bwNominal));sec.setAttribute("nominalRsi",String(bwNominal));
      comp.appendChild(sec);
    }
  }
  const addedSlab=ensureChild(floorConstr,"AddedToSlab");
  const slabKey=String(val("slabInsulation")||"user");
  const slabRec=SLAB_INSULATION[slabKey]||SLAB_INSULATION.user;
  addedSlab.textContent=slabKey==="user"?"User specified":slabRec[0];
  const slabRsi=toRsi5(val("slabRValue")||"0");
  addedSlab.setAttribute("rValue",slabRsi);
  addedSlab.setAttribute("nominalInsulation",slabRsi);
  const floorsAboveEl=ensureChild(floorConstr,"FloorsAbove");
  let faAssembly=String(val("floorsAbove")||FLOORS_ABOVE_MODE_USER);
  const faDisplay=String(val("faCodeLabel")||"").trim();
  const faNumeric=String(val("faCodeValue")||buildFloorsAboveCodeLabel({
    structureType:val("faStructure"),componentSize:val("faSize"),spacing:val("faSpacing"),
    insulation1:val("faIns1"),insulation2:val("faIns2"),interior:val("faInterior"),
    sheathing:val("faSheathing"),exterior:val("faExterior"),dropFraming:val("faDrop")
  })).trim();
  const faNominal=toRsi5(val("floorsAboveR")||"0");
  if(faAssembly===FLOORS_ABOVE_MODE_NEW||formEl.querySelector('[name="faSaveFavourite"]')?.checked){
    const codeNode=createOrUpdateFloorsAboveCode({
      id:faAssembly===FLOORS_ABOVE_MODE_NEW?null:faAssembly,
      displayLabel:faDisplay||faNumeric,
      codeValue:faNumeric,
      nominal:faNominal,
      structureType:val("faStructure"),componentSize:val("faSize"),spacing:val("faSpacing"),
      insulation1:val("faIns1"),insulation2:val("faIns2"),interior:val("faInterior"),
      sheathing:val("faSheathing"),exterior:val("faExterior"),dropFraming:val("faDrop")
    });
    faAssembly=codeNode.getAttribute("id");
    if(formEl.querySelector('[name="faSaveFavourite"]')?.checked) saveFloorsAboveFavourite(faAssembly,faDisplay||faNumeric);
  }
  if(faAssembly===FLOORS_ABOVE_MODE_USER){
    floorsAboveEl.removeAttribute("idref");
    floorsAboveEl.textContent="User specified";
    floorsAboveEl.setAttribute("rValue",faNominal);
    floorsAboveEl.setAttribute("nominalInsulation",faNominal);
  }else if(faAssembly){
    floorsAboveEl.setAttribute("idref",faAssembly);
    floorsAboveEl.textContent=faDisplay||faNumeric;
    floorsAboveEl.setAttribute("rValue",faNominal);
    floorsAboveEl.setAttribute("nominalInsulation",faNominal);
  }
  return true;
}

window.bindBasementEditor=bindBasementEditor;
window.captureBasementSaveSnapshot=captureBasementSaveSnapshot;
window.saveBasementFromForm=saveBasementFromForm;
window.applyFoundationInsulationDefaults=applyFoundationInsulationDefaults;
window.foundationDiagramSVG=foundationDiagramSVG;
window.readFoundationConfig=readFoundationConfig;
})();
