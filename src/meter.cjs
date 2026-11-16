'use strict';
const net = require('node:net');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

async function createMeter() {
  const reservation = net.createServer();
  const forwardPort = await listen(reservation);
  const sockets = new Set();
  let down = 0;
  let up = 0;
  let sampled = { down: 0, up: 0, time: Date.now(), rate: { down: 0, up: 0, live: false } };
  const proxy = net.createServer((client) => {
    const forward = net.connect(forwardPort, '127.0.0.1');
    for (const socket of [client, forward]) {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    }
    client.on('error', () => forward.destroy());
    forward.on('error', () => client.destroy());
    client.on('close', () => forward.destroy());
    forward.on('close', () => client.destroy());
    client.on('data', (chunk) => { up += chunk.length; });
    forward.on('data', (chunk) => { down += chunk.length; });
    client.pipe(forward).pipe(client);
  });
  let proxyPort;
  try { proxyPort = await listen(proxy); }
  finally { reservation.close(); }
  return {
    args: ['--force-adb-forward', '--port=' + forwardPort, '--tunnel-host=127.0.0.1', '--tunnel-port=' + proxyPort],
    stats() {
      const now = Date.now();
      const elapsed = now - sampled.time;
      if (elapsed >= 800) {
        const rate = {
          down: Math.round((down - sampled.down) * 8_000 / elapsed),
          up: Math.round((up - sampled.up) * 8_000 / elapsed),
          live: down > 4 && sockets.size > 0,
        };
        sampled = { down, up, time: now, rate };
      }
      return sampled.rate;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      proxy.close();
    },
  };
}

module.exports = { createMeter };
