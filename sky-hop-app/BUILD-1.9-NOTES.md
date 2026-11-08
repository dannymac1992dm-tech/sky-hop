# Sky Hop 1.9 (versionCode 10) build notes — 2026-10-08
NOT uploaded anywhere. 1.8 untouched.
- Source: /workspace/flappy-clone (web) + /workspace/sky-hop-app/android (Capacitor 8.5.2). Backup of pre-1.9 state: /workspace/backups/pre-1.9/
- AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.9-code10.aab (sha256 58ed7a7c83ae2b9471416ef9f6003678ead26c9d35fa6d7bf9c2c587d7b1ea75), upload key same as 1.8
- APKs: /workspace/sky-hop-1.9-test/apk/
- itch: /workspace/sky-hop-itch/sky-hop-itch.zip (builder build-itch.js)
- AdMob App ID ca-app-pub-9357129551510699~6915096354 unchanged; 0 hits for 501069; ads.js only version bump.
- Features: Ghost replaces Glide (5 pipes, once/run, 2 rewarded ads, migration); PGS v2 weekly leaderboard CgkIktmb8oQKEAIQAA; Share score (FileProvider, no new permissions).
- Tests: 1.9 suite 78/78, 1.8 regression 110/110, itch 17/17. No on-device test (emulator would not boot).
- Before release: publish PGS config + leaderboard in Play Console; update privacy policy (privacy.html l.116/119, privacy-policy.md l.63) and Data safety (data-safety-answers.md l.51).
