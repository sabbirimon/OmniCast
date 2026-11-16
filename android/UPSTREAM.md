# OmniCast Mobile

This companion is based on [Scropy Android](https://github.com/feggaa/scrcpy-android/tree/c451e80bf00c81a93a8a0837acba5b0cbe30a575) by Rabi3, under the MIT license in this directory. It uses Genymobile's scrcpy 4.1 server. OmniCast adds a setup guide, uses its own name and application ID, and disables Android backup for its local data.

The upstream checkout pins BoringSSL to [a2f9a2474d0703e6ac3111a07129ead7c5aa8245](https://github.com/google/boringssl/tree/a2f9a2474d0703e6ac3111a07129ead7c5aa8245). The build script fetches that revision for Android wireless pairing. The desktop and mobile interfaces use separate codebases.

To control a phone over USB, turn on USB debugging on the target and approve the controller phone. The controller needs USB host support and a data cable or OTG adapter. To pair wirelessly, use the target's Android 11+ Wireless debugging screen and its six-digit code while both phones are on the same local network.
