'use strict';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const nameOf = (phone) => phone.name || phone.title || phone.model;
const routes = { usb: 'USB', wifi: 'Wi‑Fi', emulator: 'Emulator' };
const silhouettes = new Set(['aquos', 'galaxy', 'pixel', 'tablet', 'tv']);
const pad = [
  ['back', '←', 'Back'], ['home', '⌂', 'Home'], ['recents', '≡', 'Recents'], ['power', '⏻', 'Power'],
  ['volumeDown', '−', 'Vol down'], ['volumeUp', '+', 'Vol up'], ['mute', '∅', 'Mute'], ['wake', '☀', 'Wake'],
  ['notifications', '↓', 'Notifications'], ['quickSettings', '▦', 'Quick settings'],
  ['cast', '◫', 'Android Cast'], ['location', '⌖', 'Location'],
  ['accessibility', '◎', 'Accessibility'], ['developer', '‹›', 'Developer'], ['about', 'ⓘ', 'About phone'],
];
const config = { audio: 'off', size: '1440', source: 'screen', keyboard: 'default', retry: true, fallback: true };
let state = { phones: [], sessions: [], events: [], error: '', canMix: false };
let selected = localStorage.getItem('selected') || '';
let transport = '';
let detailInfo = null;
let expandedInfo = false;
let saveTarget = '';
let noticeTimeout;
let stateShape = '';
let pendingStart = false;

function showNotice(message, kind = 'info') {
  const element = $('notice');
  element.textContent = message;
  element.className = 'notice' + (kind === 'error' ? ' error' : '');
  element.hidden = false;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { element.hidden = true; }, kind === 'error' ? 9_000 : 5_000);
}

async function invoke(promise) {
  try {
    const response = await promise;
    if (!response.ok) throw new Error(response.error);
    return response;
  } catch (error) {
    showNotice(error.message, 'error');
    return null;
  }
}

function current() {
  const phone = state.phones.find((item) => item.key === selected);
  const route = phone?.connections.find((item) => item.kind === transport);
  const active = state.sessions.find((item) => item.key === selected && item.kind === transport);
  return { phone, route, active };
}

function ensureSelection() {
  if (!state.phones.some((item) => item.key === selected) && state.phones.length) {
    selected = state.phones.find((item) => item.connections.some((link) => link.state === 'device'))?.key || state.phones[0].key;
  }
  const { phone } = current();
  if (!phone) return;
  const choices = phone.connections.map((item) => item.kind);
  if (!choices.includes(transport)) {
    transport = state.sessions.find((item) => item.key === selected && choices.includes(item.kind))?.kind
      || phone.connections.find((link) => link.state === 'device')?.kind || choices[0] || '';
  }
}

function silhouette(phone, large = false) {
  if (phone.photo) return '<img class="product-photo' + (large ? ' large' : '') + '" src="' + esc(phone.photo) + '" alt="">';
  return '<span class="profile ' + (silhouettes.has(phone.style) ? phone.style : '') + (large ? ' large' : '') + '" aria-hidden="true"></span>';
}

function brandMark(phone) {
  if (phone.brand === 'Sharp') return '<img class="brand-logo" src="sharp-mark.png" alt="Sharp">';
  return phone.brand ? '<span class="brand-label">' + esc(phone.brand) + '</span>' : '';
}

function deviceStatus(phone) {
  const names = phone.connections.map((item) => routes[item.kind]).filter(Boolean).join(' + ');
  if (!phone.connections.length) return 'Saved · disconnected';
  if (phone.connections.some((item) => item.state === 'device')) return names + (phone.saved ? ' · saved' : '');
  if (phone.connections.some((item) => item.state === 'unauthorized')) return names + ' · approve debugging';
  return names + ' · offline';
}

function renderList() {
  const connected = state.phones.filter((phone) => phone.connections.length).length;
  $('device-summary').textContent = connected + ' connected · ' + state.phones.filter((phone) => phone.saved).length + ' saved';
  $('device-list').innerHTML = state.phones.length ? state.phones.map((phone, index) => {
    const available = phone.connections.some((item) => item.state === 'device');
    return '<button type="button" class="device-row" data-device="' + index + '" aria-pressed="' + (phone.key === selected)
      + '">' + silhouette(phone) + '<span class="row-text"><strong>' + esc(nameOf(phone)) + '</strong><small>'
      + esc(deviceStatus(phone)) + '</small></span><span class="dot ' + (available ? 'ready' : phone.connections.length ? 'warn' : '')
      + '" aria-hidden="true"></span></button>';
  }).join('') : '<p class="empty-side">Connect a phone to see it here.</p>';
}

function selectElement(label, key, values, disabled = false) {
  return '<label>' + label + '<select data-config="' + key + '"' + (disabled ? ' disabled' : '') + '>'
    + values.map(([value, title]) => '<option value="' + value + '"' + (String(config[key]) === value ? ' selected' : '') + '>'
      + title + '</option>').join('') + '</select></label>';
}

function renderInfo(phone, route) {
  const date = (value) => value ? new Date(value).toLocaleString() : '—';
  const fields = [
    ['Model', phone.model], ['Added', date(phone.addedAt)], ['Last used', date(phone.lastUsedAt)],
  ];
  if (detailInfo) fields.push(
    ['Manufacturer', detailInfo.manufacturer], ['Android', detailInfo.android], ['Security patch', detailInfo.security],
    ['Display', detailInfo.display], ['Battery', detailInfo.battery ? detailInfo.battery + '%' : ''],
    ['Device serial', detailInfo.hardwareSerial], ['Current Wi‑Fi MAC', detailInfo.wifiMac],
    ['Wi‑Fi frequency', detailInfo.frequency ? detailInfo.frequency + ' MHz' : ''],
    ['Wi‑Fi link rate', detailInfo.wifiSpeed ? detailInfo.wifiSpeed + ' Mb/s' : ''],
  );
  return '<details class="device-info"' + (expandedInfo ? ' open' : '') + '><summary>Device information</summary><dl class="facts">'
    + fields.filter(([, value]) => value).map(([key, value]) => '<dt>' + esc(key) + '</dt><dd>' + esc(value) + '</dd>').join('')
    + '</dl><div class="action-row"><button type="button" class="link" data-action="info"'
    + (!route || route.state !== 'device' ? ' disabled' : '') + '>Read device details</button><button type="button" class="link" data-key="about"'
    + (!route || route.state !== 'device' ? ' disabled' : '') + '>Find IMEI in About phone ↗</button></div>'
    + '<div class="action-row photo-actions">'
    + (phone.catalogPhoto ? '<button type="button" class="link" data-action="productPhoto">Load manufacturer photo</button>' : '')
    + '<button type="button" class="link" data-action="localPhoto">Choose a device photo</button></div></details>';
}

function renderDetail() {
  const focusedOption = document.activeElement?.dataset.config;
  const { phone, route, active } = current();
  if (!phone) {
    $('device-detail').innerHTML = '<div class="empty"><div class="empty-mark" aria-hidden="true">◫</div><h1>Connect an Android device</h1>'
      + '<p>Use a USB data cable, or pair an Android 11+ phone over Wi‑Fi. Turn on debugging on the phone to start.</p>'
      + '<div class="action-row"><button type="button" class="button primary" data-page="setup">Open setup guide</button>'
      + '<button type="button" class="button secondary" data-action="pair">Connect over Wi‑Fi</button></div></div>';
    return;
  }
  const ready = route?.state === 'device';
  const disabled = ready ? '' : ' disabled';
  const lock = Boolean(active);
  const canStart = ready && !lock && !pendingStart ? '' : ' disabled';
  const total = state.sessions.filter((item) => item.key === phone.key);
  const connections = phone.connections.map((item) => '<option value="' + item.kind + '"' + (item.kind === transport ? ' selected' : '') + '>'
    + esc(routes[item.kind] || item.kind) + (item.state === 'device' ? '' : ' · ' + esc(item.state)) + '</option>').join('');
  const routeSelect = connections ? '<label>Connection <select id="route">' + connections + '</select></label>' : '<p>Reconnect this saved device to open a mirror.</p>';
  let live = total.map((item) => '<button type="button" class="chip active" data-route="' + esc(item.kind) + '">'
    + esc(routes[item.kind]) + ' · ' + (item.finalizing ? 'Finishing' : item.recording ? 'Recording' : 'Live') + '</button>').join('');
  if (active?.recording) live += '<span class="chip record">● Recording</span>';
  if (active?.micActive) live += '<span class="chip capture">● Mic active</span>';
  if (active?.cameraActive) live += '<span class="chip capture">● Camera active</span>';
  const accessHint = route?.state === 'unauthorized'
    ? '<p class="capture-note">Unlock the phone and tap <strong>Allow USB debugging</strong>. <button type="button" class="link" data-page="setup">Setup guide ↗</button></p>' : '';
  const audioItems = [['off', 'Muted'], ['output', 'Phone media sound'], ['mic', 'Phone microphone']];
  audioItems.push(['both', 'Media + mic (recording)']);
  const connectionHint = transport === 'wifi' ? '<p class="capture-note">Changing Wi‑Fi on the phone can close this connection.</p>' : '';

  $('device-detail').innerHTML = '<div class="detail-top"><div class="detail-id">' + silhouette(phone, true) + '<div>' + brandMark(phone) + '<h1>' + esc(nameOf(phone))
    + '</h1><p>' + esc(phone.model + ' · ' + deviceStatus(phone)) + '</p></div></div><div class="toolbar">'
    + (phone.catalogPhoto && !phone.photo ? '<button type="button" class="link" data-action="productPhoto">Load product photo</button>' : '')
    + (phone.canSave ? '<button type="button" class="button secondary" data-action="save">' + (phone.saved ? 'Edit saved device' : 'Save device') + '</button>' : '')
    + (phone.saved ? '<button type="button" class="link" data-action="forget">Forget</button>' : '') + '</div></div>'
    + '<section class="card"><div class="card-head"><h2>Mirror &amp; record</h2><div id="live-badges" class="toolbar">' + live + '</div></div>'
    + accessHint + '<div class="options">' + routeSelect
    + selectElement('Picture', 'source', [['screen', 'Phone screen'], ['back', 'Rear camera'], ['front', 'Front camera']], lock)
    + selectElement('Sound', 'audio', audioItems, lock)
    + selectElement('Resolution limit', 'size', [['720', '720 px'], ['1080', '1080 px'], ['1440', '1440 px'], ['0', 'Original']], lock)
    + selectElement('Keyboard input', 'keyboard', [['default', 'Standard'], ['physical', 'Physical keyboard (UHID)']], lock)
    + '</div>'
    + (config.audio === 'both' && !state.canMix ? '<p class="capture-note">Install FFmpeg and reopen OmniCast to mix phone media and microphone.</p>' : '')
    + (config.audio === 'mic' || config.audio === 'both' || config.source !== 'screen' ? '<p class="capture-note">Starting this session will use the selected phone microphone or camera.</p>' : '')
    + '<div class="action-row">'
    + (active
      ? '<button type="button" class="button danger" data-action="stop"' + (active.finalizing ? ' disabled' : '') + '>'
        + (active.finalizing ? 'Saving recording…' : active.recording ? 'Stop &amp; save' : 'Stop mirror') + '</button>'
      : '<button type="button" class="button primary" data-action="mirror"' + canStart + '>Mirror &amp; Control</button>'
        + '<button type="button" class="button secondary" data-action="view"' + canStart + '>View only</button>'
        + '<button type="button" class="button secondary" data-action="record"' + canStart + '>Record video</button>'
        + '<button type="button" class="button secondary" data-action="recordAudio"' + canStart + '>Record audio</button>')
    + '</div><div class="options recording-options">'
    + '<label class="checkbox"><input type="checkbox" data-config="retry"' + (config.retry ? ' checked' : '') + '> Retry unexpected drops</label>'
    + '<label class="checkbox"><input type="checkbox" data-config="fallback"' + (config.fallback ? ' checked' : '') + '> Fall back from USB to Wi‑Fi</label></div>'
    + '<p id="transfer">' + esc(rateText(active)) + '</p></section>'
    + '<section class="card"><div class="card-head"><h2>Phone controls</h2></div>' + connectionHint
    + '<div class="pad">' + pad.map(([key, icon, title]) => '<button type="button" class="button secondary" data-key="' + key + '"' + disabled
      + '><small aria-hidden="true">' + esc(icon) + '</small>' + title + '</button>').join('') + '</div>'
    + renderInfo(phone, route) + '</section>';
  const info = $('device-detail').querySelector('details');
  info?.addEventListener('toggle', () => { expandedInfo = info.open; });
  if (focusedOption) $('device-detail').querySelector('[data-config="' + focusedOption + '"]')?.focus({ preventScroll: true });
}

function rateText(session) {
  if (!session) return 'Transfer rate appears when mirroring starts.';
  if (session.state === 'opening') return 'Opening the mirror…';
  const format = (bits) => bits >= 1e6 ? (bits / 1e6).toFixed(2) + ' Mb/s' : (bits / 1e3).toFixed(1) + ' kb/s';
  return routes[session.kind] + ' transfer · ↓ ' + format(session.down) + ' · ↑ ' + format(session.up);
}

function renderLogs() {
  $('log-list').innerHTML = state.events.length ? state.events.map((event) => '<div class="log-row'
    + (event.type === 'Error' ? ' error' : '') + '"><time>' + esc(new Date(event.time).toLocaleTimeString())
    + '</time><b>' + esc(event.type) + '</b><span>' + esc(event.message) + '</span></div>').join('')
    : '<p class="log-empty">Connection events will appear here.</p>';
}

function applyState(next) {
  state = { ...state, ...next };
  ensureSelection();
  const shape = JSON.stringify([state.phones, state.sessions.map(({ down, up, ...item }) => item), state.canMix]);
  if (shape !== stateShape) {
    stateShape = shape;
    renderList();
    renderDetail();
  } else if ($('transfer')) $('transfer').textContent = rateText(current().active);
  $('footer-status').textContent = state.error || (state.sessions.length
    ? state.sessions.length + (state.sessions.length === 1 ? ' session open' : ' sessions open')
    : 'Ready · USB and local Wi‑Fi');
  $('recording').hidden = !state.lastRecording;
  renderLogs();
}

function setPage(page) {
  for (const item of document.querySelectorAll('main.page')) item.hidden = item.id !== page;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.page === page) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function setTransport(kind) {
  transport = kind;
  detailInfo = null;
  renderDetail();
}

async function launch(action) {
  const { phone, route } = current();
  if (!phone || route?.state !== 'device' || pendingStart) return;
  pendingStart = true;
  renderDetail();
  const record = action === 'record' ? 'video' : action === 'recordAudio' ? 'audio' : '';
  await invoke(window.omni.start(phone.key, route.kind, { ...config, record, viewOnly: action === 'view' }));
  pendingStart = false;
  renderDetail();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.page) return setPage(button.dataset.page);
  if (button.dataset.close) return $(button.dataset.close).close();
  if (button.dataset.device !== undefined) {
    const phone = state.phones[Number(button.dataset.device)];
    selected = phone.key;
    localStorage.setItem('selected', selected);
    transport = '';
    detailInfo = null;
    expandedInfo = false;
    ensureSelection();
    renderList();
    renderDetail();
    return;
  }
  if (button.dataset.route) return setTransport(button.dataset.route);
  if (button.id === 'wireless' || button.dataset.action === 'pair') return $('wireless-dialog').showModal();
  if (button.id === 'refresh') {
    const result = await invoke(window.omni.state());
    if (result) applyState(result.result);
    return;
  }
  if (button.id === 'recording') return invoke(window.omni.reveal());
  const { phone, route } = current();
  const action = button.dataset.action;
  if (!phone) return;
  if (button.dataset.key && route) return invoke(window.omni.control(phone.key, route.kind, button.dataset.key));
  if (['mirror', 'view', 'record', 'recordAudio'].includes(action)) return launch(action);
  if (action === 'stop') return invoke(window.omni.stop(phone.key, transport));
  if (action === 'save') {
    saveTarget = phone.key;
    $('save-name').value = nameOf(phone);
    $('save-auto').checked = Boolean(phone.auto);
    return $('save-dialog').showModal();
  }
  if (action === 'forget') return invoke(window.omni.forget(phone.key));
  if (action === 'productPhoto' || action === 'localPhoto') {
    const result = await invoke(window.omni.photo(phone.key, action === 'productPhoto'));
    if (result) {
      stateShape = '';
      const refreshed = await invoke(window.omni.state());
      if (refreshed) applyState(refreshed.result);
    }
    return;
  }
  if (action === 'info' && route) {
    const result = await invoke(window.omni.info(phone.key, route.kind));
    if (result && selected === phone.key && transport === route.kind) {
      detailInfo = result.result;
      expandedInfo = true;
      renderDetail();
    }
  }
});

document.addEventListener('change', (event) => {
  const field = event.target;
  if (field.id === 'route') return setTransport(field.value);
  if (field.dataset.config) {
    config[field.dataset.config] = field.type === 'checkbox' ? field.checked : field.value;
    if (field.type !== 'checkbox') renderDetail();
  }
});

$('wifi-method').addEventListener('change', () => {
  const pairing = $('wifi-method').value === 'pair';
  $('code-label').hidden = !pairing;
  $('wifi-code').required = pairing;
  $('wifi-submit').textContent = pairing ? 'Pair phone' : 'Connect';
  $('wifi-instructions').textContent = pairing
    ? 'On the phone, open Developer options → Wireless debugging → Pair device with pairing code.'
    : 'Enter the address on the main Wireless debugging screen. The phone must already trust this computer.';
});

$('wireless-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const pairing = $('wifi-method').value === 'pair';
  $('wifi-submit').disabled = true;
  const result = await invoke(pairing ? window.omni.pair($('wifi-address').value, $('wifi-code').value) : window.omni.connect($('wifi-address').value));
  $('wifi-submit').disabled = false;
  if (!result) return;
  $('wifi-code').value = '';
  $('wireless-dialog').close();
  showNotice(pairing ? 'Phone paired. Check the device list.' : 'Connected over Wi‑Fi.');
});

$('save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await invoke(window.omni.save(saveTarget, $('save-name').value, $('save-auto').checked));
  if (result) {
    $('save-dialog').close();
    showNotice('Device saved.');
  }
});

$('wireless-dialog').addEventListener('close', () => { $('wifi-code').value = ''; });
window.omni.onState(applyState);
window.omni.onNotice(({ message, kind }) => showNotice(message, kind));
renderDetail();
invoke(window.omni.state()).then((result) => { if (result) applyState(result.result); });
