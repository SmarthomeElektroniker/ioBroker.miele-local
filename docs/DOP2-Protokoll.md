# DOP2 / MieleH256 — Protokoll- und Leaf-Referenz

Technische Referenz zum lokalen Miele-Protokoll, wie im Adapter umgesetzt. Basis: eigenes
Reverse-Engineering + öffentliche Projekte (akappner/MieleRESTServer, ha-miele-at-lan,
home-assistant-miele-mobile).

## 1. Request-Signierung (MieleH256)

```
canonical =  METHOD + "\n"
          +  HOST + "/" + resource + "\n"
          +  "application/vnd.miele.v1+json; charset=utf-8" + "\n"   (Content-Type)
          +  "application/vnd.miele.v1+json" + "\n"                  (Accept)
          +  Date + "\n"
          +  Body (bei PUT/POST, gepaddet)
signature =  HMAC_SHA256(GroupKey, canonical)  → Hex, GROSSBUCHSTABEN
Header:      Authorization: MieleH256 <GroupID>:<signature>
```
- `Date` wird vom Gerät nicht geprüft (fester Wert möglich).
- GroupKey = 64 Byte. **AES-Key = GroupKey[0:32]**, HMAC-Key = GroupKey[0:64].

## 2. Ver-/Entschlüsselung (AES-256-CBC, kein Auto-Padding)

- **Antwort entschlüsseln:** IV = erste 16 Byte der Signatur aus dem `X-Signature`-Antwortheader.
- **Request-Body verschlüsseln:** IV = erste 16 Byte der Request-Signatur.
- **Padding:** JSON-Bodys auf min. 64 Byte und 16-Byte-Ausrichtung, Leerzeichen VOR `}`.
  Andere Bodys auf die nächste 16-Byte-Grenze mit `0x20`.

## 3. Endpunkte

| Methode | Ressource | Zweck |
|---|---|---|
| GET | `Devices/` | Liste der Geräte-Routen (Seriennummern) |
| GET | `Devices/<serie>/Ident` | Stammdaten (TechType, FabNumber, XKM …) |
| GET | `Devices/<serie>/State` | Live-Zustand (JSON) |
| GET | `Devices/<serie>/DOP2/` | DOP2-Wurzel (Knotenliste) |
| GET | `Devices/<serie>/DOP2/<unit>` | Leaf-Liste eines Knotens |
| GET | `Devices/<serie>/DOP2/<unit>/<attr>?idx1=0&idx2=0` | Leaf-Inhalt (binär, verschlüsselt) |
| PUT | `Devices/<serie>/DOP2/2/1583?idx1=0&idx2=0` | UserRequest (Steuerbefehle) |
| PUT | `Devices/<serie>/SuperVision/<ourFab>` | Push-Peer registrieren (falls unterstützt) |
| POST | `Subscriptions` | Push-Subscription anlegen |
| PUT | `Security/Commissioning/` | Erst-Pairing (nicht genutzt — würde Kopplung ändern) |

## 4. DOP2-Binärformat

Entschlüsselter Leaf:
```
[0..1]  payloadLength (big-endian)
[2..3]  unitId        [4..5] attributeId
[6..7]  (Header-Rest)
[8..]   payload   → payload[3]+payload[4]<<8 = Anzahl Felder, ab payload[5] die Felder
Feld:   [index(1B), type(1B), value(wireLength)]   (Padding 0x00 zwischen Struct-Feldern)
```
Feldtypen (Auszug): 1=bool, 2=U8, 3=S8, 5=U16, 6=S16, 8=U32, 9=S32, 11=U64, 14=float32,
15=float64, 16=struct, 18/32=string, 17/20/21/22/23/25/27=Arrays. Integer sind **Big-Endian**.
„Interpretierte" Felder sind Structs `[mask, value, interpretation]`; Nutzwert = mittleres Sub-Feld.

## 5. Bekannte/genutzte Leaves

| Leaf (unit/attr) | Inhalt |
|---|---|
| `2/1583` | GLOBAL_USER_REQ — Steuerbefehle (PUT, 32-Byte-Payload, Prefix + Opcode) |
| `2/1586` | Combined State (modern) |
| `2/138` | Cycle Counter |
| `2/119` | Hours of Operation |
| `2/6195` | **ProcessData (Waschmaschine)** — Live-Prozess/EcoFeedback |

### UserRequest-Payload (2/1583)
```
Prefix (hex): 00100001062f00000000000100010700
+ 1 Byte Opcode  + 15 Byte 0x20-Padding   → 32 Byte gesamt
```
Opcodes: 0x01 Start, 0x03 Pause, 0x37 Stop, 0x10 SwitchOn, 0x13 SwitchOff, 0x0d LightOn, 0x0e LightOff.

### ProcessData (2/6195, Waschmaschine WCR860 — empirisch)
Feld-Indizes (1-based), Nutzwert = interpretiertes Struct-Sub-Feld:

| Feld | Bedeutung | Skalierung | gegen Cloud verifiziert |
|---|---|---|---|
| #8..#12 | heaterRelay / lyePump / circulationPump / coldWaterValve / hotWaterValve (bool) | — | Bestätigt die Index-Ausrichtung |
| **#25** | Energieverbrauch | Wh (÷1000 → kWh) | 1991 → 1,991 kWh ≈ Cloud 1,9 |
| **#40** | Wasserverbrauch | 0,1 l (÷10 → l) | 953 → 95,3 l ≈ Cloud 96 |

> Achtung: Die in MieleRESTServer dokumentierten Indizes 16/17 (energyConsumed/water) stimmten
> für dieses Modell NICHT. Die korrekten Indizes wurden per Cloud-Abgleich ermittelt und können
> je Modell abweichen — bei neuen Geräten erneut gegen `mielecloudservice` plausibilisieren.

## 6. SuperVision-Push (Enrollment)

1. `PUT /Devices/<serie>/SuperVision/<ourFab>`  Body `{"Show":true,"Signal":true}`
2. `POST /Subscriptions`  Body `{"Resource":"/Devices/<serie>/State/","Callback":"http://<ip>:<port>/Devices/<ourFab>/SuperVision/<serie>/State/"}`
   (je Ressource: `/State/`, `/State/Light/`, `/State/Status/`, `/Ident/`)

Danach POSTet das Gerät Zustandsänderungen an die Callback-URL (AES-verschlüsselt, IV aus
Authorization-Signatur). Voraussetzung: erreichbare LAN-IP (Host-Netz) UND ein Gerät mit
`/SuperVision`-Endpunkt. Basisgeräte (EK037/EK057 hier) liefern 404 → kein Push.

## 7. Beobachtete Fehlercodes

| Code | Bedeutung im Kontext |
|---|---|
| 404 | Endpunkt/Leaf existiert nicht (z. B. `/SuperVision` bei Basisgeräten; 2/6195 am Ofen) |
| 405 | Methode nicht erlaubt (z. B. GET auf `/Security/Commissioning`) |
| 500 | Gerät lehnt Leaf-Read ab (Spülmaschine G5840 bei allen DOP2-Leaf-Reads) |
| 204 | leere/erfolgreiche Antwort (z. B. Push-Empfang) |
