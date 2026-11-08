# JuztMove – instruktioner för Claude

Träningsapp (PWA) för vardagsrörelse, styrka, löpning och rörlighet. Allt UI är på svenska.
Publiceras med GitHub Pages från `main` (roten). Inloggning och data: Supabase (e-post + lösenord, tabellen `user_docs` med RLS – se `supabase/schema.sql`).

## Filer
- `src/index.src.html` – **källkoden. Ändra bara här.** Innehåller platshållarna `__BUILD__`, `__LIBRARY__`, `__PUBLIC_HEAD__`.
- `src/build.py` – bygger `index.html` i roten. Kör `python src/build.py` efter varje ändring och committa både källan och `index.html`.
- `index.html` – genererad, ändra aldrig för hand.
- `config.js` – Supabase-URL och publishable key (publik nyckel, får ligga här). Ändra inte.
- `sw.js` – service worker. Höj `CACHE`-versionen när ikoner eller manifest ändras.
- `icons/`, `manifest.webmanifest` – appikon (loggan = tre aktivitetsringar grön/orange/lila med ett J).

## Regler som inte får brytas
1. **Användarnas sparade data får aldrig gå sönder.** Lägg bara till nya fält, byt aldrig namn på eller ta bort befintliga (settings, days-ÅÅÅÅ-MM, log-ÅÅÅÅ-MM, library). Data från molnet kan vara fryst – klona (JSON) innan den ändras.
2. **Passbiblioteket (program) får aldrig hamna i repot.** Det ligger privat i användarens Supabase-rad `doc='library'` och laddas med `setLibrary()`. Repot är publikt.
3. **Inga källnamn** (sajter, varumärken, personer som programmen kommer från) får synas någonstans – varken i koden, texter eller commit-meddelanden.
4. Mobil först (iPhone, Safari, hemskärmsapp). Inmatningsfält minst 16px, decimaler med komma ska fungera.
5. Testa i en headless-webbläsare (Playwright) innan push: inga JS-fel, inloggning (mocka Supabase), onboarding, Idag/Vecka/Pass/Framsteg/Inställningar.

## Arbetsflöde
Ändra `src/index.src.html` → `python src/build.py` → testa → commit med kort svensk beskrivning → push till `main`. GitHub Pages publicerar inom 1–2 minuter.
