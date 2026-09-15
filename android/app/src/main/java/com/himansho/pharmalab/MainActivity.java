package com.himansho.pharmalab;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * PharmaLab — standalone educational drug explorer.
 * The full app (React UI + data logic + curated knowledge pack) is bundled in
 * assets/www; live drug data is fetched DIRECTLY from openFDA, RxNorm and
 * PubMed (public, CORS-enabled). No companion server is required.
 * Internet needed for fresh lookups; results cache locally (24 h TTL).
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0f1a18"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);          // SPA requires JS
        s.setDomStorageEnabled(true);          // localStorage: theme + response cache
        s.setAllowFileAccess(true);            // page + assets come from file:///android_asset
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        android.webkit.WebView.setWebContentsDebuggingEnabled(true); // dev inspect: chrome://inspect

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file://") || url.startsWith("about:")) return false; // stay in-app
                // citations / DailyMed / PubMed -> system browser
                try {
                    view.getContext().startActivity(new android.content.Intent(
                            android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Never leave the user on a blank screen — show what failed.
                if (failingUrl != null && failingUrl.startsWith("file://")) {
                    String html = "<html><body style='background:#0f1a18;color:#e8f1ee;font-family:sans-serif;"
                            + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
                            + "<div style='text-align:center'><h2>PharmaLab failed to start</h2>"
                            + "<p style='color:#9fb8b0'>" + description + "</p>"
                            + "<p>Reinstall the APK from the GitHub release, then reopen.</p></div></body></html>";
                    view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
                }
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent ev) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) { web.goBack(); return true; }
        return super.onKeyDown(keyCode, ev);
    }
}
