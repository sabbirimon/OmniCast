'use strict';

const key = (id, group, icon, label, value, standard = false) => ({
  id, group, icon, label, standard, args: ['input', 'keyevent', 'KEYCODE_' + value],
});
const setting = (id, icon, label, value, standard = false) => ({
  id, group: 'Android settings', icon, label, standard, args: ['am', 'start', '-a', value.startsWith('android.') ? value : 'android.settings.' + value],
});
const shade = (id, icon, label, value) => ({
  id, group: 'Android settings', icon, label, standard: true, args: ['cmd', 'statusbar', value],
});

const library = [
  key('back', 'Navigation', '←', 'Back', 'BACK', true),
  key('home', 'Navigation', '⌂', 'Home', 'HOME', true),
  key('recents', 'Navigation', '≡', 'Recents', 'APP_SWITCH', true),
  key('menu', 'Navigation', '☰', 'Menu', 'MENU'),
  key('search', 'Navigation', '⌕', 'Search', 'SEARCH'),
  key('up', 'Navigation', '↑', 'Up', 'DPAD_UP'),
  key('down', 'Navigation', '↓', 'Down', 'DPAD_DOWN'),
  key('left', 'Navigation', '←', 'Left', 'DPAD_LEFT'),
  key('right', 'Navigation', '→', 'Right', 'DPAD_RIGHT'),
  key('select', 'Navigation', '◎', 'Select', 'DPAD_CENTER'),
  key('power', 'Power and volume', '⏻', 'Power button', 'POWER', true),
  key('wake', 'Power and volume', '☀', 'Wake', 'WAKEUP', true),
  key('sleep', 'Power and volume', '◐', 'Sleep', 'SLEEP'),
  key('volumeDown', 'Power and volume', '−', 'Vol down', 'VOLUME_DOWN', true),
  key('volumeUp', 'Power and volume', '+', 'Vol up', 'VOLUME_UP', true),
  key('mute', 'Power and volume', '∅', 'Mute speaker', 'VOLUME_MUTE', true),
  key('brightnessDown', 'Power and volume', '◒', 'Dim screen', 'BRIGHTNESS_DOWN'),
  key('brightnessUp', 'Power and volume', '☀', 'Brighten screen', 'BRIGHTNESS_UP'),
  key('playPause', 'Media', '▷', 'Play / pause', 'MEDIA_PLAY_PAUSE'),
  key('mediaStop', 'Media', '■', 'Stop media', 'MEDIA_STOP'),
  key('previous', 'Media', '|◁', 'Previous track', 'MEDIA_PREVIOUS'),
  key('next', 'Media', '▷|', 'Next track', 'MEDIA_NEXT'),
  key('rewind', 'Media', '◁◁', 'Rewind', 'MEDIA_REWIND'),
  key('fastForward', 'Media', '▷▷', 'Fast-forward', 'MEDIA_FAST_FORWARD'),
  key('enter', 'Keyboard', '↵', 'Enter', 'ENTER'),
  key('tab', 'Keyboard', '⇥', 'Tab', 'TAB'),
  key('space', 'Keyboard', '␣', 'Space', 'SPACE'),
  key('escape', 'Keyboard', '⎋', 'Escape', 'ESCAPE'),
  key('delete', 'Keyboard', '⌫', 'Backspace', 'DEL'),
  shade('notifications', '↓', 'Notifications', 'expand-notifications'),
  shade('quickSettings', '▦', 'Quick settings', 'expand-settings'),
  setting('settings', '⚙', 'Settings', 'SETTINGS'),
  setting('wifi', '◌', 'Wi‑Fi settings', 'WIFI_SETTINGS'),
  setting('bluetooth', 'ᛒ', 'Bluetooth settings', 'BLUETOOTH_SETTINGS'),
  setting('network', '≋', 'Network & data', 'WIRELESS_SETTINGS'),
  setting('airplane', '✈', 'Airplane mode settings', 'AIRPLANE_MODE_SETTINGS'),
  setting('cast', '◫', 'Android Cast', 'CAST_SETTINGS', true),
  setting('location', '⌖', 'Location', 'LOCATION_SOURCE_SETTINGS', true),
  setting('accessibility', '◎', 'Accessibility', 'ACCESSIBILITY_SETTINGS', true),
  setting('display', '▣', 'Display settings', 'DISPLAY_SETTINGS'),
  setting('sound', '♫', 'Sound settings', 'SOUND_SETTINGS'),
  setting('battery', '▤', 'Battery Saver', 'BATTERY_SAVER_SETTINGS'),
  setting('nfc', '≈', 'NFC settings', 'NFC_SETTINGS'),
  setting('keyboard', '⌨', 'Keyboard settings', 'INPUT_METHOD_SETTINGS'),
  setting('developer', '‹›', 'Developer options', 'APPLICATION_DEVELOPMENT_SETTINGS', true),
  setting('internet', '◉', 'Internet panel', 'panel.action.INTERNET_CONNECTIVITY'),
  setting('mobileData', '↕', 'Mobile data and usage', 'DATA_USAGE_SETTINGS'),
  setting('hotspot', '◍', 'Hotspot and tethering', 'TETHER_SETTINGS'),
  setting('vpn', '⬡', 'VPN', 'VPN_SETTINGS'),
  setting('privacy', '◆', 'Privacy and permissions', 'PRIVACY_SETTINGS'),
  setting('nightLight', '◐', 'Night Light', 'NIGHT_DISPLAY_SETTINGS'),
  setting('doNotDisturb', '⊖', 'Do Not Disturb', 'ZEN_MODE_SETTINGS'),
  setting('storage', '▥', 'Storage', 'INTERNAL_STORAGE_SETTINGS'),
  setting('notificationsMenu', '≡', 'Notification settings', 'NOTIFICATION_SETTINGS'),
  setting('darkTheme', '◑', 'Dark theme and display', 'DISPLAY_SETTINGS'),
  setting('about', 'ⓘ', 'About phone', 'DEVICE_INFO_SETTINGS', true),
];

const controls = new Map(library.map(({ id, args }) => [id, args]));
const controlLibrary = library.map(({ args, ...control }) => control);

module.exports = { controls, controlLibrary };
