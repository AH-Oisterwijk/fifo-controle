'use strict';

// Vaste bovengrens voor één controle. De technische Forms-limiet blijft verborgen voor eindgebruikers.
const FIFO_MAX_TOTAL_PRODUCTS = 20;
// Alleen gebruikt voor de laatste technische opslagcheck; nooit tonen in de UI.
const FIFO_FORMS_URL_HARD_LIMIT = 1750;

function fifoConfiguredProductRows(overrides){
  const replacement = overrides || {};
  return subCounts.reduce((sum, rule) => {
    const configured = Object.prototype.hasOwnProperty.call(replacement, rule.subafdeling)
      ? Number(replacement[rule.subafdeling])
      : Number(fifoFlow.counts[rule.subafdeling]);
    const count = fifoFlow.useStandardCounts
      ? rule.count
      : Math.max(rule.count, configured || rule.count);
    return sum + count;
  }, 0);
}

fifoMaxForGroup = function(groupKey){
  const rule = subCounts.find(item => norm(item.subafdeling) === norm(groupKey));
  const minimum = rule ? rule.count : 1;
  const poolSize = productsForSelectionGroup(groupKey).length;
  return Math.max(minimum, poolSize);
};

function fifoFitsTotalProductLimit(groupKey, nextCount){
  const overrides = {};
  overrides[groupKey] = nextCount;
  return fifoConfiguredProductRows(overrides) <= FIFO_MAX_TOTAL_PRODUCTS;
}

// Eerder gekozen aangepaste aantallen blijven bewaard wanneer Standaard tijdelijk wordt aangezet.
fifoHandleStandardToggle = function(e){
  fifoFlow.useStandardCounts = !!e.currentTarget.checked;
  fifoSaveFlowState();
  fifoRenderSetup();
};

fifoHandleCountButton = function(e){
  if(fifoFlow.useStandardCounts) return;
  const groupKey = e.currentTarget.dataset.group;
  if(fifoFlow.pendingNotFilled[groupKey]) return;

  const rule = subCounts.find(r => norm(r.subafdeling) === norm(groupKey));
  if(!rule) return;

  const min = rule.count;
  const max = fifoMaxForGroup(groupKey);
  let count = Math.max(min, Number(fifoFlow.counts[groupKey]) || min);
  const action = e.currentTarget.dataset.action;

  if(action === 'minus') count--;
  if(action === 'plus'){
    const nextCount = Math.min(max, count + 1);
    if(!fifoFitsTotalProductLimit(groupKey, nextCount)) return;
    count = nextCount;
  }

  fifoFlow.counts[groupKey] = Math.max(min, Math.min(max, count));
  fifoSaveFlowState();
  fifoRenderSetup();
};

const fifoBaseRenderSetupForLimits = fifoRenderSetup;
fifoRenderSetup = function(){
  fifoBaseRenderSetupForLimits();

  document.querySelectorAll('.fifo-count-btn[data-action="plus"]').forEach(btn => {
    if(btn.disabled) return;
    const groupKey = btn.dataset.group;
    const rule = subCounts.find(r => norm(r.subafdeling) === norm(groupKey));
    if(!rule) return;
    const current = Math.max(rule.count, Number(fifoFlow.counts[groupKey]) || rule.count);
    if(!fifoFitsTotalProductLimit(groupKey, current + 1)) btn.disabled = true;
  });
};

const fifoBaseStartControlForLimits = fifoStartControl;
fifoStartControl = function(){
  if(fifoConfiguredProductRows() > FIFO_MAX_TOTAL_PRODUCTS){
    alert(`Kies maximaal ${FIFO_MAX_TOTAL_PRODUCTS} producten voor één controle.`);
    return;
  }
  fifoBaseStartControlForLimits();
};
