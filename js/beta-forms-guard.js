'use strict';

// Beta-only extra beveiliging: geen onvolledige controle opslaan en geen te lange prefilled Forms-link openen.
const FIFO_SAFE_FORMS_URL_LENGTH = 7600;

logToForms = function(){
  const leader = document.getElementById('leader').value;
  if(!leader){
    alert('Kies eerst je naam.');
    return;
  }

  const missingWarningNames = selection.filter(
    item => item.Status === 'Fout' && item.MedewerkerAanspreken && !item.MedewerkerNaam
  );
  if(missingWarningNames.length){
    alert('Kies eerst een medewerker bij elke aangevinkte optie "Medewerker aanspreken".');
    return;
  }

  const open = selection.filter(
    item => (!item.Status || item.Status === 'Open') && !isItemNotFilledByToggle(item)
  ).length;
  if(open){
    alert(`Er staan nog ${open} ${open === 1 ? 'product' : 'producten'} open. Rond eerst de volledige controle af voordat je opslaat.`);
    return;
  }

  const record = buildLogRecord();
  const template = configuredFormsUrl();
  if(!template){
    prepareSubmitPage(
      record,
      '',
      'De Microsoft Forms-koppeling ontbreekt nog. Plak eerst de prefilled Forms-link in config.js en upload die opnieuw.'
    );
    return;
  }

  const url = makeFormsUrl(record);
  if(url.length > FIFO_SAFE_FORMS_URL_LENGTH){
    alert(`De Microsoft Forms-link wordt te lang (${url.length} tekens). Verlaag het aantal producten en probeer opnieuw.`);
    return;
  }

  prepareSubmitPage(record, url, '');
  window.location.href = url;
};
