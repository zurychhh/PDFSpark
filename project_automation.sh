#!/bin/bash

# Ustawienie zmiennych środowiskowych dla automatyzacji
export CI=true
export FORCE_COLOR=true
export CLAUDE_AUTO_APPROVE=true

# Funkcja do logowania
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Funkcja do odczytywania informacji z claude.md
read_claude_md() {
    if [ ! -f "claude.md" ]; then
        log "Błąd: Plik claude.md nie istnieje"
        exit 1
    fi
    log "Odczytywanie informacji z claude.md"
    # Tutaj możesz dodać kod do parsowania claude.md
}

# Funkcja do aktualizacji dokumentacji
update_documentation() {
    log "Aktualizacja dokumentacji technicznej"
    # Automatyczna aktualizacja dokumentacji bez pytania o zgodę
    # Przykład:
    # npx typedoc --out docs src --yes
}

# Funkcja do uruchamiania testów
run_tests() {
    log "Uruchamianie testów"
    # Uruchamianie wszystkich testów bez interakcji
    npm run test -- --watchAll=false --ci --coverage
}

# Funkcja do deploymentu
deploy() {
    log "Rozpoczęcie procesu deploymentu"
    
    # Deployment frontendu na Vercel bez interakcji
    if grep -q "Vercel" claude.md; then
        log "Deployment frontendu na Vercel"
        vercel --prod --yes
    fi
    
    # Deployment backendu na Railway bez interakcji
    if grep -q "Railway.app" claude.md; then
        log "Deployment backendu na Railway"
        railway up --yes
    fi
}

# Główna funkcja automatyzacji
main() {
    log "Rozpoczęcie automatyzacji projektu"
    
    # Odczytaj informacje z claude.md
    read_claude_md
    
    # Aktualizacja repozytorium bez pytania o potwierdzenie
    git pull origin main --no-edit
    
    # Instalacja zależności bez interakcji
    npm ci
    
    # Uruchomienie testów
    run_tests
    
    # Aktualizacja dokumentacji
    update_documentation
    
    # Commit zmian w dokumentacji bez pytania o potwierdzenie
    git add docs
    git commit -m "Automatyczna aktualizacja dokumentacji na podstawie claude.md" --no-verify
    git push origin main --no-verify
    
    # Deployment
    deploy
    
    log "Automatyzacja zakończona"
}

# Uruchomienie głównej funkcji
main
