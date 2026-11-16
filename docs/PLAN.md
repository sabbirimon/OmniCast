# OmniCast project plan

## Release scope

1. Ship a shared desktop UI for macOS, Windows, and Linux with ADB and scrcpy included.
2. Identify a phone by a stable device ID when Android exposes one, and group its transport choices. Allow independent USB and Wi‑Fi sessions. Give each session its own transfer meter, controls, and capture settings.
3. Keep the setup guide accessible before any phone is detected. Explain Android authorization, USB data cables, and the difference between the Wi‑Fi pairing address and the connection address.
4. Save device profiles locally. Track first saved and last used dates. Show device details on demand and retain a bounded diagnostic log.
5. Provide screen and camera capture, device audio and microphone capture, and local video and audio files. Require an explicit recording action and preserve source files if mixing fails.
6. Package an Android companion for USB host and wireless ADB. Retain its upstream source and license and track phone-to-phone verification separately.

## Release gates

- Exercise discovery, a USB mirror, and a second connection on the AQUOS R7. Confirm saved profiles survive a restart.
- Exercise the transfer meter and capture options, and verify archive integrity and expected executables.
- Build and check the APK signature. Test live OTG and wireless pairing with a second Android handset when available.
- Publish tagged source and binaries with clear platform and testing notes.

## Follow-up

- Try Windows and Linux with more manufacturers and USB drivers.
- Check phone encoder limits with more than two simultaneous sessions.
- Add verified model silhouettes and use marketed names where available.
- Measure audio synchronization across phones before offering continuous mixed recording across reconnects.
