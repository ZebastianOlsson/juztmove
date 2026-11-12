# JuztMove – instruktioner för Claude

Träningsapp (PWA) för vardagsrörelse, styrka, löpning och rörlighet. Allt UI är på svenska.
Publiceras med GitHub Pages från `main` (roten). Inloggning och data: Supabase (e-post + lösenord, tabellen `user_docs` med RLS – se `supabase/schema.sql`).

Läs PRODUKT.md innan du bygger nya funktioner eller ändrar flöden.

## Filer
- `src/index.src.html` – **källkoden. Ändra bara här.** Innehåller platshållarna `__BUILD__`, `__LIBRARY__`, `__PUBLIC_HEAD__`, `__VERSION__`.
- `src/build.py` – bygger `index.html` i roten. Kör `python src/build.py` efter varje ändring och committa både källan och `index.html`.
- `index.html`, `version.json` – genererade, ändra aldrig för hand. `version.json` är versionssträngen som appen jämför mot för att visa "Ny version finns".
- `config.js` – Supabase-URL och publishable key (publik nyckel, får ligga här). Ändra inte.
- `sw.js` – service worker. Höj `CACHE`-versionen när ikoner, manifest eller typsnitt ändras.
- `fonts/` – Manrope (700/800) och IBM Plex Sans (400/500/600) som woff2, laddas med `@font-face` (inga externa typsnitt).
- `icons/`, `manifest.webmanifest` – appikon "Stegen" – två skutt i en linje (papper) och en solgul punkt på svart (`icons/logo.svg`).

## Grafisk profil (tema Dagsljus)
- Papper #F7F6F1, svart #1D1B16, solgul punkt #E3A21A (mörkt läge #F2C14E). Knappar svarta i ljust läge, gula i mörkt.
- `--spot` för framsteg (ringar, staplar, värmekarta); `--c-s`/`--run`/`--mob` bara för styrka/löpning/rörlighet.
- Rubriker och siffror i Manrope 700/800 med tätt teckenavstånd, brödtext i IBM Plex Sans. Inga versaler i rubriker.
- Inga röda varningar, gradienter eller fler än en accent per vy.

## Regler som inte får brytas
1. **Användarnas sparade data får aldrig gå sönder.** Lägg bara till nya fält, byt aldrig namn på eller ta bort befintliga (settings, days-ÅÅÅÅ-MM, log-ÅÅÅÅ-MM, library). Data från molnet kan vara fryst – klona (JSON) innan den ändras.
2. **Passbiblioteket (program) får aldrig hamna i repot.** Det ligger privat i användarens Supabase-rad `doc='library'` och laddas med `setLibrary()`. Repot är publikt.
3. **Inga källnamn** (sajter, varumärken, personer som programmen kommer från) får synas någonstans – varken i koden, texter eller commit-meddelanden.
4. Mobil först (iPhone, Safari, hemskärmsapp). Inmatningsfält minst 16px, decimaler med komma ska fungera.
5. Testa i en headless-webbläsare (Playwright) innan push: inga JS-fel, inloggning (mocka Supabase), onboarding, Idag/Vecka/Pass/Framsteg/Inställningar.

## Arbetsflöde
Ändra `src/index.src.html` → `python src/build.py` → testa → commit med kort svensk beskrivning → push till `main`. GitHub Pages publicerar inom 1–2 minuter.

**Pusha alltid direkt till `main`** (`git push origin HEAD:main`), även om sessionen anger en annan arbetsbranch. Skapa inga pull requests om jag inte uttryckligen ber om det. Hämta `origin/main` först och kontrollera att inget annat än dina egna commits följer med.
