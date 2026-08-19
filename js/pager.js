'use strict';

// Beta-experiment: toon één hoofdafdeling per scherm met Vorige/Volgende.
// Dit bestand wordt na ui.js geladen en vervangt alleen de rendering.
let fifoPagerDepartmentIndex = 0;

function fifoPagerGroups(){
  return departmentOrder
    .map(afdeling => ({afdeling, items: selection.filter(item => item.Afdeling === afdeling)}))
    .filter(group => group.items.length);
}

function fifoRenderDepartmentPager(groups){
  if(!groups.length){
    return '<section class="fifo-message">Geen afdelingen beschikbaar.</section>';
  }

  if(fifoPagerDepartmentIndex < 0) fifoPagerDepartmentIndex = 0;
  if(fifoPagerDepartmentIndex >= groups.length) fifoPagerDepartmentIndex = groups.length - 1;

  const group = groups[fifoPagerDepartmentIndex];
  const nav = fifoRenderPagerNav(groups, fifoPagerDepartmentIndex);

  return `<section class="fifo-department-pager">
    ${nav}
    <div class="fifo-pager-stage">${fifoRenderGroup(group.afdeling, group.items)}</div>
    ${nav}
  </section>`;
}

function fifoRenderPagerNav(groups, index){
  const current = groups[index];
  const previousDisabled = index <= 0 ? 'disabled' : '';
  const nextDisabled = index >= groups.length - 1 ? 'disabled' : '';

  return `<nav class="fifo-pager-nav" aria-label="Navigatie tussen afdelingen">
    <button class="fifo-pager-btn" type="button" data-direction="previous" ${previousDisabled}>← Vorige</button>
    <div class="fifo-pager-position">
      <strong>${esc(current.afdeling)}</strong>
      <span>Afdeling ${index + 1} van ${groups.length}</span>
    </div>
    <button class="fifo-pager-btn fifo-pager-next" type="button" data-direction="next" ${nextDisabled}>Volgende →</button>
  </nav>`;
}

function fifoHandlePagerNavigation(e){
  const direction = e.currentTarget.dataset.direction;

  if(direction === 'previous') fifoPagerDepartmentIndex--;
  if(direction === 'next') fifoPagerDepartmentIndex++;

  render();

  requestAnimationFrame(() => {
    const pager = document.querySelector('.fifo-department-pager');
    if(pager){
      pager.scrollIntoView({behavior:'smooth', block:'start'});
    }
  });
}

function fifoRenderGroup(afdeling, items){
  const done = items.filter(item => item.Status && item.Status !== 'Open').length;
  const groupKeys = fillGroupKeysForDepartment(afdeling);
  const controls = groupKeys.length > 1
    ? renderCombinedFillControl(afdeling, groupKeys)
    : renderFillControl(groupKeys[0], afdeling);

  const displayItems = itemsForDisplay(afdeling, items);
  const visibleItems = displayItems.filter(item => !isItemNotFilledByToggle(item));
  const productsHtml = visibleItems.length
    ? visibleItems.map(item => renderCard(item, false)).join('')
    : `<div class="fifo-no-products">Geen producten om te controleren. Zet een groep hierboven weer op gevuld om de producten terug te tonen.</div>`;

  return `<section class="fifo-group" data-afdeling="${esc(afdeling)}">
    <div class="fifo-group-title"><h2>${esc(afdeling)}</h2><span>${done}/${items.length}</span></div>
    <div class="fifo-dept-control-list">${controls}</div>
    <div class="fifo-grid">${productsHtml}</div>
  </section>`;
}

// Vervang de standaard renderfunctie alleen binnen beta.
renderGroup = fifoRenderGroup;
render = function(){
  const groups = fifoPagerGroups();
  const warningHtml = selectionWarnings.length
    ? `<section class="fifo-message fifo-error"><strong>Let op:</strong> ${selectionWarnings.map(esc).join(' · ')}</section>`
    : '';

  document.getElementById('content').innerHTML = warningHtml + fifoRenderDepartmentPager(groups);
  document.querySelectorAll('.fifo-product-card button').forEach(btn=>btn.addEventListener('click',handleClick));
  document.querySelectorAll('.fifo-warning-check').forEach(el=>el.addEventListener('change',handleWarningChange));
  document.querySelectorAll('.fifo-medewerker-select').forEach(el=>el.addEventListener('change',handleWarningChange));
  document.querySelectorAll('.fifo-dept-toggle').forEach(el=>el.addEventListener('change',handleDepartmentToggle));
  document.querySelectorAll('.fifo-pager-btn').forEach(el=>el.addEventListener('click',fifoHandlePagerNavigation));
  updateProgress();
};
