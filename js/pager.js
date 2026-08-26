'use strict';

/*
 * Beta UX experiment:
 * - startscherm met shiftleider, aantallen en gevuld/niet gevuld
 * - één product tegelijk
 * - globale terug/verder-navigatie
 * - automatische stap na Goed/Fout
 * - positie en instellingen blijven bewaard na refresh
 */

const FIFO_FLOW_SCHEMA = 2;
let fifoFlow = {
  mode: 'setup',
  useStandardCounts: true,
  counts: {},
  pendingNotFilled: {},
  currentItemId: null
};

const fifoOriginalHandleClick = handleClick;
const fifoOriginalHandleWarningChange = handleWarningChange;

function fifoFlowKey(){
  const dayKey = document.getElementById('dateInput').value || todayKey();
  return `fifo_beta_flow_${FIFO_FLOW_SCHEMA}_${dayKey}`;
}

function fifoMinimumCounts(){
  const out = {};
  subCounts.forEach(rule => out[rule.subafdeling] = rule.count);
  return out;
}

function fifoDefaultPendingNotFilled(){
  const out = {};
  subCounts.forEach(rule => out[rule.subafdeling] = isFillGroupNotFilled(rule.subafdeling));
  return out;
}

function fifoLoadFlowState(){
  const defaults = {
    mode: 'setup',
    useStandardCounts: true,
    counts: fifoMinimumCounts(),
    pendingNotFilled: fifoDefaultPendingNotFilled(),
    currentItemId: null
  };

  try{
    const raw = localStorage.getItem(fifoFlowKey());
    if(!raw){
      fifoFlow = defaults;
      return;
    }
    const saved = JSON.parse(raw);
    fifoFlow = {
      mode: ['setup','control','summary'].includes(saved.mode) ? saved.mode : 'setup',
      useStandardCounts: saved.useStandardCounts !== false,
      counts: Object.assign({}, defaults.counts, saved.counts || {}),
      pendingNotFilled: Object.assign({}, defaults.pendingNotFilled, saved.pendingNotFilled || {}),
      currentItemId: saved.currentItemId == null ? null : Number(saved.currentItemId)
    };
  }catch(_){
    fifoFlow = defaults;
  }

  subCounts.forEach(rule => {
    const min = rule.count;
    const max = fifoMaxForGroup(rule.subafdeling);
    const current = Math.max(min, Number(fifoFlow.counts[rule.subafdeling]) || min);
    fifoFlow.counts[rule.subafdeling] = Math.min(max, current);
    fifoFlow.pendingNotFilled[rule.subafdeling] = !!fifoFlow.pendingNotFilled[rule.subafdeling];
  });

  if(fifoFlow.useStandardCounts){
    fifoFlow.counts = fifoMinimumCounts();
  }
}

function fifoSaveFlowState(){
  localStorage.setItem(fifoFlowKey(), JSON.stringify(fifoFlow));
}

function fifoMaxForGroup(groupKey){
  const rule = subCounts.find(item => norm(item.subafdeling) === norm(groupKey));
  return Math.max(rule ? rule.count : 1, productsForSelectionGroup(groupKey).length);
}

function fifoSelectionItemsForGroup(groupKey){
  return selection
    .filter(item => norm(selectionGroupForItem(item)) === norm(groupKey))
    .sort((a,b) => (Number(a.Volgorde)||Number(a.Id)||0) - (Number(b.Volgorde)||Number(b.Id)||0));
}

function fifoActiveItems(){
  const result = [];
  subCounts.forEach(rule => {
    fifoSelectionItemsForGroup(rule.subafdeling)
      .filter(item => !isItemNotFilledByToggle(item))
      .forEach(item => result.push(item));
  });
  return result;
}

function fifoCurrentIndex(items){
  if(!items.length) return -1;
  const byId = items.findIndex(item => Number(item.Id) === Number(fifoFlow.currentItemId));
  if(byId >= 0) return byId;
  const firstOpen = items.findIndex(item => !item.Status || item.Status === 'Open');
  return firstOpen >= 0 ? firstOpen : 0;
}

function fifoSetCurrentByIndex(items, index){
  if(!items.length){
    fifoFlow.currentItemId = null;
    fifoSaveFlowState();
    return;
  }
  const clamped = Math.max(0, Math.min(items.length - 1, index));
  fifoFlow.currentItemId = Number(items[clamped].Id);
  fifoSaveFlowState();
}

function fifoSetupShell(mode){
  const setup = mode === 'setup';
  const header = document.getElementById('setupHeader');
  const leaderCard = document.getElementById('setupLeaderCard');
  const controlTop = document.getElementById('controlTopbar');

  header.classList.toggle('fifo-hidden', !setup);
  leaderCard.classList.toggle('fifo-hidden', !setup);
  controlTop.classList.toggle('fifo-hidden', setup);
  document.body.classList.toggle('fifo-flow-running', !setup);
  document.body.classList.toggle('fifo-flow-setup', setup);
}

function fifoRenderSetup(){
  fifoSetupShell('setup');

  const minimums = fifoMinimumCounts();
  const standardChecked = fifoFlow.useStandardCounts ? 'checked' : '';
  const rows = subCounts.map(rule => {
    const groupKey = rule.subafdeling;
    const min = minimums[groupKey];
    const max = fifoMaxForGroup(groupKey);
    const count = fifoFlow.useStandardCounts ? min : Math.max(min, Number(fifoFlow.counts[groupKey]) || min);
    const notFilled = !!fifoFlow.pendingNotFilled[groupKey];
    const countDisabled = fifoFlow.useStandardCounts || notFilled;
    const filledChecked = notFilled ? '' : 'checked';

    return `<div class="fifo-setup-row ${notFilled ? 'fifo-setup-row-notfilled' : ''}" data-group="${esc(groupKey)}">
      <div class="fifo-setup-row-name">
        <strong>${esc(groupKey)}</strong>
        <label class="fifo-setup-filled">
          <input type="checkbox" class="fifo-setup-filled-input" data-group="${esc(groupKey)}" ${filledChecked}>
          <span>${notFilled ? 'Niet gevuld' : 'Gevuld'}</span>
        </label>
      </div>
      <div class="fifo-count-control ${countDisabled ? 'fifo-count-disabled' : ''}">
        <button type="button" class="fifo-count-btn" data-action="minus" data-group="${esc(groupKey)}" ${countDisabled || count <= min ? 'disabled' : ''}>−</button>
        <span class="fifo-count-value">${count}</span>
        <button type="button" class="fifo-count-btn" data-action="plus" data-group="${esc(groupKey)}" ${countDisabled || count >= max ? 'disabled' : ''}>+</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <section class="fifo-setup-panel">
      <label class="fifo-standard-toggle">
        <input type="checkbox" id="fifoStandardCounts" ${standardChecked}>
        <span>
          <strong>Standaard aantal producten</strong>
          <small>Uitvinken om per subafdeling extra producten toe te voegen.</small>
        </span>
      </label>
      <div class="fifo-setup-grid">${rows}</div>
      <button type="button" class="fifo-start-btn" id="fifoStartControl">Start controle</button>
    </section>`;

  document.getElementById('fifoStandardCounts').addEventListener('change', fifoHandleStandardToggle);
  document.querySelectorAll('.fifo-count-btn').forEach(btn => btn.addEventListener('click', fifoHandleCountButton));
  document.querySelectorAll('.fifo-setup-filled-input').forEach(input => input.addEventListener('change', fifoHandleSetupFilled));
  document.getElementById('fifoStartControl').addEventListener('click', fifoStartControl);

  updateProgress();
}

function fifoHandleStandardToggle(e){
  fifoFlow.useStandardCounts = !!e.currentTarget.checked;
  if(fifoFlow.useStandardCounts){
    fifoFlow.counts = fifoMinimumCounts();
  }
  fifoSaveFlowState();
  fifoRenderSetup();
}

function fifoHandleCountButton(e){
  if(fifoFlow.useStandardCounts) return;
  const groupKey = e.currentTarget.dataset.group;
  if(fifoFlow.pendingNotFilled[groupKey]) return;

  const rule = subCounts.find(r => norm(r.subafdeling) === norm(groupKey));
  if(!rule) return;

  const min = rule.count;
  const max = fifoMaxForGroup(groupKey);
  let count = Math.max(min, Number(fifoFlow.counts[groupKey]) || min);

  if(e.currentTarget.dataset.action === 'minus') count--;
  if(e.currentTarget.dataset.action === 'plus') count++;

  fifoFlow.counts[groupKey] = Math.max(min, Math.min(max, count));
  fifoSaveFlowState();
  fifoRenderSetup();
}

function fifoHandleSetupFilled(e){
  const groupKey = e.currentTarget.dataset.group;
  fifoFlow.pendingNotFilled[groupKey] = !e.currentTarget.checked;
  fifoSaveFlowState();
  fifoRenderSetup();
}

function fifoCountCompletedThatWouldBeLost(){
  let count = 0;

  subCounts.forEach(rule => {
    const groupKey = rule.subafdeling;
    const items = fifoSelectionItemsForGroup(groupKey);
    const desired = fifoFlow.useStandardCounts ? rule.count : Math.max(rule.count, Number(fifoFlow.counts[groupKey]) || rule.count);
    const completed = items.filter(item => item.Status === 'Goed' || item.Status === 'Fout');

    if(fifoFlow.pendingNotFilled[groupKey]){
      count += completed.length;
      return;
    }

    if(completed.length > desired){
      count += completed.length - desired;
    }
  });

  return count;
}

function fifoStartControl(){
  const leader = document.getElementById('leader').value;
  if(!leader){
    alert('Kies eerst je naam.');
    return;
  }

  const removedCompleted = fifoCountCompletedThatWouldBeLost();
  if(removedCompleted > 0){
    const ok = confirm(
      `Door deze instellingen verdwijnen ${removedCompleted} al gecontroleerde ${removedCompleted === 1 ? 'product' : 'producten'} uit deze controle. Wil je doorgaan?`
    );
    if(!ok) return;
  }

  if(fifoFlow.useStandardCounts){
    fifoFlow.counts = fifoMinimumCounts();
  }

  if(!fifoReconcileSelectionToSettings()) return;
  fifoApplyPendingFillStates();

  const active = fifoActiveItems();
  const currentStillExists = active.some(item => Number(item.Id) === Number(fifoFlow.currentItemId));
  if(!currentStillExists){
    const firstOpen = active.find(item => !item.Status || item.Status === 'Open');
    fifoFlow.currentItemId = firstOpen ? Number(firstOpen.Id) : (active[0] ? Number(active[0].Id) : null);
  }

  fifoFlow.mode = active.length ? 'control' : 'summary';
  fifoSaveFlowState();
  saveSelection();
  render();
}

function fifoReconcileSelectionToSettings(){
  const dayKey = document.getElementById('dateInput').value || todayKey();
  let nextId = selection.reduce((max,item) => Math.max(max, Number(item.Id)||0), 0) + 1;
  let nextOrder = selection.reduce((max,item) => Math.max(max, Number(item.Volgorde)||0), 0) + 1;

  for(const rule of subCounts){
    const groupKey = rule.subafdeling;
    const desired = fifoFlow.useStandardCounts ? rule.count : Math.max(rule.count, Number(fifoFlow.counts[groupKey]) || rule.count);
    let groupItems = fifoSelectionItemsForGroup(groupKey);

    if(groupItems.length > desired){
      const completed = groupItems.filter(item => item.Status === 'Goed' || item.Status === 'Fout');
      const other = groupItems.filter(item => item.Status !== 'Goed' && item.Status !== 'Fout');
      const keep = completed.slice(0, desired);
      if(keep.length < desired){
        keep.push(...other.slice(0, desired - keep.length));
      }
      const keepIds = new Set(keep.map(item => Number(item.Id)));
      selection = selection.filter(item =>
        norm(selectionGroupForItem(item)) !== norm(groupKey) || keepIds.has(Number(item.Id))
      );
      groupItems = fifoSelectionItemsForGroup(groupKey);
    }

    if(groupItems.length < desired){
      const needed = desired - groupItems.length;
      const usedInAfdeling = new Set(
        selection
          .filter(item => item.Afdeling === rule.afdeling)
          .map(item => String(item.Nasa))
      );

      const pool = productsForSelectionGroup(groupKey)
        .filter(product =>
          product.Afdeling === rule.afdeling &&
          !usedInAfdeling.has(String(product.Nasa))
        );

      if(pool.length < needed){
        alert(`${groupKey} heeft niet genoeg unieke actieve producten om ${desired} controles te maken.`);
        return false;
      }

      const picked = pickWeighted(pool, needed, `${dayKey}-extra-${groupKey}-${desired}-${groupItems.length}`);
      picked.forEach(product => {
        selection.push({
          Id: nextId++,
          DagKey: dayKey,
          Nasa: product.Nasa,
          Productnaam: product.Productnaam,
          Afdeling: rule.afdeling,
          Subafdeling: product.Subafdeling,
          Selectiegroep: groupKey,
          Volgorde: nextOrder++,
          Status: 'Open',
          Shiftleider: '',
          TijdGecheckt: ''
        });
      });
    }
  }

  return true;
}

function fifoApplyPendingFillStates(){
  subCounts.forEach(rule => {
    const groupKey = rule.subafdeling;
    const notFilled = !!fifoFlow.pendingNotFilled[groupKey];
    departmentStates[groupKey] = notFilled ? 'Niet gevuld vandaag' : 'Gevuld';

    fifoSelectionItemsForGroup(groupKey).forEach(item => {
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
  });
}

function fifoGoToSetup(){
  fifoFlow.mode = 'setup';
  subCounts.forEach(rule => {
    fifoFlow.counts[rule.subafdeling] = Math.max(
      rule.count,
      Number(fifoFlow.counts[rule.subafdeling]) || fifoSelectionItemsForGroup(rule.subafdeling).length || rule.count
    );
    fifoFlow.pendingNotFilled[rule.subafdeling] = isFillGroupNotFilled(rule.subafdeling);
  });
  fifoSaveFlowState();
  render();
}

function fifoResetControl(){
  if(!confirm('Weet je zeker dat je de volledige FIFO-controle wilt resetten? Alle statussen en aangepaste Nasa-nummers worden gewist.')){
    return;
  }

  const dayKey = document.getElementById('dateInput').value || todayKey();
  selection = generateSelection(dayKey);
  departmentStates = defaultDepartmentStates();

  if(fifoFlow.useStandardCounts){
    fifoFlow.counts = fifoMinimumCounts();
  }

  if(!fifoReconcileSelectionToSettings()) return;
  fifoApplyPendingFillStates();

  const active = fifoActiveItems();
  fifoFlow.currentItemId = active[0] ? Number(active[0].Id) : null;
  fifoFlow.mode = active.length ? 'control' : 'summary';

  saveSelection();
  fifoSaveFlowState();
  render();
}

function fifoRenderControl(){
  fifoSetupShell('control');
  const items = fifoActiveItems();

  if(!items.length){
    fifoFlow.mode = 'summary';
    fifoSaveFlowState();
    fifoRenderSummary();
    return;
  }

  const index = fifoCurrentIndex(items);
  fifoSetCurrentByIndex(items, index);
  const item = items[index];

  const warningHtml = selectionWarnings.length
    ? `<div class="fifo-flow-inline-warning">${selectionWarnings.map(esc).join(' · ')}</div>`
    : '';

  document.getElementById('content').innerHTML = `
    <section class="fifo-flow-control">
      ${warningHtml}
      <div class="fifo-current-meta">
        <strong>${esc(selectionGroupForItem(item))}</strong>
        <span>${index + 1} / ${items.length}</span>
      </div>
      <div class="fifo-flow-product">${renderCard(item, false)}</div>
      <nav class="fifo-flow-nav" aria-label="Navigatie tussen producten">
        <button type="button" id="fifoBackProduct" ${index <= 0 ? 'disabled' : ''}>← Terug</button>
        <button type="button" id="fifoNextProduct">Verder →</button>
      </nav>
    </section>`;

  document.querySelectorAll('.fifo-product-card button').forEach(btn => btn.addEventListener('click', handleClick));
  document.querySelectorAll('.fifo-warning-check').forEach(el => el.addEventListener('change', handleWarningChange));
  document.querySelectorAll('.fifo-medewerker-select').forEach(el => el.addEventListener('change', handleWarningChange));

  document.getElementById('fifoBackProduct').addEventListener('click', () => fifoNavigateRelative(-1));
  document.getElementById('fifoNextProduct').addEventListener('click', () => fifoNavigateRelative(1));

  fifoBindTopbar();
  updateProgress();
}

function fifoNavigateRelative(delta){
  const items = fifoActiveItems();
  const index = fifoCurrentIndex(items);

  if(delta > 0 && index >= items.length - 1){
    fifoFlow.mode = 'summary';
    fifoSaveFlowState();
    render();
    return;
  }

  fifoSetCurrentByIndex(items, index + delta);
  render();
}

function fifoAdvanceAfterResult(itemId){
  const items = fifoActiveItems();
  const index = items.findIndex(item => Number(item.Id) === Number(itemId));
  if(index < 0) return;

  if(index >= items.length - 1){
    fifoFlow.mode = 'summary';
    fifoFlow.currentItemId = Number(itemId);
  }else{
    fifoFlow.mode = 'control';
    fifoFlow.currentItemId = Number(items[index + 1].Id);
  }
  fifoSaveFlowState();
  render();
}

handleClick = function(e){
  const action = e.currentTarget.dataset.action;
  const card = e.currentTarget.closest('.fifo-product-card');
  const itemId = card ? Number(card.dataset.id) : null;

  fifoOriginalHandleClick(e);

  if((action === 'Goed' || action === 'Fout') && itemId != null){
    const item = selection.find(x => Number(x.Id) === Number(itemId));
    if(item && item.Status === action){
      fifoAdvanceAfterResult(itemId);
    }
  }
};

handleWarningChange = function(e){
  fifoOriginalHandleWarningChange(e);
  fifoSaveFlowState();
};

function fifoBindTopbar(){
  const settingsBtn = document.getElementById('fifoSettingsBtn');
  const resetBtn = document.getElementById('fifoResetBtn');
  if(settingsBtn) settingsBtn.onclick = fifoGoToSetup;
  if(resetBtn) resetBtn.onclick = fifoResetControl;
}

function fifoRenderSummary(){
  fifoSetupShell('summary');
  const active = fifoActiveItems();
  const open = active.filter(item => !item.Status || item.Status === 'Open');
  const good = active.filter(item => item.Status === 'Goed').length;
  const bad = active.filter(item => item.Status === 'Fout').length;

  const dots = active.map(item => {
    const cls = item.Status === 'Goed' ? 'fifo-summary-good' : item.Status === 'Fout' ? 'fifo-summary-bad' : 'fifo-summary-open';
    const label = `${selectionGroupForItem(item)} · ${item.Nasa} · ${item.Productnaam} · ${item.Status || 'Open'}`;
    return `<span class="fifo-summary-dot ${cls}" title="${esc(label)}"></span>`;
  }).join('');

  const notFilledGroups = subCounts
    .filter(rule => isFillGroupNotFilled(rule.subafdeling))
    .map(rule => `<span>${esc(rule.subafdeling)}</span>`)
    .join('');

  document.getElementById('content').innerHTML = `
    <section class="fifo-flow-summary">
      <div class="fifo-summary-score">
        <div class="fifo-summary-total"><strong>${active.length}</strong><span>producten</span></div>
        <div class="fifo-summary-good-box"><strong>${good}</strong><span>goed</span></div>
        <div class="fifo-summary-bad-box"><strong>${bad}</strong><span>fout</span></div>
        <div class="${open.length ? 'fifo-summary-open-box' : 'fifo-summary-ready-box'}"><strong>${open.length}</strong><span>open</span></div>
      </div>
      <div class="fifo-summary-dots" aria-label="Visuele samenvatting van alle gecontroleerde producten">${dots || '<span class="fifo-summary-empty">Geen producten geselecteerd</span>'}</div>
      ${notFilledGroups ? `<div class="fifo-summary-notfilled"><strong>Niet gevuld:</strong>${notFilledGroups}</div>` : ''}
      ${open.length ? `<div class="fifo-summary-blocked">Nog ${open.length} ${open.length === 1 ? 'product staat' : 'producten staan'} open. Rond alles af voordat je opslaat.</div>` : ''}
      <div class="fifo-summary-actions">
        <button type="button" class="fifo-summary-back" id="fifoSummaryBack">← Terug naar controle</button>
        <button type="button" class="fifo-summary-save" id="fifoSummarySave" ${open.length ? 'disabled' : ''}>Naar Microsoft Forms om op te slaan</button>
      </div>
    </section>`;

  document.getElementById('fifoSummaryBack').addEventListener('click', () => {
    fifoFlow.mode = 'control';
    const items = fifoActiveItems();
    if(items.length && !items.some(item => Number(item.Id) === Number(fifoFlow.currentItemId))){
      fifoFlow.currentItemId = Number(items[items.length - 1].Id);
    }
    fifoSaveFlowState();
    render();
  });

  document.getElementById('fifoSummarySave').addEventListener('click', logToForms);
  fifoBindTopbar();
  updateProgress();
}

function updateProgress(){
  const active = fifoActiveItems();
  const done = active.filter(item => item.Status === 'Goed' || item.Status === 'Fout').length;
  const total = active.length;
  const pct = total ? Math.round(done / total * 100) : 100;

  const text = document.getElementById('progressText');
  const bar = document.getElementById('progressBar');
  const stats = document.getElementById('stats');
  if(text) text.textContent = `${done}/${total}`;
  if(bar) bar.style.width = `${pct}%`;
  if(stats) stats.innerHTML = '';
}

function render(){
  if(!productsCsvLoaded) return;

  if(fifoFlow.mode === 'setup'){
    fifoRenderSetup();
    return;
  }
  if(fifoFlow.mode === 'summary'){
    fifoRenderSummary();
    return;
  }
  fifoRenderControl();
}

function fifoInitFlow(){
  fifoLoadFlowState();

  const active = fifoActiveItems();
  if(fifoFlow.mode === 'control' && active.length){
    const currentExists = active.some(item => Number(item.Id) === Number(fifoFlow.currentItemId));
    if(!currentExists){
      const firstOpen = active.find(item => !item.Status || item.Status === 'Open');
      fifoFlow.currentItemId = Number((firstOpen || active[0]).Id);
    }
  }

  fifoSaveFlowState();
  render();
}

backToControl = function(){
  document.getElementById('submitPage').classList.add('fifo-hidden');
  document.getElementById('controlPage').classList.remove('fifo-hidden');
  render();
};
