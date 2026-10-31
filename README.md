# ChatForge Core

Backend Node.js 22+ / TypeScript, Twitch EventSub, parser OpenAI, moderare și overlay OBS.

## Demo de moderare (fără chei)
Din directorul proiectului:
1. npm install
2. npm run demo:director
3. Deschide linkul **Director (privat, local)** afișat în terminal.
4. Deschide overlay-ul din panou într-o a doua filă.
5. Editează și aprobă o propunere: abia acum apare pe hartă. Respinge alta: harta rămâne neschimbată.

Sunt patru propuneri simulate, cu autori marcați Demo. Pentru o nouă rundă, repornește serverul.
Linkul Director conține cheia locală de control. Păstrează-l în afara streamului. Cheia se schimbă la fiecare pornire.
Panoul poate fi reîncărcat în aceeași filă: cheia rămâne în sessionStorage. După repornirea serverului, deschide noul link din terminal.
Portul implicit este 4173. Pentru un port alternativ în PowerShell:
$env:PORT='4175'
npm run demo:director

## Flux live
1. Copy-Item .env.example .env
2. Completează local OPENAI_API_KEY, OPENAI_MODEL, TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN, TWITCH_BROADCASTER_ID.
3. Oprește orice demo de pe portul 4173, apoi npm start.
4. Deschide linkul Director din terminal și overlay-ul.
5. Scrie în chat: !forge item lanterna minciunilor
6. Propunerea apare în panou. Aprobă sau editează și aprobă pentru a o trimite pe hartă.

Ordinea: Twitch → filtru/coadă → parser AI → validare Zod → propunere → decizia streamerului → reducer → WebSocket → OBS.
Refuzurile modelului sau erorile de parsare nu creează propuneri. Tipul, numele, descrierea, impactul și statisticile se pot edita.
Autorul și ID-ul sursei rămân metadate ale mesajului original. Editările sunt validate din nou pe server.
Aprobările repetate nu publică din nou. Propunerile respinse nu ajung pe overlay.
Capacitate: maximum 50 de propuneri în așteptare. Excesul este ignorat și semnalat în terminal.
Coada de propuneri și lumea sunt doar în memorie; se pierd la repornire.

## Autorizare Twitch
Înregistrează aplicația la https://dev.twitch.tv/console/apps.
Folosește un User Access Token cu user:read:chat, emis pentru același Client ID.
De exemplu, după configurarea Twitch CLI pentru aplicația ta:
twitch token --user-token --scopes "user:read:chat"

TWITCH_BROADCASTER_ID este ID-ul numeric al canalului; user_id din subscripție este extras din token.
Tokenul se validează la pornire și periodic. La expirare/revocare, reautorizează și repornește.
Nu publica .env și nu trimite cheile în chat.

## OBS și alte demo-uri
Browser Source: http://127.0.0.1:4173/overlay?transparent=1
Dimensiuni orientative: 1600 × 1000 sau 1920 × 1080. Modul transparent peste video trebuie verificat în OBS pe configurația ta.
npm run demo — fixture în consolă.
npm run demo:visual — patru creații automate, fără moderare, doar pentru prezentarea animațiilor.
npm run demo:director — demo cu aprobare manuală, recomandat pentru testarea fluxului.
Demo-urile și serverul live folosesc implicit același port; rulează unul singur.

## Verificări
npm run check
npm test
node --check public/director.js

Testele de integrare deschid conexiuni HTTP/WebSocket locale. Nu folosesc Twitch, OpenAI sau chei reale.
Sunt verificate: schema, coada parserului, reducerul, autorii, moderarea, editările invalide, aprobările duplicate, accesul la API și publicarea prin WebSocket.
Panoul se actualizează prin polling la 1,5 secunde; o actualizare nu suprascrie editările în curs.
Serverul ascultă doar pe 127.0.0.1. API-ul de control cere cheia Director și verifică originea cererilor de modificare.
Overlay-ul primește exclusiv starea publicată, fără propunerile în așteptare și fără cheia Director.

## Limite
Generarea textului nu este deterministă; schema și reducerul sunt validate determinist.
Parserul utilizează Responses API și Structured Outputs. OPENAI_MODEL este configurabil (implicit gpt-4o-mini).
Promptul de moderare al modelului este un filtru suplimentar; aprobarea streamerului decide ce apare pe stream.
La deconectări complete, Twitch nu retransmite mesajele pierdute. Refresh OAuth automat nu este inclus.
Lumea afișează ultimele 15 entități și 6 intrări în cronologie. Totalul sesiunii este separat de numărătorile tipurilor prezente pe hartă.
Statusul „Overlay conectat” se referă la conexiunea locală, nu confirmă conexiunea Twitch.

## Codex și înscriere
Regulamentul https://twitchcon-codex.devpost.com/rules cere ID-ul chatului Codex în care a fost construit proiectul.
Păstrează ID-ul real al acestui chat. ID-ul unui răspuns OpenAI sau un UUID local nu îl înlocuiește.
Parserul nu reprezintă un agent Codex runtime; Codex este folosit la dezvoltarea proiectului.

Documentație:
https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
https://dev.twitch.tv/docs/chat/authenticating/
https://developers.openai.com/api/docs/guides/structured-outputs

Pentru serverul live, valorile din .env au prioritate față de variabilele moștenite ale calculatorului.
Completează și OPENAI_API_KEY în fișier; o valoare goală din .env nu preia automat cheia din mediu.
La repetiție, comenzile trebuie să includă descrierea și să fie separate de cel puțin 5 secunde per utilizator:
!forge npc căpitan care își vinde echipa
!forge item lanternă care arată minciunile
!forge event un dragon aterizează lângă sat

Comenzile trunchiate sau cu tip necunoscut sunt ignorate înainte de model.
Zod validează forma datelor; nu garantează că o descriere fără sens este respinsă semantic.
Durata până la panou include coada, generarea AI și până la 1,5 secunde de polling.

## Harta realistă
Overlay-ul folosește acum fundalul local assets/vale-realista-v2.png, cu șase regiuni și etichete separate.
Raportul imaginii este păstrat pentru a alinia terenul cu marcajele. În modul OBS transparent, pagina este transparentă, iar terenul rămâne vizibil.
Actualizarea hărții nu apelează modelul AI.

## Modul cooperativ — Salvați Valea
La fiecare trei creații aprobate în Director, se generează o criză și două opțiuni bazate pe entitățile existente. AI indisponibil: criză de rezervă. Votul durează 60 de secunde: `!vote 1` sau `!vote 2`; primul vot per ID Twitch este definitiv. Voturile nu apelează AI.
Haos inițial 0; criză +30; majoritate −25; egalitate sau lipsă voturi +15. După rezultat urmează 10 secunde de pauză, apoi o nouă rundă de construcție. La Haos 100, Haosul revine la 0 în runda următoare; creațiile de pe hartă se păstrează. Propunerile aprobate în timpul votului rămân pe hartă, dar nu se numără spre următoarea criză.
Modul live folosește OPENAI_MODEL pentru crize. Demo-urile folosesc povestea locală. Fără clasament, premii sau memorie persistentă în această etapă. Repornirea resetează sesiunea și schimbă linkul Director. Pentru activare: repornește `npm.cmd start` și reîncarcă sursa Browser în OBS.

## English interface
The overlay, Director panel, demo content, cooperative game messages and AI output now use English. Commands remain !forge npc/item/event/danger and !vote 1/2. Input may be Romanian or English; newly generated content is requested in English. Restart the server and refresh the OBS Browser Source to activate the full change. Existing in-memory creations are not retroactively translated.

## Natural chat commands and visible feedback
Use `!forge robots`, `!forge a magic sword` or an idea in Romanian. Type prefixes remain optional. The AI infers the entity type and adapts modern ideas to fantasy. One idea per message, up to 500 characters, with a 5-second cooldown. Multiple !forge commands in one message are rejected with guidance. The overlay shows processing, pending approval, publication and rejection/unavailable feedback. This feedback is on the overlay, not sent as Twitch chat replies; the app still only requests read access. Feedback is public and bounded to recent messages.


### Punctaj și crize aprobate
Fiecare creație aprobată cu autor acordă 10 puncte autorului; propunerile în așteptare și cele respinse nu acordă puncte. Rezumatul afișează „🏆 Arhitectul Văii: [Username]”. La egalitate se folosește ordinea alfabetică. Punctajul durează întreaga sesiune și se resetează la repornirea serverului.
Un `event` aprobat adaugă 30 Haos (maximum 100). Câmpul opțional `resolutions` conține exact două texte de 1–140 caractere. Când este prezent, aprobarea deschide imediat votul de 60 secunde; o criză aprobată ulterior înlocuiește votul curent. Crizele automate după trei construcții continuă să funcționeze. Overlay-ul existent rămâne JavaScript fără migrare React/Vite.
