# PathGuard

At first were working on iOS first, with Android support planned later. Why? Simple, I've got an iphone so I went ahead on worked with IOS. This doesn't connect to the ESP32. 

## Setup (Windows + iPhone)

**Install once:** [Node.js LTS](https://nodejs.org/), [Git](https://git-scm.com/downloads), [VS Code](https://code.visualstudio.com/), and [Expo Go](https://expo.dev/go) on your iPhone. Restart VS Code after installing Node.js.

**Clone the existing project** (don't run `create-expo-app`):

```powershell
git clone <REPOSITORY_URL>
cd PathGuard
npm.cmd install
```

Replace `<REPOSITORY_URL>` with this repo's HTTPS clone URL.

**Sign in to Expo** on both your iPhone (Expo Go) and your computer using the **same account**. Each teammate can use their own account.

```powershell
npx.cmd expo login
npx.cmd expo whoami
```

If you use **Google sign-in** and the browser login doesn't sign in the CLI, try:

```powershell
npx.cmd --yes eas-cli@latest login --device
npx.cmd expo whoami
```

## Run and test

```powershell
npx.cmd expo start --go
```

Connect your iPhone and computer to the same Wi-Fi, then scan the QR code with the iPhone Camera app to open the project in Expo Go. Saving code changes should automatically refresh the app.

Test the current flow: **Scan → PathGuard Demo → Connected → Disconnect**. This uses simulated devices, not real Bluetooth.

Check for TypeScript errors with `npx.cmd tsc --noEmit`.

## Common fixes

| Issue | Solution |
| --- | --- |
| PowerShell blocks `npm.ps1` / `npx.ps1` | Use `npm.cmd` / `npx.cmd` as shown above. |
| Expo tries to use a development build | Run `npx.cmd expo start --go --clear`. |
| Expo Go says the CLI isn't signed in | Verify `npx.cmd expo whoami` and sign into the same account on your iPhone. |
| QR code can't connect | Check Wi-Fi or use `npx.cmd expo start --go --tunnel`. |
| Changes aren't showing | Restart with `npx.cmd expo start --go --clear`. |

## Main files

- `src/app/index.tsx` — Controls the overall navigation layout of the application.
- `src/app/_layout.tsx` — Defines the first screen atm that appears when we open the app. (this is not going to be the fisrt window they look)
- `src/components/DeviceSetupScreen.tsx` — The GUI of the device setup screen.

The Flow goes from top to bottom. We use React's useState to keep track of whether PathGuard is disconnected, scanning, connecting, or connected. When that state changes, React updates the interface automatically 

**Why this stack?** React Native + Expo + TypeScript lets us reuse most of the code on Android later and preview the UI directly on an iPhone. Real ESP32/BLE integration will require a custom development build instead of Expo Go.

**Questions and concerns** Feel free to reach out. if you read the whole document text me on discord the U.S flag. 
