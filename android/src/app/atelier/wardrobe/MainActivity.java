package app.atelier.wardrobe;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * Atelier for Android: a full-screen WebView that serves the web app from inside the APK over a private
 * https origin (so camera, IndexedDB, crypto and ES modules all work), plus a small native bridge for the
 * things a WebView cannot do on its own: saving files, sharing to other apps (ChatGPT, WhatsApp…),
 * clipboard and opening external links.
 */
public class MainActivity extends Activity {
    static final String HOST = "app.atelier.local";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_FILES = 11, REQ_CAMERA = 12, REQ_LOCATION = 13, REQ_STORAGE = 14;

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    PermissionRequest pendingWebPermission;
    GeolocationPermissions.Callback geoCallback;
    String geoOrigin;
    Runnable afterStoragePermission;
    boolean pageReady = false;
    String pendingShareJs = null;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " AtelierApp/1.0");

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    // A product screenshot or link shared from another app -> the "Should I buy this?" screen
    void handleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        new Thread(() -> {
            try {
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                String img = null;
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) {
                    android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    try (InputStream in = getContentResolver().openInputStream(uri)) { android.graphics.BitmapFactory.decodeStream(in, null, o); }
                    int s = 1; while (Math.max(o.outWidth, o.outHeight) / s > 1800) s *= 2;
                    android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options(); o2.inSampleSize = s;
                    android.graphics.Bitmap bmp;
                    try (InputStream in = getContentResolver().openInputStream(uri)) { bmp = android.graphics.BitmapFactory.decodeStream(in, null, o2); }
                    if (bmp != null) {
                        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, bos);
                        img = "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
                    }
                }
                String js = "window.__pendingShare={img:" + (img == null ? "null" : org.json.JSONObject.quote(img)) + ",text:" + org.json.JSONObject.quote(text == null ? "" : text) + "};window.__receiveShare&&window.__receiveShare();";
                runOnUiThread(() -> { if (pageReady) web.evaluateJavascript(js, null); else pendingShareJs = js; });
            } catch (Exception e) { toast("Could not open the shared item"); }
        }).start();
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    public void onBackPressed() {
        // let the page close an open sheet first; otherwise go back in the app, then leave
        web.evaluateJavascript("(window.__onBack && window.__onBack()) ? 1 : 0", v -> {
            if ("1".equals(v)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }

    // ---------------- serve the bundled app from assets/www over https://app.atelier.local ----------------
    class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null; // network: weather, CDNs, AI models
            return asset(u.getPath());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            openExternal(u.toString());
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pageReady = true;
            if (pendingShareJs != null) { final String js = pendingShareJs; pendingShareJs = null; view.postDelayed(() -> view.evaluateJavascript(js, null), 900); }
        }
    }

    WebResourceResponse asset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String name = path.startsWith("/") ? path.substring(1) : path;
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Access-Control-Allow-Origin", "*");
        try {
            InputStream in = getAssets().open("www/" + name);
            return new WebResourceResponse(mime(name), "UTF-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
        }
    }

    static String mime(String n) {
        n = n.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".webmanifest")) return "application/manifest+json";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".apk")) return "application/vnd.android.package-archive";
        return "application/octet-stream";
    }

    // ---------------- camera, location and file pickers for the web page ----------------
    class AppChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsCamera = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                if (!wantsCamera) { request.deny(); return; }
                if (has(Manifest.permission.CAMERA)) request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                else { pendingWebPermission = request; requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA); }
            });
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (has(Manifest.permission.ACCESS_COARSE_LOCATION)) { callback.invoke(origin, true, false); return; }
            geoOrigin = origin; geoCallback = callback;
            requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, REQ_LOCATION);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            String[] types = params.getAcceptTypes();
            String type = (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) ? types[0] : "*/*";
            if (type.startsWith(".") || type.contains("json")) type = "*/*";
            pick.setType(type);
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try { startActivityForResult(Intent.createChooser(pick, "Choose"), REQ_FILES); }
            catch (ActivityNotFoundException e) { fileCallback = null; return false; }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILES || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                ArrayList<Uri> list = new ArrayList<>();
                for (int i = 0; i < clip.getItemCount(); i++) list.add(clip.getItemAt(i).getUri());
                result = list.toArray(new Uri[0]);
            } else if (data.getData() != null) result = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    boolean has(String perm) { return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_CAMERA && pendingWebPermission != null) {
            if (ok) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        } else if (requestCode == REQ_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
        } else if (requestCode == REQ_STORAGE && afterStoragePermission != null) {
            if (ok) afterStoragePermission.run(); else toast("Storage permission is needed to save files");
            afterStoragePermission = null;
        }
    }

    // ---------------- native helpers ----------------
    void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }
    void toast(String msg) { runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()); }

    void openExternal(String url) {
        runOnUiThread(() -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (ActivityNotFoundException e) { toast("No app can open this link"); }
        });
    }

    static String safeName(String name) {
        String n = name == null ? "file" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return n.isEmpty() ? "file" : n;
    }

    void saveToStorage(byte[] bytes, String name, String mime) {
        boolean image = mime != null && mime.startsWith("image/");
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/Atelier");
                Uri collection = image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri uri = getContentResolver().insert(collection, v);
                if (uri == null) throw new IOException("insert failed");
                try (OutputStream os = getContentResolver().openOutputStream(uri)) { os.write(bytes); }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS), "Atelier");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("cannot create folder");
                try (FileOutputStream os = new FileOutputStream(new File(dir, name))) { os.write(bytes); }
            }
            toast("Saved to " + (image ? "Pictures" : "Downloads") + "/Atelier");
        } catch (Exception e) {
            toast("Could not save: " + e.getMessage());
        }
    }

    class Bridge {
        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            new Thread(() -> saveFileNow(base64, name, mime)).start(); // return immediately: the page never waits
        }

        void saveFileNow(String base64, String name, String mime) {
            final byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            final String n = safeName(name);
            if (Build.VERSION.SDK_INT < 29 && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
                runOnUiThread(() -> {
                    afterStoragePermission = () -> saveToStorage(bytes, n, mime);
                    requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
                });
                return;
            }
            saveToStorage(bytes, n, mime);
        }

        @JavascriptInterface
        public void shareFile(String base64, String name, String mime, String text) {
            new Thread(() -> shareFileNow(base64, name, mime, text)).start();
        }

        void shareFileNow(String base64, String name, String mime, String text) {
            try {
                File dir = new File(getCacheDir(), "share");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, safeName(name));
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(Base64.decode(base64, Base64.DEFAULT)); }
                Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + f.getName());
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime == null || mime.isEmpty() ? "image/*" : mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
                send.setClipData(ClipData.newRawUri(f.getName(), uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (text != null && !text.isEmpty()) copyText(text);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share with").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
            } catch (Exception e) {
                toast("Could not share: " + e.getMessage());
            }
        }

        // Several images in one share (e.g. 1-me.jpg + 2-clothes.jpg to ChatGPT). json = [{b64,name,mime}]
        @JavascriptInterface
        public void shareFiles(String json, String text) {
            new Thread(() -> {
                try {
                    org.json.JSONArray arr = new org.json.JSONArray(json);
                    File dir = new File(getCacheDir(), "share");
                    if (!dir.exists()) dir.mkdirs();
                    ArrayList<Uri> uris = new ArrayList<>();
                    ClipData clip = null;
                    for (int i = 0; i < arr.length(); i++) {
                        org.json.JSONObject o = arr.getJSONObject(i);
                        File f = new File(dir, safeName(o.optString("name", "image" + i + ".jpg")));
                        try (FileOutputStream os = new FileOutputStream(f)) { os.write(Base64.decode(o.getString("b64"), Base64.DEFAULT)); }
                        Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + f.getName());
                        uris.add(uri);
                        if (clip == null) clip = ClipData.newRawUri(f.getName(), uri); else clip.addItem(new ClipData.Item(uri));
                    }
                    Intent send = new Intent(uris.size() > 1 ? Intent.ACTION_SEND_MULTIPLE : Intent.ACTION_SEND);
                    send.setType("image/*");
                    if (uris.size() > 1) send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris); else send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                    if (text != null && !text.isEmpty()) { send.putExtra(Intent.EXTRA_TEXT, text); copyText(text); }
                    if (clip != null) send.setClipData(clip);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share with").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
                } catch (Exception e) {
                    toast("Could not share: " + e.getMessage());
                }
            }).start();
        }

        @JavascriptInterface
        public void shareText(String text) {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share with")));
        }

        @JavascriptInterface
        public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Atelier", text));
            });
        }

        @JavascriptInterface
        public void openUrl(String url) { openExternal(url); }

        // HTTPS POST to an AI provider for the "AI stylist brain" (no browser CORS limits). Result -> window.__httpDone(id, status, body)
        @JavascriptInterface
        public void httpRequest(String id, String method, String url, String headersJson, String body) {
            new Thread(() -> {
                int status = 0; String out;
                try {
                    Uri u = Uri.parse(url); String h = String.valueOf(u.getHost());
                    String[] allowed = {"api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com", "api.x.ai", "api.deepseek.com", "openrouter.ai", "api.z.ai"};
                    boolean ok = "https".equals(u.getScheme()); boolean listed = false;
                    for (String a : allowed) if (h.equals(a)) listed = true;
                    if (!ok || !listed) throw new IOException("Blocked address");
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setRequestMethod("POST".equalsIgnoreCase(method) ? "POST" : "GET");
                    c.setConnectTimeout(20000); c.setReadTimeout(120000);
                    c.setRequestProperty("Content-Type", "application/json");
                    org.json.JSONObject hs = new org.json.JSONObject(headersJson == null ? "{}" : headersJson);
                    java.util.Iterator<String> it = hs.keys();
                    while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, hs.getString(k)); }
                    if (body != null && "POST".equalsIgnoreCase(method)) {
                        c.setDoOutput(true);
                        try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes("UTF-8")); }
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bos.write(buf, 0, n); in.close(); }
                    out = bos.toString("UTF-8");
                } catch (Exception e) { status = 0; out = String.valueOf(e.getMessage()); }
                js("window.__httpDone&&__httpDone(" + org.json.JSONObject.quote(id) + "," + status + "," + org.json.JSONObject.quote(out) + ")");
            }).start();
        }

        // The image currently on the clipboard (copied from Gallery, Chrome, a shopping app…) as a JPEG data URL, or "".
        @JavascriptInterface
        public String clipboardImage() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm == null || !cm.hasPrimaryClip()) return "";
                ClipData clip = cm.getPrimaryClip();
                for (int i = 0; clip != null && i < clip.getItemCount(); i++) {
                    Uri uri = clip.getItemAt(i).getUri();
                    if (uri == null) continue;
                    android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    try (InputStream in = getContentResolver().openInputStream(uri)) { android.graphics.BitmapFactory.decodeStream(in, null, o); }
                    if (o.outWidth <= 0) continue;
                    int s = 1; while (Math.max(o.outWidth, o.outHeight) / s > 1800) s *= 2;
                    android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options(); o2.inSampleSize = s;
                    android.graphics.Bitmap bmp;
                    try (InputStream in = getContentResolver().openInputStream(uri)) { bmp = android.graphics.BitmapFactory.decodeStream(in, null, o2); }
                    if (bmp == null) continue;
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, bos);
                    return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
                }
            } catch (Exception ignored) { }
            return "";
        }

        @JavascriptInterface
        public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "0"; }
        }

        // ---- In-app update: download the new APK from the app's GitHub Releases and open Android's installer ----
        @JavascriptInterface
        public boolean canInstall() { return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls(); }

        @JavascriptInterface
        public void openInstallSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
                catch (Exception e) { toast("Open Settings → Apps → Atelier → Install unknown apps"); }
            });
        }

        @JavascriptInterface
        public void downloadUpdate(String url, String name) {
            new Thread(() -> {
                File out = null;
                try {
                    Uri u = Uri.parse(url);
                    String h = String.valueOf(u.getHost());
                    if (!"https".equals(u.getScheme()) || !(h.equals("github.com") || h.endsWith(".githubusercontent.com"))) throw new IOException("Untrusted update address");
                    File dir = new File(getCacheDir(), "share");
                    if (!dir.exists()) dir.mkdirs();
                    for (File old : dir.listFiles()) if (old.getName().endsWith(".apk")) old.delete();
                    out = new File(dir, safeName(name.endsWith(".apk") ? name : name + ".apk"));
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setInstanceFollowRedirects(false); // we check where GitHub redirects us
                    c.setConnectTimeout(20000); c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { // cross-host redirect to GitHub's file servers
                        String loc = c.getHeaderField("Location"); c.disconnect();
                        Uri lu = Uri.parse(loc);
                        if (!"https".equals(lu.getScheme()) || !String.valueOf(lu.getHost()).endsWith(".githubusercontent.com")) throw new IOException("Untrusted redirect");
                        c = (java.net.HttpURLConnection) new java.net.URL(loc).openConnection();
                        c.setConnectTimeout(20000); c.setReadTimeout(30000);
                        code = c.getResponseCode();
                    }
                    if (code != 200) throw new IOException("Server said " + code);
                    long total = c.getContentLengthLong(), done = 0; int last = -1;
                    try (InputStream in = c.getInputStream(); FileOutputStream os = new FileOutputStream(out)) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) {
                            os.write(buf, 0, n); done += n;
                            int pct = total > 0 ? (int) (done * 100 / total) : -1;
                            if (pct != last && pct % 5 == 0) { last = pct; js("window.__updateStatus&&__updateStatus('progress'," + pct + ")"); }
                        }
                    }
                    Uri apk = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + out.getName());
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(apk, "application/vnd.android.package-archive");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    js("window.__updateStatus&&__updateStatus('install',100)");
                    runOnUiThread(() -> startActivity(i));
                } catch (Exception e) {
                    if (out != null) out.delete();
                    final String msg = String.valueOf(e.getMessage()).replace("'", " ");
                    js("window.__updateStatus&&__updateStatus('error','" + msg + "')");
                }
            }).start();
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                android.os.Vibrator v = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createOneShot(Math.max(1, Math.min(ms, 60)), 40));
                else v.vibrate(Math.max(1, Math.min(ms, 60)));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void setSystemBars(String color, boolean lightBackground) {
            runOnUiThread(() -> {
                try {
                    int c = android.graphics.Color.parseColor(color);
                    getWindow().setStatusBarColor(c);
                    getWindow().setNavigationBarColor(c);
                    web.setBackgroundColor(c);
                    View d = getWindow().getDecorView();
                    int f = d.getSystemUiVisibility();
                    f = lightBackground ? (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                    if (Build.VERSION.SDK_INT >= 26) f = lightBackground ? (f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                    d.setSystemUiVisibility(f);
                } catch (Exception ignored) { }
            });
        }
    }
}
