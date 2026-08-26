'use strict';

document.getElementById('dateInput').value = todayKey();
document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('nl-NL',{
  weekday:'long',day:'2-digit',month:'long',year:'numeric'
});

document.getElementById('leader').value = localStorage.getItem('fifo_controle_leader') || '';
document.getElementById('leader').addEventListener('change', e => {
  localStorage.setItem('fifo_controle_leader', e.target.value);
});

document.getElementById('continueFormsBtn').addEventListener('click', continueToForms);
document.getElementById('backToControlBtn').addEventListener('click', backToControl);

(async function initApp(){
  const ok = await loadDataFiles();
  if(!ok) return;

  loadDay(document.getElementById('dateInput').value);
  if(typeof fifoInitFlow === 'function') fifoInitFlow();
})();
