# 📖 Antigravity Discord Bot – Benutzerhandbuch

Willkommen! Dieser Bot ermöglicht es dir, mit Antigravity AI Chat-Instanzen direkt über Discord zu kommunizieren.

## 🚀 Erste Schritte

Bevor du den Bot verwenden kannst, muss ein **Admin dich freischalten**. Ohne Freischaltung hast du keinen Zugriff auf die Bot-Funktionen.

Sobald der Admin dich für eine Antigravity-Instanz freigeschaltet hat, kannst du loslegen!

## 💬 KI-Chat – `/ask`

Sende eine Nachricht an eine Antigravity KI-Instanz:

```
/ask message:Erkläre mir Quantencomputing
/ask message:Schreibe eine Python-Funktion instance:mein-ag
```

- Wenn du keine Instanz angibst, wird automatisch die erste verwendet, auf die du Zugriff hast.
- Die Antwort erscheint **dort, wo du die Anfrage gestellt hast** (Channel → Channel, DM → DM).

## 🧠 Modell-Einstellungen – `/model`

Du kannst dein bevorzugtes KI-Modell festlegen:

```
/model set model:...                → Modell aus der Liste wählen
/model info                         → Dein aktuelles Modell anzeigen
/model list                         → Alle verfügbaren Modelle anzeigen
```

Verfügbare Modelle:
- Gemini 3.1 Pro (High)
- Gemini 3.1 Pro (Low)
- Gemini 3 Flash
- Claude Sonnet 4.6 (Thinking)
- Claude Opus 4.6 (Thinking)
- GPT-OSS 120B (Medium)

> **Hinweis:** Der Admin kann Modelle für dich sperren oder ein bestimmtes Modell erzwingen.

## 📁 Dateien anzeigen – `/files`

Du kannst `.md`-Dateien (Markdown) anzeigen lassen:

```
/files listmds             → Alle .md Dateien auflisten
/files tree                → Dateibaum des Projektes anzeigen
/files tree path:/pfad     → Dateibaum eines bestimmten Pfades
/files view path:README.md → Eine .md Datei anzeigen
```

## 📡 Status – `/status`

Zeigt den Verbindungsstatus aller Antigravity-Instanzen:

```
/status
```

🟢 = Online/Verbunden | 🔴 = Offline/Nicht verbunden

## ❓ Hilfe – `/help`

Zeigt dieses Handbuch direkt im Chat an:

```
/help
```

## ⚠️ Häufige Fragen

**Q: Warum kann ich keine Commands benutzen?**
A: Ein Admin muss dich zuerst freischalten. Kontaktiere einen Bot-Admin.

**Q: Warum bekomme ich eine Fehlermeldung bei `/ask`?**
A: Mögliche Gründe:
- Du hast keinen Zugriff auf die gewählte Instanz
- Die Antigravity-Instanz ist offline
- Das gewählte Modell ist für dich gesperrt

**Q: Kann ich mein Modell ändern?**
A: Ja, mit `/model set`. Falls der Admin ein Modell für dich gesperrt hat, kannst du es nicht ändern.

**Q: Wo erscheint die Antwort?**
A: Die Antwort erscheint immer dort, wo du die Anfrage gestellt hast – im Channel oder als Direktnachricht.
