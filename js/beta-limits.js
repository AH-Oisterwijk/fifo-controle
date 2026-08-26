'use strict';

// Beta-only veiligheidslaag voor variabele aantallen.
// 22 is bewust gekozen: ruim boven het standaardtotaal van 17,
// maar nog binnen de bestaande Excel-detailruimte en met voldoende marge voor de Forms-URL.
const FIFO_SAFE_MAX_PRODUCTS = 22;
const FIFO_SAFE_MAX_PER_GROUP = 6;

function fifoConfiguredProductRows(){
  return subCounts.reduce((sum, rule) => {
    const count = fifoFlow.useStandardCounts
      ? rule.count
      : Math.max(rule.count, Number(fifoFlow.counts[rule.subafdeling]) || rule.count);
    return sum + count;
  }, 0);
}

fifoMaxForGroup = function(groupKey){
  const rule = subCounts.find(item => norm(item.subafdeling) === norm(groupKey));
  const minimum = rule ? rule.count : 1;
  const poolSize = productsForSelectionGroup(groupKey).length;
  return Math.max(minimum, Math.min(poolSize, Math.min(FIFO_SAFE_MAX_PER_GROUP, minimum + 3)));
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
    if(fifoConfiguredProductRows() >= FIFO_SAFE_MAX_PRODUCTS) return;
    count++;
  }

  fifoFlow.counts[groupKey] = Math.max(min, Math.min(max, count));
  fifoSaveFlowState();
  fifoRenderSetup();
};

const fifoBaseRenderSetupForLimits = fifoRenderSetup;
fifoRenderSetup = function(){
  fifoBaseRenderSetupForLimits();

  const total = fifoConfiguredProductRows();
  const toggle = document.querySelector('.fifo-standard-toggle small');
  if(toggle){
    toggle.textContent = `Uitvinken om per subafdeling extra producten toe te voegen. ${total}/${FIFO_SAFE_MAX_PRODUCTS} productregels.`;
  }

  if(total >= FIFO_SAFE_MAX_PRODUCTS){
    document.querySelectorAll('.fifo-count-btn[data-action="plus"]').forEach(btn => btn.disabled = true);
  }
};

const fifoBaseStartControlForLimits = fifoStartControl;
fifoStartControl = function(){
  const total = fifoConfiguredProductRows();
  if(total > FIFO_SAFE_MAX_PRODUCTS){
    alert(`Kies maximaal ${FIFO_SAFE_MAX_PRODUCTS} producten per controle. Verlaag eerst één of meer aantallen.`);
    return;
  }
  fifoBaseStartControlForLimits();
};
