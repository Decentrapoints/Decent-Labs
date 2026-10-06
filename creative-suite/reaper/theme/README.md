# DLS Satsu — native REAPER theme

Graphite surfaces, quiet separators, lavender selection, mint playback, and rose recording. This package replaces the native track, mixer, master, envelope and transport layouts and supplies original stateful artwork. It does not require the DLS web service or an extension.

**1.2:** bottom Playback tools with draggable numbers, resettable sliders, a visible pitch section, and original guitar-practice toolbar icons. Native window backgrounds enable theme drawing, including the empty track pane and dock chrome. **DLS Satsu Light** uses layered cool grays, dark labels and a deeper violet accent; its working surfaces are never pure white.

## Use the theme

1. Download **DLS Satsu.ReaperThemeZip** from the `dist` folder, or use **Connections → Download REAPER theme** in the suite.
2. Drag the archive onto REAPER. Select **Options → Themes → DLS Satsu** if it is not selected automatically.
3. Choose **Options → Layouts → Track Panel / Mixer Panel** for the panel variants below. A particular track can also have its own panel layout from its context menu.

Download **DLS Satsu Light.ReaperThemeZip** for the light gray variant. Both variants share the same controls and layouts.

If the drag/drop path is unavailable, open **Options → Show REAPER resource path in explorer/finder**, copy the archive into **ColorThemes**, and select it in **Options → Themes**. No extraction or build is needed. The same archive works on another machine.

Windows installer, from this folder:

```powershell
./install.ps1
# Complete Windows workspace: close REAPER first.
./install.ps1 -QuickAccess -NativeControls
# Point Tabs / Satsu shortcuts at your self-hosted server:
./install.ps1 -QuickAccess -NativeControls -SuiteURL 'https://music.example.com'
# Portable / custom REAPER resource directory:
./install.ps1 -ResourcePath 'D:/PortableREAPER'
# Install only one appearance:
./install.ps1 -Variant Dark
```

The installer copies both DLS themes and the standalone **Scripts/DLS_Playback.lua**, and verifies their checksums. Existing DLS versions receive timestamped backups. `-WhatIf` previews installation. `-Uninstall` removes the selected DLS archives; it keeps the Playback script and its preferences. Other themes and scripts are untouched.

`-QuickAccess` also registers the actions and adds Playback, guitar tuner, live pitch, phrase loop, count-in, DLS Tabs and Satsu studio to the main toolbar. Existing button order, icons, custom attributes and other toolbars are preserved. The first workspace installation sets a compact bottom docker; later installs preserve your chosen height. Configuration and script updates receive timestamped backups. Re-run this command on another machine after cloning the repository.

`-NativeControls` adds Windows native transport BPM dragging using the optional official **js_ReaScriptAPI 1.310** extension. The installer downloads a pinned upstream Windows 64-bit binary and checks its SHA-256 before installation; an existing extension version is preserved. This dependency is unnecessary for the theme or standalone Playback controls. Open Playback once per REAPER session to start its separate transport action. The action continues when Playback is hidden, releases only its own mouse hooks, and suspends native dragging when another theme is selected. Stop it through the Actions list. It has no audio processing.

You can instead load and run **DLS_Load_Theme.lua** from the parent `reaper` folder. It installs and applies the theme and remembers the prior theme selection. **DLS_Restore_Theme.lua** restores that selection. Keep the repository folder structure intact. Restore the legacy palette action before changing themes if you previously used it.

**DLS_Load_Light_Theme.lua** applies the gray variant. Both loaders register and open Playback tools when the adjacent script is present.

## Playback tools

In **Actions → Show action list → New action → Load ReaScript**, load **DLS_Playback.lua**, then **Run**. The Windows installer places it in the REAPER resource directory's **Scripts** folder. It is also available in the suite under **Connections → Download Playback panel**. The downloaded script is self-contained; no extension, Python, web service or extra Lua files are needed.

Playback initially docks beneath the arrangement. Its header collapses the entire dock into the **Playback toolbar button**; click that button to reopen it. Floating panels fold into a compact header instead. The **Pitch & practice** row expands independently and scrolls its actual controls into view even in a shallow dock. Use **Float / Dock** or drag the tab to choose another position. The panel remembers its position and pitch-section preference, and follows the dark/gray theme selection.

- **BPM:** drag the number right/up to increase or left/down to decrease; hold Shift for fine adjustment. Click without dragging to type. The slider covers 20–400 BPM. Double-click its handle or the number to reset to 120 BPM. Tap tempo averages up to five recent taps. With a tempo map, the control edits the tempo marker active at the edit cursor, preserving that marker's time, signature and ramp; without one it edits the project tempo. Each drag creates one undo step.
- **Speed:** separate draggable percentage and 25–200% slider; double-click resets to 100%. **Keep pitch** uses REAPER's native preserve-pitch setting.
- **Pitch & practice:** audio take transposition from −12 to +12 semitones, precise fractional entry, relative ±1 steps and reset. Only selected audio takes change; MIDI and source audio files remain intact. A drag captures its targets so a later selection change cannot redirect it.
- **Live track pitch / ReaPitch:** select one guitar track and click. The tool reuses an existing ReaPitch, or explicitly adds one before the amp, then opens its native controls for real-time transposition and additional shifters. Nothing is inserted merely by opening Playback.
- **Loop selection, repeat, click and metronome settings:** direct access to native looping, count-in and click configuration.

The toolbar tuner reuses ReaTune or adds it before the amp on exactly one selected track. Live pitch similarly reuses/adds ReaPitch before the amp. Neither action turns on record monitoring or recording. Select a time range before using **Loop phrase**. **Tabs** and **Satsu** open their configured suite routes in your browser; they do not upload a project. Run the suite or point `-SuiteURL` at your server for these shortcuts.

Space plays/stops; Tab cycles BPM/speed/pitch entry; Enter applies; Escape cancels entry or closes the panel. Narrow docks stack the sliders and scroll to expose the expanded tools. Native undo works for project edits. The UI uses REAPER's built-in graphics API. Native REAPER 7.82 checks confirmed bottom docking, toolbar rendering and Playback BPM dragging. The final compact layout and native edit-dismissal change still need a native visual check; the Windows control helper stopped capturing the app during that check. Automated tests cover clipping, collapse, gestures, hook ownership, project switches and installer preservation. Check your display setup after installing.

## Layouts

| Panel                 | Variant         | Use                                                                                                        |
| --------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| Track                 | Satsu Studio    | 108px baseline; readable names, arm/mute/solo, gain/pan, FX, routing, automation, phase and monitoring     |
| Track                 | Satsu Compact   | 64px baseline; essential editing controls; dragging the lower edge exposes additional controls             |
| Track                 | Satsu Recording | 168px baseline; input, record mode, stereo width and native FX parameter area                              |
| Mixer                 | Satsu Studio    | 124px strips; native inserts/sends, meter, fader, gain readout, pan, arm/mute/solo, routing and monitoring |
| Mixer                 | Satsu Compact   | 92px strips; separate hit targets and a narrower meter/fader pair                                          |
| Mixer                 | Satsu Inspector | 232px strip with dedicated insert/send sidebar, input, record mode and phase                               |
| Master                | Satsu Studio    | 156px mixer with mono, stereo metering and output routing                                                  |
| Envelopes / transport | Satsu Studio    | Native automation controls, transport, tempo/tap, signature, playback rate and selection readout           |

At 150% and 200% display scale, REAPER automatically maps the base layouts to matching larger artwork/layouts. You can also choose those layouts manually. Compact tracks expand their controls with height. Under 300px TCP width, record-mode control is available from the recording-arm context menu; widen the panel for a direct button. Pan readout appears at 380px width. Input/width controls appear from 130px track height; the native FX parameter area appears from 166px.

Native mixer inserts/sends follow REAPER's mixer visibility preferences. Enable the desired insert/send sections in the mixer context menu. Inspector keeps their native scrolling area in its sidebar. The transport responds to its width: at 580px it keeps the core transport and clock; tempo/tap, signature, rate and selection readout appear as room permits.

The skin covers WALTER panels and the theme color/image system. OS menus, preferences dialogs and third-party plugin interfaces remain native. The web Satsu panel and DLS Tabs are separate applications; the theme itself does not implement a dock or timeline synchronization.

## Build / validation

Ready-to-use archive: `dist/DLS Satsu.ReaperThemeZip`.

```sh
python -m pip install Pillow==12.3.0
python reaper/theme/build.py
python reaper/theme/build.py --check
python -m unittest discover -s reaper/theme -p test_theme.py
```

Run those from `creative-suite`. `build.py` owns all vector drawing instructions, colors, font serialization and WALTER generation. `rtconfig.txt` and `DLS Satsu.ReaperTheme` are generated readable sources. The archive contains every asset and a SHA-256 manifest. ZIP metadata is fixed, and builds use no platform fonts or downloaded artwork. The release check compares generated sources and decoded RGBA pixels, and verifies the shipped file checksums; compressed PNG/ZIP bytes can differ between platform compression libraries. Python/Pillow are needed only to rebuild; users only need REAPER 7+ and the archive.

Tests inspect every PNG and archive entry; assert hover/pressed atlases, scale sets, font/layout presence and contrast; and resolve actual generated WALTER geometry across widths/heights/scales to catch collisions and inaccessible controls. They do not replace a native-renderer visual inspection.

Original theme code and artwork are MIT licensed in `LICENSE.txt`. No assets or WALTER code from Cockos, Commala, Reapertips, or other themes are redistributed.

Official format references: [Theme structure and image names](https://www.reaper.fm/sdk/walter/images.php), [WALTER](https://www.reaper.fm/sdk/walter/walter.php).
