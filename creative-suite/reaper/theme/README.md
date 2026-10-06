# DLS Satsu — native REAPER theme

Graphite surfaces, quiet separators, lavender selection, mint playback, and rose recording. This package replaces the native track, mixer, master, envelope and transport layouts and supplies original stateful artwork. It does not require the DLS web service or an extension.

## Use the theme

1. Download **DLS Satsu.ReaperThemeZip** from the `dist` folder, or use **Connections → Download REAPER theme** in the suite.
2. Drag the archive onto REAPER. Select **Options → Themes → DLS Satsu** if it is not selected automatically.
3. Choose **Options → Layouts → Track Panel / Mixer Panel** for the panel variants below. A particular track can also have its own panel layout from its context menu.

If the drag/drop path is unavailable, open **Options → Show REAPER resource path in explorer/finder**, copy the archive into **ColorThemes**, and select it in **Options → Themes**. No extraction or build is needed. The same archive works on another machine.

Windows installer, from this folder:

```powershell
./install.ps1
# Portable / custom REAPER resource directory:
./install.ps1 -ResourcePath 'D:/PortableREAPER'
```

The installer copies only the DLS theme and verifies the checksum. Existing DLS versions receive a timestamped backup; other themes, configuration, scripts, audio devices, and projects are untouched. `-WhatIf` previews installation. `-Uninstall` removes only the DLS archive; select another theme first.

You can instead load and run **DLS_Load_Theme.lua** from the parent `reaper` folder. It installs and applies the theme and remembers the prior theme selection. **DLS_Restore_Theme.lua** restores that selection. Keep the repository folder structure intact. Restore the legacy palette action before changing themes if you previously used it.

## Layouts

| Panel | Variant | Use |
| --- | --- | --- |
| Track | Satsu Studio | 108px baseline; readable names, arm/mute/solo, gain/pan, FX, routing, automation, phase and monitoring |
| Track | Satsu Compact | 64px baseline; essential editing controls; dragging the lower edge exposes additional controls |
| Track | Satsu Recording | 168px baseline; input, record mode, stereo width and native FX parameter area |
| Mixer | Satsu Studio | 124px strips; native inserts/sends, meter, fader, gain readout, pan, arm/mute/solo, routing and monitoring |
| Mixer | Satsu Compact | 92px strips; separate hit targets and a narrower meter/fader pair |
| Mixer | Satsu Inspector | 232px strip with dedicated insert/send sidebar, input, record mode and phase |
| Master | Satsu Studio | 156px mixer with mono, stereo metering and output routing |
| Envelopes / transport | Satsu Studio | Native automation controls, transport, tempo/tap, signature, playback rate and selection readout |

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
