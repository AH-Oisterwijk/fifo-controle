'use strict';

let pendingFormsUrl = '';

function formatDateTime(d){
  return d.toLocaleString('nl-NL',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function buildScoreFromSelection(afdeling){
  if(isDepartmentNotFilled(afdeling)) return '0/0';
  const items = selection.filter(p => p.Afdeling === afdeling);
  const meetellend = items.filter(p => p.Status !== 'Niet gevuld');
  const correct = meetellend.filter(p => p.Status === 'Goed');
  return `${correct.length}/${meetellend.length}`;
}

function buildAfdelingStatussen(){
  const out = {};
  departmentOrder.forEach(afdeling => {
    out[afdeling] = {
      Status: isDepartmentNotFilled(afdeling) ? 'Niet gevuld vandaag' : 'Gevuld',
      Score: buildScoreFromSelection(afdeling)
    };
  });
  return out;
}

function buildCombinedWarnings(dayKey, leader){
  const groups = new Map();

  selection
    .filter(x => x.Status === 'Fout' && x.MedewerkerAanspreken && x.MedewerkerNaam)
    .forEach(x => {
      const naamMedewerker = String(x.MedewerkerNaam || '').trim();
      const key = norm(naamMedewerker);
      if(!key) return;

      if(!groups.has(key)){
        groups.set(key, {
          DatumGegeven: dayKey,
          NaamMedewerker: naamMedewerker,
          Reden: 'Niet FIFO',
          Officieel: 'Nee',
          ShiftleiderManager: leader,
          Producten: []
        });
      }

      const group = groups.get(key);
      const product = `${x.Productnaam || 'Onbekend product'} (${x.Nasa || '-'})`;
      if(!group.Producten.includes(product)) group.Producten.push(product);
    });

  return Array.from(groups.values()).map(group => ({
    DatumGegeven: group.DatumGegeven,
    NaamMedewerker: group.NaamMedewerker,
    Reden: group.Reden,
    Officieel: group.Officieel,
    ShiftleiderManager: group.ShiftleiderManager,
    Opmerkingen: group.Producten.join('; ')
  }));
}

function buildLogRecord(){
  const leader = document.getElementById('leader').value || '';
  const dayKey = document.getElementById('dateInput').value || todayKey();
  const done = selection.filter(x=>x.Status && x.Status!=='Open').length;
  const goed = selection.filter(x=>x.Status==='Goed').length;
  const fout = selection.filter(x=>x.Status==='Fout').length;
  const niet = selection.filter(x=>x.Status==='Niet gevuld').length;
  return {
    DatumTijd: formatDateTime(new Date()),
    DagKey: dayKey,
    Shiftleider: leader,
    AantalTotaal: selection.length,
    AantalAfgerond: done,
    AantalGoed: goed,
    AantalFout: fout,
    AantalNietGevuld: niet,
    Scores: {
      'Zuivel': buildScoreFromSelection('Zuivel'),
      'Kaas/Vleeswaren': buildScoreFromSelection('Kaas/Vleeswaren'),
      'Vlees/Vis/Kip/Vega': buildScoreFromSelection('Vlees/Vis/Kip/Vega'),
      'Maaltijden/Sappen': buildScoreFromSelection('Maaltijden/Sappen'),
      'Panklaar': buildScoreFromSelection('Panklaar')
    },
    AfdelingStatussen: buildAfdelingStatussen(),
    AfdelingenNietGevuld: departmentOrder.filter(isDepartmentNotFilled),
    NietGevuldGroepen: getNotFilledGroups(),
    Producten: selection.map(x=>({
      Subafdeling:x.Subafdeling,
      Afdeling:x.Afdeling,
      Nasa:x.Nasa,
      OrigineelNasa:x.OrigineelNasa || '',
      AangepastNasa: !!x.AangepastNasa,
      Productnaam:x.Productnaam,
      OrigineleProductnaam:x.OrigineleProductnaam || '',
      Status:x.Status,
      MedewerkerAanspreken: !!x.MedewerkerAanspreken,
      MedewerkerNaam: x.MedewerkerNaam || '',
      AfdelingNietGevuld: isItemNotFilledByToggle(x)
    })),
    Waarschuwingen: buildCombinedWarnings(dayKey, leader)
  };
}

function encodeAfdelingCode(afdeling){
  const value = String(afdeling || '');
  if(value === 'Zuivel') return 'Z';
  if(value === 'Kaas/Vleeswaren') return 'K';
  if(value === 'Vlees/Vis/Kip/Vega') return 'V';
  if(value === 'Maaltijden/Sappen') return 'M';
  if(value === 'Panklaar') return 'P';
  return value;
}

function encodeStatusCode(status, afdelingNietGevuld){
  if(afdelingNietGevuld) return 'A';
  const value = String(status || '');
  if(value === 'Goed') return 'G';
  if(value === 'Fout') return 'F';
  if(value === 'Niet gevuld') return 'N';
  return value;
}

function compactScores(scores){
  const out = {};
  Object.entries(scores || {}).forEach(([afdeling, score]) => {
    out[encodeAfdelingCode(afdeling)] = String(score || '');
  });
  return out;
}

function compactAfdelingStatussen(statussen){
  const out = {};
  Object.entries(statussen || {}).forEach(([afdeling, value]) => {
    out[encodeAfdelingCode(afdeling)] = value && value.Status === 'Niet gevuld vandaag' ? 'N' : 'G';
  });
  return out;
}

function buildFormsRecord(record){
  return {
    v: 3,
    d: record.DagKey,
    dt: record.DatumTijd,
    s: record.Shiftleider,
    sc: compactScores(record.Scores),
    st: compactAfdelingStatussen(record.AfdelingStatussen),
    ng: (record.AfdelingenNietGevuld || []).map(encodeAfdelingCode),
    p: (record.Producten || []).map(p => [
      encodeAfdelingCode(p.Afdeling),
      p.Nasa || '',
      encodeStatusCode(p.Status, !!p.AfdelingNietGevuld),
      p.MedewerkerNaam || '',
      p.AfdelingNietGevuld ? 1 : 0
    ]),
    w: (record.Waarschuwingen || []).map(w => [
      w.DatumGegeven || record.DagKey || '',
      w.NaamMedewerker || '',
      w.ShiftleiderManager || record.Shiftleider || '',
      w.Opmerkingen || ''
    ])
  };
}

function formatProductLine(p){
  const nasa = p.AangepastNasa && p.OrigineelNasa ? `${p.Nasa} (aangepast van ${p.OrigineelNasa})` : p.Nasa;
  const name = p.AangepastNasa && p.OrigineleProductnaam ? `${p.Productnaam} (oorspronkelijk: ${p.OrigineleProductnaam})` : p.Productnaam;
  const warning = p.MedewerkerAanspreken && p.MedewerkerNaam ? ` | medewerker aanspreken: ${p.MedewerkerNaam}` : '';
  return `${p.Subafdeling} | ${nasa} | ${name} | ${p.Status || 'Open'}${warning}`;
}

function buildSummary(record){
  const lines = [];
  lines.push(`FIFO Controle`);
  lines.push(`Datum: ${record.DagKey}`);
  lines.push(`Shiftleider: ${record.Shiftleider || '-'}`);
  lines.push(`Voortgang: ${record.AantalAfgerond}/${record.AantalTotaal}`);
  lines.push(`Goed: ${record.AantalGoed} | Fout: ${record.AantalFout} | Niet gevuld: ${record.AantalNietGevuld}`);
  lines.push(`Waarschuwingen: ${record.Waarschuwingen.length}`);
  lines.push('');
  for(const p of record.Producten){
    lines.push(formatProductLine(p));
  }
  return lines.join('\n');
}

function departmentItems(record, afdeling){
  return record.Producten.filter(p => p.Afdeling === afdeling);
}

function buildDepartmentText(record, afdeling){
  const state = record.AfdelingStatussen && record.AfdelingStatussen[afdeling];
  if(state && state.Status === 'Niet gevuld vandaag') return `${afdeling}: niet gevuld vandaag`;
  return `${afdeling}: ${buildDepartmentScore(record, afdeling)}`;
}

function buildDepartmentScore(record, afdeling){
  const state = record.AfdelingStatussen && record.AfdelingStatussen[afdeling];
  if(state && state.Status === 'Niet gevuld vandaag') return '0/0';
  const items = departmentItems(record, afdeling);
  const meetellend = items.filter(p => p.Status !== 'Niet gevuld');
  const correct = meetellend.filter(p => p.Status === 'Goed');
  return `${correct.length}/${meetellend.length}`;
}

function departmentNasa(record, afdeling, index){
  const item = departmentItems(record, afdeling)[index - 1];
  return item ? item.Nasa : '';
}

function departmentCounts(record, afdeling){
  const items = record.Producten.filter(p => p.Afdeling === afdeling);
  return {
    correct: items.filter(p => p.Status === 'Goed').length,
    fout: items.filter(p => p.Status === 'Fout').length,
    nietGevuld: items.filter(p => p.Status === 'Niet gevuld').length,
    open: items.filter(p => !p.Status || p.Status === 'Open').length,
    totaal: items.length
  };
}

function configuredFormsUrl(){
  return (window.FIFO_FORMS_URL_TEMPLATE || '').trim();
}

function hasFormsConfig(){
  return !!configuredFormsUrl();
}

function makeFormsUrl(record){
  const template = configuredFormsUrl();
  if(!template) return '';

  const payload = 'FIFO_JSON:' + JSON.stringify(buildFormsRecord(record));
  const encodedPayload = encodeURIComponent(payload);
  const encodedDateForForms = encodeURIComponent(`"${record.DagKey || ''}"`);

  let url = template;

  // Datumveld in Microsoft Forms gebruikt in prefilled links meestal quotes:
  // "2026-01-02" wordt dan %222026-01-02%22.
  url = url.split('%22__DATUM__%22').join(encodedDateForForms);
  url = url.split('"__DATUM__"').join(encodedDateForForms);
  url = url.split('__DATUM__').join(encodedDateForForms);

  // Controle data wordt als gewone tekst meegestuurd.
  // FIFO_JSON: voorkomt dat Microsoft Forms de JSON als object behandelt.
  url = url.split('__CONTROLE_DATA__').join(encodedPayload);
  url = url.split('__JSON__').join(encodedPayload);

  return url;
}

function prepareSubmitPage(record, formsUrl, errorMessage){
  document.getElementById('controlPage').classList.add('fifo-hidden');
  document.getElementById('submitPage').classList.remove('fifo-hidden');

  const summaryLines = [];
  summaryLines.push(`Shiftleider: ${record.Shiftleider}`);
  summaryLines.push(`Datum+tijd: ${record.DatumTijd}`);
  summaryLines.push(`Voortgang: ${record.AantalAfgerond}/${record.AantalTotaal}`);
  summaryLines.push(`Goed: ${record.AantalGoed} | Fout: ${record.AantalFout} | Niet gevuld: ${record.AantalNietGevuld}`);
  summaryLines.push('');
  summaryLines.push('Afdelingen:');
  summaryLines.push(buildDepartmentText(record, 'Zuivel').split('\n')[0]);
  summaryLines.push(buildDepartmentText(record, 'Kaas/Vleeswaren').split('\n')[0]);
  summaryLines.push(buildDepartmentText(record, 'Vlees/Vis/Kip/Vega').split('\n')[0]);
  summaryLines.push(buildDepartmentText(record, 'Maaltijden/Sappen').split('\n')[0]);
  summaryLines.push(buildDepartmentText(record, 'Panklaar').split('\n')[0]);
  document.getElementById('submitSummary').textContent = summaryLines.join('\n');

  const err = document.getElementById('submitError');
  if(errorMessage){
    pendingFormsUrl = '';
    err.textContent = errorMessage;
    err.classList.remove('fifo-hidden');
    document.getElementById('continueFormsBtn').disabled = true;
  } else {
    pendingFormsUrl = formsUrl;
    err.classList.add('fifo-hidden');
    document.getElementById('continueFormsBtn').disabled = false;
  }
}

function logToForms(){
  const leader = document.getElementById('leader').value;
  if(!leader){ alert('Kies eerst een shiftleider.'); return; }

  const missingWarningNames = selection.filter(x => x.Status === 'Fout' && x.MedewerkerAanspreken && !x.MedewerkerNaam);
  if(missingWarningNames.length){
    alert('Kies eerst een medewerker bij elke aangevinkte optie "Medewerker aanspreken".');
    return;
  }

  const open = selection.filter(x=>(!x.Status || x.Status==='Open') && !isItemNotFilledByToggle(x)).length;
  if(open && !confirm(`Er staan nog ${open} producten open. Toch opslaan?`)) return;

  const record = buildLogRecord();
  const template = configuredFormsUrl();

  if(!template){
    prepareSubmitPage(record, '', 'De Microsoft Forms-koppeling ontbreekt nog. Plak eerst de prefilled Forms-link in config.js en upload die opnieuw.');
    window.scrollTo({top:0, behavior:'smooth'});
    return;
  }

  const url = makeFormsUrl(record);
  prepareSubmitPage(record, url, '');
  window.location.href = url;
}

function continueToForms(){
  if(!pendingFormsUrl){
    alert('Er is nog geen Forms-link klaargezet.');
    return;
  }
  window.location.href = pendingFormsUrl;
}

function backToControl(){
  document.getElementById('submitPage').classList.add('fifo-hidden');
  document.getElementById('controlPage').classList.remove('fifo-hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function copySummary(){
  const record = buildLogRecord();
  const txt = buildSummary(record) + '\n\n---JSON---\n' + JSON.stringify(record);
  try{
    await navigator.clipboard.writeText(txt);
    alert('Samenvatting gekopieerd.');
  } catch(e){
    alert(txt);
  }
}
