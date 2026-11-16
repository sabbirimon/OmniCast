# scrcpy integration

OmniCast Desktop runs the official scrcpy 5.0.1 client and matching Android server. The [pinned upstream source](../third_party/scrcpy) is commit a60891aea193d92e7e5c3942700eca63f9d19a5f. Release packaging checks each platform archive against its GitHub SHA-256 digest. This keeps the capture, input, codec, and USB implementations on the same upstream release. OmniCast owns device profiles, launcher settings, reconnection, ADB utilities, and the desktop interface.

| Upstream path | What it does | OmniCast integration |
| --- | --- | --- |
| app/src/cli.c | Validates option combinations, maps input modes, and selects hardware decoders | Exposes supported flags through Settings and Advanced capture. Flex and V4L2 combinations are validated before launch. |
| app/src/server.c and app/src/adb/adb_tunnel.c | Uses a per-session socket name, pushes and starts the matching server through ADB, and prefers reverse before falling back to forward | One process per selected transport. OmniCast passes a unique loopback port and uses forward mode for its traffic meter. USB and Wi-Fi for the same device can coexist if Android supports both encoders. |
| server/src/main/java/com/genymobile/scrcpy/Server.java | Checks the client/server version and starts the selected video, audio, and control workers | Omits control for View only and video for audio-only recordings. The Android companion uses a separate client protocol and matching server, so updating the desktop engine does not update the APK protocol. |
| server/src/main/java/com/genymobile/scrcpy/video/SurfaceEncoder.java and NewDisplayCapture.java | Encodes Android surfaces with MediaCodec and manages resize events for virtual displays | Supports H.264, HEVC, AV1, size, frame rate, bitrate, phone camera, and fixed or flex virtual displays. Android decides the available encoder and resolutions. |
| app/src/demuxer.c, decoder.c, and recorder.c | Parses multiplexed frame metadata, negotiates codec changes, and sends packets to decoder or muxer | Uses upstream MP4/M4A recording for each source. The desktop merges separate media and mic recordings with FFmpeg when requested. Hardware decoding affects live playback and can be disabled in Settings. |
| server/src/main/java/com/genymobile/scrcpy/control/Controller.java and app/src/control_msg.c | Serializes display-aware control events, sends clipboard events and UHID reports, and uses Android user activity to prevent idle sleep | Uses scrcpy for input during mirroring. Phone controls and the shell operate on the selected ADB transport independently. Keep awake uses scrcpy's activity signaling for the active screen mirror. |
| app/src/usb/ | Implements Android Open Accessory HID input with libusb | Starts a distinct USB keyboard/mouse/gamepad session for recovery, including when ADB debugging is off. |
| app/src/v4l2_sink.c | Feeds decoded frames into a local V4L2 loopback device | Input in Advanced capture on Linux. The loopback module and device must already exist on the Linux host. |

## Release and maintenance

- Upgrade the desktop package archives, checksums, and submodule pin together. Test USB and Wi-Fi mirroring, recordings, and a deliberate disconnect before updating the release.
- Compare server arguments and handshake framing before attempting an Android companion upgrade. Desktop and APK currently use different, internally matched scrcpy versions.
- Use the project's separate ADB shell for diagnostics. Keep live game input out of repeated ADB shell process launches and send it through a persistent control channel.
- scrcpy 5.0.1 is licensed under Apache 2.0. The upstream license and dependency notices ship with the original tool archives. [Upstream release](https://github.com/Genymobile/scrcpy/releases/tag/v5.0.1)
