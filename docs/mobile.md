# Mobile apps (Capacitor)

The game client in `apps/client` is a web app (PixiJS). Capacitor 8 wraps that build in a native iOS and Android app. The native projects live in the repo:

```
apps/client/capacitor.config.ts   app id, app name, where the web build is
apps/client/ios/                  Xcode project (Swift Package Manager, no CocoaPods)
apps/client/android/              Android Studio / Gradle project
```

Both apps show exactly the same client as the browser. Nothing native decides game logic.

## What you need on your computer

| For | You need |
| --- | --- |
| both | Node.js 22 or newer, then `npm install` in the repo root |
| iOS | a Mac with Xcode 26 or newer (App Store, free). For your own iPhone: an Apple ID signed in under Xcode → Settings → Accounts (free) |
| Android | the Android SDK with an emulator (Android Studio installs both; you never have to open it to build) and **Java 21 or newer** (`brew install --cask zulu@21`) |
| store release | Apple Developer Program (99 USD/year) and Google Play Console (25 USD once). Not needed to test on your own phone |

## Daily commands (repo root)

```
npm run app:sync          # build the client, copy it into both native projects
npm run app:ios           # build + copy + open Xcode
npm run app:android       # build + copy + open Android Studio
npm run app:run:ios       # build + copy + start on a connected iPhone or simulator (asks which)
npm run app:run:android   # build + copy + start on a connected phone or emulator (asks which)
```

Every change to the game needs one of these again: the native apps contain a copy of `out/client`, not a live link.

## First time on an iPhone

1. `npm install`, then `npm run app:ios`. Xcode opens the project.
2. In Xcode, click "App" in the left list → tab "Signing & Capabilities" → Team: pick your Apple ID ("Personal Team").
3. If Xcode says the bundle id is taken: change it there to something of your own, e.g. `com.yourname.backpackspace` (also in `capacitor.config.ts`, see below).
4. Connect the iPhone by cable, unlock it, trust the computer. On the iPhone turn on Settings → Privacy & Security → Developer Mode (restart needed).
5. Pick the iPhone at the top of Xcode and press ▶ (Run).
6. The first start fails with "untrusted developer": on the iPhone go to Settings → General → VPN & Device Management → your Apple ID → Trust. Press ▶ again.

With the free Personal Team the app runs for 7 days, then it has to be installed again from Xcode. With the paid developer program it is 1 year, and TestFlight becomes possible.

The iOS simulator needs none of this: pick an iPhone simulator in Xcode and press ▶.

## First time on an Android phone

1. `npm install`, then `npm run app:android`. Android Studio opens the project; let it finish "Gradle sync" (first time takes a few minutes and downloads the SDK).
2. On the phone: Settings → About phone → tap "Build number" 7 times. Then Settings → Developer options → turn on "USB debugging".
3. Connect the phone by cable and allow debugging on the phone.
4. Pick the phone at the top of Android Studio and press ▶ (Run).

To pass an installable file around without a cable: in Android Studio Build → Build App Bundle(s) / APK(s) → Build APK(s). The debug APK lands in `apps/client/android/app/build/outputs/apk/debug/` and can be sent to any Android phone (it asks to allow installs from unknown sources).

## Android build fails with "invalid source release: 21"

Capacitor 8 compiles for Java 21, and the terminal still uses an older JDK (often 17 from React Native work). `npm run app:run:android` already looks for an installed JDK 21+ by itself (`JAVA_HOME`, `/usr/libexec/java_home -v 21+`, Homebrew, Android Studio's bundled Java) and uses it only for this build; your other projects keep their JDK. If it finds none it stops with a message. Then:

```
brew install --cask zulu@21
npm run app:run:android
```

## Fixed settings

- Portrait only (the client is drawn for 390×844). iPad allows portrait and upside-down portrait.
- Background colour `#070b18` (the client's background), so there is no white flash at start.
- App icon and splash screen are still the Capacitor defaults. Replacing them is a later step with `@capacitor/assets` once there is art.

## Open points before a store release

- **App id** `com.backpackspace.app` in `capacitor.config.ts` is a placeholder. It must be final before the first store upload and cannot change afterwards. After changing it in the config, also change it in Xcode (Signing & Capabilities → Bundle Identifier) and in `android/app/build.gradle` (`applicationId` and `namespace`, and the Java package folder of `MainActivity`).
- **Fonts** are loaded from Google Fonts. Without internet the app falls back to system fonts. For release they should be bundled with the client.
- **Signing**: no store accounts, certificates or keystores are set up. Release builds need your own Apple certificates (Xcode can manage them) and an Android upload keystore. Never commit a keystore or its password.
- Saved progress (the profile: Galaxies, hero XP, league, cosmetics) is in the web view's local storage; it survives app restarts but not an uninstall.

## When native parts change

`npm run app:sync` is enough after game changes. After adding a Capacitor plugin (`npm install @capacitor/<plugin> -w @backpack-space/client`) also run `npm run app:sync` so the native projects pick it up, and commit the changed files under `ios/` and `android/`.
