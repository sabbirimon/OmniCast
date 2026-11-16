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
