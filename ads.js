/**
 * Sky Hop — AdMob wrapper (Capacitor native only).
 *
 * Plain browser / Safari play link: all exports no-op safely.
 * Native (Capacitor Android): initializes AdMob + UMP (best-effort),
 * shows banners on menu / game-over, hides during play, optional rewarded continue.
 *
 * Test ad units only until live console IDs exist. Do not invent live IDs.
 *
 * Placeholders for production (replace test IDs when shipping):
 *   [BANNER_AD_UNIT_ID]   — banner (menu + game-over)
 *   [REWARDED_AD_UNIT_ID] — rewarded continue
 *   [INTERSTITIAL_AD_UNIT_ID] — Phase C (unused here)
 *   [ADMOB_ANDROID_APP_ID] — AndroidManifest / strings.xml (native App ID)
 *
 * Plugin: @capacitor-community/admob ^8 (pinned in sky-hop-app).
 * UMP API: requestConsentInfo → showConsentForm when status REQUIRED
 *   (plugin 8.x; if AdMob console UMP messaging is not configured yet,
 *    consent calls may no-op / throw — we best-effort continue for test ads).
 */
(function (global) {
  "use strict";

  // —— Google official test ad unit IDs (Android) ——
  // https://developers.google.com/admob/android/test-ads
  const TEST = {
    BANNER_ANDROID: "ca-app-pub-3940256099942544/6300978111",
    REWARDED_ANDROID: "ca-app-pub-3940256099942544/5224354917",
    // App ID (native strings.xml) sample: ca-app-pub-3940256099942544~3347511713
  };

  // Live placeholders — keep commented until console IDs exist (do not invent).
  // const LIVE = {
  //   BANNER: "[BANNER_AD_UNIT_ID]",
  //   REWARDED: "[REWARDED_AD_UNIT_ID]",
  // };

  const BANNER_PAD_CSS = "--ad-banner-pad";
  const BANNER_FALLBACK_PX = 60;

  let ready = false;
  let initPromise = null;
  let canRequestAds = false;
  let bannerVisible = false;
  let bannerCreated = false;
  let rewardedReady = false;
  let preparingReward = false;
  let currentScreen = "menu"; // menu | playing | gameover
  let sizeListenerAttached = false;

  function log() {
    if (typeof console !== "undefined" && console.debug) {
      console.debug.apply(console, ["[SkyHopAds]"].concat([].slice.call(arguments)));
    }
  }

  function warn() {
    if (typeof console !== "undefined" && console.warn) {
      console.warn.apply(console, ["[SkyHopAds]"].concat([].slice.call(arguments)));
    }
  }

  function isNative() {
    try {
      const Cap = global.Capacitor;
      return !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
    } catch (_) {
      return false;
    }
  }

  function getAdMob() {
    const Cap = global.Capacitor;
    if (!Cap || !isNative()) return null;
    try {
      if (Cap.Plugins && Cap.Plugins.AdMob) return Cap.Plugins.AdMob;
      if (typeof Cap.registerPlugin === "function") {
        return Cap.registerPlugin("AdMob");
      }
    } catch (e) {
      warn("AdMob plugin unavailable", e);
    }
    return null;
  }

  function setBannerPad(px) {
    try {
      const v = Math.max(0, Math.round(px || 0));
      document.documentElement.style.setProperty(BANNER_PAD_CSS, v + "px");
    } catch (_) {}
  }

  async function runConsent(AdMob) {
    // Best-effort UMP. Plugin 8.x: requestConsentInfo / showConsentForm.
    // Status enum string: REQUIRED | OBTAINED | NOT_REQUIRED | UNKNOWN
    try {
      let info = await AdMob.requestConsentInfo();
      const status = info && info.status != null ? String(info.status) : "";
      if (info && info.isConsentFormAvailable && status === "REQUIRED") {
        info = await AdMob.showConsentForm();
      }
      if (info && typeof info.canRequestAds === "boolean") {
        return info.canRequestAds;
      }
      return true;
    } catch (e) {
      warn("UMP consent best-effort failed (configure GDPR messages in AdMob console for production):", e);
      // Test / pre-UMP setups: allow Google test ads to load.
      return true;
    }
  }

  async function attachBannerSizeListener(AdMob) {
    if (sizeListenerAttached) return;
    sizeListenerAttached = true;
    try {
      await AdMob.addListener("bannerAdSizeChanged", function (info) {
        const h = info && typeof info.height === "number" ? info.height : 0;
        if (bannerVisible && h > 0) setBannerPad(h);
        else if (!bannerVisible) setBannerPad(0);
      });
    } catch (e) {
      warn("banner size listener failed", e);
    }
  }

  async function init() {
    if (!isNative()) {
      log("browser — ads no-op");
      return false;
    }
    if (initPromise) return initPromise;
    initPromise = (async function () {
      const AdMob = getAdMob();
      if (!AdMob) {
        warn("no AdMob plugin");
        return false;
      }
      try {
        await AdMob.initialize({
          // Test units are used below; set initializeForTesting + testingDevices
          // when registering a physical device for non-test unit QA.
          initializeForTesting: true,
          maxAdContentRating: "General",
        });
      } catch (e) {
        warn("initialize failed", e);
        return false;
      }
      canRequestAds = await runConsent(AdMob);
      if (!canRequestAds) {
        warn("canRequestAds=false — banners/rewarded suppressed");
        ready = true;
        return true;
      }
      await attachBannerSizeListener(AdMob);
      ready = true;
      log("ready");
      // Prefetch rewarded for game-over continue
      prefetchRewarded();
      return true;
    })();
    return initPromise;
  }

  function bannerAdId() {
    // Android-first app; iOS not scaffolded on this box.
    return TEST.BANNER_ANDROID;
  }

  function rewardedAdId() {
    return TEST.REWARDED_ANDROID;
  }

  async function showBanner() {
    if (!isNative() || !canRequestAds) return;
    await init();
    if (!canRequestAds) return;
    const AdMob = getAdMob();
    if (!AdMob) return;
    try {
      if (bannerCreated && !bannerVisible) {
        await AdMob.resumeBanner();
        bannerVisible = true;
        setBannerPad(BANNER_FALLBACK_PX);
        return;
      }
      if (bannerVisible) return;
      await AdMob.showBanner({
        adId: bannerAdId(),
        adSize: "ADAPTIVE_BANNER",
        position: "BOTTOM_CENTER",
        margin: 0,
        isTesting: true,
      });
      bannerCreated = true;
      bannerVisible = true;
      setBannerPad(BANNER_FALLBACK_PX);
    } catch (e) {
      warn("showBanner failed", e);
    }
  }

  async function hideBanner() {
    if (!isNative()) {
      setBannerPad(0);
      return;
    }
    const AdMob = getAdMob();
    if (!AdMob || !bannerVisible) {
      setBannerPad(0);
      bannerVisible = false;
      return;
    }
    try {
      await AdMob.hideBanner();
    } catch (e) {
      warn("hideBanner failed", e);
    }
    bannerVisible = false;
    setBannerPad(0);
  }

  async function prefetchRewarded() {
    if (!isNative() || !canRequestAds || preparingReward || rewardedReady) return;
    const AdMob = getAdMob();
    if (!AdMob) return;
    preparingReward = true;
    try {
      await AdMob.prepareRewardVideoAd({
        adId: rewardedAdId(),
        isTesting: true,
      });
      rewardedReady = true;
      log("rewarded prefetched");
    } catch (e) {
      rewardedReady = false;
      warn("prepareRewardVideoAd failed", e);
    } finally {
      preparingReward = false;
    }
  }

  /**
   * Show rewarded video. Resolves true only if the user earned the reward.
   * No click incentives — reward only for completing the rewarded video.
   */
  async function showRewardedContinue() {
    if (!isNative()) return false;
    await init();
    if (!canRequestAds) return false;
    const AdMob = getAdMob();
    if (!AdMob) return false;
    try {
      if (!rewardedReady) {
        await AdMob.prepareRewardVideoAd({
          adId: rewardedAdId(),
          isTesting: true,
        });
        rewardedReady = true;
      }
      const reward = await AdMob.showRewardVideoAd();
      rewardedReady = false;
      // Prefetch next for a later run (one continue per reward already consumed by game)
      prefetchRewarded();
      return !!(reward && (reward.amount != null || reward.type != null));
    } catch (e) {
      rewardedReady = false;
      warn("showRewardVideoAd failed", e);
      prefetchRewarded();
      return false;
    }
  }

  function applyScreen(screen) {
    currentScreen = screen;
    if (!isNative()) return;
    // Fire-and-forget; init on first native screen hook
    init().then(function () {
      if (screen === "playing") {
        hideBanner();
      } else {
        // menu + gameover (+ trophies treated as menu by game.js)
        showBanner();
        if (screen === "gameover") prefetchRewarded();
      }
    });
  }

  const api = {
    /** True when running inside Capacitor native WebView. */
    isNative: isNative,
    /** Kick off SDK + consent (safe to call multiple times). */
    init: init,
    /** game.js → start / trophies / non-play menus */
    onMenu: function () {
      applyScreen("menu");
    },
    /** game.js → active run */
    onPlaying: function () {
      applyScreen("playing");
    },
    /** game.js → game-over / results */
    onGameOver: function () {
      applyScreen("gameover");
    },
    /** Whether a rewarded continue can be offered (native + ads allowed). */
    canOfferContinue: function () {
      return isNative() && canRequestAds && ready;
    },
    /** Load+show rewarded; true only after earned reward. */
    showRewardedContinue: showRewardedContinue,
    /** Constants for docs / debugging (test IDs). */
    TEST_IDS: TEST,
    getScreen: function () {
      return currentScreen;
    },
  };

  global.SkyHopAds = api;

  // Auto-init when Capacitor bridge is present (after DOM ready is fine)
  function boot() {
    if (!isNative()) return;
    init();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
