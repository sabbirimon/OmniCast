# OmniCast

OmniCast is a desktop interface for viewing, controlling, and recording Android devices over USB or local Wi‑Fi. The desktop packages bundle ADB and [scrcpy 4.1](https://github.com/Genymobile/scrcpy/releases/tag/v4.1). OmniCast Mobile is a separate Android controller for USB OTG and wireless ADB.

## Get connected

1. On the phone, open **Settings → About phone** and tap **Build number** seven times. On Samsung, find it under **Software information**. Enter the PIN if asked.
2. Open **Settings → System → Developer options**. Enable **USB debugging**, attach a data cable, and approve the debugging prompt on the phone. On Android 11+, you can instead choose **Wireless debugging → Pair device with pairing code**.
3. Select a device and connection in OmniCast. Click **Mirror & Control** for mouse and keyboard control, or **View only** to watch. Use **Wireless connection** to pair or connect to an authorized phone.

The desktop works offline over USB. Wireless mirroring uses the local network and does not need internet access. Android must authorize each controller. Saving a device name does not grant debugging access. On Windows, a phone may require its OEM USB driver. On Linux, USB detection may require Android udev rules.

## Devices and sessions

- Save a name and optionally open a muted mirror on USB reconnect. Saved devices remain visible when disconnected. Device names, timestamps, and up to 100 connection events stay in the app's local data folder.
- Open multiple mirrors, including USB and Wi‑Fi sessions for the same phone when it supports concurrent encoders. Each session has its own controls, capture source, and transfer rate. The rate is the screen, audio, and input traffic through OmniCast, excluding USB or Wi‑Fi protocol overhead.
- Screen mirrors can retry up to three times after an unexpected drop. If enabled, USB can fall back to an already authorized Wi‑Fi connection. Camera, microphone, and recording sessions require a fresh start after a drop.
- Open Android's Quick Settings, notifications, Cast, Location, Accessibility, Developer options, or About phone directly. Use Android's Quick Settings to change Wi‑Fi, Bluetooth, and mobile data. Switching off Wi‑Fi breaks a Wi‑Fi mirror.
- The device panel can read the model, display size, battery, Android version, security patch, current Wi‑Fi MAC, and link rate where exposed. Wi‑Fi MAC may be randomized. Open **About phone** to see IMEI on devices that show it there.
- **Load product photo** fetches the matching AQUOS R7 product image from Sharp and stores a local thumbnail for offline use. To use your own image for any model, open **Device information → Choose a device photo**. The bundled [Sharp wordmark](https://commons.wikimedia.org/wiki/File:Logo_of_the_Sharp_Corporation.svg) identifies the manufacturer.

## Recording

Choose the phone screen or camera, a resolution, and a sound source. **Record video** writes MP4. **Record audio** writes M4A. Audio and microphone forwarding require Android 11 or later, and camera mirroring requires Android 12 or later. Android may reject capture or blank protected content.

The **Media + mic** recording option needs FFmpeg on the desktop's PATH. You can also set the FFMPEG environment variable before starting OmniCast. OmniCast captures two tracks from the target and combines them when recording ends. Device policies may prevent concurrent capture. If the mix fails, the original tracks are retained in the temporary recording folder shown in the error.

The microphone source is the **target phone's microphone**. OmniCast shows its own active mic or camera capture. Android's privacy indicators continue to show access by other apps.

## Build from source

    npm ci
    npm start
    npm run package
    bash scripts/build-android.sh

For desktop development, install Node.js 22.12 or newer and local ADB and scrcpy. The packaging script downloads checksum-verified upstream engines and produces Intel macOS, Windows x64, and Linux x64 archives. The packaging host needs curl, unzip, tar, zip, and Go for the Windows helper. macOS packaging uses Apple's codesign and ditto.

The APK build needs JDK 17 or 21, Android SDK 36, NDK 28.2.13676358, and the SDK's CMake. See [mobile attribution](android/UPSTREAM.md) for the upstream project and native pairing dependency.

See [the project plan](docs/PLAN.md) and [validation status](docs/STATUS.md) for the release scope and checks.
