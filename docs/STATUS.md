# OmniCast validation

| Area | Status |
| --- | --- |
| Desktop discovery and input validation | Checked with fixtures for USB, Wi‑Fi, an emulator, and unauthorized devices. |
| macOS Intel | Saved and reloaded the AQUOS R7 profile, measured live transfer on simultaneous USB and Wi‑Fi mirrors, and confirmed that a dropped USB connection left the Wi‑Fi mirror available. Checked the setup guide and the manufacturer photo. |
| Windows and Linux x64 | Built on macOS. Runtime verification requires the corresponding host OS. |
| Mobile | Debug APK built for arm64-v8a and armeabi-v7a. Live USB OTG and phone-to-phone wireless pairing still need a second controller handset. |
| Recording | Recorded and probed an H.264 MP4 from the R7 over USB. Audio-only, camera and microphone capture still need hardware testing. Media + mic needs desktop FFmpeg. |
| Saved profiles and connection log | Stored locally. IMEI is available through Android's About phone screen when exposed. |
| Catalog | AQUOS R7 (A202SH and SH-52C) maps to Sharp product imagery. Additional device photos can be set locally. |

## 2.1 desktop validation

- The Intel Mac development build opened an interactive ADB shell on the Sharp AQUOS R7, returned a command result, ran diagnostics, discovered local ADB services, and generated and decoded an Android pairing QR. The setup guide and the restored model photo were checked in Electron.
- The bundled Sharp photo remains attached to the original saved profile. The catalog fetches and caches verified manufacturer images for matched model codes and carries logos for additional brands.
- The desktop launchers use scrcpy 5.0.1. The APK retains its matched scrcpy 4.1 client and server and installs on Android 8+ ARM devices.
- Platform and device validation still needed includes Windows and Linux runtime, a phone-to-phone APK session, Linux webcam output, camera QR pairing to a second device, and sustained gaming performance.

- The Galaxy A20s was recognized from its exact Android model property. A real USB screen mirror returned measured traffic, showed the keep-awake badge, and appeared in Active sessions. The Mac decoder reported VideoToolbox with its Metal renderer.

- Galaxy A20s media mute reached zero, highlighted the control, and restored the prior level on the second click. The notification control correctly alternated its command and button state on the locked phone. Android lock-screen policy governs the actual shade.
