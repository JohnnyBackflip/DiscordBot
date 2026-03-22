# 🤖 Antigravity Discord Bot

Ein Discord-Bot zur Fernsteuerung von Antigravity AI Chat-Instanzen. Unterstützt mehrere Instanzen, ein granulares Berechtigungssystem, Modell-Management und `.md`-Dateibrowser.

---

## 📋 Features

- **Multi-Instanz-Support** – Verwalte und steuere mehrere Antigravity-Instanzen gleichzeitig
- **Granulares Berechtigungssystem** – Users starten mit 0 Rechten, Admin schaltet alles frei
- **Modell-Management** – User wählen ihr Standard-Modell, Admin kann Modelle sperren/erzwingen
- **Kontextbasierte Antworten** – Bot antwortet dort, wo die Anfrage gestellt wurde (Channel → Channel, DM → DM)
- **Dateibrowser** – `.md` Dateien auflisten und anzeigen
- **In-Chat Hilfe** – `/help` zeigt eine Benutzer-Anleitung direkt im Chat

---

## 🚀 Installation

### Voraussetzungen

- **Node.js** ≥ 18.0
- **npm**
- Ein **Discord Bot Token** ([Discord Developer Portal](https://discord.com/developers/applications))
- Mindestens eine **Antigravity-Instanz** mit aktiviertem Remote-Debugging

### Setup

```bash
# 1. Repo klonen
git clone https://github.com/JohnnyBackflip/DiscordBot.git
cd DiscordBot

# 2. Dependencies installieren
npm install

# 3. .env Datei anlegen
cp .env.example .env
# .env bearbeiten und Werte eintragen
```

### .env Konfiguration

```env
DISCORD_TOKEN=dein_bot_token
CLIENT_ID=deine_application_id
ADMIN_IDS=deine_discord_user_id
GUILD_ID=optional_server_id_für_dev
```

> **ADMIN_IDS**: Komma-getrennte Liste von Discord User IDs, die Bot-Admins sind.
> 
> **GUILD_ID**: Wenn gesetzt, werden Commands nur auf diesem Server registriert (sofort verfügbar). Ohne GUILD_ID werden Commands global registriert (bis zu 1 Stunde Wartezeit).

### Antigravity vorbereiten

Jede Antigravity-Instanz muss mit Remote-Debugging gestartet werden:

```bash
# Beispiel: Antigravity mit CDP auf Port 9222 starten
antigravity --remote-debugging-port=9222
```

### Bot starten

```bash
# 1. Slash Commands registrieren (einmalig oder nach Änderungen)
npm run deploy

# 2. Bot starten
npm start

# Für Entwicklung (Auto-Restart bei Dateiänderungen):
npm run dev
```

---

## 🛡️ Berechtigungssystem

### Prinzip: Deny-by-Default

- **User haben standardmäßig KEINE Berechtigungen**
- Der Admin muss jeden User einzeln freischalten
- Freischaltung erfolgt pro Instanz UND pro Command

### Admin-Workflow

```
1. Instanz registrieren:        /instance add name:mein-ag port:9222
2. User für Instanz freischalten: /permit grant user:@Max instance:mein-ag
3. Commands freischalten:        /command-access grant user:@Max command:ask
4. Oder alle Commands auf einmal: /command-access grant-all user:@Max
```

### Admin kann immer:

- ✅ Alle Commands benutzen
- ✅ User-Einstellungen überschreiben
- ✅ Modelle sperren/erzwingen
- ✅ User-Berechtigungen jederzeit ändern
- ✅ Instanzen hinzufügen/entfernen/verbinden/trennen

---

## 📝 Command-Übersicht

### Für alle User (wenn freigeschaltet)

| Command | Beschreibung |
|---------|-------------|
| `/ask <message> [instance]` | Nachricht an Antigravity senden |
| `/model set <model>` | Standard-Modell festlegen |
| `/model info` | Aktuelles Modell anzeigen |
| `/model list [instance]` | Verfügbare Modelle auflisten |
| `/files list [directory]` | `.md` Dateien auflisten |
| `/files view <path>` | `.md` Datei anzeigen |
| `/status` | Instanz-Status anzeigen |
| `/help` | Hilfe anzeigen |

### Nur für Admins

| Command | Beschreibung |
|---------|-------------|
| `/instance add/remove/list/connect/disconnect` | Instanzen verwalten |
| `/permit grant/revoke/list` | User-Berechtigungen verwalten |
| `/command-access grant/revoke/grant-all/list` | Command-Zugriff verwalten |
| `/model lock/unlock/block/unblock` | Modelle für User steuern |
| `/admin status` | Admin-Dashboard |
| `/admin reset-user` | User komplett zurücksetzen |
| `/admin set-model` | Modell eines Users setzen |

---

## 🏗️ Architektur

```
src/
├── index.js                 # Einstiegspunkt
├── deploy-commands.js       # Slash Commands registrieren
├── database/
│   └── db.js               # SQLite DB + Schema + Queries
├── antigravity/
│   └── manager.js           # CDP-Verbindungsmanager
├── permissions/
│   └── permissions.js       # Berechtigungssystem
├── commands/
│   ├── ask.js              # /ask
│   ├── instance.js         # /instance
│   ├── permit.js           # /permit
│   ├── command-access.js   # /command-access
│   ├── model.js            # /model
│   ├── files.js            # /files
│   ├── help.js             # /help
│   ├── admin.js            # /admin
│   └── status.js           # /status
└── events/
    ├── ready.js            # Bot-Ready Event
    └── interactionCreate.js # Command-Router
```

### Datenbank

SQLite (`data/bot.db`) mit folgenden Tabellen:
- `instances` – Registrierte Antigravity-Instanzen
- `user_permissions` – Instanz-Zugriff pro User
- `command_permissions` – Command-Zugriff pro User
- `user_settings` – Standard-Modell pro User
- `model_restrictions` – Modell-Sperren/Locks pro User

### Antigravity-Verbindung

Verbindung via **Chrome DevTools Protocol (CDP)**:
1. Bot verbindet sich per WebSocket zum Antigravity CDP-Port
2. Nachrichten werden via DOM-Manipulation in den Chat injiziert
3. Antworten werden durch DOM-Polling ausgelesen
4. Unterstützt Streaming-Erkennung (wartet bis Antwort vollständig)

---

## 🔧 Troubleshooting

| Problem | Lösung |
|---------|--------|
| Bot startet nicht | Prüfe `DISCORD_TOKEN` in .env |
| Commands nicht sichtbar | `npm run deploy` ausführen, bei globaler Registrierung bis zu 1h warten |
| Instanz verbindet nicht | Prüfe ob Antigravity mit `--remote-debugging-port` läuft |
| "Keine Berechtigung" | Admin muss User mit `/permit` und `/command-access` freischalten |
| Antwort wird nicht erkannt | DOM-Selektoren in `manager.js` müssen ggf. an Antigravity-Version angepasst werden |

---

## 📄 Lizenz

MIT
