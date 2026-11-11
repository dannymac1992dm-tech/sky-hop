/**
 * Sky Hop — AdMob wrapper (Capacitor native only).
 *
 * Plain browser / Safari play link: all exports no-op safely.
 * Native (Capacitor Android): initializes AdMob + UMP (best-effort),
 * shows banners on menu / game-over, hides during play, optional rewarded
 * continue + shop unlock.
 *
 * LIVE AdMob unit IDs wired for Play release (App ID in strings.xml).
 * Google TEST unit IDs are used only when the hidden diagnostics panel's
 * "Test ads" switch is ON (stored in localStorage, applies after restart).
 *
 * Live units:
 *   BANNER              — ca-app-pub-9357129551510699/5602014680
 *   REWARDED_CONTINUE   — ca-app-pub-9357129551510699/9791621264
 *   REWARDED_UNLOCK     — ca-app-pub-9357129551510699/5030249177
 *   ADMOB_ANDROID_APP_ID — ca-app-pub-9357129551510699~6915096354 (strings.xml)
 * Interstitial unused (Phase C).
 *
 * Plugin: @capacitor-community/admob 8.1.0 (pinned in sky-hop-app).
 *
 * v1.4 (versionCode 5) fixes:
 *  - Rewarded: plugin 8.1.0 showRewardVideoAd() only resolves when a reward is
 *    earned — it NEVER settles on dismiss-without-reward or on
 *    onAdFailedToShowFullScreenContent, and prepareRewardVideoAd() has no
 *    timeout. The old code awaited those promises directly, so the game-over
 *    button could sit on "Watching ad…" forever. Now: 8 s load timeout, 8 s
 *    "ad must appear" timeout, outcome driven by Showed/Reward/Dismissed/
 *    FailedToShow events, and a user-facing "No ad available right now".
 *  - Banner: when a banner fails to load, the native plugin destroys its
 *    AdView, but the old JS kept bannerCreated=true and afterwards only called
 *    resumeBanner() (a native no-op with no AdView) — so after the first
 *    failure no further banner requests were ever made that session. Now the
 *    state resets on bannerAdFailedToLoad and the next menu/game-over retries.
 *  - Load/show errors (AdMob error code + message) are recorded and shown in a
 *    hidden diagnostics panel: tap the small "v1.4" label 5 times.
 *
 * v1.5 (versionCode 6): label reads "v1.5". game.js also uses showRewarded("unlock")
 * for Double coins / early skill unlocks and showRewarded("continue") for the
 * checkpoint continue — same 8 s timeouts and event-driven outcome as above.
 *
 * v1.6 (versionCode 7): AdMob publisher ID fix only. 1.5 shipped with a mistyped
 * publisher ID (two digits transposed); live App ID and unit IDs now use pub-9357129551510699.
 * Label reads "v1.6". No gameplay changes.
 *
 * v1.7 (versionCode 8): consent first. UMP consent info is gathered (and the
 * consent form shown when REQUIRED) BEFORE AdMob.initialize(); the SDK is
 * initialized and ads are loaded only when canRequestAds is true. A consent
 * error no longer "fails open": no ads until a later retry (next menu /
 * game-over, at most once per minute, max 5 tries per session) succeeds.
 * The consent form is never shown during a run. New privacyOptionsRequired()
 * and showPrivacyOptions() (UMP privacy options form) for the menu's
 * "Privacy choices" button. Label reads "v1.7".
 *
 * v1.8 (versionCode 9): banner layout.
 *  - Reserved banner space (AdMob accidental-click guidance): on menu / game-over
 *    the bottom padding (--ad-banner-pad) is set the moment the screen opens,
 *    before and regardless of the banner load result, and is never shrunk while
 *    on that screen (a load failure or hide no longer zeroes it there). The
 *    reservation is the last measured adaptive-banner height for this width, or
 *    the anchored adaptive maximum (min(90, 15% of screen height), >= 50) until
 *    one has been measured. During a run there is still no banner and no padding.
 *  - setBannerPad() dispatches "skyhop:bannerpad" so game.js re-fits the canvas
 *    and drops its cached tap rect (the stale rect made skill taps land low).
 *  - hideBanner(): a failed hide is retried, then the AdView is removed; the
 *    padding is cleared only once the banner is known to be gone.
 *  - Adaptive width: the banner is sized once at creation, so after a
 *    meaningful viewport-width change (Fold outer <-> inner, rotation) it is
 *    removed and recreated at the new width (debounced; never during a run).
 *  - Version tag is smaller and is hidden / non-interactive during runs so it
 *    can never cover the left skill button. Label reads "v1.8".
 *
 * v1.9 (versionCode 10): version bump only in this file (label "v1.9").
 * Ad units, consent / privacy-choices and banner layout are unchanged from 1.8.
 *
 * v1.9.2 (versionCode 12): rewarded flow can no longer freeze the game-over screen.
 *  - showRewarded() never waits on a stuck start-up: if consent / SDK start is still
 *    pending it waits at most INIT_WAIT_MS, then fails with "Ads are still starting".
 *  - showConsentForm() now has a (long) timeout; a late answer from the form still
 *    enables ads (no more "init pending forever = zero ad requests all session").
 *  - showRewarded(purpose, { stillWanted }) + cancelPendingRewarded(): while an ad is
 *    only LOADING (not on screen) the game may cancel it (player tapped Shop /
 *    Leaderboard / ...). A cancelled request never shows an ad and keeps a late-loaded
 *    ad for the next tap. rewardedPhase() = idle | loading | showing.
 *  - rewardedStatus(purpose) = off | idle | loading | ready | failed, and
 *    retryRewarded(purpose) so a "No ad right now - tap to retry" button really
 *    makes a new request. Game over prefetches the unlock unit as well.
 */
(function (global) {
  "use strict";

  const APP_VERSION = "1.21";
  const APP_BUILD = 37;

  // —— Google official test ad unit IDs (Android) ——
  // https://developers.google.com/admob/android/test-ads
  const TEST = {
    BANNER_ANDROID: "ca-app-pub-3940256099942544/6300978111",
    REWARDED_ANDROID: "ca-app-pub-3940256099942544/5224354917",
    // App ID (native strings.xml) sample: ca-app-pub-3940256099942544~3347511713
  };

  // —— Live AdMob unit IDs (com.skyhop.mobile) ——
  const LIVE = {
    BANNER: "ca-app-pub-9357129551510699/5602014680",
    REWARDED_CONTINUE: "ca-app-pub-9357129551510699/9791621264",
    REWARDED_UNLOCK: "ca-app-pub-9357129551510699/5030249177",
  };

  /** Rewarded continue — live unit. */
  const REWARDED_CONTINUE_AD_UNIT_ID = LIVE.REWARDED_CONTINUE;
  /** Rewarded shop unlock — distinct live unit. */
  const REWARDED_UNLOCK_AD_UNIT_ID = LIVE.REWARDED_UNLOCK;

  const BANNER_PAD_CSS = "--ad-banner-pad";
  // Anchored adaptive banner height bounds (Google: >= 50 dp, <= min(90 dp, 15% of screen height)).
  const BANNER_MIN_PX = 50;
  const BANNER_MAX_PX = 90;
  const BANNER_H_KEY = "skyhop_banner_h"; // measured banner height per viewport width (layout cache only)
  const WIDTH_CHANGE_PX = 24; // viewport width change that needs a new adaptive banner
  const RESIZE_DEBOUNCE_MS = 400;
  const HIDE_RETRIES = 2; // extra hideBanner attempts before removeBanner
  const HIDE_RETRY_MS = 250;
  const AD_STATS_KEY = "skyhop_ad_stats";
  const TEST_MODE_KEY = "skyhop_ads_test_mode";

  const LOAD_TIMEOUT_MS = 8000; // rewarded load must finish within this
  const SHOW_START_TIMEOUT_MS = 8000; // ad must appear on screen within this
  const REWARD_SETTLE_MS = 600; // late reward event after dismiss
  const SHOW_MAX_MS = 180000; // absolute safety net once an ad is on screen
  const CONSENT_TIMEOUT_MS = 10000; // UMP consent-info update must answer within this
  const CONSENT_RETRY_MS = 60000; // after a failed consent check, retry at most this often
  const CONSENT_MAX_ATTEMPTS = 5; // per app session
  const CONSENT_FORM_TIMEOUT_MS = 45000; // v1.9.2: form must answer within this (late answers still count)
  const INIT_WAIT_MS = 4000; // v1.9.2: a rewarded tap waits at most this for a pending start-up

  const testMode = (function () {
    try {
      return localStorage.getItem(TEST_MODE_KEY) === "1";
    } catch (_) {
      return false;
    }
  })();

  let ready = false; // SDK initialized AND consent allows ad requests
  let initPromise = null;
  let canRequestAds = false; // only ever true after a successful UMP check said so
  let sdkInitialized = false;
  let sdkFailed = false; // MobileAds.initialize failed: no ads this session (same as 1.6)
  let consentAttempts = 0;
  let lastConsentAttemptAt = 0;
  let consentDeferred = false; // form needed but a run was in progress: retry on next menu
  let consentFormPending = false; // v1.9.2: a consent form is open / unanswered: never stack a second one
  let privacyOptionsStatus = "UNKNOWN"; // REQUIRED | NOT_REQUIRED | UNKNOWN (UMP)
  let privacyFormBusy = false;
  let bannerVisible = false;
  let bannerCreated = false;
  let bannerBusy = false;
  let currentScreen = "menu"; // menu | playing | gameover
  let bannerPadPx = 0; // padding currently applied (--ad-banner-pad)
  let padReserved = false; // menu / game-over reservation in force
  let padWidth = 0; // viewport width the reservation was made for
  let bannerWidthCss = 0; // viewport width the current native AdView was created at
  let bannerNeedsRecreate = false; // width changed since creation: remove + recreate on next show
  let hideInFlight = null;
  let resizeTimer = null;
  let listenersAttached = false;
  let activeShow = null; // handlers for the rewarded show in progress
  let lastFailure = null; // { stage, code, message, userMessage }
  const rewardedReadyIds = {}; // adId -> true when a loaded ad is waiting natively
  const rewardedLoadInFlight = {}; // adId -> Promise
  const rewardedLoadFailed = {}; // adId -> true when the last load for it failed (v1.9.2)
  let rewardedShowing = false; // v1.9.2: an ad is (about to be) on screen
  const liveReqs = []; // v1.9.2: { cancelled } for requests that are still loading
  function rewardedPhaseNow() {
    if (rewardedShowing || activeShow) return "showing";
    for (let i = 0; i < liveReqs.length; i++) if (!liveReqs[i].cancelled) return "loading";
    return "idle";
  }
  function dropReq(req) {
    const i = liveReqs.indexOf(req);
    if (i >= 0) liveReqs.splice(i, 1);
  }

  // —— Diagnostics (hidden panel) ——
  const diag = {
    native: false,
    pad: "-",
    plugin: "?",
    init: "pending",
    consent: "pending",
    banner: { requests: 0, loaded: 0, failed: 0, impressions: 0, lastError: null },
    rewarded: {
      requests: 0,
      loaded: 0,
      failed: 0,
      shown: 0,
      lastLoadError: null,
      lastShowError: null,
      lastOutcome: "-",
    },
    log: [],
  };
  let lastRewardedLoadErrorEvent = null;

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

  function hhmmss() {
    const d = new Date();
    const p = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function note(msg) {
    diag.log.push(hhmmss() + " " + msg);
    if (diag.log.length > 40) diag.log.shift();
    log(msg);
    refreshPanel();
  }

  function errInfo(e) {
    if (!e) return { code: null, message: "unknown error", at: hhmmss() };
    let code = null;
    if (e.code != null && e.code !== "") code = e.code;
    let message = e.message || e.errorMessage || e.error || "";
    if (!message) {
      try {
        message = typeof e === "string" ? e : JSON.stringify(e);
      } catch (_) {
        message = String(e);
      }
    }
    return { code: code, message: String(message).slice(0, 240), at: hhmmss() };
  }

  const CODE_HINT = {
    0: "internal error",
    1: "invalid request (bad ad unit ID?)",
    2: "network error",
    3: "NO FILL — account not approved / limited serving / no inventory",
    8: "invalid app ID",
    9: "mediation no fill",
    TIMEOUT: "no answer from AdMob in time",
    "-1": "ad was not loaded",
  };

  function fmtErr(e) {
    if (!e) return "none";
    const c = e.code != null ? String(e.code) : "?";
    const hint = CODE_HINT[c] ? " (" + CODE_HINT[c] + ")" : "";
    return "code " + c + hint + ' — "' + e.message + '" @' + e.at;
  }

  function withTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise(function (_, reject) {
      t = setTimeout(function () {
        reject({ code: "TIMEOUT", message: label + " timed out after " + ms / 1000 + "s" });
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(function () {
      clearTimeout(t);
    });
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
    const v = Math.max(0, Math.round(px || 0));
    const changed = v !== bannerPadPx;
    bannerPadPx = v;
    try {
      document.documentElement.style.setProperty(BANNER_PAD_CSS, v + "px");
    } catch (_) {}
    // v1.8: the native banner is an overlay, so this padding change fires no window resize.
    // Tell game.js to re-fit the canvas and drop its cached tap rect.
    if (changed) {
      try {
        global.dispatchEvent(new CustomEvent("skyhop:bannerpad", { detail: { px: v } }));
      } catch (_) {}
    }
  }

  function viewportWidth() {
    try {
      return Math.round(global.innerWidth || document.documentElement.clientWidth || 0);
    } catch (_) {
      return 0;
    }
  }

  function widthKey(w) {
    return String(Math.round((w || 0) / 8) * 8);
  }

  const measuredBannerH = (function () {
    try {
      const o = JSON.parse(localStorage.getItem(BANNER_H_KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (_) {
      return {};
    }
  })();

  function rememberBannerH(w, h) {
    const k = widthKey(w);
    if (!(h > 0) || measuredBannerH[k] === h) return;
    measuredBannerH[k] = h;
    try {
      const keys = Object.keys(measuredBannerH);
      if (keys.length > 8) delete measuredBannerH[keys[0]];
      localStorage.setItem(BANNER_H_KEY, JSON.stringify(measuredBannerH));
    } catch (_) {}
  }

  /** Height to reserve for the bottom banner at viewport width w (CSS px = dp). */
  function expectedBannerH(w) {
    const known = measuredBannerH[widthKey(w)];
    if (known > 0) return Math.min(BANNER_MAX_PX * 2, known);
    // Not measured yet: the anchored adaptive maximum, so the banner can never be taller than the space.
    let screenH = 0;
    try {
      const ih = global.innerHeight || 0;
      const sw = (global.screen && global.screen.width) || 0;
      const sh = (global.screen && global.screen.height) || 0;
      const portrait = ih >= (global.innerWidth || 0);
      screenH = Math.max(ih, portrait ? Math.max(sw, sh) : Math.min(sw, sh));
    } catch (_) {}
    return Math.max(BANNER_MIN_PX, Math.min(BANNER_MAX_PX, Math.ceil(0.15 * screenH)));
  }

  /** Could a banner still appear this session? (native, plugin present, ads not permanently off) */
  function adsPossible() {
    if (!isNative() || sdkFailed) return false;
    if (consentAttempts >= CONSENT_MAX_ATTEMPTS && !canRequestAds && !consentDeferred) return false;
    return !!getAdMob();
  }

  /** v1.8: reserve the bottom banner space for a menu / game-over screen (before any load result). */
  function reserveBannerSpace(reason) {
    if (!adsPossible()) {
      padReserved = false;
      padWidth = 0;
      setBannerPad(0);
      return;
    }
    padWidth = viewportWidth();
    padReserved = true;
    setBannerPad(expectedBannerH(padWidth));
    diag.pad = bannerPadPx + "px reserved for width " + padWidth + " (" + reason + ")";
  }

  /** On menu / game-over the padding may grow (banner taller than reserved) but never shrinks. */
  function growBannerPad(h) {
    if (currentScreen === "playing") return;
    if (h > bannerPadPx) {
      note("banner " + h + "px taller than reserved " + bannerPadPx + "px — padding grown");
      setBannerPad(h);
      padReserved = true;
      if (!padWidth) padWidth = viewportWidth();
      diag.pad = bannerPadPx + "px reserved for width " + padWidth + " (grown to banner)";
    }
  }

  /** Clear the padding only for a run (and only once the banner is known to be gone). */
  function clearPadForRun() {
    if (currentScreen !== "playing") return; // menus keep their reservation stable
    padReserved = false;
    padWidth = 0;
    setBannerPad(0);
    diag.pad = "0px (run, banner hidden)";
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
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

  function readConsentInfo(info) {
    if (!info) return;
    if (info.privacyOptionsRequirementStatus != null) {
      privacyOptionsStatus = String(info.privacyOptionsRequirementStatus);
    }
  }

  /**
   * UMP consent gathering. Resolves true ONLY when UMP answered and its
   * canRequestAds is true. Errors, timeouts, a missing answer or a form that
   * could not be shown resolve false (no fail-open).
   */
  async function runConsent(AdMob) {
    consentAttempts++;
    lastConsentAttemptAt = Date.now();
    consentDeferred = false;
    try {
      let info = await withTimeout(AdMob.requestConsentInfo(), CONSENT_TIMEOUT_MS, "Consent info");
      readConsentInfo(info);
      const status = info && info.status != null ? String(info.status) : "";
      diag.consent =
        "status=" + status + " formAvailable=" + !!(info && info.isConsentFormAvailable) +
        " canRequestAds=" + (info ? info.canRequestAds : "?") + " privacyOptions=" + privacyOptionsStatus;
      if (info && info.isConsentFormAvailable && status === "REQUIRED") {
        if (currentScreen === "playing") {
          // Never pop the consent form over a run; ask on the next menu / game-over.
          consentDeferred = true;
          diag.consent += " → form deferred (run in progress)";
          note("consent " + diag.consent);
          return false;
        }
        if (consentFormPending) {
          // v1.9.2: the earlier form (timed out) is still unanswered. No second form, no ads.
          diag.consent += " → earlier consent form still unanswered: no ads";
          note("consent " + diag.consent);
          return false;
        }
        consentFormPending = true;
        const formP = Promise.resolve().then(function () { return AdMob.showConsentForm(); });
        formP.then(function () { consentFormPending = false; }, function () { consentFormPending = false; });
        try {
          info = await withTimeout(formP, CONSENT_FORM_TIMEOUT_MS, "Consent form");
        } catch (fe) {
          if (fe && fe.code === "TIMEOUT") {
            // v1.9.2: the form never answered (e.g. covered by another popup). Don't keep the whole
            // ad start-up pending forever: fail this attempt (canRequestAds stays false, so the SDK is
            // not initialised and nothing is requested). A late answer only re-runs init(), which asks
            // UMP again and starts ads only if ConsentInformation.canRequestAds() is true.
            formP.then(function (late) {
              readConsentInfo(late);
              note("consent form answered late, canRequestAds=" + (late ? late.canRequestAds : "?"));
              if (late && late.canRequestAds === true) {
                lastConsentAttemptAt = 0;
                consentDeferred = true; // allow an immediate retry
                init().then(function (ok) { if (ok && currentScreen !== "playing") showBanner(); });
              }
            }, function () {});
          }
          throw fe;
        }
        readConsentInfo(info);
        diag.consent += " → form shown, canRequestAds=" + (info ? info.canRequestAds : "?") +
          " privacyOptions=" + privacyOptionsStatus;
      }
      diag.consent += " (attempt " + consentAttempts + " @" + hhmmss() + ")";
      note("consent " + diag.consent);
      return !!(info && info.canRequestAds === true);
    } catch (e) {
      const ei = errInfo(e);
      diag.consent = "error (no ads until a retry succeeds): " + ei.message + " (attempt " + consentAttempts + " @" + ei.at + ")";
      note("consent FAILED — ads not requested: " + ei.message);
      return false;
    }
  }

  async function initSdk(AdMob) {
    if (sdkInitialized) return true;
    if (sdkFailed) return false;
    try {
      await withTimeout(
        AdMob.initialize({
          // Live units by default. Test mode swaps to Google demo unit IDs.
          initializeForTesting: false,
          maxAdContentRating: "General",
        }),
        15000,
        "SDK initialize"
      );
      sdkInitialized = true;
      diag.init = "ok @" + hhmmss() + " (after consent)";
      note("SDK initialized after consent (" + (testMode ? "TEST ads" : "LIVE ads") + ")");
      return true;
    } catch (e) {
      sdkFailed = true;
      diag.init = "error: " + errInfo(e).message;
      note("SDK initialize FAILED " + errInfo(e).message);
      return false;
    }
  }

  function addL(AdMob, name, fn) {
    try {
      const r = AdMob.addListener(name, function (data) {
        try {
          fn(data || {});
        } catch (e) {
          warn("listener " + name, e);
        }
      });
      if (r && typeof r.catch === "function") r.catch(function () {});
    } catch (e) {
      warn("addListener failed " + name, e);
    }
  }

  function attachListeners(AdMob) {
    if (listenersAttached) return;
    listenersAttached = true;

    // —— Banner ——
    addL(AdMob, "bannerAdSizeChanged", function (info) {
      const h = typeof info.height === "number" ? info.height : 0;
      if (h > 0) {
        rememberBannerH(bannerWidthCss || viewportWidth(), h);
        if (bannerVisible) growBannerPad(h);
      }
      // h === 0 (hidden / removed / failed): never shrink here. Menus keep their reserved space;
      // in a run hideBanner() clears it once the hide is confirmed.
    });
    addL(AdMob, "bannerAdLoaded", function () {
      diag.banner.loaded++;
      note("banner loaded");
    });
    addL(AdMob, "bannerAdImpression", function () {
      diag.banner.impressions++;
      note("banner impression");
    });
    addL(AdMob, "bannerAdFailedToLoad", function (err) {
      // Native plugin destroyed its AdView — reset so the next menu/game-over
      // creates a fresh banner (new request) instead of a no-op resume.
      diag.banner.failed++;
      diag.banner.lastError = errInfo(err);
      bannerCreated = false;
      bannerVisible = false;
      bannerNeedsRecreate = false;
      // v1.8: keep the reserved space on menu / game-over (no layout jump on a failed load).
      clearPadForRun();
      note("banner FAILED " + fmtErr(diag.banner.lastError));
    });

    // —— Rewarded ——
    addL(AdMob, "onRewardedVideoAdLoaded", function () {
      note("rewarded loaded");
    });
    addL(AdMob, "onRewardedVideoAdFailedToLoad", function (err) {
      lastRewardedLoadErrorEvent = errInfo(err);
      note("rewarded load FAILED " + fmtErr(lastRewardedLoadErrorEvent));
    });
    addL(AdMob, "onRewardedVideoAdShowed", function () {
      diag.rewarded.shown++;
      note("rewarded showed");
      if (activeShow) activeShow.onShowed();
    });
    addL(AdMob, "onRewardedVideoAdFailedToShow", function (err) {
      diag.rewarded.lastShowError = errInfo(err);
      note("rewarded show FAILED " + fmtErr(diag.rewarded.lastShowError));
      if (activeShow) activeShow.onFailedToShow(diag.rewarded.lastShowError);
    });
    addL(AdMob, "onRewardedVideoAdReward", function (reward) {
      note("rewarded reward " + (reward.amount != null ? reward.amount : "") + " " + (reward.type || ""));
      if (activeShow) activeShow.onReward(reward);
    });
    addL(AdMob, "onRewardedVideoAdDismissed", function () {
      note("rewarded dismissed");
      if (activeShow) activeShow.onDismissed();
    });
  }

  /**
   * Consent first, then SDK. Safe to call often: after a failed/negative
   * consent check it retries at most every CONSENT_RETRY_MS (max
   * CONSENT_MAX_ATTEMPTS per session); otherwise it resolves false at once.
   * Resolves true only when the SDK is initialized and ads may be requested.
   */
  async function init() {
    if (!isNative()) {
      log("browser — ads no-op");
      return false;
    }
    if (initPromise) return initPromise;
    if (ready && canRequestAds) return true; // e.g. enabled from the privacy options form
    if (sdkFailed) return false;
    if (consentAttempts > 0 && !consentDeferred) {
      if (consentAttempts >= CONSENT_MAX_ATTEMPTS) return false;
      if (Date.now() - lastConsentAttemptAt < CONSENT_RETRY_MS) return false;
    }
    const p = (async function () {
      diag.native = true;
      const AdMob = getAdMob();
      if (!AdMob) {
        diag.plugin = "MISSING";
        diag.init = "error: AdMob plugin not found in Capacitor bridge";
        note("no AdMob plugin");
        sdkFailed = true;
        return false;
      }
      diag.plugin = "ok";
      attachListeners(AdMob);
      // 1) UMP consent info (and form if required) BEFORE the Mobile Ads SDK starts.
      diag.consent = "checking… (attempt " + (consentAttempts + 1) + ")";
      canRequestAds = await runConsent(AdMob);
      if (!canRequestAds) {
        ready = false;
        if (!sdkInitialized) diag.init = "not started (waiting for consent)";
        return false;
      }
      // 2) Mobile Ads SDK only once consent allows ad requests.
      if (!(await initSdk(AdMob))) {
        ready = false;
        return false;
      }
      ready = true;
      // Prefetch rewarded for game-over continue (default purpose)
      prefetchRewarded("continue");
      return true;
    })();
    initPromise = p;
    const ok = await p;
    // Keep a successful (or permanently failed) init; allow a later retry otherwise.
    if (!ok && !sdkFailed) initPromise = null;
    return ok;
  }

  /** Re-read UMP state (e.g. after the privacy options form closed). */
  async function refreshConsent(AdMob) {
    try {
      const info = await withTimeout(AdMob.requestConsentInfo(), CONSENT_TIMEOUT_MS, "Consent info");
      readConsentInfo(info);
      const allowed = !!(info && info.canRequestAds === true);
      diag.consent = "status=" + (info && info.status) + " canRequestAds=" + allowed +
        " privacyOptions=" + privacyOptionsStatus + " (refreshed @" + hhmmss() + ")";
      note("consent refreshed: " + diag.consent);
      return allowed;
    } catch (e) {
      diag.consent = "refresh error (ads paused until a retry succeeds): " + errInfo(e).message;
      note("consent refresh FAILED " + errInfo(e).message);
      return false;
    }
  }

  /** Opens Google's UMP privacy options form (change / withdraw consent, US opt-out). */
  async function showPrivacyOptions() {
    if (!isNative()) return false;
    const AdMob = getAdMob();
    if (!AdMob || privacyFormBusy) return false;
    privacyFormBusy = true;
    let shown = false;
    try {
      note("privacy options form → open");
      await AdMob.showPrivacyOptionsForm();
      shown = true;
      note("privacy options form closed");
    } catch (e) {
      note("privacy options form FAILED " + errInfo(e).message);
    }
    try {
      // The user may have changed or withdrawn consent: re-check before any further ad request.
      const allowed = await refreshConsent(AdMob);
      if (!allowed) {
        canRequestAds = false;
        ready = false;
        hideBanner();
        if (initPromise && !sdkFailed) initPromise = null;
      } else {
        canRequestAds = true;
        if (await initSdk(AdMob)) {
          ready = true;
          if (currentScreen !== "playing") showBanner();
        }
      }
    } finally {
      privacyFormBusy = false;
    }
    return shown;
  }

  function bannerAdId() {
    return testMode ? TEST.BANNER_ANDROID : LIVE.BANNER;
  }

  /** Resolve rewarded unit by purpose. Unlock uses distinct constant. */
  function rewardedAdId(purpose) {
    if (testMode) return TEST.REWARDED_ANDROID;
    if (purpose === "unlock") return REWARDED_UNLOCK_AD_UNIT_ID;
    return REWARDED_CONTINUE_AD_UNIT_ID;
  }

  function shortId(id) {
    return String(id).split("/").pop();
  }

  async function showBanner() {
    if (!isNative()) return;
    await init();
    if (!canRequestAds || !ready) return;
    if (currentScreen === "playing") return; // never create / resume / recreate during a run
    const AdMob = getAdMob();
    if (!AdMob || bannerBusy) return;
    if (hideInFlight) await hideInFlight;
    if (currentScreen === "playing" || bannerBusy) return;
    bannerBusy = true;
    try {
      // The padding is already reserved by applyScreen(); make sure (e.g. after privacy options).
      if (!padReserved || bannerPadPx <= 0) reserveBannerSpace("show");
      if (bannerCreated && bannerNeedsRecreate) {
        // v1.8: adaptive size is fixed at creation; the viewport width changed (fold / rotation).
        note("banner width " + bannerWidthCss + " → " + viewportWidth() + "px: recreating");
        try {
          await AdMob.removeBanner();
        } catch (e) {
          warn("removeBanner failed", e);
        }
        bannerCreated = false;
        bannerVisible = false;
      }
      bannerNeedsRecreate = false;
      if (bannerCreated && !bannerVisible) {
        await AdMob.resumeBanner();
        bannerVisible = true;
        note("banner resumed");
      } else if (!bannerVisible) {
        diag.banner.requests++;
        note("banner request → " + shortId(bannerAdId()) + " (width " + viewportWidth() + ")");
        bannerWidthCss = viewportWidth();
        await AdMob.showBanner({
          adId: bannerAdId(),
          adSize: "ADAPTIVE_BANNER",
          position: "BOTTOM_CENTER",
          margin: 0,
          isTesting: false,
        });
        bannerCreated = true;
        bannerVisible = true;
      }
    } catch (e) {
      diag.banner.lastError = errInfo(e);
      note("showBanner call failed " + fmtErr(diag.banner.lastError));
    } finally {
      bannerBusy = false;
    }
    // Screen may have switched to play while the call was in flight.
    if (currentScreen === "playing" && bannerVisible) hideBanner();
  }

  function hideBanner() {
    if (!isNative()) {
      setBannerPad(0);
      return Promise.resolve();
    }
    if (hideInFlight) return hideInFlight;
    const AdMob = getAdMob();
    if (!AdMob || !bannerVisible) {
      bannerVisible = false;
      clearPadForRun();
      return Promise.resolve();
    }
    hideInFlight = (async function () {
      let gone = false;
      for (let attempt = 0; attempt <= HIDE_RETRIES && !gone; attempt++) {
        try {
          await AdMob.hideBanner();
          gone = true;
        } catch (e) {
          const msg = errInfo(e).message;
          if (/never shown/i.test(msg)) {
            // Native AdView already destroyed (failed load): nothing is on screen.
            bannerCreated = false;
            gone = true;
            break;
          }
          warn("hideBanner failed (attempt " + (attempt + 1) + ")", e);
          if (attempt < HIDE_RETRIES) await sleep(HIDE_RETRY_MS);
        }
      }
      if (!gone) {
        // Last resort: destroy the AdView so it cannot stay over the game.
        try {
          await AdMob.removeBanner();
          bannerCreated = false;
          gone = true;
          note("banner hide failed → AdView removed");
        } catch (e) {
          note("banner hide AND remove failed — keeping the banner space reserved");
        }
      }
      if (gone) {
        bannerVisible = false;
        clearPadForRun();
      }
      // else: bannerVisible stays true and so does the padding, so a banner that may still be
      // on screen never covers the play area or the skill buttons.
    })();
    return hideInFlight.finally(function () {
      hideInFlight = null;
      // Back on a menu while the hide was running: bring the banner back.
      if (currentScreen !== "playing" && ready && canRequestAds && !bannerVisible) showBanner();
    });
  }

  /** Start (or join) a rewarded load for adId. Resolves true / rejects with error. */
  function loadRewarded(adId) {
    if (rewardedLoadInFlight[adId]) return rewardedLoadInFlight[adId];
    const AdMob = getAdMob();
    if (!AdMob) return Promise.reject({ code: null, message: "no AdMob plugin" });
    diag.rewarded.requests++;
    lastRewardedLoadErrorEvent = null;
    note("rewarded request → " + shortId(adId));
    const p = Promise.resolve()
      .then(function () {
        return AdMob.prepareRewardVideoAd({ adId: adId, isTesting: false });
      })
      .then(function () {
        rewardedReadyIds[adId] = true;
        rewardedLoadFailed[adId] = false;
        diag.rewarded.loaded++;
        return true;
      })
      .catch(function (e) {
        rewardedReadyIds[adId] = false;
        rewardedLoadFailed[adId] = true;
        diag.rewarded.failed++;
        // The FailedToLoad event (fired just before the reject) carries the code.
        const ei = lastRewardedLoadErrorEvent || errInfo(e);
        diag.rewarded.lastLoadError = ei;
        throw ei;
      })
      .finally(function () {
        delete rewardedLoadInFlight[adId];
      });
    rewardedLoadInFlight[adId] = p;
    return p;
  }

  function prefetchRewarded(purpose) {
    const p = purpose === "unlock" ? "unlock" : "continue";
    if (!isNative() || !canRequestAds || !ready) return;
    const id = rewardedAdId(p);
    if (rewardedReadyIds[id] || rewardedLoadInFlight[id]) return;
    loadRewarded(id).catch(function () {});
  }

  function failWith(stage, err, userMessage) {
    const ei = err && err.at ? err : errInfo(err);
    lastFailure = { stage: stage, code: ei.code, message: ei.message, userMessage: userMessage };
    diag.rewarded.lastOutcome = stage + ": " + fmtErr(ei);
    note("rewarded outcome: " + diag.rewarded.lastOutcome);
    return false;
  }

  /**
   * Show rewarded video for a purpose. Never hangs: load has an 8 s timeout,
   * the ad must appear within 8 s, and the outcome is decided by events.
   * On false, getLastFailure().userMessage explains why (for a UI notice).
   * @param {"continue"|"unlock"} purpose
   * @returns {Promise<boolean>} true if the user earned the reward.
   */
  async function showRewarded(purpose, opts) {
    const p = purpose === "unlock" ? "unlock" : "continue";
    lastFailure = null;
    if (!isNative()) return false;
    if (rewardedPhaseNow() !== "idle") {
      return failWith("busy", { message: "another rewarded request is in progress" }, "An ad is already loading");
    }
    const req = { cancelled: false };
    liveReqs.push(req);
    try {
      return await showRewardedInner(p, opts || {}, req);
    } finally {
      dropReq(req);
      if (req.showing) rewardedShowing = false;
    }
  }

  function wantedStill(opts, req) {
    if (req.cancelled) return false;
    try {
      if (typeof opts.stillWanted === "function" && !opts.stillWanted()) return false;
    } catch (_) {}
    return true;
  }

  async function showRewardedInner(p, opts, req) {
    // v1.9.2: never hang on a start-up that is still pending (consent form / SDK init).
    let started = false;
    try {
      started = await withTimeout(init(), INIT_WAIT_MS, "Ads start-up");
    } catch (e) {
      return failWith("startup", e, "Ads are still starting — try again in a moment");
    }
    if (!started || !canRequestAds || !ready) return failWith("consent", { message: "canRequestAds=false or SDK not ready" }, "No ad available right now");
    const AdMob = getAdMob();
    if (!AdMob) return failWith("plugin", { message: "AdMob plugin missing" }, "No ad available right now");
    if (!wantedStill(opts, req)) return failWith("cancelled", { message: "cancelled before load" }, "");

    const adId = rewardedAdId(p);

    // 1) Make sure an ad is loaded (join an in-flight prefetch if any).
    if (!rewardedReadyIds[adId]) {
      try {
        await withTimeout(loadRewarded(adId), LOAD_TIMEOUT_MS, "Rewarded load");
      } catch (e) {
        // If it was a timeout, the load keeps running; a late success simply
        // leaves the ad ready for the next tap.
        if (!wantedStill(opts, req)) return failWith("cancelled", { message: "cancelled while loading" }, "");
        return failWith("load", e, "No ad available right now");
      }
    }
    // v1.9.2: the player left (Shop / Leaderboard / retry...) while it loaded: don't show it,
    // keep the loaded ad for the next tap.
    if (!wantedStill(opts, req)) return failWith("cancelled", { message: "cancelled after load" }, "");

    // 2) Show, driven by events (plugin's show promise never settles on
    //    dismiss-without-reward or failed-to-show).
    if (rewardedShowing || activeShow) return failWith("busy", { message: "another ad is showing" }, "An ad is already showing");
    bumpAdStats("watch");
    rewardedShowing = true;
    req.showing = true;
    dropReq(req); // can't be cancelled any more
    rewardedReadyIds[adId] = false; // consumed
    const outcome = await new Promise(function (resolve) {
      let settled = false;
      let showed = false;
      let rewarded = false;
      let startTimer = null;
      let maxTimer = null;
      function done(earned, stage, err) {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        clearTimeout(maxTimer);
        activeShow = null;
        resolve({ earned: earned, stage: stage, err: err });
      }
      activeShow = {
        onShowed: function () {
          showed = true;
          clearTimeout(startTimer);
          maxTimer = setTimeout(function () {
            done(rewarded, rewarded ? "earned" : "show", { code: "TIMEOUT", message: "ad never closed" });
          }, SHOW_MAX_MS);
        },
        onReward: function () {
          rewarded = true;
        },
        onFailedToShow: function (err) {
          done(false, "show", err);
        },
        onDismissed: function () {
          setTimeout(function () {
            done(rewarded, rewarded ? "earned" : "closed", { message: "closed before reward" });
          }, REWARD_SETTLE_MS);
        },
      };
      startTimer = setTimeout(function () {
        if (!showed) done(false, "show", { code: "TIMEOUT", message: "ad did not appear within " + SHOW_START_TIMEOUT_MS / 1000 + "s" });
      }, SHOW_START_TIMEOUT_MS);
      Promise.resolve()
        .then(function () {
          return AdMob.showRewardVideoAd({ adId: adId });
        })
        .then(function () {
          // Plugin resolves at reward time; wait for dismiss to finish.
          rewarded = true;
        })
        .catch(function (e) {
          if (!showed) done(false, "show", errInfo(e));
        });
    });

    let earned = outcome.earned;
    if (earned) {
      diag.rewarded.lastOutcome = "earned @" + hhmmss();
      note("rewarded outcome: earned");
      bumpAdStats("reward");
    } else if (outcome.stage === "closed") {
      failWith("closed", outcome.err, "Ad closed early — no reward");
    } else {
      if (outcome.err) diag.rewarded.lastShowError = outcome.err.at ? outcome.err : errInfo(outcome.err);
      failWith("show", outcome.err, "No ad available right now");
    }
    prefetchRewarded(p);
    return earned;
  }

  /** @deprecated Prefer showRewarded("continue") — kept for older call sites. */
  async function showRewardedContinue() {
    return showRewarded("continue");
  }

  function applyScreen(screen) {
    const prev = currentScreen;
    currentScreen = screen;
    updateVersionTag();
    if (!isNative()) return;
    if (screen === "playing") {
      // Never start consent / SDK work as a run begins; just make sure no banner shows.
      hideBanner();
      return;
    }
    // v1.8: reserve the bottom banner space now, before (and regardless of) the load result.
    // Menu / shop / birds / trophies / game-over share one reservation; it is only recomputed
    // when coming from a run (or the viewport width changed), so buttons never jump.
    if (prev === "playing" || !padReserved) reserveBannerSpace(screen);
    // menu + gameover (+ trophies/shop treated as menu by game.js).
    // init() runs (or retries) consent first and resolves true only when ads may be requested.
    init().then(function (ok) {
      if (!ok || currentScreen !== screen) return; // no consent yet / superseded
      showBanner();
      if (screen === "gameover") {
        prefetchRewarded("continue");
        prefetchRewarded("unlock"); // v1.9.2: double coins / Ghost unlock buttons use this unit
      }
    });
  }

  // —— v1.8: viewport width changes (Fold outer ~301 <-> inner ~604 CSS px, rotation) ——
  function handleViewportChange() {
    resizeTimer = null;
    if (!isNative()) return;
    const w = viewportWidth();
    if (bannerCreated && bannerWidthCss && Math.abs(w - bannerWidthCss) >= WIDTH_CHANGE_PX && !bannerNeedsRecreate) {
      bannerNeedsRecreate = true;
      note("viewport width " + bannerWidthCss + " → " + w + "px: banner will be recreated");
    }
    if (currentScreen === "playing") return; // never during a run; the next menu / game-over handles it
    if (padReserved && Math.abs(w - padWidth) >= WIDTH_CHANGE_PX) reserveBannerSpace("width change");
    if (bannerNeedsRecreate && ready && canRequestAds) showBanner();
  }

  function onViewportResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleViewportChange, RESIZE_DEBOUNCE_MS);
  }

  try {
    global.addEventListener("resize", onViewportResize);
    global.addEventListener("orientationchange", onViewportResize);
  } catch (_) {}

  // —— Hidden diagnostics UI: tap the "v1.8" label 5× ——
  let panelEl = null;
  let panelTextEl = null;

  function perfLine() {
    try {
      const p = window.SkyHopPerf && window.SkyHopPerf.info();
      if (!p) return "Perf: n/a";
      return "Perf: " + p.fps + " fps · quality " + p.quality + " · canvas " + p.canvas + " · auto-drops " + p.autoDrops + " · dpr " + (window.devicePixelRatio || 1);
    } catch (_) {
      return "Perf: n/a";
    }
  }

  function hitchLines() {
    try {
      const h = window.SkyHopHitch;
      if (!h) return ["Hitches: n/a"];
      const sm = h.summary();
      const tags = Object.keys(sm.byTag || {}).map(function (k) { return k + " " + sm.byTag[k]; }).join(" · ");
      const out = ["Hitches (frames >34ms): " + sm.hitches34 + " in " + sm.frames + " frames / " + sm.minutes + " min · worst " + sm.worstMs + "ms",
        "  during: " + (tags || "-")];
      const list = h.list().slice(-8).reverse();
      for (let i = 0; i < list.length; i++) out.push("  " + list[i]);
      return out;
    } catch (_) {
      return ["Hitches: n/a"];
    }
  }

  function renderDiag() {
    const b = diag.banner;
    const r = diag.rewarded;
    return [
      "Sky Hop v" + APP_VERSION + " (" + APP_BUILD + ")   " + hhmmss(),
      "Native: " + (isNative() ? "yes" : "NO (browser)") + "   Plugin: " + diag.plugin,
      "Ad mode: " + (testMode ? "TEST (Google demo units)" : "LIVE units"),
      "SDK init: " + diag.init,
      "Consent: " + diag.consent,
      "canRequestAds: " + canRequestAds + "   ready: " + ready + "   consent attempts: " + consentAttempts,
      "Privacy options: " + privacyOptionsStatus + (privacyOptionsStatus === "REQUIRED" ? " (menu shows Privacy choices)" : ""),
      "Banner space: " + diag.pad + " · now " + bannerPadPx + "px · AdView width " + (bannerWidthCss || "-") +
        (bannerNeedsRecreate ? " (recreate pending)" : ""),
      "",
      "BANNER  requests " + b.requests + " · loaded " + b.loaded + " · failed " + b.failed + " · impressions " + b.impressions,
      "  last error: " + fmtErr(b.lastError),
      "",
      "REWARDED  requests " + r.requests + " · loaded " + r.loaded + " · failed " + r.failed + " · shown " + r.shown,
      "  last load error: " + fmtErr(r.lastLoadError),
      "  last show error: " + fmtErr(r.lastShowError),
      "  last outcome: " + r.lastOutcome,
      "",
      "Codes: 0 internal · 1 invalid request · 2 network · 3 NO FILL",
      "(account not approved / limited serving) · 8 bad app ID ·",
      "TIMEOUT = AdMob didn't answer in 8s.",
      "",
      perfLine(),
    ]
      .concat(hitchLines())
      .concat(["", "Log:"])
      .concat(diag.log.slice().reverse())
      .join("\n");
  }

  function refreshPanel() {
    if (panelEl && panelTextEl && panelEl.style.display !== "none") {
      panelTextEl.textContent = renderDiag();
    }
  }

  function mkBtn(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText =
      "margin:0 6px 6px 0;padding:8px 10px;border:0;border-radius:8px;background:#2f6fb0;color:#fff;font:600 13px system-ui,sans-serif;";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }

  function openPanel() {
    if (!panelEl) {
      panelEl = document.createElement("div");
      panelEl.id = "skyhop-ad-diag";
      panelEl.style.cssText =
        "position:fixed;left:4%;right:4%;top:max(4%,env(safe-area-inset-top));bottom:4%;z-index:100000;" +
        "background:rgba(10,16,24,0.94);color:#e8f0ff;border-radius:12px;padding:12px;overflow:auto;" +
        "touch-action:pan-y;-webkit-user-select:text;user-select:text;";
      const bar = document.createElement("div");
      bar.appendChild(
        mkBtn("Close", function () {
          panelEl.style.display = "none";
        })
      );
      bar.appendChild(
        mkBtn("Refresh", function () {
          refreshPanel();
        })
      );
      bar.appendChild(
        mkBtn("Reset hitches", function () {
          try { if (window.SkyHopHitch) window.SkyHopHitch.reset(); } catch (_) {}
          refreshPanel();
        })
      );
      bar.appendChild(
        mkBtn("Copy", function (btn) {
          const txt = renderDiag();
          try {
            navigator.clipboard.writeText(txt).then(
              function () {
                btn.textContent = "Copied";
              },
              function () {
                btn.textContent = "Copy failed";
              }
            );
          } catch (_) {
            btn.textContent = "Copy failed";
          }
        })
      );
      bar.appendChild(
        mkBtn("Test ads: " + (testMode ? "ON" : "OFF") + " → switch", function (btn) {
          try {
            if (testMode) localStorage.removeItem(TEST_MODE_KEY);
            else localStorage.setItem(TEST_MODE_KEY, "1");
            btn.textContent = "Saved — fully close & reopen the app";
          } catch (_) {
            btn.textContent = "Could not save";
          }
        })
      );
      panelEl.appendChild(bar);
      panelTextEl = document.createElement("pre");
      panelTextEl.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.4 ui-monospace,Menlo,monospace;";
      panelEl.appendChild(panelTextEl);
      ["touchstart", "touchend", "mousedown", "mouseup"].forEach(function (ev) {
        panelEl.addEventListener(ev, function (e) {
          e.stopPropagation();
        });
      });
      document.body.appendChild(panelEl);
    }
    panelEl.style.display = "block";
    refreshPanel();
  }

  function mountVersionTag() {
    if (!isNative() && !/[?&]adsdiag\b/.test(String(global.location && global.location.search))) return;
    if (!document.body || document.getElementById("skyhop-ver")) return;
    const tag = document.createElement("div");
    tag.id = "skyhop-ver";
    tag.textContent = "v" + APP_VERSION + (testMode ? " · TEST ADS" : "");
    // v1.8: smaller, and hidden + pointer-events:none during runs (updateVersionTag) so it can
    // never sit over (or swallow taps meant for) the left skill button.
    tag.style.cssText =
      "position:fixed;left:max(2px,env(safe-area-inset-left));" +
      "bottom:calc(var(--ad-banner-pad, 0px) + max(2px, env(safe-area-inset-bottom)));" +
      "z-index:50;padding:4px 6px;font:9px/1 system-ui,sans-serif;color:rgba(255,255,255," +
      (testMode ? "0.8" : "0.35") + ");-webkit-user-select:none;user-select:none;";
    let taps = 0;
    let first = 0;
    tag.addEventListener("click", function (e) {
      e.stopPropagation();
      const now = Date.now();
      if (now - first > 3000) {
        taps = 0;
        first = now;
      }
      taps++;
      if (taps >= 5) {
        taps = 0;
        openPanel();
      }
    });
    document.body.appendChild(tag);
    updateVersionTag();
  }

  function updateVersionTag() {
    try {
      const tag = document.getElementById("skyhop-ver");
      if (!tag) return;
      const playing = currentScreen === "playing";
      tag.style.pointerEvents = playing ? "none" : "auto";
      tag.style.visibility = playing ? "hidden" : "visible";
    } catch (_) {}
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
    /** True when UMP says a privacy options entry point is required (menu "Privacy choices"). */
    privacyOptionsRequired: function () {
      return isNative() && privacyOptionsStatus === "REQUIRED";
    },
    /** UMP privacyOptionsRequirementStatus string (REQUIRED | NOT_REQUIRED | UNKNOWN). */
    getPrivacyOptionsStatus: function () {
      return privacyOptionsStatus;
    },
    /** Opens the UMP privacy options form; re-checks consent afterwards. */
    showPrivacyOptions: showPrivacyOptions,
    /**
     * Load+show rewarded for purpose; true only after earned reward.
     * @param {"continue"|"unlock"} purpose
     */
    showRewarded: showRewarded,
    /** Load+show rewarded continue; true only after earned reward. */
    showRewardedContinue: showRewardedContinue,
    /** v1.9.2: idle | loading | showing */
    rewardedPhase: function () {
      return rewardedPhaseNow();
    },
    /**
     * v1.9.2: cancel a rewarded request that is still loading (no ad on screen yet).
     * True when nothing is in flight any more (or it was cancelled); false while an ad is showing.
     */
    cancelPendingRewarded: function () {
      if (rewardedPhaseNow() === "showing") return false;
      for (let i = 0; i < liveReqs.length; i++) {
        if (!liveReqs[i].cancelled) note("rewarded request cancelled by the player (still loading)");
        liveReqs[i].cancelled = true;
      }
      return true;
    },
    /** v1.9.2: off | idle | loading | ready | failed for a purpose's unit. */
    rewardedStatus: function (purpose) {
      if (!isNative() || !canRequestAds || !ready) return "off";
      const id = rewardedAdId(purpose === "unlock" ? "unlock" : "continue");
      if (rewardedReadyIds[id]) return "ready";
      if (rewardedLoadInFlight[id]) return "loading";
      if (rewardedLoadFailed[id]) return "failed";
      return "idle";
    },
    /** v1.9.2: start a fresh load for a purpose (e.g. "No ad right now - tap to retry"). */
    retryRewarded: function (purpose) {
      if (!isNative()) return false;
      if (!canRequestAds || !ready) {
        init().then(function (ok) { if (ok) prefetchRewarded(purpose); });
        return true;
      }
      prefetchRewarded(purpose);
      return true;
    },
    /** Why the last showRewarded() returned false: { stage, code, message, userMessage } or null. */
    getLastFailure: function () {
      return lastFailure;
    },
    /** Diagnostics text (same as hidden panel). */
    getDiagnostics: renderDiag,
    openDiagnostics: openPanel,
    /** Distinct unlock unit id (live). */
    REWARDED_UNLOCK_AD_UNIT_ID: REWARDED_UNLOCK_AD_UNIT_ID,
    /** Continue unit id (live). */
    REWARDED_CONTINUE_AD_UNIT_ID: REWARDED_CONTINUE_AD_UNIT_ID,
    /** Google test IDs kept for reference / QA. */
    TEST_IDS: TEST,
    /** Live unit IDs currently in use. */
    LIVE_IDS: LIVE,
    TEST_MODE: testMode,
    VERSION: APP_VERSION,
    getScreen: function () {
      return currentScreen;
    },
  };

  global.SkyHopAds = api;

  // Auto-init when Capacitor bridge is present (after DOM ready is fine)
  // v1.8: reserve the start menu's banner space synchronously, before game.js runs its first
  // fitCanvas(), so the very first layout already has it (no re-fit or jump once ads load).
  if (isNative()) {
    try {
      reserveBannerSpace("boot");
    } catch (_) {}
  }

  function boot() {
    mountVersionTag();
    if (!isNative()) return;
    init();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
