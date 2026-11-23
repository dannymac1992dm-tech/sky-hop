# Sky Hop 1.9.2 (versionCode 12) — 2026-10-17 — NOT uploaded, NOT deployed
Working copy: /workspace/skyhop-1.9.2-work/{flappy-clone,sky-hop-app} (live sources /workspace/flappy-clone + /workspace/sky-hop-app untouched = 1.9.1; backup /workspace/backups/pre-1.9.2-flappy-clone).
1) Dead game-over buttons: 1.9.1 ignored ALL game-over taps while a rewarded ad was in flight (continueBusy/rewardBusy), and a request
   can take 8 s load + 8 s "must appear" (or forever if ads start-up was pending). With no fill the player sees "Watching ad…",
   then "No ad available right now", and Share/Leaderboard/Shop/Birds/Trophies do nothing. Fix: menu buttons cancel a still-loading
   request (ads.js cancelPendingRewarded / stillWanted; no ad pops later), "Loading ad…" vs "Watching ad…", no-fill button becomes
   "No ad right now — tap to retry" (real new request); showRewarded waits <= 4 s on a pending start-up; leaderboard lock expires after 20 s.
2) Ads: consent form now has a 45 s timeout and a late answer still starts ads; game over prefetches the unlock unit too. Live IDs unchanged.
3) Play Games: PlayGamesInitProvider removed + SUPPRESS_GAME_PROFILE_CREATION; PlayGamesSdk.initialize only on Leaderboard tap
   (or at launch for players who previously signed in). Status/submitScore never init or sign in.
AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.9.2-code12.aab (rebuilt after the consent guard; see sha256 in report), same upload cert as 1.9.1.
Web: /workspace/skyhop-1.9.2-work/web-dist (+ sky-hop-web-1.9.2.zip); itch: /workspace/skyhop-1.9.2-work/itch/sky-hop-itch.zip.
Tests: /workspace/sky-hop-1.9.2-test — verify-1.9.2.js 75/75 on 1.9.2 (25 fail on 1.9.1 = repro); 1.9.1 Back suite 118/118; 1.9 suite 78/78. No on-device test.
4) Consent (Legal follow-up): timeout/late answer gated on UMP canRequestAds (re-checked via requestConsentInfo before MobileAds init); no second consent form while one is unanswered. Suite now 88/88.
