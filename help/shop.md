# Online-Shop (Add-on)

Diese Anleitung beschreibt Einrichtung und Betrieb des Shop-Add-ons: Produkte,
Warenkorb, Kasse, Zahlung über SumUp, Stripe oder PayPal, Bestellungen und
E-Mails.

## Überblick

- Das Add-on ist **standardmäßig aus**. Erst nach dem Aktivieren sind die
  Shop-Oberfläche im Admin-Bereich und die öffentlichen Shop-Funktionen verfügbar.
- Besucher legen Produkte in den Warenkorb, geben in der Kasse Adresse und E-Mail
  an und zahlen über einen der aktivierten Anbieter.
- **Alle Preise berechnet der Server** aus Ihren Produktdaten. Der Browser sendet
  nur Artikelnummer (SKU) und Menge.
- Als bezahlt gilt eine Bestellung **nur**, wenn der Zahlungsanbieter die Zahlung
  per Abfrage bestätigt (Betrag, Währung und Bestellnummer müssen stimmen).
  Webhook-Inhalte sind nur ein Anstoß zur Prüfung.
- Alle Preise sind **Bruttopreise** in Euro (inkl. MwSt.). Der Steuersatz wird je
  Format am Produkt gepflegt.

## Einrichtung Schritt für Schritt

1. **Add-on aktivieren**: *Einstellungen → Shop → „Add-on aktivieren“*. Dabei
   werden die Seiten `shop`, `warenkorb`, `kasse` und `bestellung` angelegt und
   veröffentlicht, falls sie fehlen. Vorhandene Seiten mit gleichem Slug werden
   nie verändert. Über **„Shop-Seiten prüfen/anlegen“** lässt sich das jederzeit
   wiederholen; die Meldung nennt die neu angelegten Seiten.
2. **Produkte anlegen**: im Tab *Produkte*. Je Produkt mindestens ein Format
   (z. B. Hardcover, PDF) mit Preis, Steuersatz und, bei physischen Formaten,
   Gewicht. Digitale Formate haben kein Gewicht und werden nicht versendet.
   Produkte werden nie gelöscht, sondern nur auf *inaktiv* gestellt. Ein Format
   ist nur bestellbar, wenn Preis und Steuersatz gesetzt sind und der Bestand
   nicht 0 ist (leerer Bestand = unbegrenzt).
3. **Versand & Steuer**: im Tab *Versand & Steuer* lieferbare Länder, Zonen und
   Gewichtsstufen mit Preisen eintragen. Ohne Stufen können physische Produkte
   nicht bestellt werden (Fehler „Versand nicht verfügbar“). Reine
   Digitalbestellungen sind versandkostenfrei.
4. **Zahlungsarten**: im Tab *Zahlungsarten* je Anbieter Zugangsdaten eintragen,
   mit *Verbindung testen* prüfen und den Anbieter aktivieren. Ein Anbieter wird
   den Kunden nur angeboten, wenn er aktiviert **und** vollständig konfiguriert
   ist. Zugangsdaten werden nach dem Speichern nie wieder angezeigt; ein leeres
   Feld beim Speichern behält den gespeicherten Wert.
5. **E-Mail**: SMTP unter *Kontaktformulare* einrichten (siehe unten) und unter
   *Einstellungen → Shop* die Benachrichtigungs-E-Mail und das Präfix der
   Bestellnummer setzen.
6. **Rechtliches** ergänzen und die Checkliste vor dem Livegang abarbeiten.

## Zahlungsanbieter

Zugangsdaten erhalten Sie im Entwickler- bzw. Dashboard-Bereich des jeweiligen
Anbieters. Die genauen Menüpunkte ändern sich; schauen Sie dort nach API-Schlüsseln
bzw. Webhooks. Jeder Anbieter hat einen **Test-** und einen **Live-Modus** mit
getrennten Schlüsseln. Beginnen Sie immer im Testmodus.

### Webhook-URLs

Webhooks informieren den Shop über Zahlungsergebnisse (auch wenn der Kunde die
Seite vorher schließt). Ersetzen Sie `<domain>` durch Ihre Domain; HTTPS ist
Pflicht.

| Anbieter | URL |
|---|---|
| SumUp | `https://<domain>/api/shop/webhooks/sumup` |
| Stripe | `https://<domain>/api/shop/webhooks/stripe` |
| PayPal | `https://<domain>/api/shop/webhooks/paypal` |

### SumUp

- Zugangsdaten aus dem Entwickler-/Dashboard-Bereich von SumUp (API-Schlüssel und
  Händlercode).
- Die Kartenzahlung läuft direkt auf Ihrer Kasse-Seite (eingebettetes Formular).
- Der Rückruf zum Checkout-Status wird **automatisch** mit jeder Zahlung
  mitgesendet; Sie müssen in SumUp keinen Webhook abonnieren.

### Stripe

- Zugangsdaten (Geheimer Schlüssel) aus dem Entwickler-/Dashboard-Bereich von
  Stripe; für den Testmodus die Test-Schlüssel verwenden.
- Der Kunde wird zur gehosteten Stripe-Zahlungsseite weitergeleitet.
- Legen Sie im Stripe-Dashboard einen Webhook-Endpunkt mit der URL oben an und
  abonnieren Sie diese Ereignisse:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
- Das dabei angezeigte Signing-Secret tragen Sie im Shop als Webhook-Secret ein.
  Anfragen mit ungültiger Signatur werden abgelehnt.

### PayPal

- Zugangsdaten (Client-ID und Secret) aus dem Entwickler-/Dashboard-Bereich von
  PayPal. Modus *Sandbox* (Test) oder *Live* wählen; Schlüssel gelten nur für
  ihren Modus.
- Der Kunde wird zu PayPal weitergeleitet; der Shop schließt die Zahlung danach ab.
- Legen Sie einen Webhook mit der URL oben an und abonnieren Sie:
  - `CHECKOUT.ORDER.APPROVED`
  - `PAYMENT.CAPTURE.COMPLETED`
  - `PAYMENT.CAPTURE.DENIED`
- Die Webhook-ID des Webhooks tragen Sie im Shop ein (Signaturprüfung).

## E-Mail-Einrichtung

Der Shop versendet über den SMTP-Zugang, den Sie unter **Kontaktformulare**
einrichten. Ohne funktionierenden SMTP-Zugang gibt es keine Bestellmails; die
Bestellung selbst bleibt davon unberührt.

- **Bestellbestätigung** an den Kunden, sobald die Zahlung bestätigt ist.
- **Benachrichtigung** an die Adresse „Benachrichtigungs-E-Mail“ (leer = keine).
- **Versandmail** beim Markieren als versendet.

Die Mails enthalten keine Rechtstexte; die Widerrufsbelehrung ist ein
Platzhalter, den Sie selbst durch Ihre geprüfte Fassung ersetzen müssen.

## Bestellablauf und Status

| Status | Bedeutung |
|---|---|
| Ausstehend (`PENDING`) | Bestellung angelegt, Zahlung noch nicht bestätigt |
| Bezahlt (`PAID`) | Der Anbieter hat die Zahlung bestätigt; Bestand abgebucht, Mails versendet |
| Versendet (`SHIPPED`) | Von Ihnen im Tab *Bestellungen* mit „Als versendet markieren“ gesetzt |
| Fehlgeschlagen (`FAILED`) | Zahlung abgelehnt oder Zahlungsstart nicht möglich |
| Storniert (`CANCELLED`) | Zahlung abgebrochen oder abgelaufen |

Statuswechsel sind einmalig: Doppelte Webhooks oder ein Neuladen der
Bestätigungsseite lösen weder doppelte Bestandsabbuchung noch doppelte Mails aus.
Die Seite `bestellung` zeigt keine personenbezogenen Daten.

## Bestand

- Der Bestand wird **bei bestätigter Zahlung** abgebucht (nur Formate mit
  gesetztem Bestand, nicht digital) und nie unter 0.
- Es wird **nichts reserviert**: Zwei Kunden können dasselbe letzte Exemplar in
  den Warenkorb legen. Zahlen beide, ist **Überverkauf möglich**; er wird im
  Server-Log vermerkt und muss von Ihnen manuell geklärt werden.
- Leerer Bestand bedeutet unbegrenzt.

## Erweiterte Funktionen

- **Rechnung:** Wird nach Zahlungseingang automatisch erstellt und der Bestätigungsmail angehängt. Trage dafür unter *Einstellungen → Shop* Name, Anschrift, Steuerangaben und Bankverbindung ein; fehlende Angaben erscheinen als Platzhalter im PDF.
- **Erstatten:** Im Bestelldetail (nur Admin) Betrag und Grund angeben. Die Erstattung läuft über denselben Anbieter wie die Zahlung. Vor dem Livegang einmal mit einer Testzahlung ausprobieren.
- **Gutscheine:** Tab *Gutscheine*; Gutscheine werden nicht gelöscht, sondern deaktiviert.
- **Digitale Produkte:** Dateien am digitalen Format im Produkteditor hochladen (erst das Produkt speichern). Kunden erhalten nach Zahlung Links mit Ablauf und Download-Limit.
- **Reservierung und Zeitplan:** Ein eingebauter Timer gibt abgelaufene Reservierungen frei, räumt unbezahlte Bestellungen auf und gleicht offene Zahlungen ab. Läuft die Seite serverlos, kann `POST /api/shop/cron` mit dem Header `x-shop-cron` regelmäßig extern aufgerufen werden.
- **Rückgaben:** Kunden stellen Anfragen unter *rueckgabe*; die Bearbeitung erfolgt im Tab *Rückgaben*, die Erstattung selbst im Bestelldetail.

## Rechtliches (keine Rechtsberatung)

Diese Anleitung ersetzt **keine Rechtsberatung**. Lassen Sie Texte und Abläufe
vor dem Livegang von einer Fachperson prüfen.

- Die Texte für **AGB, Widerruf, Widerrufsformular sowie Versand & Zahlung** stellt
  der Shop nicht bereit. Beim Aktivieren (und über den Button „Shop-Seiten
  prüfen/anlegen“ in den Einstellungen) legt das Add-on dafür Seiten mit dem
  Platzhalter `[PLATZHALTER – Rechtstext folgt]` an (`/agb`, `/widerruf`,
  `/widerrufsformular`, `/versand-zahlung`; die Kasse verlinkt auf sie). Ersetzen
  Sie die Platzhalter durch Ihre eigenen, fachlich geprüften Texte; Seiten mit
  Platzhalter dürfen nicht live gehen. Warenkorb, Kasse und Bestellseite werden
  von Suchmaschinen automatisch ausgeschlossen.
- **Impressum** und **Datenschutzerklärung** Ihrer Website müssen den Shop
  berücksichtigen (siehe Checkliste).
- Der Bestell-Button heißt exakt **„Zahlungspflichtig bestellen“**.
- Preise werden inkl. MwSt. angezeigt, Versandkosten sind vor der Bestellung
  sichtbar. Der Steuersatz der Versandkosten wird derzeit nicht ausgewiesen.
- Die Pflicht-Checkbox für AGB/Widerruf ist vorhanden; bei digitalen Produkten
  kommt eine Checkbox zum vorzeitigen Erlöschen des Widerrufsrechts hinzu.

## Checkliste vor dem Livegang

- [ ] Je aktiviertem Anbieter ein **Testkauf** im Testmodus bis zur Bestätigungsseite
- [ ] **Webhook-Zustellung** im Anbieter-Dashboard prüfen (Antwort 200)
- [ ] **Live-Schlüssel** eingetragen, Modus auf Live umgestellt, Webhooks für Live neu angelegt
- [ ] Website nur über **HTTPS** erreichbar
- [ ] **Backups** eingerichtet (Kategorie *Shop*, siehe unten)
- [ ] Rechtstexte (AGB, Widerruf, Widerrufsformular, Versand & Zahlung) mit eigenen Texten gefüllt und fachlich geprüft
- [ ] Impressum und Datenschutzerklärung aktuell
- [ ] **Mails** getestet (Bestätigung, Benachrichtigung, Versand)
- [ ] **Datenschutzhinweis** zu den Zahlungsdienstleistern (SumUp, Stripe, PayPal je nach Nutzung) in der Datenschutzerklärung
- [ ] **Cookie-/Speicher-Hinweis**: Der Warenkorb liegt im `localStorage` des Browsers (`temgine_shop_cart`, nur Artikelnummer und Menge, technisch notwendig). Er erscheint bei aktivem Shop automatisch in der Cookie-Übersicht
- [ ] Versandzonen und -preise, Steuersätze und Bestände geprüft

## Backup

Im Backup gibt es die Kategorie **Shop**: Produkte, Formate, Bestellungen,
Positionen, Zahlungen und Bestandsbuchungen. **Zugangsdaten und Webhook-Secrets
sind nie im Backup**; nach einem Umzug müssen sie neu eingetragen werden. Beim
Wiederherstellen werden vorhandene Bestellungen (gleiche Bestellnummer) nicht
überschrieben, und die Verknüpfung zu Mitgliedern entfällt.

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| Kasse zeigt keine Zahlungsart | Kein Anbieter aktiviert **und** vollständig konfiguriert |
| „Versand nicht verfügbar“ | Für Land/Gewicht fehlt eine Versandstufe |
| Produkt nicht bestellbar | Preis oder Steuersatz fehlt, Bestand 0 oder Produkt inaktiv |
| Bestellung bleibt „Ausstehend“ | Webhook nicht angekommen oder Zahlung nicht bestätigt; Webhook-Zustellung im Anbieter-Dashboard prüfen, Bestätigungsseite erneut öffnen |
| Webhook liefert 400 | Signatur ungültig: Webhook-Secret bzw. Webhook-ID und Modus (Test/Live) prüfen |
| Keine Mails | SMTP unter *Kontaktformulare* prüfen; Fehler stehen im Server-Log |
| SumUp-Formular lädt nicht | Anbieter aktiviert? Bei strengen Sicherheitsregeln im Browser-Log nach blockierten Quellen schauen |
| Seiten fehlen | *Einstellungen → Shop → „Shop-Seiten prüfen/anlegen“* |
