'use strict';

const { randomBytes } = require('node:crypto');
const { validateAddress } = require('./devices.cjs');

function parseServices(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const [name, type, endpoint] = line.trim().split(/\s+/);
    const match = /^_(adb-tls-pairing|adb-tls-connect|adb)\._tcp\.?$/.exec(type || '');
    if (!match || !name || !endpoint) return [];
    try { return [{ name, kind: match[1], address: validateAddress(endpoint) }]; }
    catch { return []; }
  });
}

function qrCredentials() {
  const name = 'studio-' + randomBytes(6).toString('hex');
  // Android's scanner uses a Wi-Fi-style payload to communicate an mDNS name and secret.
  const secret = randomBytes(8).toString('base64url').slice(0, 10);
  return { name, secret, payload: 'WIFI:T:ADB;S:' + name + ';P:' + secret + ';;' };
}

function readAdbQR(payload) {
  if (typeof payload !== 'string' || payload.length > 1024) throw new Error('Choose an Android debugging QR code.');
  const fields = /^WIFI:T:ADB;S:([^;]+);P:([^;]+);;?$/.exec(payload.trim());
  if (!fields || !/^[a-zA-Z0-9_.@*+=!-]{4,64}$/.test(fields[1]) || !/^[\x21-\x7e]{6,64}$/.test(fields[2])) {
    throw new Error('This QR code does not contain Android debugging credentials.');
  }
  return { name: fields[1], secret: fields[2] };
}

module.exports = { parseServices, qrCredentials, readAdbQR };
