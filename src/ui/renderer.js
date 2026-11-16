'use strict';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const nameOf = (phone) => phone.name || phone.title || phone.model;
const routes = { usb: 'USB', wifi: 'Wi‑Fi', emulator: 'Emulator' };
const silhouettes = new Set(['aquos', 'galaxy', 'pixel', 'tablet', 'tv']);
const config = { audio: 'off', size: '1440', source: 'screen', keyboard: 'default', retry: true, fallback: true };
const advanced = { virtualDisplay: '', flex: false, startApp: '', webcam: '' };
const videoSizes = [['720', '720 px'], ['1080', '1080 px'], ['1440', '1440 px'], ['1920', '1920 px'], ['2560', '2560 px'], ['0', 'Original']];
const keyboardModes = [['default', 'Standard'], ['physical', 'Physical keyboard (UHID)']];
let state = { phones: [], sessions: [], events: [], error: '', canMix: false, controlLibrary: [] };
let controlsTarget;
let previousSettings = '';
let expandedAdvanced = false;
let selected = localStorage.getItem('selected') || '';
let transport = '';
let detailInfo = null;
let expandedInfo = false;
let saveTarget = '';
let noticeTimeout;
let stateShape = '';
const controlStates = new Map();
let controlCheck;
const deviceTiles = new Map();
let currentPage = 'devices';
let virtualTarget;
let virtualShift = false;
const nativeShortcuts = {
  Network: ['internet', 'wifi', 'mobileData', 'bluetooth', 'hotspot', 'airplane', 'vpn', 'nfc'],
  Device: ['display', 'darkTheme', 'nightLight', 'battery', 'doNotDisturb', 'sound', 'storage'],
  Privacy: ['privacy', 'location', 'accessibility', 'notificationsMenu', 'cast', 'developer'],
};
const pendingSessions = new Set();

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
  if (phone.brandLogo) return '<img class="brand-logo' + (phone.brand === 'Sharp' ? '' : ' manufacturer') + '" src="'
    + esc(phone.brandLogo) + '" alt="' + esc(phone.brand) + '">';
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
  const connected = state.phones.filter((phone) => phone.connections.some((link) => link.state === 'device')).length;
  $('device-summary').textContent = connected + ' connected · ' + state.phones.filter((phone) => phone.saved).length + ' saved';
  $('device-list').innerHTML = state.phones.length ? state.phones.map((phone, index) => {
    const available = phone.connections.some((item) => item.state === 'device');
    return '<button type="button" class="device-row" data-device="' + index + '" aria-pressed="' + (phone.key === selected)
      + '">' + silhouette(phone) + '<span class="row-text"><strong>' + esc(nameOf(phone)) + '</strong><small>'
      + esc(deviceStatus(phone)) + '</small></span><span class="dot ' + (available ? 'ready' : phone.connections.length ? 'warn' : '')
      + '" aria-hidden="true"></span></button>';
  }).join('') : '<p class="empty-side">Connect a phone to see it here.</p>';
}

function renderSessions() {
  $('active-mirrors').hidden = state.sessions.length === 0;
  $('active-mirror-list').innerHTML = state.sessions.map((session, index) => {
    const phone = state.phones.find((item) => item.key === session.key);
    const status = session.finalizing ? 'Saving' : session.recording ? 'Recording' : session.state === 'opening' ? 'Opening' : 'Live';
    const label = phone ? nameOf(phone) : 'Android device';
    return '<div class="session-row"><button type="button" class="link" data-inspect-session="' + index + '"><strong>'
      + esc(label) + '</strong><span>' + esc(routes[session.kind] + ' · ' + status) + '</span></button>'
      + '<button type="button" class="icon-button" data-stop-session="' + index + '" aria-label="Stop ' + esc(label + ' ' + routes[session.kind])
      + '"' + (session.finalizing ? ' disabled' : '') + '>×</button></div>';
  }).join('');
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

function controlsFor(key) {
  try {
    const selected = JSON.parse(localStorage.getItem('controls:' + key));
    if (Array.isArray(selected)) return state.controlLibrary.filter((control) => selected.includes(control.id));
  } catch { /* Use standard buttons if local storage is unavailable. */ }
  return state.controlLibrary.filter((control) => control.standard);
}

function editControls(phone) {
  controlsTarget = phone.key;
  const selected = new Set(controlsFor(phone.key).map(({ id }) => id));
  const groups = Map.groupBy(state.controlLibrary, ({ group }) => group);
  $('controls-library').innerHTML = [...groups].map(([group, controls]) =>
    '<fieldset><legend>' + esc(group) + '</legend>' + controls.map(({ id, label, icon, standard }) =>
      '<label class="checkbox"><input type="checkbox" value="' + esc(id) + '" data-standard="' + standard + '"'
      + (selected.has(id) ? ' checked' : '') + '><span aria-hidden="true">' + esc(icon) + '</span>' + esc(label) + '</label>'
    ).join('') + '</fieldset>').join('');
  $('controls-dialog').showModal();
}

function settingsForm() {
  const saved = state.settings;
  if (!saved) return;
  const choices = (label, key, items) => '<label>' + label + '<select name="' + key + '">'
    + items.map(([value, title]) => '<option value="' + value + '"' + (saved[key] === value ? ' selected' : '') + '>' + title + '</option>').join('')
    + '</select></label>';
  const check = (label, key) => '<label class="checkbox"><input name="' + key + '" type="checkbox"'
    + (saved[key] ? ' checked' : '') + '> ' + label + '</label>';
  $('settings-form').innerHTML =
    '<section class="guide-card"><h2>Display and power</h2>'
    + check('Keep Android display awake during a mirror', 'keepActive')
    + check('Turn off the phone display when mirroring starts', 'screenOff')
    + check('Show physical touches on the phone', 'showTouches')
    + check('Open mirrors in fullscreen', 'fullscreen')
    + '<p>Keep awake prevents idle sleep in Mirror &amp; Control over USB or Wi‑Fi. Choose screen-off mirroring if you want the physical screen dark.</p></section>'
    + '<section class="guide-card"><h2>Video quality</h2><div class="options">'
    + choices('Resolution limit', 'size', videoSizes)
    + choices('Frame rate limit', 'fps', [['0', 'Automatic'], ...[30, 60, 90, 120].map((n) => [String(n), n + ' fps'])])
    + choices('Video codec', 'codec', [['h264', 'H.264'], ['h265', 'H.265 (HEVC)'], ['av1', 'AV1']])
    + choices('Video bitrate', 'bitRate', [2, 4, 8, 12, 16, 24].map((n) => [String(n), n + ' Mb/s']))
    + choices('Video decoding', 'decoder', [['auto', 'Automatic (prefer hardware)'], ['hardware', 'Hardware acceleration'], ['software', 'Software decoding']])
    + '</div>'
    + '<p>Available codecs and frame rates depend on the phone encoder.</p></section>'
    + '<section class="guide-card"><h2>Input and clipboard</h2><div class="options">'
    + choices('Keyboard', 'keyboard', keyboardModes)
    + choices('Mouse', 'mouse', [['default', 'Direct pointer'], ['physical', 'Physical mouse (UHID)']])
    + '</div>' + check('Forward connected gamepads', 'gamepad') + check('Sync clipboard with Android', 'clipboard')
    + '<p>Use physical keyboard and mouse for Android games with native input. Alt, Super, or Command releases a captured pointer.</p></section>'
    + '<section class="guide-card"><h2>Connection recovery</h2>' + check('Retry unexpected drops', 'retry')
    + check('Fall back from USB to Wi‑Fi', 'fallback') + '<p>Wi‑Fi fallback requires an authorized wireless connection to the same phone.</p></section>'
    + '<div class="action-row"><button class="button primary" type="submit">Save settings</button>'
    + '<button class="button secondary" id="gaming-settings" type="button">Use gaming defaults</button>'
    + '<button class="button secondary" id="restore-settings" type="button">Restore defaults</button></div>';
}

function launchOptions(locked) {
  const disabled = locked ? ' disabled' : '';
  const input = (label, option, placeholder) => '<label>' + label + '<input data-advanced="' + option + '" value="'
    + esc(advanced[option]) + '" placeholder="' + placeholder + '"' + disabled + '></label>';
  return '<details id="advanced-capture"' + (expandedAdvanced ? ' open' : '') + '><summary>Advanced capture</summary>'
    + '<div class="options">' + input('Virtual display size', 'virtualDisplay', '720x1280')
    + input('App package on virtual display', 'startApp', 'org.videolan.vlc')
    + '<label class="checkbox"><input type="checkbox" data-advanced="flex"' + (advanced.flex ? ' checked' : '') + disabled
    + '> Resize virtual display with window</label>'
    + (state.platform === 'linux' ? input('V4L2 loopback output', 'webcam', '/dev/video2') : '')
    + '</div><p>Enter a size to create a separate display. Flex mode needs Mirror &amp; Control.</p></details>';
}

function controlButton(control, disabled) {
  const { id, icon, label } = control;
  const { phone } = current();
  const status = controlStates.get(phone.key);
  const pressed = id === 'mute' ? status?.muted : ['notifications', 'quickSettings'].includes(id) ? status?.shade : undefined;
  return '<button type="button" class="button secondary" data-key="' + esc(id) + '"' + disabled
    + (pressed !== undefined && pressed !== null ? ' aria-pressed="' + pressed + '"' : '')
    + '><small aria-hidden="true">' + esc(icon) + '</small>' + esc(label) + '</button>';
}

function updateControlHighlights() {
  const { phone, route } = current();
  const status = controlStates.get(phone?.key);
  $('android-nav').hidden = currentPage !== 'devices' || !phone;
  for (const button of $('android-nav').querySelectorAll('button')) button.disabled = route?.state !== 'device';
  for (const name of ['mute', 'notifications', 'quickSettings']) {
    const pressed = name === 'mute' ? status?.muted : status?.shade;
    for (const button of document.querySelectorAll('[data-key="' + name + '"]')) {
      if (pressed === undefined || pressed === null) button.removeAttribute('aria-pressed');
      else button.setAttribute('aria-pressed', String(pressed));
    }
  }
}

async function refreshControls() {
  const { phone, route } = current();
  if (controlCheck || route?.state !== 'device' || currentPage !== 'devices' || document.hidden) return;
  const lastShadeClick = controlStates.get(phone.key)?.shadeChangedAt || 0;
  controlCheck = window.omni.controlState(phone.key, route.kind);
  try {
    const result = await controlCheck;
    if (result.ok) {
      const previous = controlStates.get(phone.key) || {};
      const settled = Date.now() - lastShadeClick > 450 && lastShadeClick === (previous.shadeChangedAt || 0);
      controlStates.set(phone.key, { ...previous, muted: result.result.muted,
        shade: settled ? result.result.shade ?? previous.shade : previous.shade });
      updateControlHighlights();
    }
  } catch { /* The selected connection might have closed. */ }
  finally { controlCheck = undefined; }
}

function renderShortcuts(disabled) {
  const catalog = new Map(state.controlLibrary.map((control) => [control.id, control]));
  const tiles = deviceTiles.get(current().phone?.key);
  const customTiles = tiles?.map((component, index) => {
    const service = component.split(/[/.]/).pop();
    const label = service.replace(/(?:Qs)?Tile(?:Service)?$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    return '<button type="button" class="button secondary" data-tile="' + index + '" title="' + esc(component) + '"'
      + disabled + '>' + esc(label || service) + '</button>';
  }).join('') || '';
  return '<section class="card"><div class="card-head"><h2>Quick Settings</h2></div>'
    + Object.entries(nativeShortcuts).map(([group, buttons]) => '<h3 class="shortcut-group">' + group + '</h3><div class="pad">'
      + buttons.map((id) => catalog.get(id)).filter(Boolean).map((control) => controlButton(control, disabled)).join('')
      + '</div>').join('')
    + '<div class="action-row device-tools"><button type="button" class="button secondary" data-key="quickSettings"'
    + disabled + '>Open Android tiles</button><button type="button" class="link" data-action="loadTiles"' + disabled
    + '>Load pinned app tiles</button></div>'
    + (customTiles ? '<h3 class="shortcut-group">Pinned app tiles</h3><div class="pad">' + customTiles + '</div>'
      : tiles ? '<p class="capture-note">No app tiles are pinned for this Android user.</p>' : '')
    + '<p class="capture-note">Open Android tiles for device-specific and installed app shortcuts such as Flashlight, Camera access, and Quick Share.</p></section>';
}

function showVirtualInput(type, phone, route) {
  if (route?.state !== 'device') return;
  virtualTarget = { key: phone.key, kind: route.kind, type };
  virtualShift = false;
  const dial = type === 'dial';
  $('virtual-title').textContent = dial ? 'Phone dial pad' : 'Virtual keyboard';
  $('virtual-hint').textContent = dial ? 'Enter a number, then open the phone’s dialer to review it.'
    : 'Focus a text field on Android, then send the text. The built-in keypad supports ASCII.';
  $('virtual-field-label').firstChild.textContent = dial ? 'Phone number ' : 'Text ';
  $('virtual-field').value = '';
  $('virtual-field').inputMode = dial ? 'tel' : 'text';
  $('virtual-field').maxLength = dial ? 45 : 256;
  $('virtual-submit').textContent = dial ? 'Open in dialer' : 'Send text';
  renderVirtualKeys();
  $('virtual-dialog').showModal();
}

function renderVirtualKeys() {
  const dial = virtualTarget.type === 'dial';
  const rows = dial ? ['123', '456', '789', '*0#', '+']
    : ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '.,!?@-_'];
  const key = (value, label) => '<button type="button" class="button secondary" data-virtual="' + esc(value)
    + '">' + esc(label ?? value) + '</button>';
  $('virtual-keys').className = dial ? 'virtual-keys dial-keys' : 'virtual-keys';
  $('virtual-keys').innerHTML = rows.map((row) => '<div>' + [...row].map((letter) => key(virtualShift ? letter.toUpperCase() : letter)).join('') + '</div>').join('')
    + '<div>' + (dial ? '' : key('shift', virtualShift ? 'Lowercase' : 'Shift') + key(' ', 'Space')) + key('erase', '⌫ Clear last') + '</div>';
}

function otgButton() {
  return '<button type="button" class="button secondary" data-action="' + (state.otg ? 'stopOtg' : 'otg') + '">'
    + (state.otg ? 'Stop USB input' : 'USB input without debugging') + '</button>';
}

function renderDetail() {
  const focusedOption = document.activeElement?.dataset.config;
  const advancedField = document.activeElement?.dataset.advanced;
  const { phone, route, active } = current();
  if (!phone) {
    $('device-detail').innerHTML = '<div class="empty"><img class="empty-mark" src="omnicast.png" alt=""><h1>Connect an Android device</h1>'
      + '<p>Use a USB data cable, or pair an Android 11+ phone over Wi‑Fi. Turn on debugging on the phone to start.</p>'
      + '<div class="action-row"><button type="button" class="button primary" data-page="setup">Open setup guide</button>'
      + '<button type="button" class="button secondary" data-action="pair">Connect over Wi‑Fi</button>' + otgButton() + '</div></div>';
    updateControlHighlights();
    return;
  }
  const ready = route?.state === 'device';
  const disabled = ready ? '' : ' disabled';
  const lock = Boolean(active);
  const canStart = ready && !lock && !pendingSessions.has(phone.key + '|' + route.kind) ? '' : ' disabled';
  const total = state.sessions.filter((item) => item.key === phone.key);
  const connections = phone.connections.map((item) => '<option value="' + item.kind + '"' + (item.kind === transport ? ' selected' : '') + '>'
    + esc(routes[item.kind] || item.kind) + (item.state === 'device' ? '' : ' · ' + esc(item.state)) + '</option>').join('');
  const routeSelect = connections ? '<label>Connection <select id="route">' + connections + '</select></label>' : '<p>Reconnect this saved device to open a mirror.</p>';
  let live = total.map((item) => '<button type="button" class="chip active" data-route="' + esc(item.kind) + '">'
    + esc(routes[item.kind]) + ' · ' + (item.finalizing ? 'Finishing' : item.recording ? 'Recording' : 'Live') + '</button>').join('');
  if (active?.recording) live += '<span class="chip record">● Recording</span>';
  if (active?.micActive) live += '<span class="chip capture">● Mic active</span>';
  if (active?.cameraActive) live += '<span class="chip capture">● Camera active</span>';
  if (active?.keepActive) live += '<span class="chip active">Keep awake</span>';
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
    + selectElement('Resolution limit', 'size', videoSizes, lock)
    + selectElement('Keyboard input', 'keyboard', keyboardModes, lock)
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
    + '</div>' + launchOptions(lock) + '<div class="options recording-options">'
    + '<label class="checkbox"><input type="checkbox" data-config="retry"' + (config.retry ? ' checked' : '') + '> Retry unexpected drops</label>'
    + '<label class="checkbox"><input type="checkbox" data-config="fallback"' + (config.fallback ? ' checked' : '') + '> Fall back from USB to Wi‑Fi</label></div>'
    + '<p id="transfer">' + esc(rateText(active)) + '</p></section>'
    + '<section class="card"><div class="card-head"><h2>Phone controls</h2><button class="link" type="button" data-action="customize">Customize controls</button></div>' + connectionHint
    + '<div class="pad">' + controlsFor(phone.key).map((control) => controlButton(control, disabled)).join('') + '</div>'
    + '<div class="action-row device-tools"><button type="button" class="button secondary" data-action="keyboard"' + disabled + '>Virtual keyboard</button>'
    + '<button type="button" class="button secondary" data-action="dial"' + disabled + '>Dial pad</button>'
    + '<button type="button" class="button secondary" data-page="adb-tools">ADB tools</button>' + otgButton() + '</div>'
    + renderInfo(phone, route) + '</section>' + renderShortcuts(disabled);
  updateControlHighlights();
  $('advanced-capture')?.addEventListener('toggle', (event) => { expandedAdvanced = event.target.open; });
  const info = $('device-detail').querySelector('.device-info');
  info?.addEventListener('toggle', () => { expandedInfo = info.open; });
  if (focusedOption) $('device-detail').querySelector('[data-config="' + focusedOption + '"]')?.focus({ preventScroll: true });
  if (advancedField) $('device-detail').querySelector('[data-advanced="' + advancedField + '"]')?.focus({ preventScroll: true });
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
  const nextSettings = JSON.stringify(state.settings);
  if (nextSettings !== previousSettings) {
    previousSettings = nextSettings;
    Object.assign(config, state.settings);
    settingsForm();
  }
  const shape = JSON.stringify([state.phones, state.sessions.map(({ down, up, ...item }) => item), state.canMix, state.settings, state.otg, state.controlLibrary]);
  if (shape !== stateShape) {
    stateShape = shape;
    renderList();
    renderSessions();
    renderDetail();
  } else if ($('transfer')) $('transfer').textContent = rateText(current().active);
  $('footer-status').textContent = state.error || (state.sessions.length
    ? state.sessions.length + (state.sessions.length === 1 ? ' session open' : ' sessions open')
    : 'Ready · USB and local Wi‑Fi');
  $('recording').hidden = !state.lastRecording;
  renderLogs();
  document.dispatchEvent(new Event('omni-selection'));
}

function setPage(page) {
  currentPage = page;
  updateControlHighlights();
  document.dispatchEvent(new Event('omni-selection'));
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
  document.dispatchEvent(new Event('omni-selection'));
}

async function launch(action) {
  const { phone, route } = current();
  if (!phone || route?.state !== 'device') return;
  const id = phone.key + '|' + route.kind;
  if (pendingSessions.has(id)) return;
  pendingSessions.add(id);
  renderDetail();
  const record = action === 'record' ? 'video' : action === 'recordAudio' ? 'audio' : '';
  const special = record === 'audio' ? {} : config.source !== 'screen' ? { webcam: advanced.webcam } : advanced;
  await invoke(window.omni.start(phone.key, route.kind, { ...config, ...special, record, viewOnly: action === 'view' }));
  pendingSessions.delete(id);
  renderDetail();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.page) return setPage(button.dataset.page);
  if (button.dataset.close) return $(button.dataset.close).close();
  if (button.dataset.stopSession !== undefined) {
    const session = state.sessions[Number(button.dataset.stopSession)];
    if (session) await invoke(window.omni.stop(session.key, session.kind));
    return;
  }
  if (button.dataset.inspectSession !== undefined) {
    const session = state.sessions[Number(button.dataset.inspectSession)];
    if (session) {
      selected = session.key;
      localStorage.setItem('selected', selected);
      setTransport(session.kind);
      renderList();
    }
    return;
  }
  if (button.dataset.device !== undefined) {
    const phone = state.phones[Number(button.dataset.device)];
    selected = phone.key;
    localStorage.setItem('selected', selected);
    transport = '';
    detailInfo = null;
    expandedInfo = false;
    ensureSelection();
    document.dispatchEvent(new Event('omni-selection'));
    renderList();
    renderDetail();
    return;
  }
  if (button.dataset.virtual !== undefined) {
    const key = button.dataset.virtual;
    const field = $('virtual-field');
    if (key === 'shift') {
      virtualShift = !virtualShift;
      renderVirtualKeys();
    } else {
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      if (key === 'erase') field.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
      else if (field.value.length - (end - start) < field.maxLength) field.setRangeText(key, start, end, 'end');
      field.focus();
    }
    return;
  }
  if (button.dataset.route) return setTransport(button.dataset.route);
  if (button.id === 'wireless' || button.dataset.action === 'pair') {
    $('wireless-dialog').showModal();
    $('wifi-scan').click();
    return;
  }
  if (button.id === 'gaming-settings') {
    const fields = $('settings-form').elements;
    fields.fps.value = '60';
    fields.codec.value = 'h264';
    fields.bitRate.value = '8';
    fields.keyboard.value = 'physical';
    fields.mouse.value = 'physical';
    fields.gamepad.checked = true;
    fields.keepActive.checked = true;
    fields.screenOff.checked = false;
    showNotice('Gaming defaults filled in. Click Save settings to apply them.');
    return;
  }
  if (button.id === 'restore-settings') {
    const result = await invoke(window.omni.settings({}));
    if (result) {
      Object.assign(config, result.result);
      settingsForm();
      renderDetail();
      showNotice('Default settings restored.');
    }
    return;
  }
  if (['controls-all', 'controls-clear', 'controls-default'].includes(button.id)) {
    for (const input of $('controls-library').querySelectorAll('input')) {
      input.checked = button.id === 'controls-all' || (button.id === 'controls-default' && input.dataset.standard === 'true');
    }
    return;
  }
  if (button.id === 'refresh') {
    const result = await invoke(window.omni.state());
    if (result) applyState(result.result);
    return;
  }
  if (button.id === 'recording') return invoke(window.omni.reveal());
  const { phone, route } = current();
  const action = button.dataset.action;
  if (action === 'otg') return invoke(window.omni.otg(phone?.key));
  if (action === 'stopOtg') return invoke(window.omni.stopOtg());
  if (!phone) return;
  if (action === 'loadTiles' && route?.state === 'device') {
    const result = await invoke(window.omni.quickTiles(phone.key, route.kind));
    if (result) {
      deviceTiles.set(phone.key, result.result);
      if (current().phone?.key === phone.key) renderDetail();
    }
    return;
  }
  if (button.dataset.tile !== undefined && route?.state === 'device') {
    const component = deviceTiles.get(phone.key)?.[Number(button.dataset.tile)];
    if (component) await invoke(window.omni.clickQuickTile(phone.key, route.kind, component));
    return;
  }
  if (action === 'customize') return editControls(phone);
  if (action === 'keyboard' || action === 'dial') return showVirtualInput(action === 'dial' ? 'dial' : 'text', phone, route);
  if (button.dataset.key && route) {
    const previous = controlStates.get(phone.key) || {};
    const result = await invoke(window.omni.control(phone.key, route.kind, button.dataset.key, previous.shade));
    if (result?.result?.muted !== undefined) {
      controlStates.set(phone.key, { ...controlStates.get(phone.key), muted: result.result.muted });
    }
    if (result?.result?.shade !== undefined) {
      controlStates.set(phone.key, { ...controlStates.get(phone.key), shade: result.result.shade, shadeChangedAt: Date.now() });
    }
    updateControlHighlights();
    await refreshControls();
    return;
  }
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
  if (field.form?.id === 'settings-form' && field.checked && ['keepActive', 'screenOff'].includes(field.name)) {
    field.form.elements[field.name === 'keepActive' ? 'screenOff' : 'keepActive'].checked = false;
  }
  if (field.dataset.config) {
    config[field.dataset.config] = field.type === 'checkbox' ? field.checked : field.value;
    if (field.type !== 'checkbox') renderDetail();
  }
});

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries([...event.currentTarget.elements].filter((field) => field.name).map((field) =>
    [field.name, field.type === 'checkbox' ? field.checked : field.value]));
  const result = await invoke(window.omni.settings(values));
  if (result) {
    Object.assign(config, result.result);
    renderDetail();
    showNotice('Settings saved. They apply to the next mirror.');
  }
});

$('controls-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const controls = [...$('controls-library').querySelectorAll('input:checked')].map((input) => input.value);
  localStorage.setItem('controls:' + controlsTarget, JSON.stringify(controls));
  $('controls-dialog').close();
  renderDetail();
});

document.addEventListener('input', (event) => {
  const field = event.target;
  if (field.dataset.advanced) advanced[field.dataset.advanced] = field.type === 'checkbox' ? field.checked : field.value.trim();
});

$('save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await invoke(window.omni.save(saveTarget, $('save-name').value, $('save-auto').checked));
  if (result) {
    $('save-dialog').close();
    showNotice('Device saved.');
  }
});

$('virtual-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { key, kind, type } = virtualTarget;
  const button = $('virtual-submit');
  button.disabled = true;
  const result = await invoke(window.omni.virtualInput(key, kind, type, $('virtual-field').value));
  button.disabled = false;
  if (result) {
    showNotice(type === 'dial' ? 'Opened the Android dialer.' : 'Text sent.');
    $('virtual-field').value = '';
  }
});
$('virtual-dialog').addEventListener('close', () => { $('virtual-field').value = ''; });
setInterval(refreshControls, 3000);
window.omni.onState(applyState);
window.omni.onNotice(({ message, kind }) => showNotice(message, kind));
renderDetail();
invoke(window.omni.state()).then((result) => { if (result) applyState(result.result); });
