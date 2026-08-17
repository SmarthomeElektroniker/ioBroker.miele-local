![Logo](admin/miele-local.png)

# ioBroker.miele-local

[![NPM version](https://img.shields.io/npm/v/iobroker.miele-local.svg)](https://www.npmjs.com/package/iobroker.miele-local)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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
2. On the **Login** tab, choose your country and click **Open login page** — sign in with
   your Miele account in the browser. At the end the browser is redirected to a
   `miele://…` address (which fails to open — that is expected); copy that full address.
3. Paste the `miele://…` address and click **Fetch GroupKey**. GroupID/GroupKey are stored
   (GroupKey encrypted).
4. Save. The adapter discovers the devices via mDNS and creates the states.

### Capturing the redirect URL

The browser cannot open the final `miele://` address itself — that is expected. You obtain
the full address (`miele://oauth2-code/?code=…&state=…`) as follows — **one method is
enough**:

- **Easy — via the "Open with" dialog:** When the browser asks to open the address "with an
  application", it hands the complete `miele://` address to that app. If you open it with a
  text editor (Linux: kate/gedit; Windows: Notepad; macOS: TextEdit), the full address
  appears in the title/file name or in the text — copy it from there. You can cancel the
  actual open action.
- **Reliable — via DevTools:** Open DevTools before logging in (F12) → tab "Network",
  enable "Preserve log". After logging in, find the last request whose address begins with
  `miele://` or contains `…/de/redirect?…&code=…` → right-click → "Copy link address".

Both yield the same text with `code=` and `state=`; the adapter accepts both forms.

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

Per device under `<serial>.info` (static) and `<serial>.state` (live):

- `state.statusText` / `state.status` — operating state (plain text + raw value)
- `state.programText` / `state.programId` — running program
- `state.programPhaseText` / `state.programPhase` — program phase
- `state.remainingMinutes`, `state.elapsedMinutes`, `state.startInMinutes`
- `state.estimatedEndTime` / `state.estimatedEndTimeText` — projected finish time
- `state.temperature[Zone2/3]`, `state.targetTemperature[Zone2/3]`
- `state.signalDoor`, `state.signalInfo`, `state.signalFailure`
- `state.mobileStart` — whether remote control is enabled on the device
- `state.light`, `state.spinningSpeed` (washing machine), `state.dryingStepText` (dryer)
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

The local protocol (`MieleH256`, DOP2, provisioning) is based on the public reverse
engineering work of the projects `MieleRESTServer` (akappner),
`home-assistant-miele-mobile` and `ha-miele-at-lan`.

## Changelog

### 0.2.1
- Released via GitHub Actions with npm provenance (trusted publishing). No functional
  changes.

### 0.2.0
- Renamed from `miele-lokal` to `miele-local`: English adapter name and title.
  First release under the new package name.

### 0.1.1
- Released via GitHub Actions with npm provenance (trusted publishing). No functional
  changes. Published under the former name `iobroker.miele-lokal`.

### 0.1.0
- Initial release: login/GroupKey retrieval, mDNS discovery, state polling with enum
  decoding, optional SuperVision push, optional control.

## License

MIT License

Copyright (c) 2026 Immanuel

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction. See the [LICENSE](LICENSE) file for the full text.
