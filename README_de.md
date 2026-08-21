![Logo](admin/miele-local.png)

# ioBroker.miele-local

[![NPM version](https://img.shields.io/npm/v/iobroker.miele-local.svg)](https://www.npmjs.com/package/iobroker.miele-local)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*Diese Dokumentation in einer anderen Sprache lesen: [English documentation](README.md).*

Dieser Adapter verbindet moderne **Miele@Home**-Geräte **lokal ohne Internet**.
Er spricht das lokale Miele-Protokoll (`MieleH256` / DOP2) direkt über das LAN – kein
Cloud-Konto im laufenden Betrieb, kein Umweg über die Miele 3rd-Party-Cloud-API.

> Der einmalige **Login** mit dem Miele-Konto dient nur dazu, den haushaltsweiten
> lokalen Schlüssel (GroupID/GroupKey) abzurufen. Danach läuft der Adapter komplett
> offline, und die Miele-App funktioniert unverändert weiter.

## Funktionen

- **Automatischer Abruf der Zugangsdaten** über einen geführten Login (Cloud-OAuth), ohne
  die Geräte neu anlernen zu müssen.
- **Automatische Geräteerkennung** über mDNS (`_mieleathome._tcp`).
- **Live-Zustände** aller unterstützten Geräteklassen (Waschmaschine, Trockner,
  Spülmaschine, Backofen, Dampfgarer, Kochfeld, Kaffeevollautomat u. v. m.) mit Klartext-Dekodierung
  von Status, Programm und Phase.
- **Echtzeit-Aktualisierungen** über den SuperVision-Push-Kanal (optional), mit Polling als
  zuverlässigem Fallback.
- **Steuerung** (optional): Start/Stop/Pause, Licht, Ein/Aus über beschreibbare Datenpunkte –
  sofern „MobileStart / Fernsteuerung" am Gerät aktiviert ist.

## Installation

1. Adapter installieren und Instanz anlegen.
2. Im Tab **Login** das Land wählen und der folgenden 3-Schritte-Anleitung folgen.
3. Die abgefangene `miele://…`-Weiterleitungsadresse einfügen und auf **GroupKey abrufen** klicken.
   GroupID und GroupKey werden sicher gespeichert (GroupKey verschlüsselt).
4. Speichern. Der Adapter findet die Geräte per mDNS und legt die Datenpunkte an.

### Schritt-für-Schritt: Weiterleitungs-URL abfangen

Da die finale `miele://`-Adresse ein mobiles App-Protokoll ist, können Desktop-Browser sie nicht
automatisch öffnen und bleiben bei einem sich drehenden Laderad stehen. Fange die URL mit den
Entwicklertools (DevTools) deines Browsers ab:

1. **Entwicklertools vorbereiten:** Klicke auf **Login-Seite öffnen**, um den Login in einem neuen Tab
   zu öffnen. Drücke in dem neuen Tab **F12** (Entwicklertools) und wechsle auf den Reiter **Netzwerk**
   (Network). Aktiviere die dauerhafte Protokollierung:
   - **Chrome / Edge / Brave:** Haken bei **Log beibehalten** (*Preserve log*) setzen.
   - **Firefox:** Auf das Zahnrad-Symbol ⚙️ klicken und **Protokolle dauerhaft anzeigen** (*Persist Logs*) aktivieren.
2. **Anmelden:** E-Mail und Passwort deines Miele-App-Kontos eingeben und die Anmeldung abschicken.
   *Hinweis:* Die Seite bleibt bei einem Laderad stehen (oder meldet einen Ladefehler) – das ist völlig
   normal und signalisiert Erfolg.
3. **Kopieren & Einbinden:** Im Netzwerk-Tab (F12) ganz nach unten zur letzten (meist rot markierten)
   Zeile scrollen. Sie beginnt mit `redirect?redirect_uri=miele...` oder `miele://oauth2-code/...`.
   Mache einen Rechtsklick auf diese Zeile → **URL kopieren** (bzw. **Link-Adresse kopieren**). Füge sie
   in das Feld **miele://-Redirect-URL** im ioBroker ein und klicke auf **GroupKey abrufen**.

## Benötigte Ports / Firewall

| Richtung | Port | Zweck | Erforderlich |
|---|---|---|---|
| Eingehend | TCP *Push-Port* (Standard 18082) | Geräte senden Echtzeit-Updates an ioBroker | nur bei aktivem Push |
| Ein/Aus | UDP 5353 (mDNS) | Geräteerkennung und Push-Registrierung | ja |
| Ausgehend | TCP 80 → Geräte | Zustände lesen / Steuerbefehle senden | ja |
| Ausgehend | TCP 443 → miele-iot.com | nur beim Login (GroupKey abrufen) | nur beim Login |

Ohne Push ist **kein eingehender Port** erforderlich. ioBroker und die Geräte müssen sich im
selben Broadcast-Segment befinden (keine VLAN-/Docker-Bridge-Trennung), damit mDNS funktioniert.

### Betrieb in Docker (wichtig)

Wenn ioBroker in einem **Docker-Container mit Bridge-Netzwerk** läuft (Standard, z. B. buanet-Image),
kann die automatische **mDNS-Erkennung die Geräte nicht erreichen** – Multicast wird nicht
gebrückt. Die direkte Kommunikation (TCP 80) funktioniert, da sie geroutet wird. In diesem Fall:

- **Geräte-IPs manuell im Tab „Geräte & Polling" eintragen.** Das Polling funktioniert dann normal.
- **Push** funktioniert im Bridge-Netzwerk nicht (die Geräte können den Container nicht erreichen). Für
  Push den Container im **Host-Netzwerk** betreiben (`network_mode: host`) – der Push-Port ist
  dann automatisch erreichbar.

### Wie Push technisch funktioniert

Bei aktiviertem Push führt der Adapter ein **Enrollment** je Gerät durch: `PUT
/Devices/<series>/SuperVision/<own-fab>` (registriert den Adapter als Haushalts-Peer) sowie mehrere
`POST /Subscriptions` mit einer **Callback-URL** `http://<ioBroker-LAN-IP>:<push-port>/…`. Das
Gerät sendet Zustandsänderungen dann unaufgefordert (sub-sekündlich) an diese URL. Die Subscriptions
werden periodisch erneuert. Erreicht das Gerät die Callback-URL nicht, greift der Adapter automatisch
auf Polling zurück.

## Datenschutz

Es werden **keine personenbezogenen Daten** im Adapter gespeichert. GroupID, GroupKey und
Refresh-Token verbleiben ausschließlich in der (verschlüsselten) Instanzkonfiguration bzw. in
ioBroker-Objekten. Es erfolgt keine Datenübertragung an Dritte; im laufenden Betrieb besteht
keine Cloud-Verbindung.

## Datenpunkte (Auszug)

Je Gerät unter `<serial>.info` (statisch/Verbindung), `<serial>.state` (live) und `<serial>.eco`:

- `info.connected` – Erreichbarkeitsstatus (true, wenn Gerät antwortet)
- `state.statusText` / `state.status` – Betriebszustand (Klartext + Rohwert)
- `state.programText` / `state.programId` – Laufendes Programm
- `state.programPhaseText` / `state.programPhase` – Programmphase
- `state.remainingMinutes`, `state.elapsedMinutes`, `state.startInMinutes`
- `state.remainingSeconds`, `state.elapsedSeconds` (sekundengenau via DOP2)
- `state.estimatedEndTime` / `state.estimatedEndTimeText` – Voraussichtliches Programmende
- `state.temperature[Zone2/3]`, `state.targetTemperature[Zone2/3]`
- `state.signalDoor`, `state.signalInfo`, `state.signalFailure`
- `state.mobileStart` – Gibt an, ob MobileStart/Fernsteuerung am Gerät aktiv ist
- `state.light`, `state.spinningSpeed` (Waschmaschine), `state.dryingStepText` (Trockner)
- `eco.energy` (kWh), `eco.energyWh` (Wh), `eco.water` (l) (wo unterstützt)
- `info.techType`, `info.fabNumber`, `info.xkmType`, `info.xkmVersion`, `info.deviceType`

Bei aktivierter Steuerung zusätzlich `<serial>.control.*` (start, stop, pause, powerOn,
powerOff, lightOn, lightOff).

## Kompatibilität / Grenzen

- Getestet an Waschmaschine (WCR860/EK037), Spülmaschine (G5840/EK037) und Backofen (H2469BP/EK057).
- Kühl- und Gefriergeräte sind lokal meist **nur lesbar** (die Firmware lehnt Schreibbefehle ab).
- Steuerbefehle setzen „MobileStart / Fernsteuerung" am Gerät voraus; manche Firmware-Versionen
  beantworten DOP2-Schreibbefehle mit HTTP 404/500.
- Der SuperVision-Push ist eine Best-Effort-Ergänzung; Polling ist der zuverlässige Standardpfad.

## Rechtliche Hinweise / Haftungsausschluss

Dies ist ein **inoffizielles, privat entwickeltes** Projekt und steht in **keiner Verbindung zu
Miele & Cie. KG**. „Miele", „Miele@home" und zugehörige Bezeichnungen sind eingetragene
Marken der Miele & Cie. KG und werden hier nur beschreibend zur Kompatibilitätsangabe verwendet.

Der Adapter nutzt ein lokales Protokoll, das durch **Reverse Engineering** dokumentiert wurde.
Die Nutzung erfolgt **auf eigene Verantwortung**. Die Software wird unter MIT-Lizenz
**ohne Mängelgewähr** bereitgestellt (siehe LICENSE).

## Danksagung

Das lokale Protokoll (`MieleH256`, DOP2, Provisioning) basiert auf der Vorarbeit der
Open-Source-Projekte `MieleRESTServer` (akappner), `home-assistant-miele-mobile` und
`ha-miele-at-lan`.

## Changelog

### **WORK IN PROGRESS**

### 0.2.1 (2026-08-18)
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

### 0.2.1
- Veröffentlichung über GitHub Actions mit npm-Provenance (Trusted Publishing). Keine funktionalen Änderungen.

### 0.2.0
- Umbenennung von `miele-lokal` in `miele-local`: englischer Adaptername und Titel.
  Erste Version unter dem neuen Paketnamen.

[Ältere Einträge sind hier zu finden](CHANGELOG_OLD.md)

## Lizenz

MIT License - Copyright (c) 2026 Immanuel
