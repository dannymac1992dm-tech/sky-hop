package com.skyhop.mobile;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private int[] lastInsets = new int[] { -1, -1, -1, -1 };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v1.9: in-app plugin for Play Games leaderboard + score sharing (must register before super.onCreate).
        registerPlugin(SkyHopNativePlugin.class);
        super.onCreate(savedInstanceState);

        // v1.9.1: system back (gesture or key). Ask the game first (closes Shop / Birds / Trophies /
        // Missions); if it is on the start/game-over screen, fall back to sending the app to the background.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView wv = bridge != null ? bridge.getWebView() : null;
                if (wv == null) { moveTaskToBack(true); return; }
                wv.evaluateJavascript(
                    "(function(){try{return !!(window.SkyHopBack&&window.SkyHopBack());}catch(e){return false;}})()",
                    value -> { if (!"true".equals(value)) moveTaskToBack(true); });
            }
        });

        // v1.9.1: pass the real status bar / cutout / nav insets to CSS (--sh-inset-*). targetSdk 36 is
        // edge-to-edge, and the WebView's env(safe-area-inset-*) is not reliable on every device, so on
        // the Fold's inner screen the canvas ran under the status bar and its Back button was untappable.
        final WebView wv = bridge != null ? bridge.getWebView() : null;
        if (wv != null) {
            final View root = getWindow().getDecorView();
            ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
                pushInsets(wv, insets);
                return ViewCompat.onApplyWindowInsets(v, insets);
            });
            wv.post(() -> {
                WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(root);
                if (ins != null) pushInsets(wv, ins);
            });
            wv.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, orr, ob) -> {
                WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(root);
                if (ins != null) pushInsets(wv, ins);
            });
        }
    }

    private void pushInsets(WebView wv, WindowInsetsCompat insets) {
        Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        // The WebView itself may already be offset by the system (non edge-to-edge); only pass the overlap.
        int[] loc = new int[2];
        wv.getLocationOnScreen(loc);
        int top = Math.max(0, i.top - loc[1]);
        int left = Math.max(0, i.left - loc[0]);
        int right = i.right;
        int bottom = i.bottom;
        int[] now = new int[] { top, left, right, bottom };
        if (java.util.Arrays.equals(now, lastInsets)) return;
        lastInsets = now;
        float d = getResources().getDisplayMetrics().density;
        String js = "(function(){var s=document.documentElement.style;"
            + "s.setProperty('--sh-inset-top','" + (top / d) + "px');"
            + "s.setProperty('--sh-inset-left','" + (left / d) + "px');"
            + "s.setProperty('--sh-inset-right','" + (right / d) + "px');"
            + "s.setProperty('--sh-inset-bottom','" + (bottom / d) + "px');"
            + "window.dispatchEvent(new Event('resize'));})()";
        wv.post(() -> wv.evaluateJavascript(js, null));
    }
}
