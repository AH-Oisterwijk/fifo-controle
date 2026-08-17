'use strict';

let selection = [];
let departmentStates = defaultDepartmentStates();
let selectionWarnings = [];
const departmentOrder = ['Zuivel','Kaas/Vleeswaren','Vlees/Vis/Kip/Vega','Maaltijden/Sappen','Panklaar'];

const subdepartmentFillGroups = {
  'Zuivel': ['Zuivel','Boter'],
  'Vlees/Vis/Kip/Vega': ['Vlees/Vega','Vis','Kip'],
  'Maaltijden/Sappen': ['Maaltijden','Sappen']
};

function fillGroupKeysForDepartment(afdeling){
  return subdepartmentFillGroups[afdeling] || [afdeling];
}

function selectionGroupForItem(item){
  const explicit = String(item && item.Selectiegroep || '').trim();
  if(explicit) return explicit;

  const subafdeling = String(item && item.Subafdeling || '').trim();
  if(['Vlees','Vega'].some(key => norm(key) === norm(subafdeling))) return 'Vlees/Vega';
  return subafdeling || String(item && item.Afdeling || '').trim();
}

function itemFillGroupKey(item){
  const keys = fillGroupKeysForDepartment(item.Afdeling);
  const selectionGroup = selectionGroupForItem(item);
  const match = keys.find(key => norm(key) === norm(selectionGroup));
  return match || item.Afdeling;
}

function isFillGroupNotFilled(groupKey){
  return departmentStates && departmentStates[groupKey] === 'Niet gevuld vandaag';
}

function isItemNotFilledByToggle(item){
  return isFillGroupNotFilled(itemFillGroupKey(item));
}

function getNotFilledGroups(){
  return Object.keys(departmentStates || {}).filter(key => departmentStates[key] === 'Niet gevuld vandaag');
}

function migrateDepartmentStates(){
  const zuivelState = departmentStates['Zuivel'];
  if(zuivelState === 'Niet gevuld vandaag' && !departmentStates['Boter']){
    ['Zuivel','Boter'].forEach(key => departmentStates[key] = 'Niet gevuld vandaag');
  }

  const vleesState = departmentStates['Vlees/Vis/Kip/Vega'];
  if(vleesState === 'Niet gevuld vandaag'){
    ['Vlees/Vega','Vis','Kip'].forEach(key => departmentStates[key] = 'Niet gevuld vandaag');
  }

  if(!departmentStates['Vlees/Vega']){
    const oudVlees = departmentStates['Vlees'];
    const oudVega = departmentStates['Vega'];
    departmentStates['Vlees/Vega'] =
      oudVlees === 'Niet gevuld vandaag' && oudVega === 'Niet gevuld vandaag'
        ? 'Niet gevuld vandaag'
        : 'Gevuld';
  }
  delete departmentStates['Vlees'];
  delete departmentStates['Vega'];

  const maaltijdState = departmentStates['Maaltijden/Sappen'];
  if(maaltijdState === 'Niet gevuld vandaag'){
    ['Maaltijden','Sappen'].forEach(key => departmentStates[key] = 'Niet gevuld vandaag');
  }
}

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n){return n<10?'0'+n:String(n)}

function defaultDepartmentStates(){
  return {
    'Zuivel':'Gevuld',
    'Boter':'Gevuld',
    'Kaas/Vleeswaren':'Gevuld',
    'Vlees/Vega':'Gevuld',
    'Vis':'Gevuld',
    'Kip':'Gevuld',
    'Maaltijden':'Gevuld',
    'Sappen':'Gevuld',
    'Panklaar':'Gevuld'
  };
}

function isDepartmentNotFilled(afdeling){
  const keys = fillGroupKeysForDepartment(afdeling);
  return keys.length > 0 && keys.every(isFillGroupNotFilled);
}

function setDepartmentNotFilled(groupKey, notFilled){
  departmentStates[groupKey] = notFilled ? 'Niet gevuld vandaag' : 'Gevuld';

  selection
    .filter(item => itemFillGroupKey(item) === groupKey)
    .forEach(item => {
      if(notFilled){
        item.Status = 'Niet gevuld';
        item.Shiftleider = '';
        item.TijdGecheckt = '';
        item.MedewerkerAanspreken = false;
        item.MedewerkerNaam = '';
        delete item.EditingNasa;
      } else if(item.Status === 'Niet gevuld'){
        item.Status = 'Open';
        item.Shiftleider = '';
        item.TijdGecheckt = '';
      }
    });

  saveSelection();
  render();
}

function selectionStorageKey(dayKey){
  return 'fifo_controle_selection_' + productsVersion + '_' + dayKey;
}

function loadDay(dayKey){
  if(!productsCsvLoaded){
    showDataFilesError('CSV-data is nog niet geladen.');
    return;
  }
  selectionWarnings = [];
  const key = selectionStorageKey(dayKey);
  const saved = localStorage.getItem(key);
  if(saved){
    const parsed = JSON.parse(saved);
    if(Array.isArray(parsed)){
      selection = parsed;
      departmentStates = defaultDepartmentStates();
    } else {
      selection = parsed.selection || [];
      departmentStates = Object.assign(defaultDepartmentStates(), parsed.departmentStates || {});
      migrateDepartmentStates();
    }
    migrateSelectionGroups();
    validateCurrentPools();
  }
  else {
    selection = generateSelection(dayKey);
    departmentStates = defaultDepartmentStates();
    migrateDepartmentStates();
    saveSelection();
  }
  render();
}

function migrateSelectionGroups(){
  selection.forEach(item => {
    if(['Vlees','Vega'].some(key => norm(key) === norm(item.Subafdeling))){
      item.Selectiegroep = 'Vlees/Vega';
    }
  });
}

function sourceSubdepartmentsForSelectionGroup(groupKey){
  if(norm(groupKey) === norm('Vlees/Vega')) return ['Vlees','Vega'];
  return [groupKey];
}

function productsForSelectionGroup(groupKey){
  const sources = sourceSubdepartmentsForSelectionGroup(groupKey).map(norm);
  return products.filter(p => p.Actief !== false && sources.includes(norm(p.Subafdeling)));
}

function validateCurrentPools(){
  subCounts.forEach(rule=>{
    const pool = productsForSelectionGroup(rule.subafdeling);
    if(pool.length < rule.count){
      selectionWarnings.push(`${rule.subafdeling}: ${pool.length}/${rule.count} actieve producten in products.csv`);
    }
  });
}

function generateSelection(dayKey){
  let output = [], volgorde = 1;
  selectionWarnings = [];
  subCounts.forEach(rule=>{
    const pool = productsForSelectionGroup(rule.subafdeling);
    if(pool.length < rule.count){
      selectionWarnings.push(`${rule.subafdeling}: ${pool.length}/${rule.count} actieve producten in products.csv`);
    }
    pickWeighted(pool, rule.count, `${dayKey}-${rule.subafdeling}`).forEach(p=>{
      output.push({Id:volgorde,DagKey:dayKey,Nasa:p.Nasa,Productnaam:p.Productnaam,Afdeling:rule.afdeling,Subafdeling:p.Subafdeling,Selectiegroep:rule.subafdeling,Volgorde:volgorde++,Status:'Open',Shiftleider:'',TijdGecheckt:''});
    });
  });
  return output;
}

function productWeight(product){
  return Math.max(1, Number(product && product.Gewicht || 1));
}

function weightedScore(random, weight){
  const r = Math.max(0.000001, Math.min(0.999999, Number(random) || 0.000001));
  return -Math.log(r) / Math.max(1, weight);
}

function pickWeighted(pool,count,seed){
  return pool.map(p=>{
    const weight = productWeight(p);
    const random = seededRandom(`${seed}-${p.Nasa}`);
    return {p, score: weightedScore(random, weight)};
  }).sort((a,b)=>a.score-b.score).slice(0,count).map(x=>x.p);
}

function pickWeightedRandomOne(pool){
  const total = pool.reduce((sum,p)=>sum + productWeight(p), 0);
  if(total <= 0) return pool[Math.floor(Math.random() * pool.length)];
  let r = Math.random() * total;
  for(const product of pool){
    r -= productWeight(product);
    if(r <= 0) return product;
  }
  return pool[pool.length - 1];
}

function seededRandom(seed){
  let h=2166136261;
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return ((h>>>0)%1000000)/1000000;
}

function saveSelection(){
  localStorage.setItem(selectionStorageKey(document.getElementById('dateInput').value), JSON.stringify({
    selection,
    departmentStates
  }));
}

function duplicateInSameAfdeling(nasa, afdeling, exceptId){
  return selection.find(x => x.Id !== exceptId && x.Afdeling === afdeling && String(x.Nasa) === String(nasa));
}

function activeProductsForAfdeling(afdeling){
  return products.filter(p => p.Actief !== false && p.Afdeling === afdeling);
}

function activeProductsForSubafdeling(subafdeling){
  return products.filter(p => p.Actief !== false && norm(p.Subafdeling) === norm(subafdeling));
}

function setItemProduct(item, product, reason){
  if(!item.OrigineelNasa) item.OrigineelNasa = item.Nasa;
  if(!item.OrigineleProductnaam) item.OrigineleProductnaam = item.Productnaam;
  if(!Array.isArray(item.SkipHistory)) item.SkipHistory = [];

  item.Nasa = product.Nasa;
  item.Productnaam = product.Productnaam;
  item.Afdeling = product.Afdeling;
  item.Subafdeling = product.Subafdeling || item.Subafdeling;
  item.AangepastNasa = true;
  item.AanpassingType = reason || 'Handmatig';
  item.Status = 'Open';
  item.TijdGecheckt = '';
  item.Shiftleider = '';
  item.MedewerkerAanspreken = false;
  item.MedewerkerNaam = '';
  delete item.EditingNasa;
}

function pickRandomReplacement(item){
  const usedInAfdeling = new Set(selection
    .filter(x => x.Id !== item.Id && x.Afdeling === item.Afdeling)
    .map(x => String(x.Nasa)));

  let basePool = productsForSelectionGroup(selectionGroupForItem(item))
    .filter(p => p.Afdeling === item.Afdeling && p.Nasa !== item.Nasa && !usedInAfdeling.has(String(p.Nasa)));

  // Noodfallback binnen hetzelfde hoofdblok als de subafdeling te weinig alternatieven heeft.
  if(!basePool.length){
    basePool = activeProductsForAfdeling(item.Afdeling)
      .filter(p => p.Nasa !== item.Nasa && !usedInAfdeling.has(String(p.Nasa)));
  }

  if(!basePool.length){
    alert('Geen ander uniek actief product beschikbaar voor dit blok.');
    return;
  }

  if(!Array.isArray(item.SkipHistory)) item.SkipHistory = [];
  const currentNasa = String(item.Nasa || '');
  if(currentNasa && !item.SkipHistory.includes(currentNasa)) item.SkipHistory.push(currentNasa);

  let skipped = new Set(item.SkipHistory.map(String));
  let pool = basePool.filter(p => !skipped.has(String(p.Nasa)));

  // Pas weer cyclen als alle mogelijke alternatieven voor dit slot al eens geskipt zijn.
  if(!pool.length){
    item.SkipHistory = currentNasa ? [currentNasa] : [];
    skipped = new Set(item.SkipHistory.map(String));
    pool = basePool.filter(p => !skipped.has(String(p.Nasa)));
  }

  if(!pool.length){
    alert('Geen ander uniek actief product beschikbaar voor dit blok.');
    return;
  }

  const product = pickWeightedRandomOne(pool);
  setItemProduct(item, product, 'Willekeurig');
  saveSelection();
  render();
}

function resetControle(){
  if(!confirm('Weet je zeker dat je de volledige FIFO-controle wilt resetten? Alle statussen en aangepaste Nasa-nummers worden gewist.')){
    return;
  }
  const dayKey = document.getElementById('dateInput').value;
  localStorage.removeItem(selectionStorageKey(dayKey));
  selection = generateSelection(dayKey);
  departmentStates = defaultDepartmentStates();
  saveSelection();
  render();
}
