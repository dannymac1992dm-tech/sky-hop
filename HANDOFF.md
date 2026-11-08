# Sky Hop 1.20 baseline for 1.21 test work

Source: /workspace/skyhop-1.20-work. Originals unchanged. Supplied baseline overrides stale website repository content; use isolated branch. No verified Git ref exists for this local release snapshot.

Included: flappy-clone editable web sources; sky-hop-app Capacitor/Android native wrapper, resources, scripts, package lock and Gradle wrapper; root BUILD, SHA256SUMS and STORE-TEXT provenance documents. Excluded dependencies, caches, builds, generated www/public and Capacitor metadata, signing/local properties, credential files, release-signing instructions, APK/AAB and other release binaries. Manifest lists exclusions without secret values.

Baseline: com.skyhop.mobile, versionCode 24, versionName 1.20-candidate. Node >=22, Capacitor ^8.5.2, AdMob plugin 8.1.0. Install via npm ci in sky-hop-app; regenerate web and Android assets with sync:web and Capacitor sync. Verify historical sync scripts/path assumptions use supplied sibling flappy-clone instead of stale /workspace/flappy-clone. Android needs compatible JDK and SDK. Machine-local SDK properties and release signing credentials intentionally absent. Debug/unsigned work must not require production signing secrets; do not recover or transfer them. Old README environment statements are historical. Original checksums refer to original artifacts, not this ZIP; no rebuild or gameplay tests performed during packaging.

Next test release only: approved detailed red/gold phoenix, remove pipes including tall-column shapes, distinct breakable families and themed regions across 10,000 levels; preserve saves, upgrades and all existing behavior. Attach skyhop-obstacle-phoenix-concept.jpg separately. No upload, deploy, publishing, pushing or store submission is authorized by this handoff.

Security: heuristic credential scan found no unresolved matches in included text. Public app/ad service IDs remain non-secret application configuration. This scan is not a guarantee against unknown credential formats.
