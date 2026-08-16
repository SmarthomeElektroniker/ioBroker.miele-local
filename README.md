![Logo](admin/miele-lokal.png)

# ioBroker.miele-lokal

[![NPM version](https://img.shields.io/npm/v/iobroker.miele-lokal.svg)](https://www.npmjs.com/package/iobroker.miele-lokal)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Mit diesem Adapter verbinden Sie moderne **Miele@Home**-Geräte **lokal ohne Internet**.
Der Adapter spricht das lokale Miele-Protokoll (`MieleH256` / DOP2) direkt über das LAN –
kein Cloud-Konto im laufenden Betrieb, kein Umweg über die Miele-3rd-Party-API.

> Die einmalige **Anmeldung** mit dem Miele-Konto dient nur dazu, den haushaltsweiten
> lokalen Schlüssel (GroupID/GroupKey) zu ermitteln. Danach läuft der Adapter offline,
> und die Miele-App funktioniert unverändert weiter.

## Funktionen

- **Automatische Ermittlung der Zugangsdaten** über einen geführten Login (Cloud-OAuth),
  ohne Neu-Provisionierung der Geräte.
- **Automatische Geräteerkennung** per mDNS (`_mieleathome._tcp`).
- **Live-Zustände** aller unterstützten Geräteklassen (Waschmaschine, Trockner,
  Spülmaschine, Backofen, Dampfgarer, Kochfeld, Kaffeevollautomat u. a.) mit
  Klartext-Dekodierung von Status, Programm und Phase.
- **Echtzeit-Updates** über den SuperVision-Push-Kanal (optional) mit Polling als
  zuverlässigem Fallback.
- **Steuerung** (optional): Start/Stop/Pause, Licht, Ein/Aus über beschreibbare
  Datenpunkte – sofern das Gerät „MobileStart/Fernsteuerung" freigegeben hat.

## Installation

1. Adapter installieren und eine Instanz anlegen.
2. Im Tab **Anmeldung** Land wählen und **Login-Seite öffnen** – im Browser mit dem
   Miele-Konto anmelden. Der Browser wird am Ende auf eine `miele://…`-Adresse
   umgeleitet (blockiert); diese vollständige Adresse kopieren.
3. Die `miele://…`-Adresse einfügen und **GroupKey ermitteln**. GroupID/GroupKey werden
   (GroupKey verschlüsselt) gespeichert.
4. Speichern. Der Adapter findet die Geräte per mDNS und legt die Datenpunkte an.

### Redirect-URL abgreifen

Der Browser kann die finale `miele://`-Adresse nicht selbst öffnen – das ist erwartet.
Die vollständige Adresse (`miele://oauth2-code/?code=…&state=…`) bekommt man so – **eine
Methode genügt**:

- **Einfach – über den „Öffnen mit"-Dialog:** Fragt der Browser, die Adresse „mit einer
  Anwendung öffnen", übergibt er die komplette `miele://`-Adresse an diese App. Öffnet man
  sie z. B. mit einem Texteditor (Linux: kate/gedit; Windows: Editor; macOS: TextEdit),
  steht die vollständige Adresse dort im Titel/Dateinamen bzw. im Text – von dort kopieren.
  Den eigentlichen Öffnen-Vorgang kann man abbrechen.
- **Zuverlässig – über DevTools:** Vor dem Login DevTools öffnen (F12) → Reiter „Netzwerk",
  „Preserve log" aktivieren. Nach dem Login die letzte Anfrage suchen, deren Adresse mit
  `miele://` beginnt bzw. `…/de/redirect?…&code=…` enthält → Rechtsklick → „Adresse des
  Links kopieren".

Beide liefern denselben Text mit `code=` und `state=`; der Adapter akzeptiert beide Formen.

## Benötigte Ports / Firewall

| Richtung | Port | Zweck | Pflicht |
|---|---|---|---|
| eingehend | TCP *Push-Port* (Standard 18082) | Geräte senden Echtzeit-Updates an ioBroker (Callback-Ziel) | nur bei aktiviertem Push |
| ein/aus | UDP 5353 (mDNS) | Geräte-Discovery und Push-Anmeldung | ja |
| ausgehend | TCP 80 → Geräte | Zustände lesen / Steuerbefehle | ja |
| ausgehend | TCP 443 → miele-iot.com | nur während der Anmeldung (GroupKey holen) | nur Login |

Ohne Push ist **kein eingehender Port** nötig. ioBroker und die Geräte müssen sich im
selben Broadcast-Segment befinden (kein VLAN-/Docker-Bridge-Trennung), damit mDNS
funktioniert.

### Betrieb in Docker (wichtig)

Läuft ioBroker in einem **Docker-Container mit Bridge-Netzwerk** (Standard, z. B. das
buanet-Image), erreicht die automatische **mDNS-Suche die Geräte nicht** – Multicast wird
nicht über die Bridge gebrückt. Die direkte Kommunikation (TCP 80) funktioniert dagegen,
da sie geroutet wird. In diesem Fall:

- **Geräte-IPs im Tab „Geräte & Abfrage" manuell eintragen.** Dann läuft das Polling normal.
- **Push** funktioniert im Bridge-Netz nicht (die Geräte können den Container nicht
  erreichen). Für Push den Container im **Host-Netzwerk** betreiben (`network_mode: host`) –
  dann ist der Push-Port automatisch offen. Im Bridge-Netz zusätzlich `-p 18082:18082`
  mappen, doch die Callback-Rückadresse liegt hinter NAT, daher bleibt Push dort unzuverlässig.

### Wie Push funktioniert (technisch)

Bei aktiviertem Push führt der Adapter pro Gerät ein **Enrollment** durch: `PUT
/Devices/<serie>/SuperVision/<eigene-fab>` (registriert den Adapter als Peer) und mehrere
`POST /Subscriptions` mit einer **Callback-URL** `http://<ioBroker-LAN-IP>:<Push-Port>/…`.
Das Gerät sendet danach Zustandsänderungen unaufgefordert an diese URL (sub-sekunde). Die
Subscriptions werden periodisch erneuert. Erreicht das Gerät die Callback-URL nicht (Bridge-NAT),
kommen keine Pushes an – der Adapter fällt dann auf Polling zurück.

## Datenschutz

Es werden **keine persönlichen Daten** im Adapter hinterlegt. GroupID, GroupKey und
Refresh-Token liegen ausschließlich in der (verschlüsselten) Instanz-Konfiguration bzw.
in ioBroker-Objekten. Es findet keine Übertragung an Dritte statt; im Normalbetrieb
besteht keine Cloud-Verbindung.

## Datenpunkte (Auszug)

Pro Gerät unter `<serial>.info` (statisch) und `<serial>.state` (live):

- `state.statusText` / `state.status` – Betriebszustand (Klartext + Rohwert)
- `state.programText` / `state.programId` – laufendes Programm
- `state.programPhaseText` / `state.programPhase` – Programmphase
- `state.remainingMinutes`, `state.elapsedMinutes`, `state.startInMinutes`
- `state.temperature[Zone2/3]`, `state.targetTemperature[Zone2/3]`
- `state.signalDoor`, `state.signalInfo`, `state.signalFailure`
- `state.mobileStart` – ist Fernsteuerung am Gerät freigegeben
- `state.light`, `state.spinningSpeed` (Waschmaschine), `state.dryingStepText` (Trockner)
- `info.techType`, `info.fabNumber`, `info.xkmType`, `info.xkmVersion`, `info.deviceType`

Bei aktivierter Steuerung zusätzlich `<serial>.control.*` (start, stop, pause, powerOn,
powerOff, lightOn, lightOff).

## Kompatibilität / Grenzen

- Getestet gegen Waschmaschine (WCR860/EK037), Spülmaschine (G5840/EK037) und
  Backofen (H2469BP/EK057).
- Kühl-/Gefriergeräte sind lokal in der Regel **nur lesbar** (Firmware lehnt
  Schreibbefehle ab).
- Steuerbefehle erfordern „MobileStart/Fernsteuerung" am Gerät; manche Firmwares
  beantworten DOP2-Schreibzugriffe mit HTTP 404/500.
- Der SuperVision-Push ist eine Best-Effort-Ergänzung; das Polling ist der zuverlässige
  Standardweg.

## Rechtliches / Haftungsausschluss

Dies ist ein **inoffizielles, privat entwickeltes** Projekt und steht in **keiner
Verbindung zur Miele & Cie. KG** und wird von dieser weder unterstützt noch geprüft.
„Miele", „Miele@home" und zugehörige Namen sind Marken der Miele & Cie. KG und werden
hier ausschließlich beschreibend zur Angabe der Kompatibilität verwendet.

Der Adapter nutzt ein durch **Reverse Engineering** öffentlich dokumentiertes lokales
Protokoll. Die Nutzung erfolgt **auf eigenes Risiko**; sie kann je nach Gerät/Firmware
Garantie- oder Gewährleistungsansprüche berühren. Die Software wird gemäß der
MIT-Lizenz **ohne jede Gewährleistung** bereitgestellt (siehe LICENSE). Der Autor haftet
nicht für Schäden an Geräten, Daten oder sonstige Folgen der Nutzung.

## Danksagung

Das lokale Protokoll (`MieleH256`, DOP2, Provisioning) basiert auf den öffentlichen
Reverse-Engineering-Arbeiten der Projekte `MieleRESTServer` (akappner),
`home-assistant-miele-mobile` und `ha-miele-at-lan`.

## Changelog

### 0.1.0
- Erste Version: Login/GroupKey-Ermittlung, mDNS-Discovery, State-Polling mit
  Enum-Dekodierung, optionaler SuperVision-Push, optionale Steuerung.

## License

MIT © 2026 Immanuel
