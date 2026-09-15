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
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

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
