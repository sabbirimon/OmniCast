'use strict';

const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

function createTerminal({ getTools, send }) {
  let session;
  function close(id) {
    if (!session || (id && id !== session.id)) return;
    const previous = session;
    session = undefined;
    previous.child.kill();
  }

  return {
    start(target) {
      close();
      const { adb, env } = getTools();
      const selector = /^\d+$/.test(target.transport) ? ['-t', target.transport] : ['-s', target.serial];
      const child = spawn(adb, [
        ...selector, 'shell', '-tt', 'export TERM=xterm-256color; exec sh -i',
      ], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const id = randomUUID();
      session = { id, child };
      child.stdin.on('error', () => {});
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      let output = '';
      let timer;
      function flush() {
        clearTimeout(timer);
        timer = undefined;
        if (session?.id === id && output) send({ id, output });
        output = '';
      }
      function append(chunk) {
        output = (output + chunk).slice(-65536);
        timer ||= setTimeout(flush, 25);
      }
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.once('error', (error) => append(error.message));
      child.once('close', (code) => {
        flush();
        if (session?.id !== id) return;
        session = undefined;
        send({ id, ended: true, code });
      });
      return { id, title: target.title || target.model };
    },
    input(id, input) {
      if (session?.id !== id || typeof input !== 'string' || !input.length || input.length > 32768) return;
      if (session.child.stdin.writableLength < 65536) session.child.stdin.write(input);
    },
    close,
  };
}

const actions = {
  wake: 'input keyevent KEYCODE_WAKEUP',
  home: 'input keyevent KEYCODE_WAKEUP && input keyevent KEYCODE_HOME',
  diagnostics: 'echo "Android version"; getprop ro.build.version.release; echo "Device model"; getprop ro.product.model; echo "Display"; wm size; wm density; echo "Battery"; dumpsys battery; echo "Shared storage"; df -h /sdcard',
  files: 'ls -lah /sdcard/DCIM /sdcard/Download /sdcard/Pictures',
  logs: 'logcat -d -t 150',
};

module.exports = { actions, createTerminal };
