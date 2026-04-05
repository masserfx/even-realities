# Smart Glasses App Ideas — Even Realities G2

> Průzkum 30 nejperspektivnějších aplikací pro G2 smart glasses.
> Vytvořeno: 2026-04-05 | Zdroj: deep search (market research, competitor analysis)

## G2 Hardware Constraints

- Display: 576×288px, monochromatický zelený, 4 úrovně šedi
- Vstup: mikrofon (4x), dotykový panel na stranici, R1 prsten (Bluetooth)
- Konektivita: Bluetooth k telefonu, Wi-Fi
- Bez kamery (výhoda pro privacy)
- Vzhled normálních brýlí (diskrétnost)

---

## Aplikace — seřazeno dle potenciálu

### TIER 1 — Highest Impact (skóre 4.5+)

- [ ] **1. Real-time překladač konverzací** ⭐ 5.0 — `IMPLEMENTED`
  - Živé titulky překladu v zorném poli během konverzace
  - Cílová skupina: cestovatelé, expati, mezinárodní obchod
  - Výhoda brýlí: oční kontakt zachován, diskrétní, hands-free
  - Trh: 60 mld USD (jazykové služby), Meta Ray-Ban top 3 funkce
  - Status: základní verze hotová (push + live mode, Whisper + GPT)

- [ ] **2. Navigace se šipkami v zorném poli** ⭐ 4.8 — `PLANNED` ([plan-navigation.md](plan-navigation.md))
  - Turn-by-turn navigace pro pěší, cyklisty, řidiče
  - Cílová skupina: cestovatelé, kurýři, cyklisté
  - Výhoda brýlí: -34% kognitivní zátěž vs. telefon (University of Michigan)
  - Trh: 30 mld USD, Amazon nasadil pro doručovatele, 85% uživatelů chce
  - Implementace: Google Maps API / Mapbox → šipky + vzdálenost na HUD

- [x] **3. Titulky pro neslyšící a nedoslýchavé** ⭐ 4.8 — `IMPLEMENTED`
  - Živý přepis řeči do textu v zorném poli
  - Cílová skupina: 1,5 mld lidí se ztrátou sluchu (WHO)
  - Výhoda brýlí: jediná forma kde text neruší oční kontakt
  - Trh: Captify, XanderGlasses komerčně úspěšné, EU Accessibility Act
  - Implementace: Whisper STT → text na HUD (varianta překladače bez překladu)

- [ ] **4. AI asistent s hlasovým ovládáním** ⭐ 4.7 — `IMPLEMENTED`
  - Hands-free ChatGPT/Claude s odpověďmi v brýlích
  - Cílová skupina: profesionálové, studenti, kreativci
  - Výhoda brýlí: bez vytahování telefonu, diskrétní
  - Trh: AI asistenti nejrychleji rostoucí segment
  - Status: základní verze hotová (chat mode s GPT-4.1)

- [x] **5. Teleprompter pro řečníky** ⭐ 4.7 — `IMPLEMENTED`
  - Neviditelný teleprompter — text plyne v zorném poli
  - Cílová skupina: CEO, lektoři, YouTubeři, politici
  - Výhoda brýlí: JEDINÉ zařízení kde to funguje neviditelně
  - Trh: Even G2 již propaguje, Meta přidala na CES 2026
  - Implementace: PDF/TXT import → auto-scroll s nastavitelnou rychlostí

- [ ] **6. Sportovní HUD metriky** ⭐ 4.7 — `PLANNED` ([plan-sports-hud.md](plan-sports-hud.md))
  - Tepová frekvence, rychlost, kadence, vzdálenost v zorném poli
  - Cílová skupina: cyklisté, běžci, vytrvalostní sportovci
  - Výhoda brýlí: oči na cestě, -5-8% vnímaná námaha
  - Trh: 70 mld USD (wearables), Engo 2 ($329), Garmin + Meta partnerství
  - Implementace: BLE senzory (HR pás, power meter) → metriky na HUD

- [ ] **7. Notifikace a triáž zpráv** ⭐ 4.5
  - Chytré filtrování notifikací z telefonu v brýlích
  - Cílová skupina: každý uživatel smartphonu (96x/den kontrola)
  - Výhoda brýlí: 2s pohled stačí, bez vytahování telefonu
  - Trh: nejuniverzálnější use case, každý výrobce má
  - Implementace: notification listener → AI prioritizace → HUD

- [ ] **8. Prep Notes — příprava na schůzky** ⭐ 4.5
  - CRM data, LinkedIn profily, poznámky v brýlích během schůzky
  - Cílová skupina: sales manažeři, konzultanti, HR
  - Výhoda brýlí: informace v zorném poli, protistrana nevidí
  - Trh: 80 mld USD (CRM), 25-30% zkrácení doby uzavření obchodu
  - Implementace: Salesforce/HubSpot API → kontext meeting → HUD

### TIER 2 — High Potential (skóre 4.0–4.4)

- [ ] **9. Čtečka e-knih** ⭐ 4.3
  - EPUB/PDF čtečka optimalizovaná pro HUD
  - Cílová skupina: čtenáři, dojíždějící, studenti
  - Výhoda brýlí: hands-free čtení v MHD, nízká únava očí
  - Trh: 15 mld USD, Even Hub má Epub Reader
  - Implementace: EPUB parser → paginated text → R1 ovládání

- [ ] **10. Přepis schůzek + AI shrnutí** ⭐ 4.3
  - Živý přepis + automatické shrnutí klíčových bodů
  - Cílová skupina: manažeři, konzultanti, studenti, novináři
  - Výhoda brýlí: sledování mluvčího + přepis současně
  - Trh: Otter.ai, Fireflies.ai rostou, "meeting intelligence"
  - Implementace: Whisper STT → GPT summarization → action items

- [ ] **11. Asistent pro učení jazyků** ⭐ 4.3
  - Kontextové slovíčka, flashcards, korekce výslovnosti
  - Cílová skupina: 340M uživatelů Duolingo
  - Výhoda brýlí: immerzní učení bez odtržení od reality
  - Trh: 60 mld USD, +200% retence vs. učebnice
  - Implementace: rozšíření překladače o learning mode + spaced repetition

- [ ] **12. Zdravotní metriky (CGM, tepová f.)** ⭐ 4.2
  - Data ze senzorů (hodinky, glukóza) v zorném poli
  - Cílová skupina: 537M diabetiků, kardiaci, biohackeři
  - Výhoda brýlí: glukóza jedním pohledem, včasné varování
  - Trh: CGM +20%/rok, digitální zdraví 300 mld USD
  - Implementace: Apple Health / Google Fit API → BLE → HUD dashboard

- [ ] **13. Průvodce terénním servisem** ⭐ 4.2
  - Hands-free manuály, schémata, check-listy při opravách
  - Cílová skupina: technici, údržbáři, elektrikáři
  - Výhoda brýlí: ruce volné pro nářadí, -25-30% doba oprav
  - Trh: 27% podíl na trhu smart glasses (Grand View Research)
  - Implementace: PDF manuály → krokové instrukce → voice navigation

- [ ] **14. Skladové operace (pick-by-vision)** ⭐ 4.2
  - Navigace po skladu, pick listy, inventář hands-free
  - Cílová skupina: skladníci, logistika, e-commerce fulfillment
  - Výhoda brýlí: obě ruce volné, rychlejší než ruční skenery
  - Trh: 20 mld USD (warehouse automation), Vuzix LX1, Amazon deploy
  - Implementace: WMS integrace → pick instrukce → barcode verification

- [ ] **15. Meditace a dechová cvičení** ⭐ 4.0
  - Vizuální průvodce dechem, timer meditace, mindfulness
  - Cílová skupina: 500M meditujících, Headspace 70M uživatelů
  - Výhoda brýlí: meditace s otevřenýma očima, kdekoli, diskrétně
  - Trh: 7 mld USD (wellness apps), Even Hub má "Stillness"
  - Implementace: dechová animace (expand/contract) → timer → HRV integrace

- [ ] **16. Dev notifikace (CI/CD, PagerDuty)** ⭐ 4.0
  - Build status, PR reviews, deploy alerts, monitoring
  - Cílová skupina: 28M+ vývojářů, DevOps, SRE
  - Výhoda brýlí: bez přerušení flow, periferní notifikace
  - Trh: developer tools multimiliardový segment
  - Implementace: GitHub/GitLab webhooks → priority filter → HUD alerts

- [ ] **17. Hudební ovládání + Now Playing** ⭐ 4.0
  - Aktuální píseň, skip/pause/volume přes R1 prsten
  - Cílová skupina: Spotify 600M+ uživatelů
  - Výhoda brýlí: hands-free při běhu, v zimě bez rukavic
  - Trh: 30+ mld USD (music streaming)
  - Implementace: Spotify/Apple Music API → media controls → R1 gestures

### TIER 3 — Solid Potential (skóre 3.5–3.9)

- [ ] **18. Počasí a denní briefing** ⭐ 3.8
  - Ranní dashboard: počasí, kalendář, zprávy, doprava
  - Cílová skupina: každý uživatel
  - Výhoda brýlí: ambient info pouhým pohledem
  - Implementace: weather API + calendar API → morning glance

- [ ] **19. Burzovní ticker a finanční alerty** ⭐ 3.8
  - Real-time ceny akcií/krypto, cenové alerty
  - Cílová skupina: tradeři, investoři
  - Výhoda brýlí: real-time data bez přepínání oken
  - Implementace: finance API → watchlist → threshold alerts

- [ ] **20. Studijní flashcards (Anki styl)** ⭐ 3.8
  - Spaced repetition karty v brýlích
  - Cílová skupina: studenti medicíny, práva, jazyků
  - Výhoda brýlí: využití "mrtvého času", ruce volné
  - Implementace: Anki export → SR algoritmus → R1 reveal/rate

- [ ] **21. Remote asistence** ⭐ 3.8
  - Vzdálený expert posílá instrukce do brýlí technika
  - Cílová skupina: servisní firmy, nemocnice
  - Výhoda brýlí: hands-free instrukce (bez kamery jen text/schémata)
  - Implementace: WebRTC text channel → real-time instrukce na HUD

- [ ] **22. Tesla / EV integrace** ⭐ 3.7
  - Stav nabíjení, dosah, zamykání/odemykání
  - Cílová skupina: 20M+ EV majitelů
  - Výhoda brýlí: rychlý pohled na stav bez telefonu
  - Implementace: Tesla/EV API → charge status → HUD widget

- [ ] **23. Kuchařský asistent hands-free** ⭐ 3.7
  - Krokový recept v brýlích, timer, hlasové ovládání
  - Cílová skupina: domácí kuchaři
  - Výhoda brýlí: špinavé/mokré ruce, recept stále viditelný
  - Implementace: recipe parser → step-by-step → voice next/timer

- [ ] **24. Dopravní info MHD** ⭐ 3.7
  - Real-time příjezdy, zpoždění, výluky
  - Cílová skupina: dojíždějící
  - Výhoda brýlí: info na zastávce bez telefonu
  - Implementace: GTFS real-time API → nearest stop → arrival times

- [ ] **25. Guided workout / osobní trenér** ⭐ 3.7
  - Cviky, opakování, odpočinkový timer v zorném poli
  - Cílová skupina: fitness nadšenci
  - Výhoda brýlí: při cvičení nelze koukat na telefon
  - Implementace: workout plans → exercise display → R1 next/rest timer

- [ ] **26. Šachy a logické hry** ⭐ 3.5
  - Šachy, sudoku, křížovky na HUD
  - Cílová skupina: Chess.com 150M+ účtů
  - Výhoda brýlí: diskrétní hra kdykoli, mono displej ideální
  - Implementace: chess engine → 288px board → R1 move input

- [ ] **27. Marketing metriky kampaní** ⭐ 3.5
  - CTR, konverze, ROAS, anomálie alerty
  - Cílová skupina: performance marketéři, CMO
  - Výhoda brýlí: glanceable metriky bez dashboardu
  - Implementace: Google Ads / Meta Ads API → KPI alerts → HUD

- [ ] **28. Chirurgický / klinický asistent** ⭐ 3.5
  - Vitální funkce, procedury check-listy, lékové interakce
  - Cílová skupina: lékaři, chirurgové
  - Výhoda brýlí: oči na pacientovi, -32% chirurgické chyby
  - Trh: 171M→235M USD (2025→2032)
  - Implementace: EHR integrace → vitals + checklists → sterile voice control

- [ ] **29. Onboarding zaměstnanců** ⭐ 3.5
  - Krokové tréningové instrukce při práci
  - Cílová skupina: HR, výroba, retail
  - Výhoda brýlí: kontextové "learning by doing"
  - Implementace: training scripts → step-by-step → progress tracking

- [ ] **30. Koučink veřejného vystupování** ⭐ 3.3
  - Tempo řeči, výplňová slova, čas zbývající
  - Cílová skupina: manažeři, studenti, Toastmasters
  - Výhoda brýlí: neviditelný real-time feedback
  - Implementace: speech analysis → pace/filler alerts → breathing prompts

---

## Strategické poznámky

### Již implementováno v tomto projektu
- Real-time překlad (#1) — push + live mode, Whisper + GPT-4.1
- AI chat asistent (#4) — GPT-4.1, streaming
- Komixový generátor (bonus) — DALL-E, 10 stylů, glasses display

### Quick wins (rozšíření stávajícího kódu)
- Titulky pro neslyšící (#3) — varianta překladače bez překladu
- Teleprompter (#5) — text scroll na HUD
- Učení jazyků (#11) — rozšíření překladače o learning mode

### Největší B2B příležitosti
- Prep Notes (#8) — CRM integrace, sales teams
- Terénní servis (#13) — hands-free manuály
- Skladové operace (#14) — pick-by-vision

### Tržní kontext (2025-2026)
- Trh smart glasses: 2,5 → 3,2 mld USD, CAGR 27%+
- AI smart glasses revenue 4× v 2026
- Even Hub ekosystém: 2000+ vývojářů (launch 3. 4. 2026)
- Apple a Samsung chystají vstup na trh v 2026
- G2 výhoda: bez kamery = privacy-first (healthcare, B2B, školy)
