'use strict';

let leaders = [];
let medewerkers = [];
const subCounts = [
  {subafdeling:'Zuivel', afdeling:'Zuivel', count:3},
  {subafdeling:'Boter', afdeling:'Zuivel', count:1},
  {subafdeling:'Kaas/Vleeswaren', afdeling:'Kaas/Vleeswaren', count:3},
  {subafdeling:'Vis', afdeling:'Vlees/Vis/Kip/Vega', count:1},
  {subafdeling:'Vlees/Vega', afdeling:'Vlees/Vis/Kip/Vega', count:2},
  {subafdeling:'Kip', afdeling:'Vlees/Vis/Kip/Vega', count:1},
  {subafdeling:'Maaltijden', afdeling:'Maaltijden/Sappen', count:2},
  {subafdeling:'Sappen', afdeling:'Maaltijden/Sappen', count:1},
  {subafdeling:'Panklaar', afdeling:'Panklaar', count:3}
];
let products = [];
let productsVersion = 'no-products';
let productsCsvLoaded = false;

async function loadDataFiles(){
  try{
    const [productText, medewerkerText, shiftleiderText] = await Promise.all([
      fetchTextFile('data/products.csv'),
      fetchTextFile('data/medewerkers.csv'),
      fetchTextFile('data/shiftleiders.csv')
    ]);

    const parsedProducts = parseProductsCsv(productText);
    if(!parsedProducts.length) throw new Error('data/products.csv bevat geen geldige actieve productregels');

    products = parsedProducts;
    medewerkers = parseNamesCsv(medewerkerText, 'Medewerkers');
    leaders = parseNamesCsv(shiftleiderText, 'Shiftleiders / Managers');

    if(!medewerkers.length) throw new Error('data/medewerkers.csv bevat geen medewerkers');
    if(!leaders.length) throw new Error('data/shiftleiders.csv bevat geen shiftleiders/managers');

    populateLeaderDropdown();
    productsVersion = simpleHash(productText + '\n' + medewerkerText + '\n' + shiftleiderText);
    productsCsvLoaded = true;
    return true;
  }catch(e){
    products = [];
    medewerkers = [];
    leaders = [];
    productsCsvLoaded = false;
    showDataFilesError(e && e.message ? e.message : String(e));
    return false;
  }
}

async function fetchTextFile(path){
  const res = await fetch(path + '?v=' + Date.now(), {cache:'no-store'});
  if(!res.ok) throw new Error(path + ' niet gevonden of niet bereikbaar');
  return await res.text();
}

function showDataFilesError(message){
  document.getElementById('leader').innerHTML = '<option value="">Datafout</option>';
  document.getElementById('progressText').textContent = '0/0';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('stats').innerHTML = '';
  document.getElementById('content').innerHTML = `<section class="fifo-card fifo-error">
    <strong>CSV-data kon niet worden gelezen.</strong>
    <p>De app gebruikt geen ingebouwde fallback. Daardoor zie je deze fout meteen als GitHub Pages of je browser een CSV-bestand niet goed kan laden.</p>
    <p><strong>Fout:</strong> ${esc(message)}</p>
    <p>Controleer of deze bestanden bestaan: <code>data/products.csv</code>, <code>data/medewerkers.csv</code> en <code>data/shiftleiders.csv</code>.</p>
    <p>Test lokaal via <code>python3 -m http.server 8080</code> en niet via dubbelklikken op index.html.</p>
  </section>`;
}

function populateLeaderDropdown(){
  const select = document.getElementById('leader');
  const saved = localStorage.getItem('fifo_controle_leader') || '';
  select.innerHTML = '<option value="">Kies shiftleider / manager</option>' + leaders.map(name => `<option>${esc(name)}</option>`).join('');
  if(saved && leaders.includes(saved)) select.value = saved;
}

function parseNamesCsv(text, expectedColumn){
  const lines = String(text || '').split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length) return [];
  const rows = lines.map(parseCsvLine);
  const header = rows[0].map(h=>norm(h));
  const colIndex = header.indexOf(norm(expectedColumn));
  const idx = colIndex >= 0 ? colIndex : 0;
  const dataRows = colIndex >= 0 ? rows.slice(1) : rows;
  const seen = new Set();
  const names = [];
  for(const row of dataRows){
    const name = String(row[idx] || '').trim();
    if(!name) continue;
    const key = norm(name);
    if(seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((a,b)=>a.localeCompare(b,'nl'));
}

function simpleHash(text){
  let h = 2166136261;
  text = String(text || '');
  for(let i=0;i<text.length;i++){
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function parseProductsCsv(text){
  const lines = String(text || '').split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length) return [];
  const rows = lines.map(parseCsvLine);
  const header = rows[0].map(h=>norm(h));
  const hasHeader = header.includes('nasa') && header.includes('productnaam');
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const idx = (name, fallback) => hasHeader ? header.indexOf(norm(name)) : fallback;
  const iNasa=idx('Nasa',0), iName=idx('Productnaam',1), iAfd=idx('Afdeling',2), iSub=idx('Subafdeling',3), iAct=idx('Actief',4), iGew=idx('Gewicht',5), iKans=idx('Kans14',6);
  return dataRows.map((r,i)=>{
    const kans14 = Math.max(1, Math.min(14, Number(r[iKans] || 0) || 1));
    const gewicht = Math.max(1, Number(r[iGew] || 0) || (kans14 * kans14 * kans14));
    return {
      Id:i+1,
      Nasa:String(r[iNasa]||'').replace(/\D/g,''),
      Productnaam:String(r[iName]||'').trim(),
      Afdeling:String(r[iAfd]||'').trim(),
      Subafdeling:String(r[iSub]||r[iAfd]||'').trim(),
      Actief: !['nee','false','0','no'].includes(norm(r[iAct] || 'ja')),
      Gewicht: gewicht,
      Kans14: kans14
    };
  }).filter(p=>p.Nasa && p.Productnaam && p.Actief);
}

function parseCsvLine(line){
  const sep = line.includes(';') ? ';' : ',';
  const out=[]; let cur='', quote=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quote && line[i+1]==='"'){ cur+='"'; i++; }
      else quote=!quote;
    } else if(ch===sep && !quote){ out.push(cur.trim()); cur=''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim()}
