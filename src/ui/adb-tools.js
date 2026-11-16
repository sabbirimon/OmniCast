'use strict';

let terminalId;
let terminalPending = false;
let terminalView;
let terminalFit;

function updateAdbTarget() {
  const { phone, route } = current();
  const ready = route?.state === 'device';
  $('adb-target').textContent = ready ? nameOf(phone) + ' · ' + routes[route.kind] + ' · debugging authorized'
    : 'Select an authorized Android connection on the Devices page.';
  $('terminal-open').disabled = !ready || terminalPending || Boolean(terminalId);
  $('terminal-close').disabled = !terminalId;
  for (const button of document.querySelectorAll('[data-recipe]')) button.disabled = !ready;
}

function prepareTerminal() {
  if (!terminalView) {
    terminalView = new Terminal({
      cursorBlink: true, fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 13, scrollback: 1500,
      fontWeight: '400', theme: { background: '#0c151c', foreground: '#dce9ed', cursor: '#94edca' },
    });
    terminalFit = new FitAddon.FitAddon();
    terminalView.loadAddon(terminalFit);
    terminalView.open($('terminal'));
    terminalView.onData((data) => { if (terminalId) window.omni.terminalInput(terminalId, data); });
    new ResizeObserver(() => {
      if ($('terminal').clientWidth && $('terminal').clientHeight) terminalFit.fit();
    }).observe($('terminal'));
  }
  terminalFit.fit();
  terminalView.focus();
}

$('terminal-open').addEventListener('click', async () => {
  const { phone, route } = current();
  if (route?.state !== 'device') return;
  terminalPending = true;
  updateAdbTarget();
  try {
    prepareTerminal();
    const result = await invoke(window.omni.terminalStart(phone.key, route.kind));
    if (!result) return;
    terminalId = result.result.id;
    terminalView.reset();
    terminalView.focus();
    $('terminal-status').textContent = 'Shell on ' + nameOf(phone) + ' over ' + routes[route.kind] + ' · Ctrl+C interrupts the running command.';
  } catch (error) { showNotice(error.message, 'error'); }
  finally {
    terminalPending = false;
    updateAdbTarget();
  }
});

$('terminal-close').addEventListener('click', async () => {
  if (!terminalId) return;
  const id = terminalId;
  terminalId = undefined;
  await invoke(window.omni.terminalStop(id));
  terminalView.write('\r\n[Shell closed]\r\n');
  $('terminal-status').textContent = 'Shell closed.';
  updateAdbTarget();
});

window.omni.terminalData(({ id, output, ended, code }) => {
  if (id !== terminalId) return;
  if (output) terminalView.write(output);
  if (ended) {
    terminalId = undefined;
    terminalView.write('\r\n[Shell ended' + (code ? ' with exit code ' + code : '') + ']\r\n');
    $('terminal-status').textContent = 'Shell ended. Open it again to reconnect.';
    updateAdbTarget();
  }
});

document.addEventListener('omni-selection', updateAdbTarget);
updateAdbTarget();

document.querySelector('.adb-actions').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-recipe]');
  const { phone, route } = current();
  if (!button || route?.state !== 'device') return;
  const recipe = button.dataset.recipe;
  const output = $('recipe-result');
  const result = await invoke(recipe === 'screenshot' ? window.omni.adbScreenshot(phone.key, route.kind)
    : window.omni.adbRecipe(phone.key, route.kind, recipe));
  if (!result) return;
  output.hidden = false;
  output.textContent = nameOf(phone) + ' · ' + routes[route.kind] + '\n\n'
    + (recipe === 'screenshot' ? result.result ? 'Screenshot saved.' : 'Save canceled.' : result.result || 'Command completed.');
});

function renderCommandHelp() {
  const query = $('adb-search').value.trim().toLowerCase();
  const matches = adbCommands.filter((row) => row.some((field) => field.toLowerCase().includes(query)));
  $('adb-commands').innerHTML = matches.map(([group, command, purpose]) =>
    '<article><span class="command-group">' + esc(group) + '</span><code>' + esc(command)
    + '</code><p>' + esc(purpose) + '</p></article>').join('') || '<p>No matching commands.</p>';
}

$('adb-search').addEventListener('input', renderCommandHelp);
$('adb-help').querySelector('details').addEventListener('toggle', async (event) => {
  if (!event.target.open || $('adb-raw-help').textContent) return;
  const result = await invoke(window.omni.adbHelp());
  if (result) $('adb-raw-help').textContent = result.result;
});
renderCommandHelp();
