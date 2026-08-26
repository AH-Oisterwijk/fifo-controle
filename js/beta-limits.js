'use strict';

// Microsoft publiceert geen Forms-specifieke harde maximumlengte voor prefilled links.
// Daarom controleert deze versie de werkelijk encoded URL en gebruikt hij een conservatief
// operationeel budget: 6000 als harde grens, plus 1200 extra reserve tijdens de setup voor
// namen/waarschuwingen die pas tijdens de controle kunnen ontstaan.
const FIFO_FORMS_URL_HARD_LIMIT = 6000;
const FIFO_FORMS_URL_SETUP_RESERVE = 1200;
const FIFO_FORMS_URL_SETUP_LIMIT = FIFO_FORMS_URL_HARD_LIMIT - FIFO_FORMS_URL_SETUP_RESERVE;

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

function fifoEstimatedFormsUrlLength(overrides){
  if(typeof configuredFormsUrl !== 'function' || typeof makeFormsUrl !== 'function') return 0;
  if(!configuredFormsUrl()) return 0;

  const replacement = overrides || {};
  const dayKey = document.getElementById('dateInput').value || todayKey();
  const leader = (document.getElementById('leader').value || 'Shiftleider').trim();
  const products = [];
  const scores = {};
  const statuses = {};

  departmentOrder.forEach(afdeling => {
    scores[afdeling] = '0/0';
    statuses[afdeling] = {Status:'Gevuld', Score:'0/0'};
  });

  subCounts.forEach(rule => {
    const configured = Object.prototype.hasOwnProperty.call(replacement, rule.subafdeling)
      ? Number(replacement[rule.subafdeling])
      : Number(fifoFlow.counts[rule.subafdeling]);
    const count = fifoFlow.useStandardCounts
      ? rule.count
      : Math.max(rule.count, configured || rule.count);
    const notFilled = !!fifoFlow.pendingNotFilled[rule.subafdeling];

    for(let i = 0; i < count; i++){
      products.push({
        Afdeling: rule.afdeling,
        Nasa: '999999',
        Status: notFilled ? 'Niet gevuld' : 'Goed',
        MedewerkerNaam: '',
        AfdelingNietGevuld: notFilled
      });
    }
  });

  const record = {
    DatumTijd: '26/08/2026 20:12',
    DagKey: dayKey,
    Shiftleider: leader,
    Scores: scores,
    AfdelingStatussen: statuses,
    AfdelingenNietGevuld: [],
    Producten: products,
    Waarschuwingen: []
  };

  return makeFormsUrl(record).length;
}

function fifoProjectedCountForGroup(groupKey, nextCount){
  const overrides = {};
  overrides[groupKey] = nextCount;
  return fifoEstimatedFormsUrlLength(overrides);
}

function fifoFitsSetupUrlBudget(groupKey, nextCount){
  const estimated = fifoProjectedCountForGroup(groupKey, nextCount);
  return estimated === 0 || estimated <= FIFO_FORMS_URL_SETUP_LIMIT;
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
    if(!fifoFitsSetupUrlBudget(groupKey, nextCount)) return;
    count = nextCount;
  }

  fifoFlow.counts[groupKey] = Math.max(min, Math.min(max, count));
  fifoSaveFlowState();
  fifoRenderSetup();
};

const fifoBaseRenderSetupForLimits = fifoRenderSetup;
fifoRenderSetup = function(){
  fifoBaseRenderSetupForLimits();

  const total = fifoConfiguredProductRows();
  const estimated = fifoEstimatedFormsUrlLength();
  const toggle = document.querySelector('.fifo-standard-toggle small');
  if(toggle){
    toggle.textContent = estimated > 0
      ? `Uitvinken om per subafdeling extra producten toe te voegen. ${total} producten · geschatte Forms-link ${estimated}/${FIFO_FORMS_URL_SETUP_LIMIT} tekens (+${FIFO_FORMS_URL_SETUP_RESERVE} reserve).`
      : `Uitvinken om per subafdeling extra producten toe te voegen. ${total} producten. De Forms-lengte wordt bij opslaan gecontroleerd.`;
  }

  document.querySelectorAll('.fifo-count-btn[data-action="plus"]').forEach(btn => {
    if(btn.disabled) return;
    const groupKey = btn.dataset.group;
    const rule = subCounts.find(r => norm(r.subafdeling) === norm(groupKey));
    if(!rule) return;
    const current = Math.max(rule.count, Number(fifoFlow.counts[groupKey]) || rule.count);
    if(!fifoFitsSetupUrlBudget(groupKey, current + 1)) btn.disabled = true;
  });
};

const fifoBaseStartControlForLimits = fifoStartControl;
fifoStartControl = function(){
  const estimated = fifoEstimatedFormsUrlLength();
  if(estimated > FIFO_FORMS_URL_SETUP_LIMIT){
    alert(`Deze instelling maakt de geschatte Microsoft Forms-link te lang (${estimated} tekens). Houd maximaal ${FIFO_FORMS_URL_SETUP_LIMIT} tekens aan; zo blijft ${FIFO_FORMS_URL_SETUP_RESERVE} tekens reserve voor namen en waarschuwingen.`);
    return;
  }
  fifoBaseStartControlForLimits();
};
