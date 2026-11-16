# OmniCast 2.0.0 preview

- **Desktop:** macOS Intel, Windows x64 and Linux x64. Extract the full archive before opening OmniCast. The desktop archives include ADB and scrcpy.
- **Mobile:** Debug-signed Android APK for ARM phones, with USB OTG and Android wireless pairing support. Install the controller app on the phone you want to use as a screen.
- **Device dashboard:** Saved profiles, model photos, repeated connection attempts, USB-to-Wi-Fi fallback, logs, detailed device information and measured transfer rates.
- **Controls:** Mirror or view only, record MP4 or M4A, and open Android's system controls. Mixing device audio with the target microphone requires desktop FFmpeg.

The Intel Mac build was tested with an AQUOS R7, including simultaneous USB and Wi-Fi mirrors, an interrupted USB connection, and a saved MP4. Windows and Linux were packaged and checked but have not been run on their target operating systems. The APK has not been tested with two physical Android phones. See [validation details](https://github.com/sabbirimon/OmniCast/blob/main/docs/STATUS.md) before relying on a feature on a new model.
