'use strict';

/*
 * Aus gesammelten Zyklen ableiten, welches Feld Energie und Wasser traegt.
 *
 * WOZU
 * Die Feldindizes des Eco-Leaf (DOP2 2/6195) sind nicht dokumentiert. Sie wurden durch
 * Vergleich mit der Cloud erschlossen, gelten fuer eine Baureihe und koennen sich mit einem
 * Firmware-Update verschieben, ohne dass es jemand ankuendigt. Solange die Cloud noch
 * antwortet, gibt es einen unabhaengigen Massstab - dieser Modul nutzt ihn, um die
 * Zuordnung zu BELEGEN statt sie zu glauben.
 *
 * WAS DIESE SUCHE FRUEHER GEFUNDEN HAETTE
 * Der Adapter las das Wasser bis zum 28.08.2026 aus Feld 40 und meldete zehn Tage lang
 * unveraendert 95,3 l - fuer Seide (36 min) genauso wie fuer Baumwolle (214 min).
 * Aufgefallen ist es nur, weil jemand den Wert in der App merkwuerdig fand. Ein Feld, das
 * ueber alle Zyklen denselben Wert traegt, waehrend der Vergleichswert schwankt, kann diese
 * Groesse nicht sein - das ist die erste und wichtigste Regel hier.
 *
 * Ebenso die Energie: F25 und F26 stehen waehrend des ganzen Programms still und tragen
 * bestenfalls den zuletzt abgeschlossenen Lauf. Am 29.08.2026 ueber einen Waschgang von
 * 4:16 h gemessen - Shelly 1,884 kWh, Cloud 2 kWh, F25 dagegen 2,077 kWh unveraendert seit
 * dem Vorlauf.
 *
 * WAS DIESER MODUL NICHT TUT
 * Er entscheidet nichts. Er liefert eine Rangfolge mit Belegzahlen; ob eine Zuordnung
 * uebernommen wird, bleibt eine Entscheidung des Menschen davor. Eine automatisch
 * umgestellte Feldzuordnung waere genau die Art Aenderung, die niemand bemerkt, bis die
 * Jahresstatistik nicht mehr stimmt.
 */

/**
 * Teiler, mit denen die Suche zuerst rechnet - die gewohnten Zehnerstufen.
 *
 * SIE REICHEN NICHT, und das ist am 04.09.2026 teuer aufgefallen: Feld 21 der WCR860 traegt
 * den Wasserverbrauch mit dem Teiler 200 (fuenf Milliliter je Zaehlschritt). Gegen die feste
 * Liste geprueft, kam es auf 80 Prozent Abweichung und landete unter "passt nicht" - dabei
 * trifft es mit dem richtigen Teiler auf 0,5 Prozent genau. Deshalb wird der Teiler
 * inzwischen AUS DEN DATEN bestimmt (siehe freierTeiler); diese Liste dient nur noch als
 * Rueckfall, wenn zu wenige Zyklen fuer eine eigene Schaetzung vorliegen.
 */
const TEILER = [1, 10, 100, 1000];

/** Unter so vielen Vergleichszyklen ist jede Aussage Zufall. */
const MIN_ZYKLEN = 3;

/**
 * Ab welcher mittleren Abweichung ein Feld noch als Treffer gilt.
 *
 * Zehn Prozent klingt grosszuegig, ist es aber nicht: Die Cloud rundet (sie liefert "2 kWh"
 * fuer 1,884 gemessene), und zwischen dem lokalen Abruf und dem Cloud-Stand liegen Minuten.
 * Wer hier auf ein Prozent geht, verwirft die richtige Zuordnung wegen der Rundung.
 */
const TREFFER_GRENZE = 0.10;

/** Zahl aus einem Feldwert machen - Bigint, String und Verschachteltes verkraften. */
function alsZahl(v) {
    if (v == null) return null;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Die Vergleichswerte eines Datensatzes - Cloud bevorzugt, sonst die Ablesung aus der App.
 *
 * Die Cloud zuerst, weil sie ohne Zutun kommt und deshalb bei jedem Zyklus da ist. Die
 * manuelle Ablesung ist genauer, aber es gibt sie nur, wo jemand hingesehen hat.
 */
function vergleichswert(satz, groesse) {
    for (const quelle of ['cloud', 'manuell']) {
        const w = satz[quelle] && alsZahl(satz[quelle][groesse]);
        if (w != null && w > 0) return { wert: w, quelle };
    }
    return null;
}

/**
 * Ein einzelnes Feld gegen die Vergleichswerte halten.
 *
 * @param {Array}  saetze  Datensaetze mit .felder und .cloud/.manuell
 * @param {string} index   Feldindex als Schluessel in .felder
 * @param {string} groesse 'waterL' oder 'energyKwh'
 * @returns {object|null}  Bewertung oder null, wenn zu wenige Zyklen
 */
function feldPruefen(saetze, index, groesse) {
    const paare = [];
    let leer = 0;
    for (const satz of saetze) {
        const v = vergleichswert(satz, groesse);
        if (!v) continue;
        const roh = alsZahl(satz.felder && satz.felder[index]);
        if (roh == null) continue;
        /*
         * Eine Null heisst "nichts geliefert", nicht "null Liter".
         *
         * Am 04.09.2026 an der WCR860 nachgezaehlt: F25 und F26 standen in sieben von elf
         * Zyklen auf 0, obwohl die Cloud fuer denselben Lauf Werte hatte - die Maschine
         * setzt sie zurueck, und der Abruf trifft sie oft erst danach. Wer diese Nullen
         * mitrechnet, gibt jedem Feld 100 Prozent Abweichung und macht damit auch das
         * richtige Feld unbrauchbar. Sie werden gezaehlt und ausgewiesen, aber nicht
         * bewertet: Ein Feld, das meistens leer ist, taugt nicht - das sagt die Zahl
         * [leer] deutlicher als eine verrechnete Abweichung.
         */
        if (roh === 0) { leer++; continue; }
        paare.push({ roh, soll: v.wert });
    }
    if (paare.length < MIN_ZYKLEN) {
        // Ein Feld, das fast immer leer ist, verdient trotzdem einen Vermerk - sonst
        // verschwindet es kommentarlos aus der Rangfolge.
        if (leer >= MIN_ZYKLEN) {
            return { index, teiler: null, abweichung: null, zyklen: paare.length, leer,
                     konstant: false, taugt: false,
                     grund: `Feld steht in ${leer} von ${leer + paare.length} Zyklen auf 0` };
        }
        return null;
    }

    /*
     * Ein Feld, das sich nie aendert, kann keine Groesse sein, die sich aendert.
     *
     * Das ist die Regel, an der Feld 40 mit seinen konstanten 95,3 l gescheitert waere. Sie
     * greift nur, wenn der Vergleichswert selbst schwankt - liefen zufaellig drei gleiche
     * Programme hintereinander, ist auch ein konstantes Feld kein Widerspruch.
     */
    const rohWerte = paare.map(p => p.roh);
    const sollWerte = paare.map(p => p.soll);
    const rohKonstant = new Set(rohWerte).size === 1;
    const sollKonstant = new Set(sollWerte).size === 1;
    if (rohKonstant && !sollKonstant) {
        return { index, teiler: null, abweichung: null, zyklen: paare.length, leer,
                 konstant: true, taugt: false,
                 grund: `Feld steht konstant auf ${rohWerte[0]}, waehrend der Vergleichswert schwankt` };
    }

    /*
     * Und die Umkehrung: Schwankt der VERGLEICHSWERT nicht, ist nichts bewiesen.
     *
     * Drei Zyklen mit demselben Sollwert und demselben Rohwert ergeben rechnerisch null
     * Prozent Abweichung - und sagen nichts. Eine Zuordnung entsteht daraus, dass ein Feld
     * der Groesse FOLGT; wo die Groesse stillsteht, kann ihr nichts folgen.
     *
     * Am 08.09.2026 an der WCR860 aufgefallen: Feld 60 stand in 22 von 25 Zyklen auf 0 und
     * in dreien auf 1 - und genau diese drei waren die Zyklen mit 0,1 kWh. Die Feldsuche
     * meldete "Feld 60 geteilt durch 10 passt auf 0,0 Prozent genau". Es ist ein Merker, kein
     * Zaehler; die drei Zyklen waren ueberdies verlorene Ablesungen.
     */
    if (sollKonstant) {
        return { index, teiler: null, abweichung: null, zyklen: paare.length, leer,
                 konstant: rohKonstant, taugt: false, unentschieden: true,
                 grund: `alle ${paare.length} brauchbaren Zyklen haben denselben Vergleichswert `
                      + `(${sollWerte[0]}) - daraus laesst sich nichts ablesen` };
    }

    /*
     * Den Teiler aus den Daten schaetzen, statt ihn zu raten.
     *
     * Ist ein Feld die gesuchte Groesse in einer anderen Einheit, dann ist das Verhaeltnis
     * Feldwert zu Vergleichswert ueber alle Zyklen KONSTANT - und genau dieses Verhaeltnis
     * ist der Teiler. Der Mittelwert ist damit der beste Schaetzer, den es gibt, und er
     * findet auch krumme Teiler wie die 200 von Feld 21.
     *
     * Die feste Liste bleibt zusaetzlich im Rennen: Bei wenigen Zyklen kann der geschaetzte
     * Teiler daneben liegen, und ein glatter Zehnerwert ist dann die plausiblere Antwort.
     * Gewonnen hat am Ende, was die kleinste Abweichung ergibt.
     */
    const verhaeltnisse = paare.map(p => p.roh / p.soll);
    const geschaetzt = verhaeltnisse.reduce((a, b) => a + b, 0) / verhaeltnisse.length;
    const kandidaten = geschaetzt > 0 ? [...TEILER, geschaetzt] : TEILER;

    let bester = null;
    for (const teiler of kandidaten) {
        const fehler = paare.map(p => Math.abs(p.roh / teiler - p.soll) / p.soll);
        const mittel = fehler.reduce((a, b) => a + b, 0) / fehler.length;
        const groesster = Math.max(...fehler);
        if (!bester || mittel < bester.abweichung) {
            // Krumme Teiler auf zwei Stellen runden - "199.44" liest sich als das, was es
            // ist: eine Schaetzung fuer 200.
            bester = { teiler: Math.round(teiler * 100) / 100,
                       abweichung: mittel, groessteAbweichung: groesster };
        }
    }
    return {
        index,
        teiler: bester.teiler,
        abweichung: bester.abweichung,
        groessteAbweichung: bester.groessteAbweichung,
        zyklen: paare.length,
        leer,
        konstant: rohKonstant,
        taugt: bester.abweichung <= TREFFER_GRENZE,
    };
}

/**
 * Alle Felder bewerten und nach Eignung sortieren.
 *
 * @returns {Array} Bewertungen, bester Treffer zuerst; untaugliche ans Ende
 */
function felderBewerten(saetze, groesse) {
    const liste = Array.isArray(saetze) ? saetze : [];
    const indizes = new Set();
    for (const satz of liste) {
        for (const k of Object.keys((satz && satz.felder) || {})) indizes.add(k);
    }
    const bewertet = [];
    for (const index of indizes) {
        const b = feldPruefen(liste, index, groesse);
        if (b) bewertet.push(b);
    }
    return bewertet.sort((a, b) => {
        if (a.taugt !== b.taugt) return a.taugt ? -1 : 1;
        if (a.abweichung == null) return 1;
        if (b.abweichung == null) return -1;
        return a.abweichung - b.abweichung;
    });
}

/**
 * Wie viele Zyklen taugen ueberhaupt zum Vergleich?
 *
 * Ohne diese Zahl liesse sich ein Ergebnis nicht einordnen: "Feld 26 passt" heisst etwas
 * anderes bei drei Zyklen als bei dreissig.
 */
function belegbar(saetze, groesse) {
    return (Array.isArray(saetze) ? saetze : [])
        .filter(s => vergleichswert(s, groesse) != null).length;
}

/**
 * Das Ergebnis in einem Satz - fuer den Datenpunkt, den ein Mensch liest.
 *
 * @param {Array} saetze      gesammelte Zyklen
 * @param {object} eingestellt aktuell konfigurierte Indizes {energie, wasser, wasserTeiler}
 */
function befund(saetze, eingestellt = {}) {
    const zeilen = [];
    for (const [groesse, beschriftung, gesetzt] of [
        ['energyKwh', 'Energie', eingestellt.energie],
        ['waterL', 'Wasser', eingestellt.wasser],
    ]) {
        const n = belegbar(saetze, groesse);
        if (n < MIN_ZYKLEN) {
            zeilen.push(`${beschriftung}: ${n} Zyklen mit Vergleichswert - mindestens ${MIN_ZYKLEN} noetig.`);
            continue;
        }
        const rang = felderBewerten(saetze, groesse);
        const beste = rang.filter(b => b.taugt);
        if (!beste.length) {
            const nah = rang.find(b => b.abweichung != null);
            zeilen.push(`${beschriftung}: kein Feld passt zu den ${n} Vergleichswerten`
                + (nah ? ` (am naechsten Feld ${nah.index} mit ${(nah.abweichung * 100).toFixed(0)} % Abweichung)` : '')
                + '.');
            continue;
        }
        const b = beste[0];
        const teil = `${beschriftung}: Feld ${b.index}`
            + (b.teiler !== 1 ? ` geteilt durch ${b.teiler}` : '')
            + ` passt auf ${(b.abweichung * 100).toFixed(1)} % genau (${b.zyklen} Zyklen)`;
        const konflikt = gesetzt != null && String(gesetzt) !== String(b.index)
            ? ` - eingestellt ist aber Feld ${gesetzt}` : '';
        const zweiter = beste.length > 1
            ? `; auch Feld ${beste[1].index} passt (${(beste[1].abweichung * 100).toFixed(1)} %), die Zuordnung ist noch nicht eindeutig` : '';
        zeilen.push(teil + konflikt + zweiter + '.');
    }

    /*
     * Haengt das EINGESTELLTE Feld starr an einem anderen, ist das eine Warnung fuer sich.
     *
     * Sie steht auch dann da, wenn oben schon "kein Feld passt" gemeldet wurde - denn sie
     * sagt etwas anderes: nicht "die Zuordnung ist unbelegt", sondern "die Zuordnung kann
     * gar nicht stimmen". Feld 26 war als Wasser eingestellt und ist in Wahrheit das
     * 1,782-fache des Energiefelds.
     */
    const gekoppelt = starrGekoppelt(saetze);
    for (const [beschriftung, gesetzt] of [['Energie', eingestellt.energie],
                                           ['Wasser', eingestellt.wasser]]) {
        if (gesetzt == null) continue;
        const p = gekoppelt.find(x => String(x.a) === String(gesetzt) || String(x.b) === String(gesetzt));
        if (!p) continue;
        const anderes = String(p.a) === String(gesetzt) ? p.b : p.a;
        zeilen.push(`Achtung: Das fuer ${beschriftung} eingestellte Feld ${gesetzt} steht in `
            + `festem Verhaeltnis zu Feld ${anderes} (Faktor ${p.verhaeltnis}, ${p.zyklen} Zyklen) `
            + `- es traegt damit keine eigene Messung, sondern eine Umrechnung.`);
    }
    return zeilen.join(' ');
}

/**
 * Felder finden, die nur ein festes Vielfaches eines anderen sind.
 *
 * WOZU DAS GEHOERT
 * Am 04.09.2026 an der WCR860 aufgefallen: Feld 26 war ueber alle Zyklen exakt das
 * 1,782-fache von Feld 25 - bei 319/568, 386/688, 2071/3692, 1593/2840, 770/1372. Ein
 * solches Feld traegt keine eigene Messung, sondern eine Umrechnung derselben Groesse
 * (Kosten, CO2, eine andere Einheit).
 *
 * DAS SCHLIESST EINE ZUORDNUNG AUS. Wasser und Energie stehen in keinem festen Verhaeltnis
 * zueinander - dieselben Zyklen brauchten 48,5 l/kWh (Baumwolle Hygiene) und 73,6 l/kWh
 * (Baumwolle). Wenn ein Feld also starr am Energiefeld haengt, kann es nicht das Wasser
 * sein, egal wie gut ein Teiler es zufaellig passend macht. Genau als Wasser war Feld 26
 * aber eingestellt.
 *
 * @param {number} [toleranz=0.01] wie stark das Verhaeltnis schwanken darf (1 Prozent)
 * @returns {Array} Paare {a, b, verhaeltnis, zyklen}
 */
function starrGekoppelt(saetze, toleranz = 0.01) {
    const liste = Array.isArray(saetze) ? saetze : [];
    const indizes = [...new Set(liste.flatMap(s => Object.keys((s && s.felder) || {})))];
    const paare = [];
    for (let i = 0; i < indizes.length; i++) {
        for (let j = i + 1; j < indizes.length; j++) {
            const verhaeltnisse = [];
            for (const satz of liste) {
                const a = alsZahl(satz.felder && satz.felder[indizes[i]]);
                const b = alsZahl(satz.felder && satz.felder[indizes[j]]);
                // Nullen tragen kein Verhaeltnis - siehe feldPruefen.
                if (!a || !b) continue;
                verhaeltnisse.push(b / a);
            }
            if (verhaeltnisse.length < MIN_ZYKLEN) continue;
            const mittel = verhaeltnisse.reduce((x, y) => x + y, 0) / verhaeltnisse.length;
            // Ein Verhaeltnis von 1 ist keine Erkenntnis, sondern ein doppeltes Feld.
            const spanne = Math.max(...verhaeltnisse) - Math.min(...verhaeltnisse);
            if (mittel > 0 && spanne / mittel <= toleranz) {
                paare.push({ a: indizes[i], b: indizes[j],
                             verhaeltnis: Math.round(mittel * 10000) / 10000,
                             zyklen: verhaeltnisse.length });
            }
        }
    }
    return paare.sort((x, y) => y.zyklen - x.zyklen);
}

module.exports = { TEILER, MIN_ZYKLEN, TREFFER_GRENZE, alsZahl, vergleichswert,
                   feldPruefen, felderBewerten, belegbar, befund, starrGekoppelt };
