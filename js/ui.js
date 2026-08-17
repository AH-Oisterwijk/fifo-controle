'use strict';

function render(){
  const groups = departmentOrder.map(a=>({afdeling:a,items:selection.filter(x=>x.Afdeling===a)})).filter(g=>g.items.length);
  const warningHtml = selectionWarnings.length ? `<section class="fifo-message fifo-error"><strong>Let op:</strong> ${selectionWarnings.map(esc).join(' · ')}</section>` : '';
  document.getElementById('content').innerHTML = warningHtml + groups.map(g=>renderGroup(g.afdeling,g.items)).join('');
  document.querySelectorAll('.fifo-product-card button').forEach(btn=>btn.addEventListener('click',handleClick));
  document.querySelectorAll('.fifo-warning-check').forEach(el=>el.addEventListener('change',handleWarningChange));
  document.querySelectorAll('.fifo-medewerker-select').forEach(el=>el.addEventListener('change',handleWarningChange));
  document.querySelectorAll('.fifo-dept-toggle').forEach(el=>el.addEventListener('change',handleDepartmentToggle));
  updateProgress();
}

function itemsForDisplay(afdeling, items){
  if(afdeling !== 'Vlees/Vis/Kip/Vega') return items;

  const order = {'Vis':0, 'Kip':1, 'Vlees/Vega':2};
  return [...items].sort((a,b) => {
    const aOrder = order[selectionGroupForItem(a)] ?? 99;
    const bOrder = order[selectionGroupForItem(b)] ?? 99;
    if(aOrder !== bOrder) return aOrder - bOrder;
    return (Number(a.Volgorde) || Number(a.Id) || 0) - (Number(b.Volgorde) || Number(b.Id) || 0);
  });
}

function renderGroup(afdeling,items){
  const done = items.filter(x=>x.Status && x.Status !== 'Open').length;
  const groupKeys = fillGroupKeysForDepartment(afdeling);
  const controls = groupKeys.length > 1
    ? renderCombinedFillControl(afdeling, groupKeys)
    : renderFillControl(groupKeys[0], afdeling);
  const displayItems = itemsForDisplay(afdeling, items);

  return `<section class="fifo-group" data-afdeling="${esc(afdeling)}">
    <div class="fifo-group-title"><h2>${esc(afdeling)}</h2><span>${done}/${items.length}</span></div>
    <div class="fifo-dept-control-list">${controls}</div>
    <div class="fifo-grid">${displayItems.map(item => renderCard(item, isItemNotFilledByToggle(item))).join('')}</div>
  </section>`;
}

function renderFillControl(groupKey, afdeling){
  const notFilled = isFillGroupNotFilled(groupKey);
  const checked = notFilled ? '' : 'checked';

  return `<div class="fifo-fillbar fifo-fillbar-single">
    <div>
      <strong>${esc(afdeling)} gevuld?</strong>
      <small>Vink aan als dit vandaag gevuld is.</small>
    </div>
    <div class="fifo-check-options">
      <label class="fifo-check-option" title="Vink aan als ${esc(groupKey)} vandaag gevuld is">
        <input class="fifo-dept-toggle" type="checkbox" data-afdeling="${esc(groupKey)}" ${checked}>
        <span>${esc(groupKey)}</span>
      </label>
    </div>
  </div>`;
}

function renderCombinedFillControl(afdeling, groupKeys){
  const options = groupKeys.map(key => {
    const notFilled = isFillGroupNotFilled(key);
    const checked = notFilled ? '' : 'checked';
    return `<label class="fifo-check-option" title="Vink aan als ${esc(key)} vandaag gevuld is">
      <input class="fifo-dept-toggle" type="checkbox" data-afdeling="${esc(key)}" ${checked}>
      <span>${esc(key)}</span>
    </label>`;
  }).join('');

  return `<div class="fifo-fillbar">
    <div>
      <strong>${esc(afdeling)} gevuld?</strong>
      <small>Vink de subafdelingen aan die vandaag gevuld zijn.</small>
    </div>
    <div class="fifo-check-options">${options}</div>
  </div>`;
}

function renderCard(item, groupNotFilled=false){
  const cls = item.Status==='Goed'?'fifo-is-good':item.Status==='Fout'?'fifo-is-bad':item.Status==='Niet gevuld'?'fifo-is-empty':'fifo-is-open';
  const disabled = groupNotFilled ? 'disabled' : '';
  const statusText = groupNotFilled ? 'Niet gevuld vandaag' : (item.Status || 'Open');
  const goedSelected = item.Status === 'Goed' ? 'fifo-action-selected' : '';
  const foutSelected = item.Status === 'Fout' ? 'fifo-action-selected' : '';
  return `<article class="fifo-product-card ${cls}" data-id="${item.Id}">
    <div class="fifo-card-top"><span class="fifo-sub">${esc(selectionGroupForItem(item))}</span><span class="fifo-status-pill">${esc(statusText)}</span></div>
    <h3>${esc(item.Productnaam)}</h3>
    <div class="fifo-nasa-row"><span>Nasa</span><strong>${esc(item.Nasa)}</strong></div>
    <div class="fifo-product-tools">
      <button data-action="RandomProduct" ${disabled}>Ander willekeurig product</button>
      <button data-action="ChooseProduct" ${disabled}>Zelf een product kiezen</button>
    </div>
    <div class="fifo-nasa-edit ${item.EditingNasa?'':'fifo-hidden'}">
      <label>Zelf gekozen Nasa-nummer</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(item.Nasa)}" aria-label="Zelf gekozen Nasa-nummer">
      <div class="fifo-nasa-edit-actions">
        <button data-action="SaveNasa">Opslaan Nasa</button>
        <button data-action="CancelNasa">Annuleren</button>
      </div>
    </div>
    <div class="fifo-qr">${qrSvg(item.Nasa)}</div>
    <div class="fifo-actions">
      <button class="${goedSelected}" data-action="Goed" ${disabled}>Goed</button><button class="${foutSelected}" data-action="Fout" ${disabled}>Fout</button><!-- <button data-action="Niet gevuld">Niet gevuld</button> -->
    </div>
    ${renderWarningPanel(item)}
  </article>`;
}

function renderWarningPanel(item){
  if(item.Status !== 'Fout') return '';
  const checked = item.MedewerkerAanspreken ? 'checked' : '';
  const disabled = item.MedewerkerAanspreken ? '' : 'disabled';
  const options = ['<option value="">Kies medewerker</option>']
    .concat(medewerkers.map(name => `<option ${name === item.MedewerkerNaam ? 'selected' : ''}>${esc(name)}</option>`))
    .join('');
  return `<div class="fifo-warning-panel">
    <label><input class="fifo-warning-check" type="checkbox" ${checked}> Medewerker aanspreken</label>
    <select class="fifo-medewerker-select" ${disabled}>${options}</select>
    <div class="fifo-warning-note">Alleen aanvinken als de medewerker ook daadwerkelijk is aangesproken!</div>
  </div>`;
}

function handleClick(e){
  const btn = e.currentTarget, card = btn.closest('.fifo-product-card'), id = Number(card.dataset.id), action = btn.dataset.action;
  const item = selection.find(x=>x.Id===id);
  if(!item) return;
  if(isItemNotFilledByToggle(item)){
    alert('Dit blok staat op "Niet gevuld vandaag". Zet het eerst terug op gevuld.');
    return;
  }

  if(action==='RandomProduct'){
    pickRandomReplacement(item);
    return;
  }

  if(action==='ChooseProduct'){
    item.EditingNasa = true;
    render();
    return;
  }

  if(action==='CancelNasa'){
    delete item.EditingNasa;
    render();
    return;
  }

  if(action==='SaveNasa'){
    const input = card.querySelector('.fifo-nasa-edit input');
    const newNasa = String(input && input.value || '').replace(/\D/g,'');
    if(!newNasa){
      alert('Vul een geldig Nasa-nummer in.');
      return;
    }

    const duplicate = duplicateInSameAfdeling(newNasa, item.Afdeling, item.Id);
    if(duplicate){
      alert(`Dit Nasa-nummer staat al in een ander slot van ${item.Afdeling}. Kies een ander product.`);
      return;
    }

    const match = products.find(p => p.Actief !== false && String(p.Nasa) === newNasa);

    if(match && match.Afdeling !== item.Afdeling){
      alert(`Dit product hoort bij ${match.Afdeling}, niet bij ${item.Afdeling}. Kies een product binnen hetzelfde blok of voer een ander Nasa-nummer handmatig in.`);
      return;
    }

    if(newNasa !== item.Nasa){
      if(match){
        setItemProduct(item, match, 'Handmatig');
      } else {
        if(!item.OrigineelNasa) item.OrigineelNasa = item.Nasa;
        if(!item.OrigineleProductnaam) item.OrigineleProductnaam = item.Productnaam;

        item.Nasa = newNasa;
        item.Productnaam = 'Handmatig gekozen product';
        item.AangepastNasa = true;
        item.AanpassingType = 'Handmatig';
        item.Status = 'Open';
        item.TijdGecheckt = '';
        item.Shiftleider = '';
        item.MedewerkerAanspreken = false;
        item.MedewerkerNaam = '';
      }
    }
    delete item.EditingNasa;
    saveSelection();
    render();
    return;
  }

  const leader = document.getElementById('leader').value;
  if(!leader){ alert('Kies eerst een shiftleider.'); return; }

  item.Status = action;
  item.Shiftleider = leader;
  item.TijdGecheckt = new Date().toISOString();

  if(action !== 'Fout'){
    item.MedewerkerAanspreken = false;
    item.MedewerkerNaam = '';
  } else {
    item.MedewerkerAanspreken = !!item.MedewerkerAanspreken;
    item.MedewerkerNaam = item.MedewerkerNaam || '';
  }

  saveSelection();
  render();
}

function handleWarningChange(e){
  const card = e.currentTarget.closest('.fifo-product-card');
  const id = Number(card.dataset.id);
  const item = selection.find(x=>x.Id===id);
  if(!item) return;

  const check = card.querySelector('.fifo-warning-check');
  const select = card.querySelector('.fifo-medewerker-select');

  item.MedewerkerAanspreken = !!(check && check.checked);
  item.MedewerkerNaam = item.MedewerkerAanspreken && select ? select.value : '';

  saveSelection();
  render();
}

function handleDepartmentToggle(e){
  const groupKey = e.currentTarget.dataset.afdeling;
  const notFilled = !e.currentTarget.checked;
  if(notFilled){
    if(!confirm(`${groupKey} markeren als niet gevuld vandaag? Productstatussen en eventuele medewerker-aanspreken keuzes binnen dit blok worden gewist.`)){
      e.currentTarget.checked = true;
      return;
    }
  }
  setDepartmentNotFilled(groupKey, notFilled);
}

function updateProgress(){
  const total=selection.length||17, done=selection.filter(x=>x.Status && x.Status!=='Open').length;
  document.getElementById('progressText').textContent=`${done}/${total}`;
  document.getElementById('progressBar').style.width=`${Math.round(done/total*100)}%`;
  const goed=selection.filter(x=>x.Status==='Goed').length, fout=selection.filter(x=>x.Status==='Fout').length, niet=selection.filter(x=>x.Status==='Niet gevuld').length;
  document.getElementById('stats').innerHTML=`<span>Goed: <strong>${goed}</strong></span><span>Fout: <strong>${fout}</strong></span><span>Niet gevuld: <strong>${niet}</strong></span>`;
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
