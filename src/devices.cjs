'use strict';

const { spawn } = require('node:child_process');
const { accessSync, constants } = require('node:fs');
const { isIP } = require('node:net');
const path = require('node:path');

const deviceStates = new Set(['device', 'offline', 'unauthorized', 'authorizing', 'connecting', 'recovery', 'sideload', 'bootloader', 'no']);
const audioModes = new Set(['off', 'output', 'mic']);
const resolutions = new Set([720, 1080, 1440, 0]);

const controls = new Map([
  ['back', ['input', 'keyevent', 'KEYCODE_BACK']],
  ['home', ['input', 'keyevent', 'KEYCODE_HOME']],
  ['recents', ['input', 'keyevent', 'KEYCODE_APP_SWITCH']],
  ['power', ['input', 'keyevent', 'KEYCODE_POWER']],
  ['wake', ['input', 'keyevent', 'KEYCODE_WAKEUP']],
  ['volumeUp', ['input', 'keyevent', 'KEYCODE_VOLUME_UP']],
  ['volumeDown', ['input', 'keyevent', 'KEYCODE_VOLUME_DOWN']],
  ['mute', ['input', 'keyevent', 'KEYCODE_VOLUME_MUTE']],
  ['notifications', ['cmd', 'statusbar', 'expand-notifications']],
  ['quickSettings', ['cmd', 'statusbar', 'expand-settings']],
  ['accessibility', ['am', 'start', '-a', 'android.settings.ACCESSIBILITY_SETTINGS']],
  ['cast', ['am', 'start', '-a', 'android.settings.CAST_SETTINGS']],
  ['location', ['am', 'start', '-a', 'android.settings.LOCATION_SOURCE_SETTINGS']],
  ['developer', ['am', 'start', '-a', 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS']],
  ['about', ['am', 'start', '-a', 'android.settings.DEVICE_INFO_SETTINGS']],
]);

function readDevices(output) {
  const lines = output.split(/\r?\n/);
  const header = lines.findIndex((line) => line.trim() === 'List of devices attached');
  if (header === -1) return [];
  return lines.slice(header + 1).flatMap((line) => {
    const [serial, state, ...properties] = line.trim().split(/\s+/);
    if (!deviceStates.has(state) || !serial || serial.length > 256) return [];
    const attrs = Object.fromEntries(properties.filter((part) => part.includes(':'))
      .map((part) => [part.slice(0, part.indexOf(':')), part.slice(part.indexOf(':') + 1)]));
    let kind = 'usb';
    if (serial.startsWith('emulator-')) kind = 'emulator';
    else if (!attrs.usb && (serial.includes(':') || serial.includes('._adb-'))) kind = 'wifi';
    return [{
      serial, state, kind, transport: attrs.transport_id || serial,
      model: attrs.model?.replaceAll('_', ' ') || 'Android device',
    }];
  });
}

function identityFor(device, hardwareSerial) {
  const validSerial = /^[a-zA-Z0-9_.-]{4,128}$/;
  if (hardwareSerial && validSerial.test(hardwareSerial) && !/^(unknown|0123456789abcdef)$/i.test(hardwareSerial)) {
    return { key: 'serial:' + hardwareSerial, canSave: true };
  }
  if (device.kind === 'usb' && validSerial.test(device.serial)) {
    return { key: 'serial:' + device.serial, canSave: true };
  }
  if (device.kind === 'wifi' && device.serial.includes('._adb-tls-connect._tcp')) {
    return { key: 'wireless:' + device.serial, canSave: true };
  }
  return { key: 'connection:' + device.serial, canSave: false };
}

function groupDevices(devices, saved) {
  const phones = new Map(saved.map((device) => [device.key, { ...device, saved: true, canSave: true, connections: [] }]));
  for (const device of devices) {
    const phone = phones.get(device.key) || {
      key: device.key, model: device.model, title: device.title, style: device.style,
      name: '', saved: false, canSave: device.canSave, connections: [],
    };
    const dupe = phone.connections.find((connection) => connection.kind === device.kind);
    const preferredWifi = device.kind === 'wifi' && device.serial.includes('._adb-tls-connect._tcp');
    if (!dupe) phone.connections.push(device);
    else if ((dupe.state !== 'device' && device.state === 'device')
      || (dupe.state === device.state && preferredWifi)) {
      phone.connections.splice(phone.connections.indexOf(dupe), 1, device);
    }
    phones.set(device.key, phone);
  }
  return [...phones.values()].sort((a, b) => Number(b.saved) - Number(a.saved)
    || Number(b.connections.length > 0) - Number(a.connections.length > 0)
    || (a.name || a.model).localeCompare(b.name || b.model));
}

function validateAddress(value) {
  const address = typeof value === 'string' ? value.trim() : '';
  const match = /^(\[[0-9a-f:.%a-z0-9_-]+\]|[a-z0-9][a-z0-9.-]{0,252}):(\d{1,5})$/i.exec(address);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535
    || (match[1].startsWith('[') && isIP(match[1].slice(1, -1)) !== 6)) {
    throw new Error('Enter an address and port, such as 192.168.1.20:37001.');
  }
  return address;
}

function findTools(resources) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const bundled = path.join(resources, 'tools');
  const developmentBundle = path.join(__dirname, '..', '.cache', 'engines', process.platform + '-' + process.arch, 'tools');
  const base = [
    path.join(home, 'Library', 'Android', 'sdk', 'platform-tools'),
    path.join(home, 'Android', 'Sdk', 'platform-tools'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools'),
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin',
    ...(process.env.PATH || '').split(path.delimiter),
  ].filter(Boolean);
  const gui = '/Applications/ScrcpyGUI.app/Contents/MacOS/scrcpy-bin';
  function firstExecutable(name, dirs, override) {
    const candidates = [override, ...dirs.map((dir) => path.join(dir, name + suffix))].filter(Boolean);
    return candidates.find((file) => {
      try { accessSync(file, constants.X_OK); return true; } catch { return false; }
    });
  }
  const adb = firstExecutable('adb', [...base, bundled, developmentBundle, gui], process.env.ADB);
  const scrcpy = firstExecutable('scrcpy', [bundled, developmentBundle, ...base, gui], process.env.SCRCPY);
  if (!adb || !scrcpy) throw new Error('Android Mirror could not find ADB and scrcpy. Re-extract the full app or install both tools.');
  const server = path.join(path.dirname(scrcpy), 'scrcpy-server');
  const env = { ...process.env, ADB: adb };
  try { accessSync(server, constants.R_OK); env.SCRCPY_SERVER_PATH = server; } catch { /* System scrcpy knows its server path. */ }
  return { adb, scrcpy, env };
}

function run(file, args, { env, input, timeout = 6_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, windowsHide: true, timeout, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    function append(chunk) { output = (output + chunk.toString()).slice(-128_000); }
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.stdin.on('error', () => {});
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal) reject(new Error('The device did not respond in time. Try again.'));
      else if (code !== 0) reject(new Error(output.trim().slice(-360) || 'The device command failed.'));
      else resolve(output.trim());
    });
    child.stdin.end(input);
  });
}

function mirrorArgs(serial, title, options) {
  const audio = audioModes.has(options.audio) ? options.audio : 'off';
  const size = resolutions.has(Number(options.size)) ? Number(options.size) : 1440;
  const args = ['--serial', serial, '--window-title=' + title];
  if (size) args.push('--max-size=' + size);
  if (audio === 'off') args.push('--no-audio');
  else args.push('--audio-source=' + audio);
  if (options.keyboard === 'physical') args.push('--keyboard=uhid');
  if (options.viewOnly) args.push('--no-control');
  if (options.record) {
    args.push('--record=' + options.record);
    if (audio !== 'off') args.push('--audio-codec=aac');
  }
  if (options.audioOnly) args.push('--no-video', '--no-playback');
  else if (options.camera) args.push('--video-source=camera', '--camera-facing=' + options.camera);
  return args;
}

module.exports = { controls, findTools, groupDevices, identityFor, mirrorArgs, readDevices, run, validateAddress };
