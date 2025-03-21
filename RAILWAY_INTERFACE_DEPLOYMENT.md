# Wdrażanie PDFSpark do Railway przez interfejs webowy

Jeśli masz problemy z wdrażaniem przez CLI, możesz użyć interfejsu webowego Railway. Poniżej znajdziesz szczegółową instrukcję.

## Krok 1: Przygotowanie projektu

1. Upewnij się, że masz konto w Railway.app
2. Zaloguj się na https://railway.app/dashboard

## Krok 2: Tworzenie nowego projektu

1. Kliknij przycisk "New Project" w panelu Railway
2. Wybierz opcję "Deploy from GitHub repo"
3. Połącz swoje konto GitHub jeśli jeszcze tego nie zrobiłeś
4. Wybierz repozytorium "react-pdfspark"
5. Wybierz gałąź "main"
6. Kliknij "Deploy Now"

## Krok 3: Konfiguracja projektu

Po utworzeniu projektu, należy skonfigurować odpowiednie ustawienia:

1. Przejdź do zakładki "Settings" projektu
2. W sekcji "Build & Deploy":
   - Root Directory: `/`
   - Builder: `Dockerfile`
   - Watch Paths: `.` (kropka)
   - Healthcheck Path: `/health`
   - Healthcheck Timeout: `30`
   - Start Command: `node --max-old-space-size=2048 railway-entry.js`

## Krok 4: Konfiguracja zmiennych środowiskowych

1. Przejdź do zakładki "Variables" projektu
2. Dodaj następujące zmienne:
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - `USE_MEMORY_FALLBACK`: `true`
   - `CORS_ALLOW_ALL`: `true`
   - `TEMP_DIR`: `/app/temp`
   - `UPLOAD_DIR`: `/app/uploads`
   - `LOG_DIR`: `/app/logs`
   - `CLOUDINARY_CLOUD_NAME`: `dciln75i0`
   - `CLOUDINARY_API_KEY`: `756782232717326`
   - `CLOUDINARY_API_SECRET`: `<twój_sekret>`

## Krok 5: Monitoring wdrożenia

1. Przejdź do zakładki "Deployments"
2. Obserwuj status najnowszego wdrożenia
3. Jeśli wdrożenie zakończy się niepowodzeniem, sprawdź logi, klikając na wdrożenie

## Krok 6: Sprawdzanie logów

1. Przejdź do zakładki "Logs"
2. Obserwuj logi w czasie rzeczywistym
3. Filtruj logi, aby znaleźć ewentualne błędy

## Krok 7: Testowanie aplikacji

Po udanym wdrożeniu:

1. Przejdź do zakładki "Settings"
2. W sekcji "Domains", znajdziesz publiczny URL twojej aplikacji
3. Kliknij na URL, aby otworzyć aplikację w przeglądarce
4. Sprawdź, czy endpoint `/health` działa poprawnie, dodając `/health` na końcu URL

## Krok 8: Konfiguracja frontendu Vercel

Po udanym wdrożeniu backendu:

1. Zaktualizuj pliki `.env.production` i `vercel.json` z nowym URL backendu
2. Wdróż frontend na Vercel

## Rozwiązywanie problemów

### Problem 1: Wdrożenie nie przechodzi testu healthcheck

Sprawdź:
- Logi, aby zobaczyć, czy aplikacja uruchamia się poprawnie
- Czy endpoint `/health` jest dostępny
- Czy PORT jest ustawiony na 3000

### Problem 2: Błędy pamięci podczas wdrażania

Upewnij się, że:
- `USE_MEMORY_FALLBACK` jest ustawione na `true`
- Start command używa flagi `--max-old-space-size=2048`

### Problem 3: Aplikacja uruchamia się, ale nie działa poprawnie

Sprawdź:
- Czy zmienne Cloudinary są poprawnie ustawione
- Czy katalogi tymczasowe są poprawnie skonfigurowane