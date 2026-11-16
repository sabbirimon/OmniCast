'use strict';

const { packager } = require('@electron/packager');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.cache');
const dist = path.join(root, 'dist');
const manifest = require('../package.json');
const version = manifest.devDependencies.electron;
const engine = '5.0.1';
const platforms = {
  darwin: {
    electron: '151d249b646eb8b99f1bea40aff217b10d8e21246ad8c07bb3a5982e2722660f',
    archive: 'scrcpy-macos-x86_64-v5.0.1.tar.gz',
    sha: '31a5467a9e907f162b093267cbbab1276b15c6e709c2ea8159566a8d165beb50',
    title: 'macOS-Intel', extension: 'zip',
  },
  win32: {
    electron: '49dd2d3875944f08de03d34595cd30093c588b9edcabb41a0ac481028a3a5a8a',
    archive: 'scrcpy-win64-v5.0.1.zip',
    sha: 'b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5',
    title: 'Windows-x64', extension: 'zip',
  },
  linux: {
    electron: '0a63ce0e2b6a69d6ced7194949934b8414a6dadeca82910f88dc8720a1433269',
    archive: 'scrcpy-linux-x86_64-v5.0.1.tar.gz',
    sha: '9f969d30cc574816077edecda65719c1c70b0aee1df1ba5fa00779ac07b8fd6e',
    title: 'Linux-x64', extension: 'tar.gz',
  },
};

function execute(bin, args, options = {}) {
  const result = spawnSync(bin, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw result.error || new Error(bin + ' failed with ' + result.status);
}

async function download(asset, url, sha) {
  const target = path.join(cache, asset);
  async function valid() {
    if (!fs.existsSync(target)) return false;
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(target)) hash.update(chunk);
    return hash.digest('hex') === sha;
  }
  if (!await valid()) {
    execute('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '3', '--output', target, url]);
    if (!await valid()) throw new Error('Checksum mismatch for ' + asset);
  }
  return target;
}

async function packagePlatform(platform) {
  const config = platforms[platform];
  if (!config) throw new Error('Choose darwin, win32, or linux.');
  const electronArchive = 'electron-v' + version + '-' + platform + '-x64.zip';
  await download(electronArchive, 'https://github.com/electron/electron/releases/download/v' + version + '/' + electronArchive, config.electron);
  const engineArchive = await download(config.archive, 'https://github.com/Genymobile/scrcpy/releases/download/v' + engine + '/' + config.archive, config.sha);
  const unpack = fs.mkdtempSync(path.join(cache, platform + '-'));
  try {
    if (platform === 'win32') execute('unzip', ['-q', engineArchive, '-d', unpack]);
    else execute('tar', ['-xf', engineArchive, '-C', unpack]);
    const tools = path.join(unpack, 'tools');
    const engineFolder = fs.readdirSync(unpack).find((name) => name.startsWith('scrcpy-'));
    fs.renameSync(path.join(unpack, engineFolder), tools);
    if (platform === 'win32') {
      execute('go', ['build', '-trimpath', '-o', path.join(tools, 'mirror-host.exe'), path.join(root, 'scripts', 'mirror-host-windows.go')], {
        env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
      });
    }
    const source = path.join(unpack, 'source');
    fs.mkdirSync(source);
    fs.cpSync(path.join(root, 'src'), path.join(source, 'src'), { recursive: true });
    for (const dependency of Object.keys(manifest.dependencies)) {
      fs.cpSync(path.join(root, 'node_modules', dependency), path.join(source, 'node_modules', dependency), { recursive: true });
    }
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({
      name: manifest.name, productName: manifest.productName, version: manifest.version,
      description: manifest.description, main: manifest.main, dependencies: manifest.dependencies,
    }));
    const [bundle] = await packager({
      dir: source, name: 'OmniCast', platform, arch: 'x64', electronVersion: version,
      electronZipDir: cache, extraResource: tools, out: dist, overwrite: true,
      asar: true, prune: false,
      icon: platform === 'linux' ? undefined : path.join(root, 'assets', 'omnicast.' + (platform === 'darwin' ? 'icns' : 'ico')),
      extendInfo: { NSCameraUsageDescription: 'OmniCast uses the computer camera to scan Android debugging QR codes.' },
      appBundleId: 'com.omnicast.desktop', tmpdir: unpack,
    });
    const archive = path.join(dist, 'OmniCast-' + config.title + '.' + config.extension);
    if (platform === 'darwin') {
      const app = path.join(bundle, 'OmniCast.app');
      execute('codesign', ['--force', '--deep', '--sign', '-', app]);
      execute('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
    } else if (platform === 'linux') {
      execute('tar', ['-czf', archive, '-C', path.dirname(bundle), path.basename(bundle)]);
    } else {
      if (fs.existsSync(archive)) fs.unlinkSync(archive);
      execute('zip', ['-qr', archive, path.basename(bundle)], { cwd: path.dirname(bundle) });
    }
    console.log(archive);
  } finally {
    fs.rmSync(unpack, { recursive: true });
  }
}

async function main() {
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(dist, { recursive: true });
  for (const platform of (process.argv.length > 2 ? process.argv.slice(2) : Object.keys(platforms))) {
    await packagePlatform(platform);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
