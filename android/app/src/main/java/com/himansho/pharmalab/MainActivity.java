package com.himansho.pharmalab;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * PharmaLab client — a WebView shell that connects to a PharmaLab server
 * (your PC) over the LAN. First launch asks for the server URL; the ⚙ badge
 * (top-right) reopens settings anytime.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "pharmalab";
    private static final String KEY_URL = "server_url";
    private WebView web;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0c1413"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false; // stay in-app; all same-origin API calls are fine
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        TextView gear = new TextView(this);
        gear.setText("⚙");
        gear.setTextSize(20f);
        gear.setPadding(dp(12), dp(8), dp(12), dp(8));
        gear.setBackgroundColor(Color.parseColor("#22FFFFFF"));
        gear.setTextColor(Color.parseColor("#0f766e"));
        gear.setOnClickListener(v -> promptForUrl(true));
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        gp.gravity = Gravity.TOP | Gravity.END;
        gp.topMargin = dp(6);
        gp.setMarginEnd(dp(6));
        root.addView(gear, gp);

        setContentView(root);

        String url = prefs.getString(KEY_URL, null);
        if (url == null || url.isEmpty()) promptForUrl(false);
        else loadUrl(url);
    }

    private void promptForUrl(boolean canCancel) {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        String saved = prefs.getString(KEY_URL, "");
        input.setHint("http://192.168.1.20:8787");
        input.setText(saved);
        input.setSelection(input.getText().length());

        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle(canCancel ? "PharmaLab server address" : "Connect to PharmaLab")
                .setMessage("Start PharmaLab on your PC (npm run dev or npm start), then enter its LAN address here.\nBoth devices must be on the same Wi-Fi.")
                .setView(input);
        if (canCancel) b.setNegativeButton("Cancel", null);
        b.setPositiveButton("Connect", (d, w) -> {
            String url = input.getText().toString().trim();
            if (!url.startsWith("http")) url = "http://" + url;
            if (!url.matches("https?://[^/]+.*")) url = url + ":8787";
            prefs.edit().putString(KEY_URL, url).apply();
            loadUrl(url);
        });
        AlertDialog dlg = b.create();
        if (!canCancel) dlg.setCanceledOnTouchOutside(false);
        dlg.show();
    }

    private void loadUrl(String url) {
        web.loadUrl(url.endsWith("/") ? url.substring(0, url.length() - 1) : url);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent ev) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) { web.goBack(); return true; }
        return super.onKeyDown(keyCode, ev);
    }

    private int dp(int v) { return Math.round(getResources().getDisplayMetrics().density * v); }
}
