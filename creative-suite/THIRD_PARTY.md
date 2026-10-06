# Third-party notices

Original DLS source uses the repository's existing ownership terms. Installed dependencies retain their original licenses; dependency source is not copied into this repository.

| Component                                | License / purpose                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| alphaTab 1.8.4                           | Mozilla Public License 2.0; notation, score import/export and synthesis. Package notices include integrated libraries. [Upstream](https://github.com/coderline/alphaTab) |
| Bravura font                             | SIL Open Font License 1.1; © Steinberg Media Technologies, reserved font name Bravura. License is served from the installed package's `font/Bravura-OFL.txt`.           |
| SONiVOX soundfont                        | Apache License 2.0; © 2004–2006 Sonic Network Inc. License and README are served from the installed package's `soundfont/` directory.                                   |
| React / React DOM                        | MIT                                                                                                                                                                      |
| Fastify and its multipart/static plugins | MIT                                                                                                                                                                      |
| Lucide React icons                       | ISC                                                                                                                                                                      |
| Vite / React Vite plugin                 | MIT                                                                                                                                                                      |
| Playwright                               | Apache License 2.0; development verification                                                                                                                             |
| Fengari                                  | MIT; Lua 5.3 verification harness                                                                                                                                        |
| Prettier                                 | MIT; development formatter                                                                                                                                               |

The application serves the original alphaTab library, font, soundfont and their notices locally from `node_modules`. It does not modify those assets. Container distribution includes dependency assets and notices from their original packages. Review upstream licenses when distributing or changing third-party code.

The three included scores (Glass, Night signal, Stillwater) are original demonstration phrases created for this suite; no commercial song transcriptions are bundled.

The optional Windows native-gesture installer downloads [js_ReaScriptAPI](https://github.com/juliansader/ReaExtensions) 1.310, copyright Julian Sader, under its upstream MIT license. The binary is not bundled in this repository. It is pinned to commit `2100b96d99b8621f6145a0f02000036c23b3d938`, path `js_ReaScriptAPI/v1.310/reaper_js_ReaScriptAPI64.dll`, with SHA-256 `7231862247efcd935f14a648364f7808631cb99b0fd55eb5ed6af1fbf7405072`. See the [upstream license](https://github.com/juliansader/ReaExtensions/blob/2100b96d99b8621f6145a0f02000036c23b3d938/License.txt).
