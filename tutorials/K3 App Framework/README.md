# K3 App Framework

Das K3AF ist ein kleines Modul-Framework für **Knuddels UserApps**, das deine App in klar getrennte Module aufteilt.

- Module laden und registrieren
- Hooks automatisch an aktive Module binden
- Chatbefehle automatisch an Module binden
- modulbezogene Persistenz kapseln
- optionale Hot-Reloads im Testsystem ermöglichen

## Warum K3AF?

Bei größeren UserApps wird eine einzige `main.js` schnell unübersichtlich. K3AF trennt alles sauber:

- **ein Modul pro Funktion**
- **ein zentraler Modulmanager**
- **saubere Aktivierung/Deaktivierung**
- **klare Hook- und Command-Struktur**

Damit kannst du Funktionen wie Topic-Verwaltung, Rechte-Logik, Auswertungen oder Admin-Tools getrennt entwickeln und unabhängig aktivieren.

## Philosophie des K3AF

Die Idee des K3AF ist es, Entwicklern ein kompaktes und funktionales Modulsystem an die Hand zu geben und nur noch Module dafür entwickeln zu müssen.

## Projektstruktur

```text
main.js
includes/
  init.js
  classes/
    FileSystem.js
    Module.js
    ModulePersistence.js
    Utils.js
  module/
    ModuleManager.js
    AutoUpdate.js
    ChannelAdmin.js
    CodeEval.js
    MCMTracker.js
    TopicChanger.js
```

## Startablauf

### `main.js`
Die App startet minimal:

```javascript
var App = {};
App.chatCommands = {};

KnuddelsServer.execute('includes/init.js');
```

### `includes/init.js`
`init.js` lädt die Kernklassen und dann alle Module. Danach ruft K3AF einmal `refreshHooks()` auf, damit alle Hooks und Commands in `App[...]` und `App.chatCommands[...]` registriert werden.

## Kernbestandteile

### `Module.create(name)`
Erzeugt ein Modulobjekt mit einer kleinen Basisausstattung:

- `activate(user)`
- `deactivate(user)`
- `isActivated()`
- `register()`
- `getPersistence()`
- `toString()`
- `isVisible()`
- `F_OnActivated()`
- `F_OnDeactivated()`
- `F_OnUpdate()`

Ein Modul ist also kein Constructor mit Prototype-Kette, sondern einfach ein Objekt mit klar definierten Funktionen.

### `ModulePersistence(module)`
Jedes Modul bekommt eine eigene Kapsel für Persistenzschlüssel.

Dadurch werden Keys automatisch mit dem Modulnamen prefixiert, z. B.:

```text
TopicChanger_activated
ChannelAdmin_Owner
```

Das verhindert Kollisionen zwischen Modulen.

### `ModuleManager`
Der `ModuleManager` ist das Herzstück vom K3AF.

Er verwaltet:

- registrierte Module
- aktive Module
- Hook-Mapping
- Command-Mapping
- Admin-Übersicht
- Neuaufbau aller Hooks nach Änderungen

## Wie Hooks funktionieren

K3AF erkennt Hooks **über ihre Methodennamen**.

### Methoden mit `on...`
Werden als normale App-Hooks behandelt, z. B.:

```javascript
MyModule.onUserJoined = function (user) {
    user.sendPrivateMessage('Willkommen.');
};
```

### Methoden mit `may...`
Werden als Filter behandelt, z. B.:

```javascript
MyModule.mayShowPublicMessage = function (publicMessage) {
    return true;
};
```

Für `mayShowPublicMessage` und `mayShowPublicActionMessage` verknüpft K3AF die Rückgaben aller aktiven Module logisch mit **UND**. Sobald ein Modul `false` liefert, wird die Nachricht blockiert.

### Methoden mit `cmd...`
Werden automatisch als Chatbefehl registriert.

Beispiel:

```javascript
MyModule.cmdHello = function (user, params, command) {
    user.sendPrivateMessage('Hallo ' + user.getNick());
};
```

Daraus wird automatisch der Befehl:

```text
/hello
```

## Priorität und Sichtbarkeit

Jedes Modul kann zusätzliche Eigenschaften setzen:

```javascript
MyModule.visible = true;
MyModule.priority = 0;
MyModule._blockedModules = [];
MyModule.isLoggingFunctions = false;
```

### `priority`
Aktive Module werden nach `priority` sortiert. Kleinere Zahlen laufen zuerst.

### `visible`
Wenn `visible = false` gesetzt ist, taucht das Modul nicht in der normalen Admin-Übersicht auf. App-Developer können es weiterhin sehen.

### `_blockedModules`
Damit lassen sich Konflikte zwischen Modulen definieren. Beim Aktivieren prüft K3AF dann, ob ein inkompatibles Modul schon aktiv ist.

## Beispielmodul

```javascript
if (typeof GreetingModule === 'undefined') {
    var GreetingModule = Module.create('GreetingModule');
    GreetingModule.register();
}

GreetingModule.onUserJoined = function (user) {
    user.sendPrivateMessage('Willkommen im Channel, ' + user.getProfileLink() + '.');
};

GreetingModule.cmdHello = function (user) {
    user.sendPrivateMessage('Hallo ' + user.getNick() + '!');
};
```

Dieses Modul:

- registriert sich selbst
- reagiert auf `onUserJoined`
- stellt den Befehl `/hello` bereit

## Persistenz im Modul

Persistenz läuft immer über `this.getPersistence()`.

### Zahlen

```javascript
var count = this.getPersistence().getUserNumber(user, 'greetCount', 0);
this.getPersistence().setUserNumber(user, 'greetCount', count + 1);
```

### Strings

```javascript
this.getPersistence().setUserString(user, 'lastMessage', 'Hallo');
```

### Objekte

```javascript
this.getPersistence().setUserObject(user, 'settings', {
    enabled: true
});
```

## Eingebaute Module

### `ModuleManager`
Verwaltet alle Module, baut Hooks und Commands auf und zeigt Framework-Managern die Admin-Übersicht an.

Nützlicher Befehl:

```text
/k3afmodules
```

Damit können berechtigte Nutzer Module sehen sowie aktivieren oder deaktivieren.

---

### `AutoUpdate`
Lädt im **Testsystem** geänderte `.js`-Dateien automatisch neu und baut danach die Hooks neu auf.

Wichtig:

- läuft nur im Testsystem
- läuft nur in der Root-Instanz
- Intervall: 30 Sekunden

Gedacht für Entwicklung und schnelles Nachladen während Tests.

---

### `ChannelAdmin`
Verwaltet **appinterne Zusatzrechte**.

Wichtig: Im K3AF werden **keine echten Knuddels-Rechte überschrieben**. `ChannelAdmin` ergänzt nur die eigene Framework-Logik.

Das Modul bietet Hilfsfunktionen wie:

- `canUseOwnerFeatures(user)`
- `canUseModeratorFeatures(user)`
- `canUseFrameworkManagerFeatures(user)`

Zusätzlich gibt es den Befehl:

```text
/channeladmin
```

Damit können Channelowner oder App-Developer ChannelAdmins in der App-Persistenz eintragen oder entfernen.

---

### `CodeEval`
Ein kleines Entwickler-Modul für Tests.

Befehl:

```text
/evalcode
```

Nur App-Developer dürfen diesen Befehl verwenden. Das Modul ist bewusst immer aktiv und nicht deaktivierbar.

**Achtung:** `eval` ist ein mächtiges Werkzeug und sollte mit bedacht verwendet werden.

---

### `MCMTracker`
Zeigt Moderator-/CM-Informationen für den aktuellen Channel an.

Befehl:

```text
/mcmtracker
```

Das Modul baut eine Übersicht über:

- Online-User im Channel
- Online-Moderatoren im Channel
- Channelmoderatoren insgesamt
- Client-Typ der aktuell sichtbaren Moderatoren

Gedacht als kleines Moderations- und Übersichtstool.

---

### `TopicChanger`
Erlaubt berechtigten Nutzern, das Channeltopic zu lesen und zu ändern.

Typische Befehle:

```text
/settopic
/gettopic
```

Die Berechtigungsprüfung orientiert sich an echten Channelrechten plus den appinternen Zusatzrechten aus `ChannelAdmin`.

## Hilfsfunktionen in `Utils.js`

Das K3AF verzichtet auf globale Extensions. Stattdessen gibt es bewusst nur eine kleine Hilfssammlung:

- `K3AF.Utils.format(str, values)`
- `K3AF.Utils.getRecursivePropertyNames(obj)`
- `K3AF.Utils.getUserByNickname(nickname)`
- `K3AF.Utils.removeComments(str)`

Diese Funktionen sind nur interne Helfer und ersetzen NICHT die offizielle UserApps-API.

## Best Practices

### 1. Verwende immer die offizielle UserApps-API
Nutze direkt Methoden wie:

- `user.sendPrivateMessage(...)`
- `user.isChannelOwner()`
- `user.isChannelModerator()`
- `user.isAppManager()`
- `KnuddelsServer.getUserAccess()`

### 2. Halte Module klein
Ein Modul sollte möglichst **eine klar abgegrenzte Aufgabe** haben.

### 3. Rechte bewusst prüfen
Verlasse dich nicht auf Magie. Prüfe Rechte im Modul explizit.

### 4. Persistenz modulbezogen halten
Lege Daten immer über `this.getPersistence()` ab, nicht mit globalen Schlüsseln.

### 5. AutoUpdate nur für Entwicklung nutzen
Für den Live Betrieb ist AutoUpdate normalerweise nicht nötig.

## Für wen ist das K3AF gedacht?

Das K3AF ist sinnvoll, wenn du:

- deine UserApp modular strukturieren willst
- möglichst nah an der offiziellen Knuddels-API bleiben willst
- neue Funktionen als einzelne Module nachrüsten willst
- bestehende Logik sauber voneinander trennen willst

## Kurz gesagt

Das K3AF ist **kein Ersatz oder eine Erweiterung für die UserApps-API**, sondern ein organisatorischer Layer darüber.

Die UserApps-API liefert die Plattformfunktionen. K3AF liefert die modulare Struktur.
