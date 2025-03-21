# Wdrażanie PDFSpark do Railway

Ten dokument zawiera instrukcje dotyczące wdrażania aplikacji PDFSpark na platformie Railway.

## 🚀 Szybki start

1. Zaloguj się do Railway:
   ```bash
   railway login
   ```

2. Uruchom skrypt wdrożeniowy:
   ```bash
   ./railway-manual-deploy.sh
   ```

3. Otwórz projekt w przeglądarce:
   ```bash
   railway open
   ```

## 📋 Wymagania

- Konto Railway (https://railway.app)
- Zainstalowany Railway CLI (`npm install -g @railway/cli`)
- Klucze Cloudinary (Cloud Name, API Key, API Secret)

## 🔧 Konfiguracja

### Zmienne środowiskowe

Aplikacja wymaga następujących zmiennych środowiskowych:

- `NODE_ENV=production` - Tryb produkcyjny
- `PORT=3000` - Port, na którym działa aplikacja
- `USE_MEMORY_FALLBACK=true` - Włącza tryb pamięci (wymagany dla Railway)
- `CORS_ALLOW_ALL=true` - Ułatwia testy CORS
- `TEMP_DIR=/app/temp` - Katalog tymczasowy
- `UPLOAD_DIR=/app/uploads` - Katalog przesłanych plików
- `LOG_DIR=/app/logs` - Katalog logów
- `CLOUDINARY_CLOUD_NAME` - Nazwa chmury Cloudinary
- `CLOUDINARY_API_KEY` - Klucz API Cloudinary
- `CLOUDINARY_API_SECRET` - Sekret API Cloudinary

## 🛠️ Dostępne skrypty

1. **railway-manual-deploy.sh** - Pełny proces wdrożenia
2. **railway-monitor.sh** - Monitorowanie statusu wdrożenia
3. **railway-diagnose.sh** - Diagnostyka problemów z wdrożeniem

## 🔍 Rozwiązywanie problemów

### Problem 1: Wdrożenie nie przechodzi healthcheck

**Rozwiązanie:**
- Sprawdź, czy endpoint `/health` działa poprawnie
- Zwiększ timeout healthcheck w `railway.json`
- Upewnij się, że PORT jest ustawiony na 3000

### Problem 2: Pusty projekt po wdrożeniu

**Rozwiązanie:**
- Upewnij się, że Railway ma dostęp do Twojego repozytorium
- Spróbuj wdrożenia za pomocą interfejsu webowego (zobacz `RAILWAY_INTERFACE_DEPLOYMENT.md`)

### Problem 3: Problemy z pamięcią

**Rozwiązanie:**
- Upewnij się, że `USE_MEMORY_FALLBACK=true` jest ustawione
- Sprawdź, czy startup command zawiera flagę `--max-old-space-size=2048`

## 📝 Dodatkowe informacje

- **RAILWAY_INTERFACE_DEPLOYMENT.md** - Instrukcje wdrażania przez interfejs webowy
- **RAILWAY_DEPLOYMENT_FIX.md** - Szczegóły rozwiązywania typowych problemów

## 🧪 Testowanie wdrożenia

Po wdrożeniu, aplikacja powinna być dostępna pod adresem przydzielonym przez Railway.

Aby sprawdzić, czy aplikacja działa poprawnie:
1. Otwórz URL w przeglądarce
2. Dodaj `/health` na końcu URL, aby sprawdzić endpoint healthcheck
3. Sprawdź, czy frontend Vercel może komunikować się z backendem

## 📊 Monitorowanie

Możesz monitorować swoją aplikację za pomocą:
- Panelu Railway w sekcji "Metrics"
- Logów Railway w sekcji "Logs"
- Skryptu `railway-monitor.sh`