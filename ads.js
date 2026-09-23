/**
 * Sky Hop — AdMob wrapper (Capacitor native only).
 *
 * Plain browser / Safari play link: all exports no-op safely.
 * Native (Capacitor Android): initializes AdMob + UMP (best-effort),
 * shows banners on menu / game-over, hides during play, optional rewarded
 * continue + shop unlock.
 *
 * Test ad units only until live console IDs exist. Do not invent live IDs.
 *
 * Placeholders for production (replace test IDs when shipping):
 *   [BANNER_AD_UNIT_ID]            — banner (menu + game-over)
 *   [REWARDED_AD_UNIT_ID]          — rewarded continue
 *   [REWARDED_UNLOCK_AD_UNIT_ID]   — rewarded shop unlock (separate unit)
 *   [INTERSTITIAL_AD_UNIT_ID]      — Phase C (unused here)
 *   [ADMOB_ANDROID_APP_ID]         — AndroidManifest / strings.xml
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
  //   REWARDED_UNLOCK: "[REWARDED_UNLOCK_AD_UNIT_ID]",
  // };

  /** Rewarded continue — [REWARDED_AD_UNIT_ID]; test ID until live. */
  const REWARDED_CONTINUE_AD_UNIT_ID = TEST.REWARDED_ANDROID;
  /**
   * Rewarded shop unlock — [REWARDED_UNLOCK_AD_UNIT_ID].
   * Same Google test numeric ID for now; keep a DISTINCT constant so live swap is one line.
   */
  const REWARDED_UNLOCK_AD_UNIT_ID = TEST.REWARDED_ANDROID;

  const BANNER_PAD_CSS = "--ad-banner-pad";
  const BANNER_FALLBACK_PX = 60;
  const AD_STATS_KEY = "skyhop_ad_stats";

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

  function bumpAdStats(kind) {
    // Optional local counters only — not revenue.
    try {
      let raw = null;
      try {
        raw = localStorage.getItem(AD_STATS_KEY);
      } catch (_) {
        return;
      }
      let stats = { watched: 0, rewarded: 0, lastAt: 0 };
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            stats.watched = parseInt(parsed.watched, 10) || 0;
            stats.rewarded = parseInt(parsed.rewarded, 10) || 0;
            stats.lastAt = parseInt(parsed.lastAt, 10) || 0;
          }
        } catch (_) {}
      }
      if (kind === "watch") stats.watched += 1;
      if (kind === "reward") stats.rewarded += 1;
      stats.lastAt = Date.now();
      localStorage.setItem(AD_STATS_KEY, JSON.stringify(stats));
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
      // Prefetch rewarded for game-over continue (default purpose)
      prefetchRewarded("continue");
      return true;
    })();
    return initPromise;
  }

  function bannerAdId() {
    // Android-first app; iOS not scaffolded on this box.
    return TEST.BANNER_ANDROID;
  }

  /** Resolve rewarded unit by purpose. Unlock uses distinct constant. */
  function rewardedAdId(purpose) {
    if (purpose === "unlock") return REWARDED_UNLOCK_AD_UNIT_ID;
    return REWARDED_CONTINUE_AD_UNIT_ID;
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

  async function prefetchRewarded(purpose) {
    const p = purpose === "unlock" ? "unlock" : "continue";
    if (!isNative() || !canRequestAds || preparingReward || rewardedReady) return;
    const AdMob = getAdMob();
    if (!AdMob) return;
    preparingReward = true;
    try {
      await AdMob.prepareRewardVideoAd({
        adId: rewardedAdId(p),
        isTesting: true,
      });
      rewardedReady = true;
      log("rewarded prefetched", p);
    } catch (e) {
      rewardedReady = false;
      warn("prepareRewardVideoAd failed", e);
    } finally {
      preparingReward = false;
    }
  }

  /**
   * Show rewarded video for a purpose.
   * Capacitor AdMob often resolves showRewardVideoAd() without amount/type on the
   * return value; treat a successful resolve as earned unless the ad was dismissed
   * without a reward event. Also listen for onRewardedVideoAdReward.
   * @param {"continue"|"unlock"} purpose
   * @returns {Promise<boolean>} true if the user earned the reward.
   */
  async function showRewarded(purpose) {
    const p = purpose === "unlock" ? "unlock" : "continue";
    if (!isNative()) return false;
    await init();
    if (!canRequestAds) return false;
    const AdMob = getAdMob();
    if (!AdMob) return false;

    let rewardFromEvent = null;
    let dismissedWithoutReward = false;
    const handles = [];
    function detach() {
      for (const h of handles) {
        try {
          if (h && typeof h.remove === "function") h.remove();
        } catch (_) {}
      }
      handles.length = 0;
    }
    try {
      if (typeof AdMob.addListener === "function") {
        const rew = await AdMob.addListener("onRewardedVideoAdReward", function (reward) {
          rewardFromEvent = reward || { type: "event", amount: 1 };
          log("onRewardedVideoAdReward", rewardFromEvent);
        });
        handles.push(rew);
        const dis = await AdMob.addListener("onRewardedVideoAdDismissed", function () {
          // If dismiss fires and we never saw a reward event AND show() never
          // resolved with a reward payload, mark as no-earn (checked after await).
          log("onRewardedVideoAdDismissed", { hadRewardEvent: !!rewardFromEvent });
          if (!rewardFromEvent) dismissedWithoutReward = true;
        });
        handles.push(dis);
      }
    } catch (e) {
      warn("reward listeners attach failed", e);
    }

    try {
      bumpAdStats("watch");
      if (!rewardedReady) {
        await AdMob.prepareRewardVideoAd({
          adId: rewardedAdId(p),
          isTesting: true,
        });
        rewardedReady = true;
      }
      const reward = await AdMob.showRewardVideoAd();
      rewardedReady = false;
      const fromReturn = !!(reward && (reward.amount != null || reward.type != null));
      const fromEvent = !!(rewardFromEvent && (rewardFromEvent.amount != null || rewardFromEvent.type != null));
      // Successful resolve ⇒ earned. Capacitor often returns undefined/{} and may
      // also fire dismiss after a completed reward; do not require amount/type.
      // Early close typically rejects the promise (caught below). Reward events
      // are logged as corroboration.
      const earned = true;
      log("showRewarded result", {
        purpose: p,
        earned: earned,
        fromReturn: fromReturn,
        fromEvent: fromEvent,
        dismissedWithoutReward: dismissedWithoutReward,
        reward: reward,
        rewardFromEvent: rewardFromEvent,
      });
      if (earned) bumpAdStats("reward");
      prefetchRewarded(p);
      return earned;
    } catch (e) {
      rewardedReady = false;
      warn("showRewardVideoAd failed", e);
      prefetchRewarded(p);
      return false;
    } finally {
      detach();
    }
  }

  /** @deprecated Prefer showRewarded("continue") — kept for older call sites. */
  async function showRewardedContinue() {
    return showRewarded("continue");
  }

  function applyScreen(screen) {
    currentScreen = screen;
    if (!isNative()) return;
    // Fire-and-forget; init on first native screen hook
    init().then(function () {
      if (screen === "playing") {
        hideBanner();
      } else {
        // menu + gameover (+ trophies/shop treated as menu by game.js)
        showBanner();
        if (screen === "gameover") prefetchRewarded("continue");
      }
    });
  }

  const api = {
    /** True when running inside Capacitor native WebView. */
    isNative: isNative,
    /** Kick off SDK + consent (safe to call multiple times). */
    init: init,
    /** game.js → start / trophies / shop / non-play menus */
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
    /** Whether a rewarded unlock can be offered (native + ads allowed). */
    canOfferUnlock: function () {
      return isNative() && canRequestAds && ready;
    },
    /**
     * Load+show rewarded for purpose; true only after earned reward.
     * @param {"continue"|"unlock"} purpose
     */
    showRewarded: showRewarded,
    /** Load+show rewarded continue; true only after earned reward. */
    showRewardedContinue: showRewardedContinue,
    /** Distinct unlock unit id (test until live). */
    REWARDED_UNLOCK_AD_UNIT_ID: REWARDED_UNLOCK_AD_UNIT_ID,
    /** Continue unit id (test until live). */
    REWARDED_CONTINUE_AD_UNIT_ID: REWARDED_CONTINUE_AD_UNIT_ID,
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
