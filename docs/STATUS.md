# OmniCast validation

| Area | Status |
| --- | --- |
| Desktop discovery and input validation | Checked with fixtures for USB, Wi‑Fi, an emulator, and unauthorized devices. |
| macOS Intel | Saved the AQUOS R7, measured live transfer on simultaneous USB and Wi‑Fi mirrors, and confirmed that a dropped USB connection left the Wi‑Fi mirror available. Checked the setup guide. |
| Windows and Linux x64 | Cross-build on macOS. Runtime verification requires the corresponding host OS. |
| Mobile | Based on a pinned MIT-licensed upstream. Live phone-to-phone verification needs a second controller handset. |
| Recording | MP4 video and M4A audio. Media + mic needs desktop FFmpeg. |
| Saved profiles and connection log | Stored locally. IMEI is available through Android's About phone screen when exposed. |
| Catalog | AQUOS R7 (A202SH and SH-52C) maps to Sharp product imagery. Additional device photos can be set locally. |
