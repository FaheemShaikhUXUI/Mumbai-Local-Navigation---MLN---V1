# Android Build Process & Deployment Guide

## 1. Android Application Architecture

The mobile application (`apps/mobile`) is built with React Native / Expo and native Android SQLite bindings (`expo-sqlite`).

### Architecture Highlights:
- **Native SQLite Performance**: Queries run against native SQLite engine embedded in Android OS (`libsqlite3.so`).
- **WorkManager Background Sync**: Scheduled periodic background checks respect Android Doze mode and battery restrictions.
- **Pure Offline Capability**: Zero network calls during user interaction.

---

## 2. Prerequisites for Android Build

1. **Node.js**: v20.11 or higher
2. **JDK**: OpenJDK 17
3. **Android Studio**: Android SDK Build-Tools 34.0.0, Platform API 34
4. **Environment Variables**:
   ```bash
   ANDROID_HOME=$HOME/AppData/Local/Android/Sdk
   PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
   ```

---

## 3. Local Android Build (APK / AAB)

To run in development mode with an Android emulator or connected device via USB:
```bash
# Inside apps/mobile
npm run start
# Press 'a' to launch on Android device/emulator
```

To generate a standalone release APK:
```bash
npx eas-cli build --platform android --profile preview --local
```

To generate an optimized Android App Bundle (AAB) for Google Play:
```bash
npx eas-cli build --platform android --profile production
```

---

## 4. Android Permissions (`AndroidManifest.xml`)

The application requires minimal permissions:
- `android.permission.INTERNET`: Required only for initial dataset download and checking for published timetable updates.
- `android.permission.ACCESS_NETWORK_STATE`: Detects online/offline connectivity without attempting failing socket requests.
- `android.permission.RECEIVE_BOOT_COMPLETED`: Reschedules the periodic 6-hour WorkManager update check on device reboot.
