![Logo](admin/miele-local.png)

# ioBroker.miele-local

[![NPM version](https://img.shields.io/npm/v/iobroker.miele-local.svg)](https://www.npmjs.com/package/iobroker.miele-local)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*Read this in another language: [Deutsche Dokumentation](README_de.md).*

This adapter connects modern **Miele@Home** appliances **locally, without the internet**.
It speaks the local Miele protocol (`MieleH256` / DOP2) directly over the LAN — no cloud
account during operation, no detour through the Miele 3rd-party API.

> The one-time **login** with your Miele account only serves to obtain the household-wide
> local key (GroupID/GroupKey). After that the adapter runs offline, and the Miele app
> keeps working unchanged.

## Features

- **Automatic credential retrieval** via a guided login (cloud OAuth), without
  re-provisioning the appliances.
- **Automatic device discovery** via mDNS (`_mieleathome._tcp`).
- **Live states** of all supported appliance classes (washing machine, dryer,
  dishwasher, oven, steam oven, hob, coffee machine and more) with plain-text decoding of
  status, program and phase.
- **Real-time updates** via the SuperVision push channel (optional), with polling as a
  reliable fallback.
- **Control** (optional): start/stop/pause, light, on/off through writable states — as
  long as "MobileStart/remote control" is enabled on the appliance.

## Installation

1. Install the adapter and create an instance.
2. On the **Login** tab, choose your country and follow the 3-step login guide below.
3. Paste the captured `miele://…` redirect address and click **Fetch GroupKey**. GroupID and
   GroupKey are stored securely (GroupKey encrypted).
4. Save. The adapter discovers your devices and creates the states.

### Step-by-step: Capturing the redirect URL

Because the final `miele://` address is a custom mobile-app scheme, desktop browsers cannot open
it automatically and will hang on a spinning wheel. Capture the URL using browser DevTools:

1. **Prepare DevTools:** Click **Open login page** to open the Miele login in a new tab. In that
   new tab, press **F12** to open Developer Tools and switch to the **Network** tab. Enable
   persistent logging:
   - **Chrome / Edge / Brave:** Check **Preserve log**.
   - **Firefox:** Click the gear icon ⚙️ and check **Persist Logs**.
2. **Sign In:** Enter the email and password of your Miele app account and submit the login.
   *Note:* The page will remain on a spinning wheel (or report a failed load) — this is completely
   expected and indicates success.
3. **Copy & Submit:** In the Network tab (F12), scroll to the very last (usually red) request. It
   starts with `redirect?redirect_uri=miele...` or `miele://oauth2-code/...`. Right-click this
   entry → **Copy URL** (or **Copy link address**). Paste it into the **miele:// redirect URL**
   field in ioBroker and click **Fetch GroupKey**.

## Required ports / firewall

| Direction | Port | Purpose | Required |
|---|---|---|---|
| inbound | TCP *push port* (default 18082) | Devices send real-time updates to ioBroker (callback target) | only when push is enabled |
| in/out | UDP 5353 (mDNS) | device discovery and push registration | yes |
| outbound | TCP 80 → devices | read states / send control commands | yes |
| outbound | TCP 443 → miele-iot.com | only during login (fetch GroupKey) | login only |

Without push, **no inbound port** is required. ioBroker and the devices must be in the same
broadcast segment (no VLAN/Docker-bridge separation) for mDNS to work.

### Running in Docker (important)

If ioBroker runs in a **Docker container with bridge networking** (the default, e.g. the
buanet image), the automatic **mDNS discovery cannot reach the devices** — multicast is not
bridged. Direct communication (TCP 80) does work, because it is routed. In that case:

- **Enter the device IPs manually on the "Devices & polling" tab.** Polling then works
  normally.
- **Push** does not work in a bridge network (the devices cannot reach the container). For
  push, run the container in **host networking** (`network_mode: host`) — the push port is
  then automatically open. In a bridge network you additionally have to map `-p
  18082:18082`, but the callback return address sits behind NAT, so push stays unreliable.

### How push works (technical)

When push is enabled, the adapter performs an **enrollment** per device: `PUT
/Devices/<series>/SuperVision/<own-fab>` (registers the adapter as a peer) and several
`POST /Subscriptions` with a **callback URL** `http://<ioBroker-LAN-IP>:<push-port>/…`. The
device then sends state changes to that URL unsolicited (sub-second). Subscriptions are
renewed periodically. If the device cannot reach the callback URL (bridge NAT), no pushes
arrive — the adapter then falls back to polling.

## Privacy

**No personal data** is stored by the adapter. GroupID, GroupKey and refresh token live
only in the (encrypted) instance configuration or in ioBroker objects. No data is
transmitted to third parties; in normal operation there is no cloud connection.

## States (excerpt)

Per device under `<serial>.info` (static/connectivity), `<serial>.state` (live) and `<serial>.eco`:

- `info.connected` — connectivity status (true when appliance responds)
- `state.statusText` / `state.status` — operating state (plain text + raw value)
- `state.programText` / `state.programId` — running program
- `state.programPhaseText` / `state.programPhase` — program phase
- `state.remainingMinutes`, `state.elapsedMinutes`, `state.startInMinutes`
- `state.remainingSeconds`, `state.elapsedSeconds` (optional second-precise DOP2 values)
- `state.estimatedEndTime` / `state.estimatedEndTimeText` — projected finish time
- `state.temperature[Zone2/3]`, `state.targetTemperature[Zone2/3]`
- `state.signalDoor`, `state.signalInfo`, `state.signalFailure`
- `state.mobileStart` — whether remote control is enabled on the device
- `state.light`, `state.spinningSpeed` (washing machine), `state.dryingStepText` (dryer)
- `eco.energy` (kWh), `eco.energyWh` (Wh), `eco.water` (l) (where supported)
- `info.techType`, `info.fabNumber`, `info.xkmType`, `info.xkmVersion`, `info.deviceType`

With control enabled, additionally `<serial>.control.*` (start, stop, pause, powerOn,
powerOff, lightOn, lightOff).

## Compatibility / limits

- Tested against a washing machine (WCR860/EK037), dishwasher (G5840/EK037) and oven
  (H2469BP/EK057).
- Refrigeration/freezer appliances are usually **read-only** locally (firmware rejects
  write commands).
- Control commands require "MobileStart/remote control" on the device; some firmwares
  answer DOP2 writes with HTTP 404/500.
- The SuperVision push is a best-effort addition; polling is the reliable default path.

## Legal / disclaimer

This is an **unofficial, privately developed** project and is **not affiliated with Miele
& Cie. KG**, nor endorsed or reviewed by them. "Miele", "Miele@home" and related names are
trademarks of Miele & Cie. KG and are used here only descriptively to indicate
compatibility.

The adapter uses a local protocol that has been publicly documented through **reverse
engineering**. Use is **at your own risk**; depending on device/firmware it may affect
warranty claims. The software is provided under the MIT license **without any warranty**
(see LICENSE). The author is not liable for damage to devices, data or any other
consequences of use.

## Acknowledgements

Special thanks to **[meistermopper](https://github.com/meistermopper)**, an experienced
ioBroker adapter developer, who reviewed this adapter unprompted and contributed substantial
improvements: periodic background discovery for appliances waking from standby, a per-device
connectivity state, corrected state roles and units, explicit defaults for all states, and
German documentation. His work went into release 0.3.0.

The local protocol (`MieleH256`, DOP2, provisioning) is based on the public reverse
engineering work of the projects `MieleRESTServer` (akappner),
`home-assistant-miele-mobile` and `ha-miele-at-lan`.

## Changelog

### 0.3.5
- **Fix: appliance status no longer flips to "off" during a running program.** A failed status
  request was reported as a state change instead of being retried; every twenty-fifth poll
  produced a spurious "off". Requests now get a second attempt, and an implausible jump from
  "running" to "off" is discarded when the remaining time says the program is still going.
  The retry count is exposed as `info.pollRetries`.
- **Fix: remaining time was read from the wrong field.** `remainingSeconds` carries only the
  seconds component - at "2:01" it reads 0. The plausibility check now uses
  `remainingMinutes`.
- **Fix: frozen EcoFeedback values are no longer booked as consumption.** When an appliance
  keeps reporting the previous cycle's figures, the unchanged value is skipped instead of
  being added to the new cycle.
- Requests are serialised per appliance, and a cycle now survives an adapter restart.
- **EcoFeedback is only requested while an appliance is actually running.** The DOP2 leaf
  only answers while the appliance is awake - a switched-off machine returns HTTP 500. The
  washing machine's last reading came in mid-programme; afterwards every poll ran into the
  void, one per minute for days, each one occupying the XKM module that answers only one
  request at a time. Polling now happens while a programme runs, during a ten-minute
  follow-up afterwards (the final reading is not settled the moment the status flips), and
  once at startup so that appliances without the leaf can still be identified. The follow-up
  ends early once two consecutive readings are identical.
- **All object names are complete in eleven languages.** The repository check reported 147
  W1001 warnings for `common.name`; channels, EcoFeedback data points, appliance names and the
  instance objects were still English- or German-only. Appliance categories are translated
  while model and serial number stay untouched - they are proper names.

### 0.3.4
- **New: cycle history.** Every completed program is recorded with duration, program name,
  energy and water. The appliances do not keep finished cycles themselves, so the history
  starts when the feature is enabled - it cannot be filled retroactively. Recent cycles are
  kept as JSON in `<serial>.history.cyclesJson`, alongside running totals for cycle count,
  runtime, energy and water. Optionally each cycle is also written to the history adapter,
  timestamped at the end of the cycle, so charts can cover any period.
  Configurable on the new **History** tab: ring buffer size (default 50), retention in days
  (default 730) and the history instance.
- The step-by-step login instructions were stored in English in nine of the eleven language
  files. All eight texts are now translated into es, fr, it, nl, pl, pt, ru, uk and zh-cn.
- `common.news` no longer lists versions that were never published to npm.
- Dependabot: raised the PR limit, spread the schedule over a cron slot, added automerge.

### 0.3.3
- Fix E3005: states declared as `number` no longer receive `null` when the appliance does not
  report a value - the datapoint keeps its default instead. `estimatedEndTime` is cleared with
  0 rather than null.
- Fix E1011: `state.light` is read-only and now carries role `sensor.light`; switching happens
  through `control.lightOn`/`lightOff`.

### 0.3.2
- EcoFeedback conversion moved into `dop2.ecoValues()` and covered by unit tests against the
  cloud-verified reference values (1991 Wh = 1.991 kWh, 953 = 95.3 l).

### 0.3.1
- Fix: `applyIdent` threw on the new `connected` field, which has no ident path. Because that
  entry comes first, **all** device data stayed empty - model, serial number, firmware.
- Eco polling now logs why it skips a device instead of failing silently.

### 0.3.0
- Adopt ioBroker development guidelines and conformity rules.
- Translate internal log messages to pure English.
- Add explicit default metadata values (`def`) to all state definitions.
- Sanitize dynamic object IDs against forbidden characters.
- Add local verification test script (`npm run test:local`).
- Add German documentation (`README_de.md`).
- Fix dev-server packaging issue by removing redundant prepare script.
- Clarify step-by-step login instructions and i18n translations.
- Add CHANGELOG_OLD.md for historical pre-rename versions.
- Add per-device connectivity state (`info.connected`).
- Add periodic background discovery for waking/standby appliances.
- Add admin UI configuration for second-precise remaining time polling.
- Refine EcoFeedback state roles and measurement units.
- mDNS auto-discovery is no longer marked experimental - confirmed working.

Most of the above was contributed by [meistermopper](https://github.com/meistermopper).

### 0.2.1
- Released via GitHub Actions with npm provenance (trusted publishing). No functional
  changes.

### 0.2.0
- Renamed from `miele-lokal` to `miele-local`: English adapter name and title.
  First release under the new package name.

[Older changelog entries can be found here](CHANGELOG_OLD.md)

## License

MIT License

Copyright (c) 2026 Immanuel

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction. See the [LICENSE](LICENSE) file for the full text.
