# Rupivo – private offline money tracker

Plain HTML/CSS/JS. **No build step, no frameworks, no server.** Open `www/index.html` through any static server.

## Run it
```
npm run serve        # then open http://localhost:8080   (or: cd www && python3 -m http.server 8080)
npm test             # 23 logic tests (store, encryption, SMS parser)
```
Encryption needs https or localhost (browser rule), so don't open index.html by double-click.

## Project map (where to change what)
| File | Purpose |
|---|---|
| `www/js/config.js` | Categories, banks, UPI apps, currencies, KDF settings – **edit lists here** |
| `www/js/store.js` | All data + money rules + validation + autosave. Views never touch storage |
| `www/js/crypto.js` | AES-256-GCM + PBKDF2 passcode encryption |
| `www/js/storage.js` | The only file that uses localStorage |
| `www/js/sms.js` | Bank SMS parser + import + native bridge |
| `www/js/forms.js` | Transaction / account / person dialogs |
| `www/js/view-*.js` | One file per screen (dashboard, accounts, people, reports, settings) |
| `www/js/ui.js`, `charts.js`, `icons.js` | Modal/confirm/toast, SVG charts, icons |
| `www/js/lock.js`, `app.js` | Welcome/lock screens; router + startup (loaded last) |
| `www/css/styles.css` | Theme colours are tokens at the top (light + dark) |
| `www/terms.html` | Terms & Privacy page (linked from app and SMS consent) |
| `native/android/SmsInboxPlugin.java` | Android SMS reader (see below) |

Add a new screen: create `view-xxx.js` with `MT.views.xxx = {title, render(param)}`, add a `<script>` tag in `index.html` and an entry in `NAV` in `app.js`.

## Turn it into an Android app (no Android Studio needed)
You need a way to compile an APK. Options without installing Android Studio:
- **GitHub Actions** (free): push this project to GitHub and use a workflow that runs `npm i && npx cap add android && npx cap sync && ./gradlew assembleDebug` on an `ubuntu` runner, then download the APK from the run's artifacts.
- **Ionic Appflow / Capawesome Cloud** – hosted Capacitor builds.

Steps (same either way):
```
npm install
npx cap add android
cp native/android/SmsInboxPlugin.java android/app/src/main/java/com/rupivo/app/
```
1. In `android/app/src/main/java/com/rupivo/app/MainActivity.java` register the plugin:
   ```java
   public class MainActivity extends BridgeActivity {
     @Override public void onCreate(Bundle b) { registerPlugin(SmsInboxPlugin.class); super.onCreate(b); }
   }
   ```
2. In `android/app/src/main/AndroidManifest.xml` add: `<uses-permission android:name="android.permission.READ_SMS" />`
3. `npx cap sync android`, then build (`cd android && ./gradlew assembleDebug`). APK: `android/app/build/outputs/apk/debug/`.
4. Make app icons from `www/assets/logo.svg` (e.g. `npx @capacitor/assets generate`).

The web code detects the native plugin automatically; in a normal browser the SMS section shows an explanation instead.

## Easiest: get the APK from GitHub (no installs)
1. Create a GitHub repo and upload the contents of this folder (keep the `.github` folder).
2. Open the **Actions** tab -> *Build Android APK* -> wait ~5-8 min.
3. Open the finished run -> **Artifacts** -> download `rupivo-apk` (zip) -> unzip -> install `app-debug.apk` on your phone (allow "install unknown apps").

## Honest notes
- **Android has no "bank SMS only" permission.** `READ_SMS` is all-or-nothing, so the app filters on the device (bank-style sender IDs, transaction wording) and stores only amount/date/category/note, never the SMS text. The consent dialog and `terms.html` say exactly this.
- **Google Play restricts READ_SMS** to default SMS/dialer apps and a few exceptions; a finance tracker will most likely be rejected there. Sideloading the APK is fine. If you want Play Store later, the alternative is parsing notifications or manual paste.
- **Forgotten passcode = data is gone** (by design – nobody, including you, can recover it). Backup export exists for this reason.
- Data lives in the app's local storage: clearing app data/uninstalling deletes it. Remind users to export backups.
- SMS parser handles common Indian bank formats (tested on 6 sample formats) but real SMS vary; extend patterns in `sms.js` and add cases in `tests/logic.test.js`.
- `terms.html` is a template: add your support email and have it reviewed before public release.
- Name "Rupivo" is a coined word; I found no finance app by that name in a quick search, but do a trademark check before publishing.
