# Gaming controls plan

OmniCast controls a physical Android phone. Android still runs and renders the game.

## Available in the desktop preview

Use **Settings → Use gaming defaults**, then **Save settings** and start **Mirror & Control**. This enables physical keyboard and mouse emulation through UHID, gamepad forwarding, and keep awake. Start with USB, a 60 fps cap, and H.264. Settings also offers 90 or 120 fps and other encoders when the phone supports them. Select software decoding if a driver or graphics device has trouble with hardware decoding. Scrcpy's pointer-capture shortcut releases the mouse back to the computer.

Games that already accept Android keyboard, mouse, or gamepad input can use these devices directly. Frame rate depends on the game, phone display, encoder, and computer decoder.

## Per-game profiles and touch mapping

1. Add profiles per Android package with separate controls, frame rate, aspect ratio, and display preferences. Export mappings in a versioned format with no device serials or authentication data.
2. Add a placement editor over the live picture. Start with key-to-tap, hold-to-press, and directional pad mappings. Store normalized coordinates and bind them to orientation and display; stop active pointers if rotation or a disconnect changes the mapping.
3. Evaluate a small scrcpy host extension against the pinned upstream control protocol. Reuse its multi-pointer event ordering and virtual display coordinate mapper. Test separate press, move, release, focus loss, and reconnect. Avoid sending high-rate game input by repeatedly starting ADB shell commands.
4. Add pointer-look and controller-to-touch only after stable d-pad and multi-touch support. Make keyboard capture explicit and keep system shortcuts accessible.
5. Verify with games that use native HID and games that only accept touch. Measure input latency separately from encoder output delay over USB and Wi-Fi. Verify that disconnect, focus loss, and app switches release all pressed keys and touch pointers.

This plan covers input mapping. It does not add an Android emulator or install games.
