# Naprawa Błędu Deploymentu Railway dla PDFSpark

## Problem

Obecna konfiguracja deploymentu Railway powoduje błędy podczas budowania obrazu Docker. Analizując logi z nieudanego deployu oraz porównując z ostatnim działającym deploymentem (cf3a7b9), zidentyfikowałem następujące problemy:

1. **Konflikt konfiguracji Railway**: Istnieją dwa pliki `railway.json` - jeden w katalogu głównym i jeden w katalogu `backend/`, które definiują różne metody budowania:
   - Główny `railway.json` używa `NIXPACKS`
   - `backend/railway.json` używa `DOCKERFILE`

2. **Błędy podczas budowania Dockera**:
   ```
   failed to calculate checksum of ref: '/backend': not found
   failed to calculate checksum of ref: '/railway-entry.js': not found
   ```
   Pliki, które Docker próbuje skopiować, nie są dostępne w kontekście budowania.

3. **Niewłaściwe ścieżki względne**: Główny Dockerfile próbuje kopiować pliki używając ścieżek, które nie są dostępne w kontekście budowania.

## Rozwiązanie

Istnieją dwie opcje rozwiązania problemu:

### Opcja 1: Powrót do działającej konfiguracji (najszybsze rozwiązanie)

Zmiany, które zostały już wprowadzone:

1. **Zaktualizowano główny `railway.json`**:
   - Zmieniono builder z `NIXPACKS` na `DOCKERFILE`
   - Wskazano ścieżkę do Dockerfile w katalogu backend: `"dockerfilePath": "backend/Dockerfile"`

2. **Zaktualizowano `backend/Dockerfile`**:
   - Dodano optymalizacje pamięci
   - Skonfigurowano użycie katalogów tymczasowych w `/tmp`
   - Dodano wsparcie dla memory fallback

### Opcja 2: Skrypt Naprawczy (kompleksowe rozwiązanie)

Przygotowałem skrypt `railway-fix-deploy.sh`, który automatycznie naprawia konfigurację i wdraża aplikację:

1. Tworzy kopie zapasowe obecnych plików konfiguracyjnych
2. Aktualizuje główny `railway.json` aby używał `DOCKERFILE` i wskazywał na `backend/Dockerfile`
3. Aktualizuje `backend/Dockerfile` z optymalizacjami pamięci i porządkuje ścieżki
4. Ustawia niezbędne zmienne środowiskowe w projekcie Railway
5. Zatwierdza zmiany w repozytorium Git
6. Inicjuje nowy deployment na Railway

## Instrukcje Naprawy

### Metoda 1: Manualne wdrożenie

1. Już zaktualizowaliśmy pliki konfiguracyjne
2. Zatwierdź zmiany:
   ```bash
   git add railway.json backend/Dockerfile
   git commit -m "Fix Railway deployment configuration"
   git push
   ```
3. Wdróż na Railway:
   ```bash
   railway up --detach
   ```

### Metoda 2: Użycie skryptu naprawczego

Wykonaj poniższe kroki:

1. Upewnij się, że skrypt jest wykonywalny:
   ```bash
   chmod +x railway-fix-deploy.sh
   ```

2. Uruchom skrypt:
   ```bash
   ./railway-fix-deploy.sh
   ```

3. Postępuj zgodnie z instrukcjami wyświetlanymi przez skrypt

## Weryfikacja

Po zakończeniu deploymentu sprawdź, czy aplikacja działa poprawnie:

1. Otwórz przeglądarkę i przejdź do: https://pdfspark-production-production.up.railway.app/health
2. Sprawdź logi w dashboardzie Railway
3. Użyj skryptu `check-railway-status.sh` aby zweryfikować konfigurację CORS

## Dlaczego Rozwiązanie Zadziała

1. **Jednolita Konfiguracja**: Używamy tylko jednego pliku `railway.json` z jasno określoną metodą budowania
2. **Właściwe Ścieżki**: Dockerfile znajduje się w katalogu `backend/`, więc wszystkie operacje COPY są względem tego katalogu
3. **Optymalizacje Pamięci**: Zachowujemy wszystkie optymalizacje pamięci i konfigurację katalogów tymczasowych
4. **Zachowanie Zmiennych Środowiskowych**: Wszystkie potrzebne zmienne środowiskowe są ustawione, w tym konfiguracja CORS

## Zapobieganie Podobnym Problemom w Przyszłości

1. **Jednolita Struktura Konfiguracji**: Unikaj duplikowania plików konfiguracyjnych w różnych katalogach
2. **Testowanie Budowania Lokalnie**: Testuj budowanie Dockera lokalnie przed wdrożeniem
3. **Monitorowanie Zmian Konfiguracji**: Zwracaj szczególną uwagę na zmiany w plikach `Dockerfile` i `railway.json`
4. **Zachowaj działające kopie**: Zachowuj kopie działających konfiguracji, aby móc szybko wrócić do działającego stanu