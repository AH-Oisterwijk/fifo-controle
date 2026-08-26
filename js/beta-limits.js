'use strict';

// De complete encoded opslag-URL blijft bewust ruim onder de praktische ~2000-tekengrens.
// Tijdens de setup rekenen we bovendien alvast met drie ongunstige waarschuwingen:
// lange productnamen + lange, verschillende medewerker-namen.
const FIFO_FORMS_URL_HARD_LIMIT = 1750;
const FIFO_WARNING_RESERVE_PRODUCTS = 3;

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

function fifoEncodedLength(value){
  return encodeURIComponent(String(value || '')).length;
}

function fifoLongestNames(values, count){
  return (values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort((a,b) => fifoEncodedLength(b) - fifoEncodedLength(a))
    .slice(0, count);
}

function fifoWarningProductLength(product){
  return fifoEncodedLength(`${product && product.Productnaam ? product.Productnaam : 'Onbekend product'} (${product && product.Nasa ? product.Nasa : '-'})`);
}

function fifoProjectedProducts(overrides){
  const replacement = overrides || {};
  const projected = [];

  subCounts.forEach(rule => {
    const configured = Object.prototype.hasOwnProperty.call(replacement, rule.subafdeling)
      ? Number(replacement[rule.subafdeling])
      : Number(fifoFlow.counts[rule.subafdeling]);
    const count = fifoFlow.useStandardCounts
      ? rule.count
      : Math.max(rule.count, configured || rule.count);
    const notFilled = !!fifoFlow.pendingNotFilled[rule.subafdeling];

    // Voor de veiligheidsberekening nemen we binnen elke groep juist de langste productteksten.
    const pool = productsForSelectionGroup(rule.subafdeling)
      .slice()
      .sort((a,b) => fifoWarningProductLength(b) - fifoWarningProductLength(a));

    for(let i = 0; i < count; i++){
      const source = pool[i] || {};
      projected.push({
        Afdeling: rule.afdeling,
        Nasa: String(source.Nasa || ''),
        Productnaam: String(source.Productnaam || ''),
        Status: notFilled ? 'Niet gevuld' : 'Goed',
        MedewerkerNaam: '',
        AfdelingNietGevuld: notFilled
      });
    }
  });

  return projected;
}

function fifoAddWarningSafetyReserve(record){
  const candidates = (record.Producten || [])
    .map((product, index) => ({product, index}))
    .filter(item => !item.product.AfdelingNietGevuld)
    .sort((a,b) => fifoWarningProductLength(b.product) - fifoWarningProductLength(a.product));

  const fallbackNames = [
    'Medewerker met lange achternaam',
    'Medewerker met dubbele achternaam',
    'Medewerker met extra lange naam'
  ];
  const employeeNames = fifoLongestNames(typeof medewerkers !== 'undefined' ? medewerkers : [], FIFO_WARNING_RESERVE_PRODUCTS);
  while(employeeNames.length < FIFO_WARNING_RESERVE_PRODUCTS){
    employeeNames.push(fallbackNames[employeeNames.length]);
  }

  const reserveCount = Math.min(FIFO_WARNING_RESERVE_PRODUCTS, candidates.length);
  for(let i = 0; i < reserveCount; i++){
    const candidate = candidates[i];
    const product = candidate.product;
    const employeeName = employeeNames[i];

    product.Status = 'Fout';
    product.MedewerkerNaam = employeeName;

    record.Waarschuwingen.push({
      DatumGegeven: record.DagKey,
      NaamMedewerker: employeeName,
      Reden: 'Niet FIFO',
      Officieel: 'Nee',
      ShiftleiderManager: record.Shiftleider,
      Opmerkingen: `${product.Productnaam || 'Onbekend product'} (${product.Nasa || '-'})`
    });
  }
}

function fifoEstimatedFormsUrlLength(overrides){
  if(typeof configuredFormsUrl !== 'function' || typeof makeFormsUrl !== 'function') return 0;
  if(!configuredFormsUrl()) return 0;

  const dayKey = document.getElementById('dateInput').value || todayKey();
  const selectedLeader = (document.getElementById('leader').value || '').trim();
  const longestLeader = fifoLongestNames(typeof leaders !== 'undefined' ? leaders : [], 1)[0] || 'Shiftleider / Manager';
  const leader = selectedLeader || longestLeader;
  const products = fifoProjectedProducts(overrides);
  const scores = {};
  const statuses = {};

  departmentOrder.forEach(afdeling => {
    scores[afdeling] = '0/0';
    statuses[afdeling] = {Status:'Gevuld', Score:'0/0'};
  });

  const record = {
    DatumTijd: typeof formatDateTime === 'function' ? formatDateTime(new Date()) : new Date().toISOString(),
    DagKey: dayKey,
    Shiftleider: leader,
    Scores: scores,
    AfdelingStatussen: statuses,
    AfdelingenNietGevuld: [],
    Producten: products,
    Waarschuwingen: []
  };

  fifoAddWarningSafetyReserve(record);
  return makeFormsUrl(record).length;
}

function fifoProjectedCountForGroup(groupKey, nextCount){
  const overrides = {};
  overrides[groupKey] = nextCount;
  return fifoEstimatedFormsUrlLength(overrides);
}

function fifoFitsSetupUrlBudget(groupKey, nextCount){
  const estimated = fifoProjectedCountForGroup(groupKey, nextCount);
  return estimated === 0 || estimated <= FIFO_FORMS_URL_HARD_LIMIT;
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

  // Geen technische limiettekst in de eindgebruikers-UI: alleen onveilige '+'-stappen blokkeren.
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
  if(estimated > FIFO_FORMS_URL_HARD_LIMIT){
    alert('Deze controle bevat te veel extra producten om betrouwbaar op te slaan. Verlaag het aantal extra producten en probeer opnieuw.');
    return;
  }
  fifoBaseStartControlForLimits();
};
