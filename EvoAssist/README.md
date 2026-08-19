# EvoAssist for iOS

EvoAssist is a Theos tweak for the supplied EvoWars 2.18.9 IPA. It injects a
touch-oriented control panel into the game's Cordova `WKWebView` and provides:

- Auto Dodge: moves the mobile thumbstick away from the nearest active threat.
- Auto Attack: taps the in-game attack button and aims at a predicted target.
- Camera Zoom: changes the Construct 2 layer scale in real time.
- Optional threat overlay for runtime verification.

All automation options default to off. Camera zoom defaults to `1.00`.

## Requirements

- macOS or Linux with a current Theos installation.
- An iOS 15+ jailbroken device.
- The installed app must use bundle id `com.nightsteed.evowarsio`.
- Rootless jailbreak: build with the rootless package scheme.

The project intentionally targets `arm64` only. The supplied App Store binary
is `arm64`, so an `arm64e` slice is unnecessary even on an arm64e device.

## Build

Rootless package (Dopamine, modern jailbreaks):

```sh
cd EvoAssist
make clean package THEOS_PACKAGE_SCHEME=rootless FINALPACKAGE=1
```

Rootful package:

```sh
cd EvoAssist
make clean package FINALPACKAGE=1
```

The resulting `.deb` is written under `packages/`. Install it with Sileo/Zebra
or with `dpkg -i`, then fully close and reopen EvoWars.

To build and install directly through SSH, configure `THEOS_DEVICE_IP` and run:

```sh
make package install THEOS_PACKAGE_SCHEME=rootless
```

## Validation

Install the test dependency and run the JavaScript checks before packaging:

```sh
npm install
npm test
```

The Playwright smoke test uses a mocked Construct 2 runtime and validates the
mobile panel, synthetic dodge/attack touches, outgoing angle override, and
camera layer scale at iPhone-landscape and desktop-landscape sizes. It does not
replace a final test on the actual iOS device.

## Use

Open EvoWars and tap the `EA` button near the top-right safe area. The status
changes from `Waiting` to `Ready` after Construct 2 exposes the expected game
objects. Enable Auto Dodge or Auto Attack independently and adjust the zoom
slider as needed.

Use this only in an environment where you are permitted to automate gameplay.
Online-game automation can violate the game's rules and may lead to account or
device sanctions.

## Compatibility notes

This source targets version 2.18.9 from the supplied IPA. It avoids hard-coded
native addresses, but a future game update can still rename Construct 2 object
types or change instance-variable indexes. See `docs/analysis.md` for the exact
runtime assumptions.
