# Sky Hop 1.21 code 47 — world animals

Built on code 46. versionName stays **1.21**. versionCode and APP_BUILD are **47**. Hunters and witches are unchanged. Nothing was uploaded. Store release notes are unchanged.

`flight.test.js` and `obstacles.test.js` had 0 failures.

Animals use the old critter spawn slot, on a longer gap, so they do not sit on top of the hunter clock. They are drawn upright: heads and beaks point down the screen, wings open left and right. A defeat is smoke and feathers. One fire hit scatters a wasp swarm. A storm eagle takes 4 hits and drops 3 coins. Screen edges do not kill the bird.

Worlds still change every 5 levels:

| Levels | World | Animals |
| --- | --- | --- |
| 1–5 | Ember Reach | bats |
| 6–10 | Sunset Desert | wasp swarms |
| 11–15 | Snowy Peaks | ravens, rare storm eagle |
| 16–20 | Night City | bats |
| 21–25 | Outer Space | bats, rare storm eagle |
| 26–30 | Blossom Valley | wasp swarms, sometimes ravens |
| 31–35 | Coral Reef | ravens |
| 36–40 | Lava Land | bats |
| 41–45 | Glass Aurora | ravens, rare storm eagle |

Then the nine worlds repeat. Animals begin at level 2. Eagles begin at level 11, about one spawn in eight in Snowy Peaks, Outer Space, and Glass Aurora.

The unsigned AAB is package `com.skyhop.mobile`. The live AdMob app ID is `ca-app-pub-9357129551510699~6915096354`. The merged permission list matches code 45 and 46. The app manifest still declares only `INTERNET`. `jarsigner` reports the jar is unsigned. Minify is off, so there is no mapping.txt.

- AAB SHA-256 `83aa23de6139707a46b6a2e5d3be1d9c5fed00dee7c9ee0407108d9b1ef8d0a6`
- web zip SHA-256 `633fe27a07f40e84a425fb5c4fd3efdfe009fd08d0049712d7b83c7bcb7b28b5`
