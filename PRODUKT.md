# JuztMove – produktvision och designprinciper

## Positionering
Vardagsrörelse som grund, träning som tillval. Hybridappar (Edge, Runna) riktar sig till folk som redan tränar mycket; pausappar (Wakeout, MoveDose) ger korta pauser men ingen helhetsplan. JuztMove bygger hela dagen kring vardagsrörelse och rörlighet, med styrka och löpning ovanpå när man vill.

## Designprinciper

1. Golv, inte tak
- Varje dag har ett minimum (promenad + några minuter rörlighet) som räknas som en hel, godkänd dag.
- Styrka och löpning är uppväxlingar man väljer till, inte krav.
- Veckomål i stället för streaks som nollställs.
- Inga skuldbeläggande texter, röda varningar eller "du missade"-notiser.
- Låg friktion: dagens minimum ska gå att starta med ett tryck.

2. Rörelsesnacks med ett "varför"
- Korta pass (1–2 min, gärna pulshöjande) utspridda över dagen.
- Knyt dem till befintliga vanor (kaffet, efter möten, trappan) – påminnelser ensamma räcker inte.
- Visa en kort förklaring om varför, inramad kring hur man mår och energi snarare än hälsorisker.

3. Variation med struktur
- Passen ska kännas varierade, men variationen är planerad, inte slumpmässig.
- Byt övningar inom samma rörelsemönster (knäböj, höftfällning, press, drag, bål) och behåll progressionen (reps, vikt, tid) under ytan.
- Undvik formuleringar som "kroppen hinner inte vänja sig" – anpassning är målet.

4. Liten krets i stället för flöde
- Dela med en liten grupp (partner, kompisar).
- Visa om de andra klarat dagens minimum och låt dem skicka en enkel peppning.
- Inga publika topplistor eller jämförelser.

5. Rörlighet för stela kroppar
- Byggd för stela kontorskroppar, inte atleter.
- Standardlängd 3–6 minuter.
- Utgå från "var känns det stelt?" (nacke, rygg, höfter, axlar).

## Bygg inte
- Generisk AI-coach.
- Funktioner som ökar friktionen, kräver mycket loggning eller ger skuldkänslor.
- Feature-uppblåsning – hellre få saker som fungerar sömlöst.

## Tekniska begränsningar
- Appen är en PWA och kan inte läsa steg från Apple Hälsa eller Health Connect (kräver native). Möjlig brygga: en iOS-genväg som skickar dagens steg till Supabase.
- Push-notiser på iPhone fungerar bara när appen är tillagd på hemskärmen.
- "JuztMove" är ett arbetsnamn: håll det på ett ställe (konstant + name/short_name i manifestet), inte i tabellnamn.
- Namn på källprogrammen som passen kommer från får inte synas någonstans i appen.

## Framtid (vid uppskalning)
- Ersätt importerade pass från andra prenumerationer med egna.
- Ett abonnemang kan räknas som skattefri friskvård (friskvårdsbidrag); stillasittande kontor är en naturlig målgrupp.
