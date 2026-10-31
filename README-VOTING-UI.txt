ChatForge — Voting UI patch (Feature Freeze)
===========================================

Conținutul pachetului:
  src/overlay.ts         (unica modificare a unui fișier existent)
  public/vote-focus.js   (nou)
  public/vote-focus.css  (nou)
  test/vote-focus.test.ts (test nou)

CE FACE
- Afișează panou mare de vot în OBS DOAR cât timp cooperative.phase = vote.
- Arată !vote 1 / !vote 2, titlu, opțiuni, cronometru și numărul voturilor.
- Arată rezultatul pentru faza result existentă (10 secunde) și schimbarea Chaos.
- Utilizează direct mesajele world.snapshot transmise de serverul existent.
- Păstrează pagina curentă, harta, fișierele SVG, Director, Twitch EventSub și ?transparent=1.
- Nu adaugă un nou sistem de vot și nu schimbă regulile jocului.

INSTALARE PE WINDOWS (din directorul chatforge-core)
1. Oprește npm start cu Ctrl+C. ATENȚIE: versiunea curentă nu persistă harta după repornire.
2. Fă backup: Copy-Item .\src\overlay.ts .\src\overlay.ts.before-vote-ui -Force
3. Pune chatforge-voting-ui-patch.zip în directorul chatforge-core.
4. Rulează: Expand-Archive -Path .\chatforge-voting-ui-patch.zip -DestinationPath . -Force
5. Rulează: npm run check
6. Rulează: npm test
7. Rulează: npm start
8. În OBS și browser, reîncarcă overlay-ul (Refresh), apoi aprobă o criză nouă.
9. Verifică din nou ?transparent=1.

REVERSIBIL
Copy-Item .\src\overlay.ts.before-vote-ui .\src\overlay.ts -Force
Remove-Item .\public\vote-focus.js,.\public\vote-focus.css,.\test\vote-focus.test.ts -ErrorAction SilentlyContinue

IMPORTANT
- Dacă ai schimbări noi în overlay.ts după ce ai pregătit ZIP-ul inițial, nu suprascrie automat fișierul; compară diferențele înainte de instalare.
- Niciun .env, token, secret sau fișier de hartă nu se află în acest patch.
- Nu a fost posibil să rulăm npm test și npm run check în mediul de pregătire,
  pentru că dependențele npm nu sunt disponibile. Verificarea JS și smoke test-ul UI au trecut.
