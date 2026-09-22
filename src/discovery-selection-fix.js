import { createClient } from '@supabase/supabase-js';

let supabasePromise;
let selectionSignature = '';
let selectedCandidates = new Set();
let saving = false;

async function client() {
  if (!supabasePromise) {
    supabasePromise = fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Error ${response.status}`);
        return response.json();
      })
      .then((config) => createClient(config.supabaseUrl, config.supabasePublishableKey));
  }
  return supabasePromise;
}

function inputs() {
  return [...document.querySelectorAll('[data-candidate-choice]')];
}

function ensureStatusHost() {
  const button = document.querySelector('#approve-discovery-selection');
  const parent = button?.parentElement;
  if (!parent) return null;
  let status = parent.querySelector('[data-selection-status]');
  if (!status) {
    status = document.createElement('div');
    status.dataset.selectionStatus = 'true';
    status.style.marginTop = '8px';
    status.style.fontSize = '14px';
    status.style.fontWeight = '700';
    status.style.width = '100%';
    parent.appendChild(status);
  }
  return status;
}

function showStatus(text, error = false) {
  const status = ensureStatusHost();
  if (!status) return;
  status.textContent = text;
  status.style.color = error ? '#b42318' : '#475569';
}

function paintSelection() {
  for (const input of inputs()) {
    const active = selectedCandidates.has(input.value);
    input.checked = active;
    const card = input.closest('.candidate-card');
    if (card) {
      card.style.outline = active ? '2px solid #2563eb' : '';
      card.style.outlineOffset = active ? '-2px' : '';
    }
    const label = input.closest('.candidate-choice');
    if (label) {
      label.style.fontWeight = active ? '800' : '600';
      label.style.color = active ? '#1d4ed8' : '';
    }
  }

  const button = document.querySelector('#approve-discovery-selection');
  if (button && !saving) {
    const count = selectedCandidates.size;
    button.disabled = count === 0;
    button.textContent = count ? `Confirmar ${count} candidato${count === 1 ? '' : 's'}` : 'Seleccioná candidatos';
  }
}

function initializeSelection() {
  const currentInputs = inputs();
  if (!currentInputs.length) {
    selectionSignature = '';
    selectedCandidates.clear();
    return;
  }

  const signature = currentInputs.map((input) => input.value).join('|');
  if (signature !== selectionSignature) {
    selectionSignature = signature;
    const checked = currentInputs.filter((input) => input.checked).map((input) => input.value);
    const initial = checked.length ? checked : currentInputs.slice(0, 3).map((input) => input.value);
    selectedCandidates = new Set(initial.slice(0, 3));
  }

  paintSelection();
}

async function latestRunId(db) {
  const { data, error } = await db
    .from('product_discovery_runs')
    .select('id,status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('No se encontró la investigación activa.');
  return data.id;
}

async function confirmSelection() {
  if (saving) return;
  const ids = [...selectedCandidates];
  if (!ids.length) {
    showStatus('Seleccioná al menos un candidato.', true);
    return;
  }
  if (ids.length > 3) {
    showStatus('Podés confirmar hasta tres candidatos.', true);
    return;
  }

  saving = true;
  const button = document.querySelector('#approve-discovery-selection');
  if (button) {
    button.disabled = true;
    button.textContent = 'Guardando selección…';
  }
  showStatus(`Confirmando ${ids.length} candidato${ids.length === 1 ? '' : 's'}…`);

  try {
    const db = await client();
    const { data: auth } = await db.auth.getSession();
    if (!auth?.session) throw new Error('Necesitás iniciar sesión.');

    const runId = await latestRunId(db);
    const { data, error } = await db.rpc('confirm_discovery_selection', {
      p_run_id: runId,
      p_candidate_ids: ids,
    });
    if (error) throw error;

    const count = Number(data?.selected || ids.length);
    showStatus(`${count} candidato${count === 1 ? '' : 's'} confirmado${count === 1 ? '' : 's'} ✓`);
    if (button) button.textContent = 'Selección confirmada ✓';

    setTimeout(() => {
      document.querySelector('[data-discovery-nav]')?.click();
    }, 650);
  } catch (error) {
    saving = false;
    showStatus(error?.message || 'No se pudo guardar la selección.', true);
    paintSelection();
  }
}

document.addEventListener('change', (event) => {
  const input = event.target.closest?.('[data-candidate-choice]');
  if (!input) return;

  if (input.checked) {
    if (selectedCandidates.size >= 3 && !selectedCandidates.has(input.value)) {
      input.checked = false;
      showStatus('Podés seleccionar hasta tres candidatos.', true);
    } else {
      selectedCandidates.add(input.value);
      showStatus(`${selectedCandidates.size} candidato${selectedCandidates.size === 1 ? '' : 's'} seleccionado${selectedCandidates.size === 1 ? '' : 's'}.`);
    }
  } else {
    selectedCandidates.delete(input.value);
    showStatus(`${selectedCandidates.size} candidato${selectedCandidates.size === 1 ? '' : 's'} seleccionado${selectedCandidates.size === 1 ? '' : 's'}.`);
  }
  paintSelection();
}, true);

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#approve-discovery-selection');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  confirmSelection();
}, true);

const observer = new MutationObserver(() => queueMicrotask(initializeSelection));
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
setTimeout(initializeSelection, 250);
