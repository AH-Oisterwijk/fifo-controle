'use strict';

// Laatste controle gebruikt de werkelijk opgebouwde, URL-encoded Microsoft Forms-link.
// 6000 is bewust lager dan de oude beta-grens van 7600 om operationele veiligheidsmarge te houden.
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
  if(url.length > FIFO_FORMS_URL_HARD_LIMIT){
    alert(`De Microsoft Forms-link wordt te lang (${url.length} tekens; veilige grens ${FIFO_FORMS_URL_HARD_LIMIT}). Verlaag het aantal producten of het aantal waarschuwingen en probeer opnieuw.`);
    return;
  }

  prepareSubmitPage(record, url, '');
  window.location.href = url;
};
