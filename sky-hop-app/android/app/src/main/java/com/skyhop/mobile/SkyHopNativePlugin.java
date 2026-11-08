package com.skyhop.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.LeaderboardsClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.tasks.Task;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Sky Hop 1.9 native helpers, exposed to the web game as window.Capacitor.Plugins.SkyHopNative.
 *
 *  - Play Games Services v2: sign-in status, manual sign-in, submit score, show the weekly leaderboard.
 *    v1.9.2: nothing here initialises Play Games or signs in except showLeaderboard / gamesSignIn,
 *    which only run when the player taps Leaderboard. Status and score submits just report
 *    "not signed in" until then (see SkyHopApp).
 *  - Share your score: writes the screenshot to the app cache and opens the Android share sheet through
 *    the app's FileProvider (${applicationId}.fileprovider, cache-path). No runtime permissions needed.
 */
@CapacitorPlugin(name = "SkyHopNative")
public class SkyHopNativePlugin extends Plugin {

    private static final String TAG = "SkyHopNative";
    private static final String SHARE_DIR = "share";

    // —— Play Games ——

    private GamesSignInClient signInClient() {
        return PlayGames.getGamesSignInClient(getActivity());
    }

    private LeaderboardsClient leaderboards() {
        return PlayGames.getLeaderboardsClient(getActivity());
    }

    private static boolean authed(Task<AuthenticationResult> t) {
        return t != null && t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated();
    }

    @PluginMethod
    public void gamesStatus(PluginCall call) {
        if (!SkyHopApp.isPlayGamesInitialized()) {
            JSObject r = new JSObject();
            r.put("available", true);
            r.put("authenticated", false);
            r.put("initialized", false);
            call.resolve(r);
            return;
        }
        try {
            signInClient().isAuthenticated().addOnCompleteListener(t -> {
                JSObject r = new JSObject();
                r.put("available", true);
                r.put("authenticated", authed(t));
                call.resolve(r);
            });
        } catch (Throwable e) {
            JSObject r = new JSObject();
            r.put("available", false);
            r.put("authenticated", false);
            call.resolve(r);
        }
    }

    @PluginMethod
    public void gamesSignIn(PluginCall call) {
        if (!SkyHopApp.initPlayGames(getContext())) {
            call.reject("Play Games sign-in unavailable");
            return;
        }
        try {
            signInClient().signIn().addOnCompleteListener(t -> {
                noteSignInResult(t);
                JSObject r = new JSObject();
                r.put("authenticated", authed(t));
                call.resolve(r);
            });
        } catch (Throwable e) {
            call.reject("Play Games sign-in unavailable", e instanceof Exception ? (Exception) e : null);
        }
    }

    /** Submits only when the player is already signed in (never pops a sign-in screen at game over). */
    @PluginMethod
    public void submitScore(PluginCall call) {
        final String id = call.getString("leaderboardId");
        final Long score = readScore(call);
        if (id == null || id.isEmpty() || score == null || score <= 0) {
            call.reject("leaderboardId and a positive score are required");
            return;
        }
        if (!SkyHopApp.isPlayGamesInitialized()) {
            // v1.9.2: never start Play Games (or a sign-in) from a game over.
            JSObject r = new JSObject();
            r.put("submitted", false);
            r.put("reason", "not_signed_in");
            call.resolve(r);
            return;
        }
        try {
            signInClient().isAuthenticated().addOnCompleteListener(t -> {
                JSObject r = new JSObject();
                if (!authed(t)) {
                    r.put("submitted", false);
                    r.put("reason", "not_signed_in");
                    call.resolve(r);
                    return;
                }
                try {
                    // Fire-and-forget: Play Games queues it if offline and keeps each player's best per time span.
                    leaderboards().submitScore(id, score);
                    r.put("submitted", true);
                } catch (Throwable e) {
                    Log.w(TAG, "submitScore failed", e);
                    r.put("submitted", false);
                    r.put("reason", "error");
                }
                call.resolve(r);
            });
        } catch (Throwable e) {
            JSObject r = new JSObject();
            r.put("submitted", false);
            r.put("reason", "unavailable");
            call.resolve(r);
        }
    }

    /**
     * Opens the leaderboard on its weekly tab. Signs the player in first if needed (user tapped the button),
     * then submits pendingScore (best score of this session that couldn't be sent while signed out).
     */
    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        final String id = call.getString("leaderboardId");
        if (id == null || id.isEmpty()) {
            call.reject("leaderboardId is required");
            return;
        }
        // v1.9.2: the player tapped Leaderboard: this is the only place Play Games is started.
        if (!SkyHopApp.initPlayGames(getContext())) {
            JSObject r = new JSObject();
            r.put("shown", false);
            r.put("reason", "unavailable");
            call.resolve(r);
            return;
        }
        try {
            signInClient().isAuthenticated().addOnCompleteListener(t -> {
                if (authed(t)) {
                    SkyHopApp.setOptedIn(getContext(), true);
                    openLeaderboard(call, id);
                } else {
                    signInClient().signIn().addOnCompleteListener(s -> {
                        noteSignInResult(s);
                        if (authed(s)) openLeaderboard(call, id);
                        else {
                            JSObject r = new JSObject();
                            r.put("shown", false);
                            r.put("reason", "not_signed_in");
                            call.resolve(r);
                        }
                    });
                }
            });
        } catch (Throwable e) {
            JSObject r = new JSObject();
            r.put("shown", false);
            r.put("reason", "unavailable");
            call.resolve(r);
        }
    }

    /**
     * Signed in: remember it, so later launches start Play Games early (silent, no prompt) and
     * game-over scores are submitted. Declined / cancelled: nothing is remembered, no prompt again
     * until the next Leaderboard tap. A sign-in ERROR (not a cancel) is also remembered, in case
     * this device needs Play Games started at launch for sign-in to work; such a player already
     * asked for the leaderboard, so a silent attempt at the next launch is what they wanted.
     */
    private void noteSignInResult(Task<AuthenticationResult> s) {
        if (authed(s)) {
            SkyHopApp.setOptedIn(getContext(), true);
        } else if (s != null && !s.isSuccessful() && s.getException() != null) {
            Log.w(TAG, "Play Games sign-in failed", s.getException());
            SkyHopApp.setOptedIn(getContext(), true);
        }
    }

    private void openLeaderboard(PluginCall call, String id) {
        final Long pending = readPending(call);
        if (pending != null && pending > 0) {
            try {
                leaderboards().submitScore(id, pending);
            } catch (Throwable e) {
                Log.w(TAG, "pending submitScore failed", e);
            }
        }
        leaderboards()
            .getLeaderboardIntent(id, LeaderboardVariant.TIME_SPAN_WEEKLY)
            .addOnSuccessListener(intent -> startActivityForResult(call, intent, "onLeaderboardClosed"))
            .addOnFailureListener(e -> {
                Log.w(TAG, "getLeaderboardIntent failed", e);
                JSObject r = new JSObject();
                r.put("shown", false);
                r.put("reason", "error");
                r.put("pendingSubmitted", pending != null && pending > 0);
                call.resolve(r);
            });
    }

    @ActivityCallback
    private void onLeaderboardClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        r.put("shown", true);
        r.put("resultCode", result != null ? result.getResultCode() : Activity.RESULT_CANCELED);
        call.resolve(r);
    }

    private static Long readScore(PluginCall call) {
        double d = call.getData().optDouble("score", Double.NaN);
        return Double.isNaN(d) ? null : (long) Math.floor(d);
    }

    private static Long readPending(PluginCall call) {
        double d = call.getData().optDouble("pendingScore", Double.NaN);
        return Double.isNaN(d) ? null : (long) Math.floor(d);
    }

    // —— Share your score ——

    @PluginMethod
    public void shareImage(PluginCall call) {
        String data = call.getString("base64");
        String mime = call.getString("mimeType", "image/jpeg");
        String text = call.getString("text", "");
        String title = call.getString("title", "Share your score");
        if (data == null || data.isEmpty()) {
            call.reject("base64 image data is required");
            return;
        }
        if (!"image/png".equals(mime)) mime = "image/jpeg";
        try {
            int comma = data.indexOf(',');
            if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), SHARE_DIR);
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cache dir");
            // One file, overwritten each time, so shares never pile up in the cache.
            File out = new File(dir, "image/png".equals(mime) ? "sky-hop-score.png" : "sky-hop-score.jpg");
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TEXT, text);
            send.putExtra(Intent.EXTRA_SUBJECT, "Sky Hop");
            send.setClipData(ClipData.newRawUri("Sky Hop score", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);

            JSObject r = new JSObject();
            r.put("shared", true);
            call.resolve(r);
        } catch (Throwable e) {
            Log.w(TAG, "shareImage failed", e);
            call.reject("Could not open the share sheet", e instanceof Exception ? (Exception) e : null);
        }
    }
}
