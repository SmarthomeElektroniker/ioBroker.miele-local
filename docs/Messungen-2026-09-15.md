# Was die gesammelten Läufe hergeben — Stand 15.09.2026

Grundlage: 36 Datensätze der Waschmaschine (WCR860), 19 der Spülmaschine (G5840), 6 des Backofens
(H2469BP), dazu 41 / 29 / 12 Zyklen aus der Historie. Alles aus der laufenden Instanz, nichts
nachgerechnet von Hand. Am 11.09. waren es 28 Sätze, und nur die Waschmaschine sammelte.

## 1. Feld 25 und 26 sind Heizenergie und Heizzeit — der Heizstab hat 2020 W

Das Verhältnis **F26 / F25 = 1,7825** ist über 19 Läufe auf **0,07 %** konstant. Nimmt man F25 als
Wattstunden und F26 als Sekunden, folgt daraus die Leistung:

    3600 s/h ÷ 1,7825 = 2020 W

Das ist exakt die Größenordnung eines Waschmaschinen-Heizstabs. Die Gegenprobe stützt es: Eine
Regression der gemessenen Energie allein auf F25 ergibt den Faktor **1,01** — F25 zählt also
tatsächlich in Wattstunden, nicht in einer krummen Einheit.

**Folge:** Zwei ehrliche Messwerte, die der Adapter bisher nur als Rohzahlen mitschreibt, lassen
sich als Datenpunkte führen: Heizenergie (Wh) und Heizzeit (s).

## 2. Der Wasserteiler 200 ist bestätigt

Über 24 vollständige Läufe mit Zählerstand: **Median 200,10 Impulse je Liter, Streuung 1,4 %**
(Spanne 190–206). Die Schätzung des Adapters aus denselben Daten nennt 199,38. Der Vorgabewert 200
(5 ml je Impuls) steht damit auf festem Grund.

## 3. Feld 25/26 bleiben nach kalten Programmen stehen

Bei **3 von 35 Übergängen** trägt der Folgelauf exakt denselben Wert:

| vorher | nachher | F25 / F26 |
|---|---|---|
| Baumwolle Hygiene (60°) | Erstwäsche (30°) | 2020 / 3601 |
| Automatic Plus (40°) | Spülen | 228 / 406 |
| Baumwolle Hygiene (60°) | Feinwäsche (30°) | 2152 / 3836 |

Der Zähler wird also nicht zurückgesetzt, wenn ein Programm nicht heizt. Die Feldsuche rechnet
diese Läufe bisher mit — ein Teil der Erklärung, warum „kein Feld passt zur Energie“. **Vorschlag:**
Läufe überspringen, deren F25/F26 dem Vorgänger gleichen.

## 4. Fünf Läufe haben Wasserzähler 0 trotz Verbrauch — ohne Vermerk

Seide und Erstwäsche melden fünfmal den Zählerstand 0, während die Cloud 17 bis 31 Liter nennt.
Diese Läufe sind **nicht** als unvollständig vermerkt und verfälschen die Feldsuche. Ursache dürfte
der Ablesetakt sein: Kurze Programme enden zwischen zwei Eco-Abfragen (60 s), der Zähler steht beim
Lesen schon wieder auf 0. **Vorschlag:** Zählerstand 0 bei nachgewiesenem Verbrauch als unvollständig
werten, wie es die bestehende Prüfung für Zwischenstände schon tut.

## 5. Die Cloud misst bei der Waschmaschine 10 % zu wenig — bei der Spülmaschine exakt

| Gerät | Läufe | gemessen ÷ Cloud |
|---|---|---|
| Waschmaschine (ab 0,4 kWh) | 6 | **1,105** (Streuung 0,030) |
| Spülmaschine | 4 | **1,002** |

Bei der Waschmaschine liegt Miele durchgehend rund ein Zehntel unter der Steckdose, bei der
Spülmaschine trifft die Cloud auf ein halbes Prozent. Die EcoFeedback-Zahl der Waschmaschine ist
also eine Modellrechnung für den Waschgang, die Nebenverbraucher auslässt; die der Spülmaschine
ist eine Messung. Unter 0,4 kWh dominiert die Rundung auf 0,1 kWh, dort sind Faktoren von 0,67 bis
2,64 zu sehen — diese Läufe taugen als Vergleichswert nicht.

## 6. Die Gesamtenergie lässt sich aus den Feldern NICHT zuverlässig rechnen

Bestes Modell auf 13 gemessenen Läufen: `Wh ≈ 0,675·F25 + 3,47·Dauer(min)` mit **R² = 0,997** — das
klingt gut, täuscht aber: Der mittlere relative Fehler liegt bei **39 %**, weil die großen Läufe die
Anpassung bestimmen. Rechnet man mit einer festen Grundlast, schwankt der nicht geheizte Rest je
Lauf zwischen **0,15 und 4,18 Wh/min**; bei den 60-Grad-Programmen deckt F25 schon 95–99 % der
gemessenen Energie ab, bei 40 Grad nur 34–61 %.

**Fazit:** Für Läufe ab 0,4 kWh liefert `F25 + Grundlast·Dauer` rund 12 % Genauigkeit, für kurze
Programme gar nichts. Die Messsteckdose bleibt die einzige belastbare Gesamtenergie.

## 7. Beladung (Feld 65 ÷ 2 = kg) ist plausibel

Werte in halben Kilo von 0,0 bis **8,0 kg** — genau die Nennlast. Acht Läufe stehen auf 0,0 kg,
davon sieben Seide/Feinwäsche (wenige hundert Gramm). Median je Programm: Pflegeleicht 5,0 kg,
Erstwäsche 3,8 kg, Baumwolle Hygiene 3,0 kg, Seide 0,0 kg. Das passt zu einer Waage.

## 8. Ohne Zeitstempel ist die Zuordnung nicht eindeutig

Der Versuch, jeden Sammlungssatz über Programm + Dauer einem Zyklus zuzuordnen: **19 eindeutig,
12 mehrdeutig, 5 ohne Treffer** (von 36). Genau deshalb tragen neue Datensätze seit dem 15.09.
Start und Ende. Für den Altbestand ließe sich die Zeit nur für die 19 eindeutigen Fälle nachtragen.

## 9. Die anderen beiden Geräte

**Spülmaschine G5840** — keine Rohfelder (der Leaf-Scan bleibt bei 500/404, wie am 11.09.
festgestellt), aber Cloud-Werte:

| Programm | Läufe | Energie | Wasser | Dauer |
|---|---|---|---|---|
| Eco | 16 | 0,60 kWh | 7 l | 247 min |
| Intensiv | 1 | 1,00 kWh | 12 l | 174 min |

Gesamt 29 Programme, 16,8 kWh, 240,6 l. Betriebszeit 7348,7 h.

**Backofen H2469BP** — 12 Zyklen mit Zeiten, aber **kein einziger Energie- oder Wasserwert**: keine
Rohfelder, keine Cloud-Zahl, keine Messsteckdose. Nur „Ober-/Unterhitze“ als Programm. Ohne
Messsteckdose ist hier nichts abzuleiten.

**Waschmaschine gesamt:** 41 Programme, 21,9 kWh, 1885 l.

## Was sich daraus bauen ließe

1. Feldsuche: stehengebliebene F25/F26 überspringen (Punkt 3).
2. Ablesung: Zählerstand 0 bei nachgewiesenem Verbrauch als unvollständig werten (Punkt 4).
3. Neue Datenpunkte Heizenergie (Wh) und Heizzeit (s) aus F25/F26 (Punkt 1).
4. Für den Altbestand die 19 eindeutigen Zeitstempel nachtragen (Punkt 8).

---

# Nachtrag: Warum die Cloud 10 % zu wenig zählt — die Netzspannung

Die Vermutung des Betreibers: Miele rechnet mit 230 V, die tatsächliche Spannung liegt höher,
weil die eigene PV einspeist. Das ist nachgemessen und stimmt.

## Der Beweis: zwölf Heizphasen gegen die gleichzeitige Netzspannung

Aus der Leistungsaufzeichnung der Messsteckdose (3 Tage, 31 636 Punkte) alle Abschnitte über
1500 W herausgesucht und jeder mit der zeitgleich aufgezeichneten Netzspannung
(`modbus.3…35019_Spannung_Ph_A`) verglichen. Ein ohmscher Heizstab folgt P ∝ U², also lässt sich
jede Phase auf 230 V zurückrechnen:

| Beginn | Dauer | gemessene Leistung | Spannung | zurückgerechnet auf 230 V |
|---|---|---|---|---|
| 12.09. 09:15 | 6 min | 2143 W | 238,9 V | 1987 W |
| 12.09. 09:40 | 51 min | 2233 W | 242,3 V | 2012 W |
| 12.09. 11:39 | 13 min | 2097 W | 242,1 V | 1893 W |
| 12.09. 13:27 | 1 min | 2362 W | 245,7 V | 2070 W |
| 13.09. 06:19 | 16 min | 2135 W | 233,5 V | 2071 W |
| 13.09. 08:05 | 14 min | 2010 W | 231,0 V | 1992 W |
| 13.09. 13:39 | 24 min | 2201 W | 235,7 V | 2096 W |
| 13.09. 17:41 | 3 min | 2087 W | 228,1 V | 2122 W |
| 13.09. 18:16 | 4 min | 2103 W | 228,6 V | 2128 W |
| 14.09. 17:13 | 3 min | 2133 W | 238,9 V | 1977 W |

**Mittel über alle zwölf Phasen: 2022 W bei 230 V, Streuung 71 W.** Der aus F26/F25 abgeleitete
Rechenwert von Miele ist **2020 W** — Abweichung **0,1 %**.

Damit ist beides belegt: Der Heizstab ist ein ohmscher Verbraucher mit 2020 W Nennleistung bei
230 V, und die Zahl, mit der Miele rechnet, ist genau diese Nennleistung.

## Warum daraus zwangsläufig zu wenig herauskommt

Das Gerät heizt auf eine Zieltemperatur. Die dafür nötige Energie hängt an Wassermenge und
Temperaturhub, nicht an der Spannung — bei höherer Spannung ist das Wasser nur **schneller** warm.
Miele multipliziert aber die **tatsächlich verkürzte** Heizzeit mit der **Nennleistung**:

    Miele        = 2020 W × t
    tatsächlich  = 2020 W × (U/230)² × t

Die Anzeige liegt also um genau (U/230)² zu niedrig. Gegenprobe an den sechs großen Waschgängen:
beobachteter Faktor **1,105** im Mittel, aus der Spannung erwartet **1,091**. Das deckt sich auf
1,3 Prozentpunkte.

Ein Zusammenhang je einzelnem Waschgang ist in den Daten nicht zu sehen (r = −0,81, von den
kleinen Läufen getrieben). Das ist erwartbar: Die Cloud rundet auf 0,1 kWh, was bei 0,1-kWh-Läufen
Faktoren zwischen 0,67 und 2,64 erzeugt; die Durchschnittsspannung über ein ganzes Programm ist
nicht die Spannung während der Heizphase; und Motor und Pumpe sind keine ohmschen Verbraucher.

## Wie weit die Spannung geht

Aufzeichnung 1. bis 15.09.2026: **224,3 bis 253,6 V** am Wechselrichter, am Shelly der
Außenzähler bis **256,1 V**. Die Angabe des Betreibers, mittags gehe es bis 253 V hoch, steht
damit in den Daten. Bei 253 V zieht der Heizstab 2020 × (253/230)² = **2444 W**, also **21 %**
mehr, als Miele in die Rechnung einsetzt.

## Was das für die Bewertung bedeutet

1. Die EcoFeedback-Energie der Waschmaschine ist kein Messwert, sondern ein Modell für 230 V.
   Der Fehler ist systematisch und mit der Netzspannung berechenbar.
2. Die Spülmaschine trifft dagegen auf 0,2 % genau (4 Läufe). Sie kann also nicht nach demselben
   Muster rechnen — dort steckt entweder eine Messung dahinter oder eine feste Tabelle je
   Programm. Das wäre der nächste Punkt, den man prüfen könnte.
3. Für den Adapter ließe sich die Heizenergie aus F25 mit der gemessenen Spannung korrigieren:
   `Heizenergie = F25 × (U/230)²`. Voraussetzung ist eine Spannungsquelle in der Konfiguration;
   ohne sie bleibt F25 der 230-V-Modellwert.
