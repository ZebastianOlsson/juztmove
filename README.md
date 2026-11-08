# JuztMove

Träningsapp för vardagsrörelse, styrka, löpning och rörlighet. En installerbar webbapp med inloggning via e-postkod och molnsparning i Supabase.

## Filer

| Fil | Vad |
|---|---|
| `index.html` | Hela appen |
| `config.js` | Supabase-adress och publik nyckel (fylls i en gång) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Gör appen installerbar med ikon, helskärm och offline |
| `supabase/schema.sql` | Databastabell och regler – körs en gång i Supabase |

## Sätta upp (ca 20 minuter, allt gratis)

### 1. Supabase – databas och inloggning
1. Skapa konto på https://supabase.com och klicka **New project**. Välj ett namn, ett databaslösenord (spara det) och region **Stockholm** eller närmaste i EU.
2. När projektet är klart: **SQL Editor → New query**, klistra in hela `supabase/schema.sql` och klicka **Run**.
3. **Authentication → Sign In / Providers → Email**: se till att Email är påslaget.
4. **Authentication → Emails → Magic Link**: byt mejlets innehåll så att koden syns, t.ex.:
   `<h2>Din inloggningskod</h2><p>Skriv in koden i appen: <strong>{{ .Token }}</strong></p><p>Eller tryck här: <a href="{{ .ConfirmationURL }}">Logga in</a></p>`
   (Koden behövs för att inloggning ska fungera i appen på hemskärmen.)
5. **Project Settings → API**: kopiera **Project URL** och **anon public key** och klistra in dem i `config.js`.

### 2. GitHub – lägg upp appen
1. Skapa konto på https://github.com och klicka **New repository**. Namn: `juztmove`. Välj **Public** (GitHub Pages gratis kräver publikt repo). Klicka **Create repository**.
2. Klicka **uploading an existing file** och dra in **alla filer och mappar** härifrån (index.html, config.js, manifest.webmanifest, sw.js, .nojekyll, mapparna icons och supabase). Klicka **Commit changes**.
3. **Settings → Pages → Build and deployment**: Source = **Deploy from a branch**, Branch = **main** och **/ (root)**. Klicka **Save**.
4. Efter 1–2 minuter finns appen på `https://DITT-ANVÄNDARNAMN.github.io/juztmove/`.

### 3. Koppla ihop
1. I Supabase: **Authentication → URL Configuration**. Site URL = din GitHub-adress ovan. Lägg också till den under **Redirect URLs**.

### 4. Installera på telefonen
1. Öppna adressen i **Safari** (iPhone) eller **Chrome** (Android).
2. iPhone: Dela → **Lägg till på hemskärmen**. Android: menyn → **Installera app**.
3. Öppna från ikonen, skriv in e-post, skriv in koden från mejlet, svara på frågorna.

## Uppdatera appen
Ladda upp den nya `index.html` i repot (Add file → Upload files) och committa. Telefonerna hämtar den nya versionen nästa gång appen öppnas med nät.

## Bra att veta
- Varje användare ser bara sin egen data (radsäkerhet i databasen). Du som ägare kan se tabellen i Supabase-panelen.
- Supabase gratisnivå: projekt pausas efter en veckas inaktivitet utan användning – används appen regelbundet händer det inte. Det går att väcka i panelen.
- Supabase skickar ett begränsat antal mejl per timme med standardinställningen. Räcker för några användare; för fler, koppla en egen e-posttjänst under Authentication → SMTP.
- Egen domän (valfritt): köp t.ex. via Loopia, lägg en CNAME-post mot `DITT-ANVÄNDARNAMN.github.io` och ange domänen under Settings → Pages → Custom domain. Uppdatera då Site URL i Supabase.
