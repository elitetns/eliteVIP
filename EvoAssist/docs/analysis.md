# Project analysis

## Target

- Bundle identifier: `com.nightsteed.evowarsio`
- Executable: `EvoWars`
- App/game version: `2.18.9`
- Minimum iOS version: `15.0`
- CPU architecture in the supplied IPA: `arm64`

## Architecture

The native executable is an Apache Cordova shell. It creates a `WKWebView`
and loads the local `www/index.html` page. The game itself is a Construct 2
export, not a native game engine. Relevant files in the supplied IPA are:

- `www/c2runtime.js`: Construct 2 runtime and plugins.
- `www/data.js`: game object model and event data.
- `www/ws_worker.js`: WebSocket worker.
- `www/index.html`: starts the runtime after Cordova's `deviceready` event.

The IPA contains the same runtime surfaces used by the supplied userscript:
`cr_getC2Runtime`, `runtime.types_by_index`, `runtime.running_layout`, the
`Touch` plugin, and `NSG_PowerWS`. The iOS build does not include Construct
2's desktop Mouse plugin, so blindly injecting the desktop userscript would
show the menu but its synthetic mouse movement would not reliably control the
mobile client.

## Implementation choice

The tweak hooks `-[WKWebView initWithFrame:configuration:]` and registers a
main-frame `WKUserScript`. This is more version-tolerant than patching ARM64
offsets in the Cordova executable. The payload uses native Construct 2 touch
events for the joystick and attack button, and only uses the worker hook to
override the outgoing attack angle.

The Construct export obfuscates runtime object names. Static analysis of the
supplied `data.js` maps the required types as follows:

- Player: `t110` with 72 instance variables.
- Mobile attack button: `t370` (`btnattack-sheet0.png`).
- Mobile thumbstick base: `t372` (`thumbstickmiddle-sheet0.png`).

The current compatibility contract is intentionally narrow: EvoWars 2.18.9 and
those type IDs, with the original 72-instance-variable fallback for the player
type. If those structures change, the panel remains available but reports an
incompatible runtime and automation does not run.
