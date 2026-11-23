package com.skyhop.mobile;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import com.google.android.gms.games.PlayGamesSdk;

/**
 * v1.9: initialises the Play Games Services v2 SDK.
 *
 * v1.9.2: sign-in is opt-in. The SDK's auto-start provider (PlayGamesInitProvider) is removed in
 * AndroidManifest.xml, because initialising PGS v2 makes it try to sign the player in (and, on a
 * fresh install, pop a Google / Play Games prompt) at launch. Now the SDK is only initialised:
 *  - when the player taps Leaderboard (SkyHopNativePlugin.showLeaderboard), or
 *  - at start-up, only for a player who already chose to use the leaderboard earlier.
 * Players who never tap Leaderboard, or who decline/cancel the sign-in, never see a prompt and the
 * whole game works without Play Games.
 */
public class SkyHopApp extends Application {
    private static final String TAG = "SkyHop";
    private static final String PREFS = "skyhop_pgs";
    private static final String KEY_OPTED_IN = "leaderboard_opted_in";
    private static volatile boolean pgsInitialized = false;

    @Override
    public void onCreate() {
        super.onCreate();
        if (isOptedIn(this)) initPlayGames(this);
    }

    /** Initialises PGS once per process. Never throws; returns whether the SDK is usable. */
    public static synchronized boolean initPlayGames(Context ctx) {
        if (pgsInitialized) return true;
        try {
            PlayGamesSdk.initialize(ctx.getApplicationContext());
            pgsInitialized = true;
        } catch (Throwable t) {
            // Never let Play Games break the game; the leaderboard just stays unavailable.
            Log.w(TAG, "PlayGamesSdk.initialize failed", t);
        }
        return pgsInitialized;
    }

    public static boolean isPlayGamesInitialized() {
        return pgsInitialized;
    }

    public static boolean isOptedIn(Context ctx) {
        try {
            return prefs(ctx).getBoolean(KEY_OPTED_IN, false);
        } catch (Throwable t) {
            return false;
        }
    }

    public static void setOptedIn(Context ctx, boolean v) {
        try {
            prefs(ctx).edit().putBoolean(KEY_OPTED_IN, v).apply();
        } catch (Throwable t) {
            Log.w(TAG, "could not save leaderboard opt-in", t);
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
