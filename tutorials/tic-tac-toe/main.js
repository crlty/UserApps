// ===================================================
// Tic-Tac-Toe – Server-Logik (main.js)
// ===================================================

// Hier speichern wir das aktuelle Spiel und die Warteschlange
var warteschlange = null;   // User-Objekt des wartenden Spielers
var aktuellesSpiel = null;  // Objekt mit allen Infos zum laufenden Spiel

// =============================================
// App-Objekt mit Hooks und Chat-Befehlen
// =============================================

var App = {

    onAppStart: function() {
        var logger = KnuddelsServer.getDefaultLogger();
        logger.info('Tic-Tac-Toe App gestartet!');

        // Bestenliste (Toplist) anlegen
        var toplistAccess = KnuddelsServer.getToplistAccess();
        toplistAccess.createOrUpdateToplist('ttt_siege', 'Tic-Tac-Toe Siege', {
            ascending: false
        });
    },

    onShutdown: function() {
        // Aufräumen beim Beenden
        warteschlange = null;
        aktuellesSpiel = null;
    },

    // =============================================
    // Chat-Befehle
    // =============================================

    chatCommands: {
        // /ttt – Öffnet die App
        ttt: function(user, params, command) {
            oeffneApp(user);
        },
        // /tttplay – Spiel beitreten oder Warteschlange betreten
        tttplay: function(user, params, command) {
            spielBeitreten(user);
        },
        // /ttttop – Bestenliste anzeigen
        ttttop: function(user, params, command) {
            oeffneApp(user);
        }
    },

    // =============================================
    // Events vom Client empfangen
    // =============================================

    onEventReceived: function(user, type, data, appContentSession) {
        if (type === 'zug') {
            zugVerarbeiten(user, data.position);
        } else if (type === 'getToplist') {
            toplistSenden(user, appContentSession);
        } else if (type === 'spielBeitreten') {
            spielBeitreten(user);
        }
    },

    // =============================================
    // Nutzer verlässt den Channel
    // =============================================

    onUserLeft: function(user) {
        // Aus der Warteschlange entfernen
        if (warteschlange !== null && warteschlange.getUserId() === user.getUserId()) {
            warteschlange = null;
            return;
        }

        // Laufendes Spiel abbrechen
        if (aktuellesSpiel !== null) {
            if (aktuellesSpiel.spielerX.getUserId() === user.getUserId() ||
                aktuellesSpiel.spielerO.getUserId() === user.getUserId()) {

                var andererSpieler = aktuellesSpiel.spielerX.getUserId() === user.getUserId()
                    ? aktuellesSpiel.spielerO
                    : aktuellesSpiel.spielerX;

                andererSpieler.sendPrivateMessage(
                    'Dein Gegner hat den Channel verlassen. Das Spiel wurde abgebrochen.'
                );

                var sessions = andererSpieler.getAppContentSessions(AppViewMode.Popup);
                for (var i = 0; i < sessions.length; i++) {
                    sessions[i].sendEvent('spielAbgebrochen', {});
                }

                aktuellesSpiel = null;
            }
        }
    }
};

// =============================================
// Hilfsfunktionen
// =============================================

// ----- App-Fenster öffnen -----

function oeffneApp(user) {
    // Aktuelle Punkte des Spielers laden
    var siege = user.getPersistence().getNumber('ttt_siege', 0);

    var pageData = {
        username: user.getNick(),
        siege: siege
    };

    var htmlFile = new HTMLFile('index.html', pageData);
    var popup = AppContent.popupContent(htmlFile, 480, 650);
    popup.setResponsive(true);

    if (user.canShowAppViewMode(AppViewMode.Popup)) {
        user.sendAppContent(popup);
    } else {
        user.sendPrivateMessage('Die App kann auf deinem Gerät leider nicht angezeigt werden.');
    }
}

// ----- Matchmaking – Spieler zusammenbringen -----

function spielBeitreten(user) {
    // Prüfen: Ist der Spieler bereits in einem Spiel?
    if (aktuellesSpiel !== null) {
        if (aktuellesSpiel.spielerX.getUserId() === user.getUserId() ||
            aktuellesSpiel.spielerO.getUserId() === user.getUserId()) {
            user.sendPrivateMessage('Du bist bereits in einem Spiel!');
            return;
        }
        user.sendPrivateMessage('Es läuft gerade ein Spiel. Bitte warte, bis es vorbei ist.');
        return;
    }

    // Prüfen: Wartet der Spieler bereits?
    if (warteschlange !== null && warteschlange.getUserId() === user.getUserId()) {
        user.sendPrivateMessage('Du wartest bereits auf einen Gegner.');
        return;
    }

    if (warteschlange === null) {
        // Erster Spieler: In die Warteschlange
        warteschlange = user;
        user.sendPrivateMessage('Du bist in der Warteschlange. Warte auf einen Gegner...');

        var bot = KnuddelsServer.getDefaultBotUser();
        bot.sendPublicMessage(
            user.getProfileLink() + ' sucht einen Gegner für Tic-Tac-Toe! ' +
            'Schreibe °>/tttplay|/tttplay<° um mitzuspielen.'
        );

        // App nur öffnen, wenn der Spieler noch kein Popup offen hat
        if (user.getAppContentSessions(AppViewMode.Popup).length === 0) {
            oeffneApp(user);
        }
    } else {
        // Zweiter Spieler: Spiel starten!
        var spielerX = warteschlange;
        var spielerO = user;
        warteschlange = null;

        spielStarten(spielerX, spielerO);
    }
}

// ----- Spiel starten -----

function spielStarten(spielerX, spielerO) {
    // Spielfeld: 9 Felder, null = leer, 'X' oder 'O' = belegt
    aktuellesSpiel = {
        spielerX: spielerX,
        spielerO: spielerO,
        feld: [null, null, null, null, null, null, null, null, null],
        amZug: 'X'   // X beginnt immer
    };

    var bot = KnuddelsServer.getDefaultBotUser();
    bot.sendPublicMessage(
        'Tic-Tac-Toe: ' + spielerX.getProfileLink() + ' (X) vs. ' +
        spielerO.getProfileLink() + ' (O) – Das Spiel beginnt!'
    );

    // App nur öffnen, wenn der Spieler noch kein Popup offen hat.
    // Bei "Nochmal spielen" ist das Popup bereits offen – dann nur Update senden.
    if (spielerX.getAppContentSessions(AppViewMode.Popup).length === 0) {
        oeffneApp(spielerX);
    }
    if (spielerO.getAppContentSessions(AppViewMode.Popup).length === 0) {
        oeffneApp(spielerO);
    }

    // Spielzustand an beide Spieler senden
    sendeSpielUpdate(spielerX);
    sendeSpielUpdate(spielerO);
}

// ----- Spielzustand an einen Spieler senden -----

function sendeSpielUpdate(user) {
    if (aktuellesSpiel === null) return;

    var spielerSymbol = 'X';
    if (aktuellesSpiel.spielerO.getUserId() === user.getUserId()) {
        spielerSymbol = 'O';
    }

    var sessions = user.getAppContentSessions(AppViewMode.Popup);
    for (var i = 0; i < sessions.length; i++) {
        sessions[i].sendEvent('spielUpdate', {
            feld: aktuellesSpiel.feld,
            amZug: aktuellesSpiel.amZug,
            meinSymbol: spielerSymbol,
            gegnerName: spielerSymbol === 'X'
                ? aktuellesSpiel.spielerO.getNick()
                : aktuellesSpiel.spielerX.getNick()
        });
    }
}

// ----- Zug verarbeiten -----

function zugVerarbeiten(user, position) {
    if (aktuellesSpiel === null) {
        user.sendPrivateMessage('Es läuft gerade kein Spiel.');
        return;
    }

    // Welcher Spieler ist dran?
    var spielerAmZug = aktuellesSpiel.amZug === 'X'
        ? aktuellesSpiel.spielerX
        : aktuellesSpiel.spielerO;

    // Ist der richtige Spieler dran?
    if (spielerAmZug.getUserId() !== user.getUserId()) {
        user.sendPrivateMessage('Du bist gerade nicht am Zug!');
        return;
    }

    // Ist das Feld gültig und frei?
    if (position < 0 || position > 8 || aktuellesSpiel.feld[position] !== null) {
        user.sendPrivateMessage('Dieses Feld ist nicht verfügbar.');
        return;
    }

    // Zug setzen
    aktuellesSpiel.feld[position] = aktuellesSpiel.amZug;

    // Gewinner prüfen
    var gewinner = gewinnerpruefung(aktuellesSpiel.feld);

    if (gewinner !== null) {
        // Letzten Spielzustand senden, damit der Gewinnerzug sichtbar wird
        sendeSpielUpdate(aktuellesSpiel.spielerX);
        sendeSpielUpdate(aktuellesSpiel.spielerO);
        spielBeenden(gewinner);
        return;
    }

    // Unentschieden prüfen (alle Felder belegt)
    var allesBelegt = true;
    for (var i = 0; i < 9; i++) {
        if (aktuellesSpiel.feld[i] === null) {
            allesBelegt = false;
            break;
        }
    }

    if (allesBelegt) {
        // Letzten Spielzustand senden, damit der letzte Zug sichtbar wird
        sendeSpielUpdate(aktuellesSpiel.spielerX);
        sendeSpielUpdate(aktuellesSpiel.spielerO);
        spielBeenden('unentschieden');
        return;
    }

    // Nächster Spieler ist dran
    aktuellesSpiel.amZug = aktuellesSpiel.amZug === 'X' ? 'O' : 'X';

    // Beide Spieler informieren
    sendeSpielUpdate(aktuellesSpiel.spielerX);
    sendeSpielUpdate(aktuellesSpiel.spielerO);
}

// ----- Gewinnprüfung -----

function gewinnerpruefung(feld) {
    // Alle 8 möglichen Gewinnkombinationen
    var kombinationen = [
        [0, 1, 2],  // Obere Reihe
        [3, 4, 5],  // Mittlere Reihe
        [6, 7, 8],  // Untere Reihe
        [0, 3, 6],  // Linke Spalte
        [1, 4, 7],  // Mittlere Spalte
        [2, 5, 8],  // Rechte Spalte
        [0, 4, 8],  // Diagonale links-oben nach rechts-unten
        [2, 4, 6]   // Diagonale rechts-oben nach links-unten
    ];

    for (var i = 0; i < kombinationen.length; i++) {
        var a = kombinationen[i][0];
        var b = kombinationen[i][1];
        var c = kombinationen[i][2];

        if (feld[a] !== null && feld[a] === feld[b] && feld[b] === feld[c]) {
            return feld[a];  // Gibt 'X' oder 'O' zurück
        }
    }

    return null;  // Kein Gewinner
}

// ----- Spiel beenden und Punkte vergeben -----

function spielBeenden(ergebnis) {
    if (aktuellesSpiel === null) return;

    var bot = KnuddelsServer.getDefaultBotUser();
    var spielerX = aktuellesSpiel.spielerX;
    var spielerO = aktuellesSpiel.spielerO;

    if (ergebnis === 'unentschieden') {
        bot.sendPublicMessage('Tic-Tac-Toe: Unentschieden! Gut gespielt, ' +
            spielerX.getProfileLink() + ' und ' + spielerO.getProfileLink() + '!');

        sendeSpielErgebnis(spielerX, 'unentschieden', null);
        sendeSpielErgebnis(spielerO, 'unentschieden', null);
    } else {
        // ergebnis ist 'X' oder 'O'
        var gewinner = ergebnis === 'X' ? spielerX : spielerO;
        var verlierer = ergebnis === 'X' ? spielerO : spielerX;

        // Siege hochzählen (aktualisiert automatisch die Toplist!)
        gewinner.getPersistence().addNumber('ttt_siege', 1);

        bot.sendPublicMessage('Tic-Tac-Toe: ' + gewinner.getProfileLink() +
            ' gewinnt gegen ' + verlierer.getProfileLink() + '!');

        sendeSpielErgebnis(spielerX, 'gewonnen',
            ergebnis === 'X' ? spielerX.getNick() : spielerO.getNick());
        sendeSpielErgebnis(spielerO, 'gewonnen',
            ergebnis === 'X' ? spielerX.getNick() : spielerO.getNick());
    }

    // Spiel zurücksetzen
    aktuellesSpiel = null;
}

function sendeSpielErgebnis(user, ergebnis, gewinnerName) {
    var sessions = user.getAppContentSessions(AppViewMode.Popup);
    for (var i = 0; i < sessions.length; i++) {
        sessions[i].sendEvent('spielErgebnis', {
            ergebnis: ergebnis,
            gewinnerName: gewinnerName
        });
    }
}

// ----- Bestenliste senden -----

function toplistSenden(user, appContentSession) {
    var besteSpieler = UserPersistenceNumbers.getSortedEntries('ttt_siege', {
        ascending: false,
        count: 10
    });

    var liste = [];
    for (var i = 0; i < besteSpieler.length; i++) {
        var entry = besteSpieler[i];
        liste.push({
            position: entry.getPosition(),
            name: entry.getUser().getNick(),
            siege: entry.getValue()
        });
    }

    if (appContentSession) {
        appContentSession.sendEvent('toplist', { liste: liste });
    }
}
