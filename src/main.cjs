'use strict';

const { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { findTools, groupDevices, identityFor, mirrorArgs, readDevices, run, validateAddress } = require('./devices.cjs');
const { controls, controlLibrary } = require('./controls.cjs');
const { defaults, normalizePreferences } = require('./preferences.cjs');
const { actions, createTerminal } = require('./terminal.cjs');
const { parseServices, qrCredentials, readAdbQR } = require('./wireless.cjs');
const { createMeter } = require('./meter.cjs');
const { logo, profile } = require('./catalog.cjs');

app.setName('OmniCast');
protocol.registerSchemesAsPrivileged([{ scheme: 'omnicast', privileges: { standard: true, secure: true } }]);
const page = 'omnicast://app/index.html';
const vendors = new Map([
  ['/xterm.js', require.resolve('@xterm/xterm')],
  ['/xterm.css', require.resolve('@xterm/xterm/css/xterm.css')],
  ['/fit.js', require.resolve('@xterm/addon-fit')],
  ['/jsqr.js', require.resolve('jsqr')],
  ['/qrcode.js', require.resolve('qrcode-generator')],
]);
const assets = new Set(['/index.html', '/styles.css', '/renderer.js', '/inter.woff2', '/sharp-mark.png', '/omnicast.png', '/adb-tools.js', '/adb-help.js', '/wireless-ui.js']);
let window;
let tools;
let stateFile;
let settingsFile;
let settings = { ...defaults };
let otg;
let pairingPromise;
const terminal = createTerminal({
  getTools,
  send(data) { if (window && !window.isDestroyed()) window.webContents.send('terminal-data', data); },
});
let logFile;
let saved = [];
let detected = [];
let connections = [];
let discovery;
let latestError = '';
let lastRecording;
let quitting = false;
const sessions = new Map();
const identityCache = new Map();
const autoAttempts = new Set();
const recoveries = new Map();
const knownWireless = new Map();
const events = [];
const photoAttempts = new Set();
let knownLinks = new Map();

function writeSaved(next) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile + '.tmp', JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(stateFile + '.tmp', stateFile);
  saved = next;
}

function sendNotice(message, kind = 'info') {
  if (window && !window.isDestroyed()) window.webContents.send('notice', { message, kind });
}

function log(type, message) {
  events.unshift({ time: Date.now(), type, message });
  if (events.length > 100) events.pop();
  if (logFile) {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.writeFileSync(logFile + '.tmp', JSON.stringify(events), { mode: 0o600 });
      fs.renameSync(logFile + '.tmp', logFile);
    } catch { /* Retain the current session's log in memory if storage is unavailable. */ }
  }
}

function sessionID(key, kind) { return key + '|' + kind; }

function photoKey(model) {
  return createHash('sha256').update(model).digest('hex') + '.png';
}

function photoPath(filename) {
  return path.join(app.getPath('userData'), 'photos', filename);
}

async function setPhoto(key, useCatalog, automatic = false) {
  const phone = groupDevices(connections, saved).find((device) => device.key === key);
  if (!phone) throw new Error('Select a phone first.');
  let data;
  if (useCatalog === true) {
    const url = profile(phone.model).photo;
    if (!url) throw new Error('There is no verified catalog photo for this model yet.');
    const response = await net.fetch(url, {
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !/^image\/(?:png|jpeg|webp)/i.test(response.headers.get('content-type') || '')) {
      throw new Error('The manufacturer photo is unavailable.');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > 5 * 1024 * 1024) throw new Error('The product image exceeds the size limit.');
      chunks.push(Buffer.from(chunk));
    }
    data = Buffer.concat(chunks);
  } else {
    const answer = await dialog.showOpenDialog(window, {
      title: 'Choose a device photo', properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (answer.canceled) return;
    const filename = answer.filePaths[0];
    if (fs.statSync(filename).size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
    data = fs.readFileSync(filename);
  }
  const image = nativeImage.createFromBuffer(data);
  if (image.isEmpty()) throw new Error('OmniCast could not read that photo.');
  const filename = photoPath(photoKey(phone.model));
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try {
    fs.writeFileSync(filename, image.resize({ width: 320, quality: 'good' }).toPNG(),
      { mode: 0o600, flag: automatic ? 'wx' : 'w' });
  } catch (error) {
    if (automatic && error.code === 'EEXIST') return;
    throw error;
  }
  publish();
}

function loadCatalogPhotos() {
  for (const phone of groupDevices(connections, saved)) {
    if (!profile(phone.model).photo || photoAttempts.has(phone.model)
      || fs.existsSync(photoPath(photoKey(phone.model)))) continue;
    photoAttempts.add(phone.model);
    setPhoto(phone.key, true, true).catch(() => { /* The manual button can retry when the network returns. */ });
  }
}

function snapshot() {
  return {
    phones: groupDevices(connections, saved).map((phone) => {
      const modelProfile = profile(phone.model, phone.connections[0]?.manufacturer || phone.brand);
      const photo = photoKey(phone.model);
      return {
        ...phone, brand: modelProfile.brand, brandLogo: logo(modelProfile.brand), catalogPhoto: Boolean(modelProfile.photo),
        photo: fs.existsSync(photoPath(photo)) ? '/photos/' + photo : '',
        connections: phone.connections.map(({ serial, photo: manufacturerImage, ...connection }) => connection),
      };
    }),
    sessions: [...sessions.values()].map(({ key, kind, clock, options, finalizing, meters = [], mirror }) => {
      const tracks = meters.map((meter) => meter.stats());
      return {
        key, kind, clock, keepActive: !options.viewOnly && options.keepActive, recording: Boolean(options.record), audio: options.audio, camera: options.camera, finalizing,
        state: finalizing ? 'finishing' : !mirror ? 'opening' : 'running',
        micActive: tracks[options.audio === 'both' ? 1 : 0]?.live && ['mic', 'both'].includes(options.audio),
        cameraActive: tracks[0]?.live && Boolean(options.camera),
        down: tracks.reduce((sum, rate) => sum + rate.down, 0),
        up: tracks.reduce((sum, rate) => sum + rate.up, 0),
      };
    }),
    error: latestError, lastRecording: lastRecording ? path.basename(lastRecording) : '',
    canMix: Boolean(localFFmpeg()), events, controlLibrary, settings, platform: process.platform, otg: Boolean(otg),
  };
}

function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('state', snapshot());
}

function localFFmpeg() {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const paths = [
    process.env.FFMPEG,
    path.join(process.resourcesPath, 'tools', 'ffmpeg' + suffix),
    ...[...(process.env.PATH || '').split(path.delimiter), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin']
      .filter(Boolean).map((dir) => path.join(dir, 'ffmpeg' + suffix)),
  ];
  return paths.find((candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
  });
}

function getTools() {
  return tools ||= findTools(process.resourcesPath);
}

function adb(args, options) {
  const { adb: executable, env } = getTools();
  return run(executable, args, { env, ...options });
}

async function discover() {
  if (discovery) return discovery;
  discovery = (async () => {
    try {
      detected = readDevices(await adb(['devices', '-l']));
      const live = new Set(detected.map(({ transport }) => transport));
      for (const transport of identityCache.keys()) {
        if (!live.has(transport)) identityCache.delete(transport);
      }
      connections = await Promise.all(detected.map(async (device) => {
        let info = identityCache.get(device.transport);
        if (!info && device.state === 'device') {
          try {
            const [serial, manufacturer, sdk, form, model] = (await adb(
              ['-s', device.serial, 'shell', 'getprop ro.serialno; getprop ro.product.manufacturer; getprop ro.build.version.sdk; getprop ro.build.characteristics; getprop ro.product.model'],
              { timeout: 2_500 },
            )).split(/\r?\n/);
            info = { ...identityFor(device, serial), manufacturer: manufacturer || '', sdk: Number(sdk) || 0, form, model: model?.trim() || device.model };
            if (serial || sdk) identityCache.set(device.transport, info);
          } catch { /* A device can disconnect while it is being detected. */ }
        }
        const model = info?.model || device.model;
        return { ...device, ...(info || identityFor(device)), model, ...profile(model, info?.manufacturer, info?.form), sdk: info?.sdk || 0 };
      }));
      const liveLinks = new Map(groupDevices(connections, []).flatMap((phone) => phone.connections.map((connection) => [
        phone.key + '|' + connection.kind, { title: phone.title, kind: connection.kind, state: connection.state },
      ])));
      for (const [id, link] of knownLinks) if (!liveLinks.has(id)) log('Disconnected', link.title + ' · ' + transportName(link.kind));
      for (const [id, link] of liveLinks) {
        if (knownLinks.get(id)?.state !== link.state) log('Connection', link.title + ' · ' + transportName(link.kind) + ' · ' + link.state);
      }
      knownLinks = liveLinks;
      for (const link of connections) {
        if (link.kind === 'wifi' && link.state === 'device') knownWireless.set(link.key, link.serial);
      }
      loadCatalogPhotos();
      latestError = '';
      const usb = new Set(connections.filter((device) => device.kind === 'usb' && device.state === 'device').map((d) => d.key));
      for (const key of autoAttempts) if (!usb.has(key)) autoAttempts.delete(key);
      for (const phone of saved) {
        if (!phone.auto || !usb.has(phone.key) || autoAttempts.has(phone.key) || sessions.has(sessionID(phone.key, 'usb'))) continue;
        autoAttempts.add(phone.key);
        startSession(phone.key, 'usb', { ...settings, audio: 'off' }).catch((error) => sendNotice(error.message, 'error'));
      }
    } catch (error) {
      if (latestError !== error.message) log('Error', 'Device detection failed. ' + error.message);
      latestError = error.message;
      tools = null;
    } finally {
      discovery = null;
      publish();
    }
    return snapshot();
  })();
  return discovery;
}

function transportName(kind) {
  return { usb: 'USB', wifi: 'Wi‑Fi', emulator: 'Emulator' }[kind] || 'Connection';
}

function requireDevice(key, kind) {
  const target = groupDevices(connections, saved).find((device) => device.key === key)
    ?.connections.find((device) => device.kind === kind && device.state === 'device');
  if (!target) throw new Error('That connection is unavailable. Reconnect the phone and approve debugging.');
  return target;
}

function adbTarget(target) {
  return /^\d+$/.test(target.transport) ? ['-t', target.transport] : ['-s', target.serial];
}

const shadeAction = new Set(['notifications', 'quickSettings']);

async function shadeOpen(base) {
  const windows = await adb([...base, 'dumpsys', 'window', 'windows', 'NotificationShade']);
  const shade = /Window #\d+ Window\{[^\n}]+ NotificationShade\}:([\s\S]*?)(?=\n\s*Window #\d+ Window|$)/.exec(windows)?.[1];
  const visible = /\bisVisible=(true|false)\b/.exec(shade || '')?.[1];
  return visible === undefined ? null : visible === 'true';
}

async function deviceControlState(key, kind) {
  const base = [...adbTarget(requireDevice(key, kind)), 'shell'];
  const [audio, shade] = await Promise.all([
    adb([...base, 'dumpsys audio | sed -n "/^- STREAM_MUSIC:/,+2p"']).catch(() => ''),
    shadeOpen(base).catch(() => null),
  ]);
  const muted = /\bMuted:\s*(true|false)\b/.exec(audio)?.[1];
  return { muted: muted === undefined ? null : muted === 'true', shade };
}

async function deviceControl(key, kind, action, wasOpen) {
  if (!controls.has(action)) throw new Error('Unknown device control.');
  if (!shadeAction.has(action)) return setting(controls.get(action), key, kind);
  const base = [...adbTarget(requireDevice(key, kind)), 'shell'];
  const open = await shadeOpen(base).catch(() => null);
  const collapse = open ?? wasOpen === true;
  await setting(collapse ? ['cmd', 'statusbar', 'collapse'] : controls.get(action), key, kind);
  return { shade: !collapse };
}

async function quickTiles(key, kind) {
  const text = await setting(['settings', 'get', 'secure', 'sysui_qs_tiles'], key, kind);
  return [...new Set(text.split(',').map((tile) =>
    /^custom\(([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.$]+)\)$/.exec(tile.trim())?.[1]).filter(Boolean))];
}

async function clickQuickTile(key, kind, component) {
  if (!(await quickTiles(key, kind)).includes(component)) throw new Error('That tile is no longer pinned on the phone.');
  // The component is from the strict Quick Settings allowlist, with shell metacharacters quoted.
  await setting(['cmd', 'statusbar', 'click-tile', "'" + component + "'"], key, kind);
}

async function virtualInput(key, kind, type, text) {
  if (type === 'dial') {
    if (typeof text !== 'string' || !/^[0-9*#+]{1,45}$/.test(text)) throw new Error('Enter a phone number or dial code.');
    const number = encodeURIComponent(text).replaceAll('*', '%2A');
    return setting(['am', 'start', '-a', 'android.intent.action.DIAL', '-d', 'tel:' + number], key, kind);
  }
  if (type !== 'text' || typeof text !== 'string' || !/^[ -~]{1,256}$/.test(text)) {
    throw new Error('Enter up to 256 ASCII characters or use clipboard paste in the mirror for other scripts.');
  }
  // Android input converts %s to a space. Split a literal %s into separate injections.
  const blocks = text.split(/(?<=%)\b(?=s)/);
  for (const block of blocks) {
    const literal = "'" + block.replaceAll(' ', '%s').replaceAll("'", "'\\''") + "'";
    await setting(['input text ' + literal], key, kind);
  }
}

async function setting(args, key, kind) {
  const response = await adb([...adbTarget(requireDevice(key, kind)), 'shell', ...args]);
  if (/(?:^|\n)\s*(?:Error\b|Exception\b|Unknown command|Security exception)/i.test(response)) {
    throw new Error('Android does not expose this control on the selected phone.');
  }
  return response;
}

function childMirror(args) {
  const { scrcpy, env } = getTools();
  let command = scrcpy;
  if (process.platform === 'win32') {
    command = path.join(process.resourcesPath, 'tools', 'mirror-host.exe');
    args = [scrcpy, ...args];
  }
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  const append = (chunk) => { output = (output + chunk.toString()).slice(-8_000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.stdin.on('error', () => {});
  const started = new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  const done = new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: -1, output: error.message }));
    child.once('close', (code) => resolve({ code, output }));
  });
  return {
    started, done,
    stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === 'win32') child.stdin.end('stop\n');
      else child.kill('SIGINT');
    },
  };
}

async function chooseRecording(phone, audioOnly) {
  const ext = audioOnly ? 'm4a' : 'mp4';
  const safeName = phone.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'android';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const file = await dialog.showSaveDialog(window, {
    title: audioOnly ? 'Save audio recording' : 'Save screen recording',
    defaultPath: path.join(app.getPath('videos'), safeName + '-' + stamp + '.' + ext),
    filters: [{ name: audioOnly ? 'M4A audio' : 'MP4 video', extensions: [ext] }],
  });
  if (file.canceled || !file.filePath) return null;
  if (file.filePath.toLowerCase().endsWith('.' + ext)) return file.filePath;
  const withExtension = file.filePath + '.' + ext;
  if (fs.existsSync(withExtension)) throw new Error('Choose the existing filename exactly to confirm that it can be replaced.');
  return withExtension;
}

async function finishSession(session, result) {
  if (sessions.get(session.id) !== session) return;
  if (session.mic) {
    session.mic.stop();
    await session.mic.done;
  }
  for (const meter of session.meters || []) meter.close();
  const unexpected = result.code !== 0 && !session.stopping;
  log(unexpected ? 'Disconnected' : 'Session',
    session.name + ' · ' + transportName(session.kind) + (unexpected ? ' mirror ended unexpectedly' : ' mirror stopped'));
  if (session.options.record) {
    session.finalizing = true;
    publish();
    try {
      let output = session.recordOutput;
      if (session.mix) {
        const { directory, media, mic, ffmpeg } = session.mix;
        const partial = path.join(directory, session.options.audioOnly ? 'merged.m4a' : 'merged.mp4');
        const mapVideo = session.options.audioOnly ? [] : ['-map', '0:v:0', '-c:v', 'copy'];
        await run(ffmpeg, [
          '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', media, '-i', mic,
          '-filter_complex', '[0:a:0][1:a:0]amix=inputs=2:duration=first:normalize=1[audio]',
          ...mapVideo, '-map', '[audio]', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', partial,
        ], { timeout: 300_000 });
        output = partial;
      }
      if (fs.statSync(output).size === 0) throw new Error('The recording is empty.');
      fs.renameSync(output, session.options.record);
      lastRecording = session.options.record;
      try { fs.rmSync(session.recordDirectory, { recursive: true }); } catch { /* The recording was already saved. */ }
      log('Recording', session.name + ' · recording saved');
      sendNotice('Saved ' + path.basename(lastRecording), 'success');
    } catch (error) {
      log('Error', session.name + ' · recording could not be finalized');
      const where = session.recordDirectory ? ' Source files: ' + session.recordDirectory : '';
      sendNotice('Could not finish the recording. ' + error.message + where, 'error');
    }
  } else if (unexpected) {
    const reported = result.output.split(/\r?\n/).filter((line) => /ERROR:/i.test(line)).pop();
    sendNotice(reported || 'The mirror disconnected. Reconnect the phone to start again.', 'error');
  }
  sessions.delete(session.id);
  publish();
  if (unexpected && session.options.retry && !session.options.record
    && !session.options.camera && session.options.audio !== 'mic' && !quitting) {
    recoverSession(session).catch((error) => log('Error', error.message));
  }
}

async function reconnectKnownWireless(key) {
  const previous = knownWireless.get(key);
  if (!previous) return;
  if (previous.includes('._adb-tls-connect._tcp')) {
    const name = previous.split('._adb-tls-connect._tcp')[0];
    const services = await wirelessServices().catch(() => []);
    const match = services.find((service) => service.name === name && service.kind === 'adb-tls-connect');
    if (match) await connectWireless(match.address).catch(() => {});
    return;
  }
  await connectWireless(previous).catch(() => {});
}

async function recoverSession(session) {
  if ((session.options.retryCount || 0) >= 3) return;
  const token = Symbol();
  recoveries.set(session.id, token);
  for (let attempt = session.options.retryCount || 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, [650, 1_600, 3_200][attempt]));
    if (quitting || recoveries.get(session.id) !== token || sessions.has(session.id)) return;
    await discover();
    let routes = groupDevices(connections, []).find((phone) => phone.key === session.key)?.connections || [];
    if ((session.kind === 'wifi' || (session.kind === 'usb' && session.options.fallback))
      && !routes.some((route) => route.state === 'device' && (route.kind === session.kind || route.kind === 'wifi'))) {
      await reconnectKnownWireless(session.key);
      if (quitting || recoveries.get(session.id) !== token || sessions.has(session.id)) return;
      routes = groupDevices(connections, []).find((phone) => phone.key === session.key)?.connections || [];
    }
    if (session.kind === 'usb' && session.options.fallback && sessions.has(sessionID(session.key, 'wifi'))) {
      log('Recovery', session.name + ' · existing Wi‑Fi mirror is still available');
      recoveries.delete(session.id);
      publish();
      return;
    }
    const preferred = routes.find((route) => route.state === 'device' && route.kind === session.kind);
    const fallback = session.kind === 'usb' && session.options.fallback
      ? routes.find((route) => route.state === 'device' && route.kind === 'wifi') : null;
    const route = preferred || fallback;
    if (!route) continue;
    recoveries.delete(session.id);
    try {
      await startSession(session.key, route.kind, { ...session.options, retryCount: attempt + 1 });
      sendNotice(session.name + ' reconnected over ' + transportName(route.kind) + '.');
      log('Recovery', session.name + ' · reconnected over ' + transportName(route.kind));
      publish();
      return;
    } catch {
      recoveries.set(session.id, token);
    }
  }
  recoveries.delete(session.id);
  log('Recovery', session.name + ' · retry limit reached');
  publish();
}

async function startSession(key, kind, request) {
  const target = requireDevice(key, kind);
  const id = sessionID(key, kind);
  if (sessions.has(id)) throw new Error('This connection already has an open session.');
  recoveries.delete(id);
  const name = saved.find((phone) => phone.key === key)?.name || target.title || target.model;
  const audio = ['off', 'output', 'mic', 'both'].includes(request.audio) ? request.audio : 'off';
  const audioOnly = request.record === 'audio';
  const camera = !audioOnly && ['front', 'back'].includes(request.source) ? request.source : '';
  const recording = audioOnly || request.record === 'video';
  const dimensions = typeof request.virtualDisplay === 'string' && /^(\d{3,4})x(\d{3,4})$/.exec(request.virtualDisplay);
  const virtualDisplay = !audioOnly && !camera && dimensions
    && dimensions.slice(1).every((dimension) => Number(dimension) >= 240 && Number(dimension) <= 4096) ? dimensions[0] : '';
  if (request.virtualDisplay && !virtualDisplay) throw new Error('Use a virtual display size such as 720x1280 with the phone screen source.');
  const flex = Boolean(virtualDisplay && request.flex === true);
  if (flex && request.viewOnly) throw new Error('Use Mirror & Control for a flex display.');
  const startApp = virtualDisplay && typeof request.startApp === 'string' ? request.startApp.trim() : '';
  if (startApp && (!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/.test(startApp) || request.viewOnly)) {
    throw new Error('Enter an Android package name and use Mirror & Control to launch it on a virtual display.');
  }
  const webcam = process.platform === 'linux' && !audioOnly && !flex && typeof request.webcam === 'string'
    && /^\/dev\/video\d{1,3}$/.test(request.webcam) ? request.webcam : '';
  if (request.webcam && !webcam) throw new Error('Choose a Linux loopback device such as /dev/video2. Flex displays need a fixed-size source to use a webcam sink.');
  if (audioOnly && audio === 'off') throw new Error('Choose an audio source for an audio-only recording.');
  if (audio !== 'off' && target.sdk > 0 && target.sdk < 30) throw new Error('Audio forwarding needs Android 11 or later.');
  if (camera && target.sdk > 0 && target.sdk < 31) throw new Error('Camera mirroring needs Android 12 or later.');
  if (audio === 'both' && !recording) throw new Error('Choose screen or audio recording to mix media and microphone.');
  const ffmpeg = audio === 'both' ? localFFmpeg() : null;
  if (audio === 'both' && !ffmpeg) throw new Error('Install FFmpeg and reopen OmniCast to mix phone audio with its microphone.');
  const session = {
    key, id, kind, target, name, clock: Date.now(), stopping: false, finalizing: false, meters: [],
    options: {
      ...normalizePreferences({ ...settings, ...request }),
      audio, audioOnly, camera, virtualDisplay, flex, startApp, webcam,
      viewOnly: request.viewOnly === true || audioOnly || Boolean(camera),
      retryCount: Number.isInteger(request.retryCount) ? Math.max(0, Math.min(request.retryCount, 3)) : 0,
    },
  };
  sessions.set(id, session);
  try {
    if (recording) {
      session.options.record = await chooseRecording(name, audioOnly);
      if (!session.options.record) {
        sessions.delete(id);
        publish();
        return;
      }
    }
    const primary = { ...session.options };
    if (recording) {
      session.recordDirectory = fs.mkdtempSync(path.join(path.dirname(session.options.record), '.omnicast-recording-'));
      session.recordOutput = path.join(session.recordDirectory, audioOnly ? 'media.m4a' : 'screen.mp4');
      primary.record = session.recordOutput;
    }
    if (audio === 'both') {
      const directory = session.recordDirectory;
      session.mix = { directory, ffmpeg, media: session.recordOutput, mic: path.join(directory, 'mic.m4a') };
      primary.audio = 'output';
      primary.record = session.mix.media;
    }
    session.meters.push(await createMeter());
    if (session.mix) session.meters.push(await createMeter());
    if (session.stopping || quitting) {
      for (const meter of session.meters) meter.close();
      sessions.delete(id);
      publish();
      return;
    }
    session.mirror = childMirror([...mirrorArgs(target.serial, name + ' (' + transportName(kind) + ') · OmniCast', primary), ...session.meters[0].args]);
    if (session.mix) {
      session.mic = childMirror([...mirrorArgs(target.serial, name + ' microphone', {
        audio: 'mic', audioOnly: true, viewOnly: true, record: session.mix.mic,
      }), ...session.meters[1].args]);
    }
    session.mirror.done.then((result) => finishSession(session, result));
    await Promise.all([session.mirror.started, session.mic?.started]);
    if (saved.some((phone) => phone.key === key)) {
      writeSaved(saved.map((phone) => phone.key === key ? { ...phone, lastUsedAt: Date.now() } : phone));
    }
    log('Session', name + ' · opened over ' + transportName(kind));
  } catch (error) {
    session.mirror?.stop();
    session.mic?.stop();
    if (!session.mirror) {
      for (const meter of session.meters) meter.close();
      sessions.delete(id);
    }
    publish();
    throw error;
  }
  publish();
}

async function deviceInfo(key, kind) {
  const device = requireDevice(key, kind);
  const base = ['-s', device.serial, 'shell'];
  const [system, wifi] = await Promise.all([
    adb([...base, 'getprop ro.build.version.release; getprop ro.build.version.security_patch; wm size; dumpsys battery']),
    adb([...base, 'cmd', 'wifi', 'status']).catch(() => ''),
  ]);
  const lines = system.split(/\r?\n/);
  return {
    manufacturer: device.manufacturer || '',
    model: device.model,
    android: lines[0] || '',
    security: lines[1] || '',
    display: /Physical size:\s*(\d+x\d+)/.exec(system)?.[1] || '',
    battery: /^\s*level:\s*(\d+)/m.exec(system)?.[1] || '',
    hardwareSerial: device.key.startsWith('serial:') ? device.key.slice(7) : '',
    wifiMac: /\bMAC:\s*((?:[a-f0-9]{2}:){5}[a-f0-9]{2})\b/i.exec(wifi)?.[1] || '',
    frequency: /\bFrequency:\s*(\d+)MHz/i.exec(wifi)?.[1] || '',
    wifiSpeed: /\bLink speed:\s*(\d+)Mbps/i.exec(wifi)?.[1] || '',
  };
}

async function wirelessServices() {
  return parseServices(await adb(['mdns', 'services'])).map((service) => ({
    ...service,
    connected: connections.some(({ serial, state }) => state === 'device'
      && (serial === service.address || serial.startsWith(service.name + '._adb-tls-connect._tcp'))),
  }));
}

async function connectWireless(address) {
  const result = await adb(['connect', validateAddress(address)], { timeout: 12_000 });
  if (!/^(already )?connected to\b/i.test(result)) throw new Error(result || 'Could not connect to the phone.');
  await discover();
}

async function pairWireless(address, secret) {
  if (pairingPromise) throw new Error('A wireless pairing request is already running.');
  pairingPromise = (async () => {
    let result;
    try { result = await adb(['pair', validateAddress(address)], { input: secret + '\n', timeout: 15_000 }); }
    catch { throw new Error('Pairing failed. Keep the pairing screen open and check that both devices share a network.'); }
    const guid = /\[guid=([^\]]+)\]/.exec(result)?.[1];
    if (!/Successfully paired/i.test(result)) throw new Error('The phone rejected the pairing request.');
    let addressForConnection;
    for (let attempt = 0; guid && attempt < 5; attempt++) {
      const services = await wirelessServices().catch(() => []);
      const endpoint = services.find(({ name, kind }) => name === guid && kind === 'adb-tls-connect')?.address;
      if (endpoint) {
        addressForConnection = endpoint;
        await connectWireless(endpoint).catch(() => {});
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await discover();
    return { connected: Boolean(guid && connections.some((link) => link.kind === 'wifi' && link.state === 'device'
      && (link.serial === addressForConnection || link.serial.startsWith(guid + '._adb-tls-connect._tcp')))) };
  })();
  try { return await pairingPromise; }
  finally { pairingPromise = undefined; }
}

async function pollPairingQR(payload) {
  const { name, secret } = readAdbQR(payload);
  const services = await wirelessServices();
  const pairing = services.find((service) => service.kind === 'adb-tls-pairing' && service.name === name);
  if (!pairing) return null;
  return pairWireless(pairing.address, secret);
}

async function disconnectWireless(address) {
  const endpoint = validateAddress(address);
  const services = await wirelessServices();
  const name = services.find((service) => service.address === endpoint && service.kind === 'adb-tls-connect')?.name;
  const matches = connections.filter(({ serial, kind }) => kind === 'wifi'
    && (serial === endpoint || (name && serial.startsWith(name + '._adb-tls-connect._tcp'))));
  for (const target of matches) {
    const session = sessions.get(sessionID(target.key, 'wifi'));
    if (session) {
      session.stopping = true;
      session.mirror?.stop();
    }
    recoveries.delete(sessionID(target.key, 'wifi'));
    knownWireless.delete(target.key);
    await adb(['disconnect', target.serial]);
  }
  await discover();
}

async function runRecipe(key, kind, action) {
  if (!Object.hasOwn(actions, action)) throw new Error('Choose an available ADB action.');
  return setting([actions[action]], key, kind);
}

async function screenshot(key, kind) {
  const target = requireDevice(key, kind);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Save Android screenshot', defaultPath: path.join(app.getPath('pictures'), 'OmniCast-screenshot.png'),
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });
  if (canceled || !filePath) return false;
  const { adb: executable, env } = getTools();
  const bytes = await new Promise((resolve, reject) => {
    execFile(executable, [...adbTarget(target), 'exec-out', 'screencap', '-p'],
      { env, timeout: 8000, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Android did not return a screenshot.');
  }
  await fs.promises.writeFile(filePath, bytes);
  return true;
}

async function startOtg(key) {
  if (otg) throw new Error('USB input mode is already running.');
  const device = connections.find((link) => link.key === key && link.kind === 'usb');
  const args = ['--otg', '--window-title=OmniCast USB input'];
  if (device) args.push('--serial', device.serial);
  if (settings.gamepad) args.push('--gamepad=aoa');
  const child = childMirror(args);
  otg = child;
  child.done.then(({ code, output }) => {
    if (otg !== child) return;
    otg = undefined;
    if (code !== 0) sendNotice(output.split(/\r?\n/).find((line) => line.includes('ERROR:')) ||
      'USB input closed. Check USB permissions and close other apps using the phone.', 'error');
    publish();
  });
  await child.started;
  publish();
}

function handle(name, handler) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== page) throw new Error('Unknown app window.');
    try { return { ok: true, result: await handler(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

function openWindow() {
  window = new BrowserWindow({
    width: 1030, height: 760, minWidth: 745, minHeight: 580, show: false,
    backgroundColor: '#10191e', title: 'OmniCast',
    icon: path.join(__dirname, 'ui', 'omnicast.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  window.removeMenu();
  window.on('closed', () => terminal.close());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.loadURL(page);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window && !window.isDestroyed()) { window.restore(); window.focus(); }
  });
  app.whenReady().then(() => {
    if (app.dock) app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'ui', 'omnicast.png')));
    stateFile = path.join(app.getPath('userData'), 'devices.json');
    settingsFile = path.join(app.getPath('userData'), 'settings.json');
    try { settings = normalizePreferences(JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || {}); }
    catch { /* New installations use the default settings. */ }
    logFile = path.join(app.getPath('userData'), 'connection-log.json');
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (Array.isArray(data)) saved = data.filter((d) => typeof d?.key === 'string'
        && typeof d.name === 'string' && typeof d.model === 'string');
    } catch { /* An empty device list is the default. */ }
    try {
      const previous = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      if (Array.isArray(previous)) events.push(...previous.slice(0, 100));
    } catch { /* A new install has no connection history. */ }
    const cameraAllowed = (_contents, permission, origin, details) => permission === 'media'
      && (origin === 'omnicast://app' || origin === 'omnicast://app/') && details.mediaType === 'video';
    const { session } = require('electron');
    session.defaultSession.setPermissionCheckHandler(cameraAllowed);
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(contents === window?.webContents && permission === 'media' && details.requestingUrl === page
        && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video');
    });
    protocol.handle('omnicast', (request) => {
      const url = new URL(request.url);
      if (url.host === 'app') {
        if (vendors.has(url.pathname)) return net.fetch(pathToFileURL(vendors.get(url.pathname)).href);
        if (assets.has(url.pathname)) return net.fetch(pathToFileURL(path.join(__dirname, 'ui', url.pathname.slice(1))).href);
        const brandLogo = /^\/brands\/([a-z]+\.png)$/.exec(url.pathname)?.[1];
        if (brandLogo) {
          const file = path.join(__dirname, 'ui', 'brands', brandLogo);
          if (fs.existsSync(file)) return net.fetch(pathToFileURL(file).href);
        }
        const filename = /^\/photos\/([a-f0-9]{64}\.png)$/.exec(url.pathname)?.[1];
        if (filename && fs.existsSync(photoPath(filename))) {
          return new Response(fs.readFileSync(photoPath(filename)), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
        }
      }
      return new Response(null, { status: 404 });
    });
    handle('state', discover);
    handle('start', (key, kind, options) => startSession(key, kind, options || {}));
    handle('stop', (key, kind) => {
      const id = sessionID(key, kind);
      recoveries.delete(id);
      const session = sessions.get(id);
      if (!session || session.finalizing) return;
      session.stopping = true;
      session.mirror?.stop();
      session.mic?.stop();
    });
    handle('control', deviceControl);
    handle('control-state', deviceControlState);
    handle('virtual-input', virtualInput);
    handle('quick-tiles', quickTiles);
    handle('quick-tile-click', clickQuickTile);
    handle('info', deviceInfo);
    handle('photo', (key, useCatalog) => setPhoto(key, useCatalog));
    handle('pair', (address, code) => {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Enter the six digits shown on the phone.');
      return pairWireless(address, code);
    });
    handle('connect', connectWireless);
    handle('disconnect', disconnectWireless);
    handle('wireless-scan', wirelessServices);
    handle('wireless-qr-new', () => qrCredentials().payload);
    handle('wireless-qr-poll', pollPairingQR);
    handle('settings', (options) => {
      const updated = normalizePreferences(options || {});
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(settingsFile + '.tmp', settingsFile);
      settings = updated;
      publish();
      return settings;
    });
    handle('otg', startOtg);
    handle('otg-stop', () => otg?.stop());
    handle('terminal-start', (key, kind) => terminal.start(requireDevice(key, kind)));
    handle('terminal-input', terminal.input);
    handle('terminal-stop', terminal.close);
    handle('adb-help', () => adb(['help']));
    handle('adb-recipe', runRecipe);
    handle('adb-screenshot', screenshot);
    handle('save', (key, name, auto) => {
      const phone = groupDevices(connections, saved).find((d) => d.key === key && d.canSave);
      if (!phone || typeof name !== 'string' || !name.trim() || name.trim().length > 48) throw new Error('Choose a phone and enter a name up to 48 characters.');
      writeSaved([...saved.filter((d) => d.key !== key), {
        key, model: phone.model, title: phone.title, style: phone.style, brand: profile(phone.model, phone.connections[0]?.manufacturer || phone.brand).brand, name: name.trim(), auto: auto === true,
        addedAt: phone.addedAt || Date.now(),
        lastUsedAt: phone.lastUsedAt || [...sessions.values()].find((session) => session.key === key)?.clock || null,
      }]);
      if (connections.some((d) => d.key === key && d.kind === 'usb')) autoAttempts.add(key);
      publish();
    });
    handle('forget', (key) => {
      writeSaved(saved.filter((d) => d.key !== key));
      autoAttempts.delete(key);
      publish();
    });
    handle('reveal', () => { if (lastRecording) shell.showItemInFolder(lastRecording); });
    openWindow();
    const timer = setInterval(() => { if (!quitting) discover(); }, 2_500);
    timer.unref();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) openWindow(); });
    app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
    app.on('before-quit', (event) => {
      terminal.close();
      otg?.stop();
      if (quitting || !sessions.size) return;
      event.preventDefault();
      quitting = true;
      for (const session of sessions.values()) {
        session.stopping = true;
        session.mirror?.stop();
        session.mic?.stop();
      }
      const wait = setInterval(() => {
        if (sessions.size) return;
        clearInterval(wait);
        app.quit();
      }, 150);
    });
  });
}
