'use strict';

// Laatste controle gebruikt de werkelijk opgebouwde, URL-encoded opslaglink.
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
      'De opslagkoppeling ontbreekt. Neem contact op met de beheerder.'
    );
    return;
  }

  const url = makeFormsUrl(record);
  if(url.length > FIFO_FORMS_URL_HARD_LIMIT){
    alert('Deze controle bevat te veel gegevens om betrouwbaar op te slaan. Verlaag het aantal extra producten of het aantal aangesproken medewerkers en probeer opnieuw.');
    return;
  }

  prepareSubmitPage(record, url, '');
  window.location.href = url;
};
