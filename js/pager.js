'use strict';

// Beta-experiment: toon één hoofdafdeling én één product tegelijk.
// Dit bestand wordt na ui.js geladen en vervangt alleen de rendering.
let fifoPagerDepartmentIndex = 0;
let fifoPagerProductIndex = 0;

function fifoPagerGroups(){
  return departmentOrder
    .map(afdeling => ({afdeling, items: selection.filter(item => item.Afdeling === afdeling)}))
    .filter(group => group.items.length);
}

function fifoVisibleItemsForGroup(group){
  return itemsForDisplay(group.afdeling, group.items)
    .filter(item => !isItemNotFilledByToggle(item));
}

function fifoClampPagerPosition(groups){
  if(!groups.length){
    fifoPagerDepartmentIndex = 0;
    fifoPagerProductIndex = 0;
    return;
  }

  if(fifoPagerDepartmentIndex < 0) fifoPagerDepartmentIndex = 0;
  if(fifoPagerDepartmentIndex >= groups.length) fifoPagerDepartmentIndex = groups.length - 1;

  const visibleItems = fifoVisibleItemsForGroup(groups[fifoPagerDepartmentIndex]);
  if(!visibleItems.length){
    fifoPagerProductIndex = 0;
    return;
  }

  if(fifoPagerProductIndex < 0) fifoPagerProductIndex = 0;
  if(fifoPagerProductIndex >= visibleItems.length) fifoPagerProductIndex = visibleItems.length - 1;
}

function fifoRenderDepartmentPager(groups){
  if(!groups.length){
    return '<section class="fifo-message">Geen afdelingen beschikbaar.</section>';
  }

  fifoClampPagerPosition(groups);
  const group = groups[fifoPagerDepartmentIndex];

  return `<section class="fifo-department-pager">
    ${fifoRenderDepartmentNav(groups, fifoPagerDepartmentIndex)}
    <div class="fifo-pager-stage">${fifoRenderGroup(group.afdeling, group.items)}</div>
  </section>`;
}

function fifoRenderDepartmentNav(groups, index){
  const current = groups[index];
  const previousDisabled = index <= 0 ? 'disabled' : '';
  const nextDisabled = index >= groups.length - 1 ? 'disabled' : '';

  return `<nav class="fifo-pager-nav fifo-department-nav" aria-label="Navigatie tussen afdelingen">
    <button class="fifo-pager-btn" type="button" data-nav="department" data-direction="previous" ${previousDisabled}>← Vorige afdeling</button>
    <div class="fifo-pager-position">
      <strong>${esc(current.afdeling)}</strong>
      <span>Afdeling ${index + 1} van ${groups.length}</span>
    </div>
    <button class="fifo-pager-btn fifo-pager-next" type="button" data-nav="department" data-direction="next" ${nextDisabled}>Volgende afdeling →</button>
  </nav>`;
}

function fifoRenderProductNav(visibleItems, index){
  if(visibleItems.length <= 1){
    return `<div class="fifo-product-position"><strong>Product ${visibleItems.length ? 1 : 0} van ${visibleItems.length}</strong></div>`;
  }

  const previousDisabled = index <= 0 ? 'disabled' : '';
  const nextDisabled = index >= visibleItems.length - 1 ? 'disabled' : '';

  return `<nav class="fifo-pager-nav fifo-product-nav" aria-label="Navigatie tussen producten">
    <button class="fifo-pager-btn" type="button" data-nav="product" data-direction="previous" ${previousDisabled}>← Vorig product</button>
    <div class="fifo-pager-position">
      <strong>Product ${index + 1} van ${visibleItems.length}</strong>
      <span>${esc(selectionGroupForItem(visibleItems[index]))}</span>
    </div>
    <button class="fifo-pager-btn fifo-pager-next" type="button" data-nav="product" data-direction="next" ${nextDisabled}>Volgend product →</button>
  </nav>`;
}

function fifoHandlePagerNavigation(e){
  const direction = e.currentTarget.dataset.direction;
  const navType = e.currentTarget.dataset.nav;

  if(navType === 'department'){
    if(direction === 'previous') fifoPagerDepartmentIndex--;
    if(direction === 'next') fifoPagerDepartmentIndex++;
    fifoPagerProductIndex = 0;
  } else if(navType === 'product'){
    if(direction === 'previous') fifoPagerProductIndex--;
    if(direction === 'next') fifoPagerProductIndex++;
  }

  render();

  requestAnimationFrame(() => {
    const stage = document.querySelector('.fifo-pager-stage');
    if(stage){
      stage.scrollIntoView({behavior:'smooth', block:'start'});
    }
  });
}

function fifoRenderGroup(afdeling, items){
  const done = items.filter(item => item.Status && item.Status !== 'Open').length;
  const groupKeys = fillGroupKeysForDepartment(afdeling);
  const controls = groupKeys.length > 1
    ? renderCombinedFillControl(afdeling, groupKeys)
    : renderFillControl(groupKeys[0], afdeling);

  const group = {afdeling, items};
  const visibleItems = fifoVisibleItemsForGroup(group);

  if(visibleItems.length && fifoPagerProductIndex >= visibleItems.length){
    fifoPagerProductIndex = visibleItems.length - 1;
  }
  if(fifoPagerProductIndex < 0) fifoPagerProductIndex = 0;

  const product = visibleItems[fifoPagerProductIndex];
  const productsHtml = product
    ? `<div class="fifo-single-product">${renderCard(product, false)}</div>`
    : `<div class="fifo-no-products">Geen producten om te controleren. Zet een groep hierboven weer op gevuld om de producten terug te tonen.</div>`;

  const productNav = visibleItems.length ? fifoRenderProductNav(visibleItems, fifoPagerProductIndex) : '';

  return `<section class="fifo-group" data-afdeling="${esc(afdeling)}">
    <div class="fifo-group-title"><h2>${esc(afdeling)}</h2><span>${done}/${items.length}</span></div>
    <div class="fifo-dept-control-list">${controls}</div>
    ${productNav}
    <div class="fifo-grid fifo-single-product-grid">${productsHtml}</div>
    ${visibleItems.length > 1 ? productNav : ''}
  </section>`;
}

// Vervang de standaard renderfunctie alleen binnen beta.
renderGroup = fifoRenderGroup;
render = function(){
  const groups = fifoPagerGroups();
  fifoClampPagerPosition(groups);

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