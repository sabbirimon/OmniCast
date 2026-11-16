'use strict';

let wirelessCache = [];
let qrOperation = 0;
let cameraStream;
const qrCanvas = document.createElement('canvas');

function wirelessStatus(message) {
  $('wifi-status').textContent = message;
}

function selectWirelessMethod(method, address = '') {
  $('wifi-method').value = method;
  if (address) $('wifi-address').value = address;
  $('wifi-method').dispatchEvent(new Event('change'));
}

$('wifi-method').addEventListener('change', () => {
  const pairing = $('wifi-method').value === 'pair';
  $('code-label').hidden = !pairing;
  $('wifi-code').required = pairing;
  $('wifi-submit').textContent = pairing ? 'Pair phone' : 'Connect';
  $('wifi-instructions').textContent = pairing
    ? 'On the phone, open Developer options → Wireless debugging → Pair device with pairing code.'
    : 'Enter the address on the main Wireless debugging screen. The phone must already trust this computer.';
});

async function scanWireless() {
  $('wifi-scan').disabled = true;
  const result = await invoke(window.omni.wirelessScan());
  $('wifi-scan').disabled = false;
  if (!result) return;
  wirelessCache = result.result;
  $('wifi-services').innerHTML = wirelessCache.length ? wirelessCache.map((service, index) => {
    const pairing = service.kind === 'adb-tls-pairing';
    const kind = pairing ? 'Pairing service' : service.kind === 'adb' ? 'Legacy ADB' : 'Wireless debugging';
    const action = pairing ? 'Use address' : service.connected ? 'Disconnect' : 'Connect';
    return '<div class="wifi-service"><div><strong>' + esc(service.address) + '</strong><p>' + kind + '</p></div>'
      + '<button type="button" class="link" data-service="' + index + '">' + action + '</button></div>';
  }).join('') : '<p>No services found. Turn on Wireless debugging, or enter an address manually.</p>';
}

$('wifi-scan').addEventListener('click', scanWireless);
$('wifi-services').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-service]');
  if (!button) return;
  const service = wirelessCache[Number(button.dataset.service)];
  if (!service) return;
  if (service.connected) {
    const result = await invoke(window.omni.disconnect(service.address));
    if (result) {
      wirelessStatus('Wi‑Fi transport disconnected.');
      await scanWireless();
    }
    return;
  }
  selectWirelessMethod(service.kind === 'adb-tls-pairing' ? 'pair' : 'connect', service.address);
  $(service.kind === 'adb-tls-pairing' ? 'wifi-code' : 'wifi-submit').focus();
});

function paired(result) {
  wirelessStatus(result.connected ? 'Phone paired and connected.' :
    'Phone paired. Use Connect with the main Wireless debugging address if it does not appear in Devices.');
  $('wifi-code').value = '';
  scanWireless();
}

$('wireless-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const pairing = $('wifi-method').value === 'pair';
  $('wifi-submit').disabled = true;
  wirelessStatus(pairing ? 'Pairing…' : 'Connecting…');
  const result = await invoke(pairing ? window.omni.pair($('wifi-address').value, $('wifi-code').value)
    : window.omni.connect($('wifi-address').value));
  $('wifi-submit').disabled = false;
  if (!result) return wirelessStatus('Connection failed. Check the address, port, and debugging screen.');
  if (pairing) paired(result.result);
  else {
    wirelessStatus('Connected over Wi‑Fi.');
    scanWireless();
  }
});

function stopQR() {
  qrOperation++;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
  $('qr-video').srcObject = null;
  $('qr-video').hidden = true;
  $('qr-display').hidden = true;
  $('qr-display').width = 0;
  $('qr-stop').hidden = true;
  return qrOperation;
}

function drawQR(payload) {
  const code = qrcode(0, 'M');
  code.addData(payload);
  code.make();
  const canvas = $('qr-display');
  const count = code.getModuleCount();
  const cell = 6;
  canvas.width = canvas.height = (count + 8) * cell;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#101820';
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (code.isDark(y, x)) context.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
    }
  }
  canvas.hidden = false;
}

async function waitForQR(payload, operation) {
  const expires = Date.now() + 90000;
  while (operation === qrOperation && Date.now() < expires) {
    const result = await invoke(window.omni.pollQR(payload));
    if (operation !== qrOperation) return;
    if (!result) {
      stopQR();
      wirelessStatus('QR pairing failed. Generate a fresh code or pair with six digits.');
      return;
    }
    if (result.result) {
      stopQR();
      paired(result.result);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  if (operation === qrOperation) {
    stopQR();
    wirelessStatus('Pairing timed out. Check that the devices share a network and try a fresh QR code.');
  }
}

$('qr-create').addEventListener('click', async () => {
  const operation = stopQR();
  const result = await invoke(window.omni.newQR());
  if (!result || operation !== qrOperation) return;
  drawQR(result.result);
  $('qr-stop').hidden = false;
  wirelessStatus('On the phone, select Pair device with QR code, then scan this image.');
  await waitForQR(result.result, operation);
});

function decodeQR(source, width, height) {
  const scale = Math.min(1, 1100 / Math.max(width, height));
  qrCanvas.width = Math.max(1, Math.round(width * scale));
  qrCanvas.height = Math.max(1, Math.round(height * scale));
  const context = qrCanvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, qrCanvas.width, qrCanvas.height);
  const frame = context.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
  return jsQR(frame.data, frame.width, frame.height)?.data;
}

async function useScannedQR(value) {
  const operation = stopQR();
  if (!/^WIFI:T:ADB;/.test(value.trim())) {
    wirelessStatus('This image does not contain an Android debugging QR code.');
    return;
  }
  $('qr-stop').hidden = false;
  wirelessStatus('Waiting for the phone to scan the same QR in Wireless debugging.');
  await waitForQR(value.trim(), operation);
}

$('qr-camera').addEventListener('click', async () => {
  const operation = stopQR();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (operation !== qrOperation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = stream;
    const video = $('qr-video');
    video.srcObject = stream;
    video.hidden = false;
    $('qr-stop').hidden = false;
    await video.play();
    wirelessStatus('Hold an Android debugging QR in front of the camera.');
    const scan = () => {
      if (operation !== qrOperation) return;
      const value = video.videoWidth && decodeQR(video, video.videoWidth, video.videoHeight);
      if (value) useScannedQR(value);
      else setTimeout(scan, 250);
    };
    scan();
  } catch (error) {
    if (operation !== qrOperation) return;
    stopQR();
    wirelessStatus('Camera unavailable. You can upload a QR image. ' + error.message);
  }
});

$('qr-upload').addEventListener('click', () => $('qr-file').click());
$('qr-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const operation = stopQR();
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
    const bitmap = await createImageBitmap(file);
    const value = decodeQR(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    if (operation !== qrOperation) return;
    if (!value) throw new Error('No QR code found. Try a clearer image with the full code visible.');
    await useScannedQR(value);
  } catch (error) {
    if (operation === qrOperation) wirelessStatus(error.message);
  }
});

$('qr-stop').addEventListener('click', () => {
  stopQR();
  wirelessStatus('QR session closed.');
});
$('wireless-dialog').addEventListener('close', () => {
  stopQR();
  $('wifi-code').value = '';
  wirelessStatus('');
});
