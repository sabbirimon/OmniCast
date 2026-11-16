'use strict';

const defaults = {
  size: '1440', fps: '0', bitRate: '8', codec: 'h264', keyboard: 'default',
  mouse: 'default', gamepad: false, clipboard: true, fullscreen: false,
  decoder: 'auto', keepActive: false, screenOff: false, showTouches: false,
  retry: true, fallback: true,
};

function normalizePreferences(options = {}) {
  const value = (key, choices) => choices.includes(String(options[key])) ? String(options[key]) : defaults[key];
  const toggle = (key) => typeof options[key] === 'boolean' ? options[key] : defaults[key];
  return {
    size: value('size', ['0', '720', '1080', '1440', '1920', '2560']),
    fps: value('fps', ['0', '30', '60', '90', '120']),
    bitRate: value('bitRate', ['2', '4', '8', '12', '16', '24']),
    decoder: options.softwareDecoder === true ? 'software' : value('decoder', ['auto', 'hardware', 'software']),
    codec: value('codec', ['h264', 'h265', 'av1']),
    keyboard: value('keyboard', ['default', 'physical']),
    mouse: value('mouse', ['default', 'physical']),
    ...Object.fromEntries(Object.keys(defaults).filter((key) => typeof defaults[key] === 'boolean')
      .map((key) => [key, toggle(key)])),
    screenOff: !toggle('keepActive') && toggle('screenOff'),
  };
}

module.exports = { defaults, normalizePreferences };
