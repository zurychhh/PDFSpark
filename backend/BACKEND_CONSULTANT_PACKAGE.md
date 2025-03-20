# PDFSpark Backend - Pakiet Diagnostyczny dla Konsultanta

## Spis treści
1. [Opis projektu i problemu](#opis-projektu-i-problemu)
2. [Środowisko uruchomieniowe](#środowisko-uruchomieniowe)
3. [Najważniejsze pliki diagnostyczne](#najważniejsze-pliki-diagnostyczne)
4. [Kluczowe fragmenty kodu](#kluczowe-fragmenty-kodu)
5. [Logi i błędy](#logi-i-błędy)
6. [Wdrożone rozwiązania](#wdrożone-rozwiązania)
7. [Pytania do konsultanta](#pytania-do-konsultanta)
8. [Dane kontaktowe](#dane-kontaktowe)

## Opis projektu i problemu

PDFSpark to aplikacja do konwersji plików PDF, która wykorzystuje Node.js i Express.js w warstwie backendowej. Backend odpowiada za:
- Przyjmowanie plików PDF
- Przetwarzanie ich w różnych formatach (docx, txt, png, jpg, itp.)
- Przechowywanie plików w Cloudinary
- Zarządzanie operacjami konwersji

### Główne problemy

1. **Awarie serwerów na Railway** - serwer regularnie nie przechodzi health check, co powoduje restartowanie kontenera
2. **Wysokie zużycie pamięci** - obserwujemy zużycie pamięci na poziomie 82-84%
3. **Błędy "Maximum call stack size exceeded"** - pojawiają się podczas przetwarzania większych plików PDF
4. **Zrywane połączenia z bazą danych** - okresowe problemy z połączeniem do MongoDB

### Historia problemu

Problem pojawił się po wdrożeniu nowej funkcjonalności przetwarzania większych plików PDF w trybie podzielonym na chunki. Mimo implementacji systemu zarządzania pamięcią, serwery nadal ulegają awariom, szczególnie w środowisku Railway z limitowaną pamięcią (512MB-1GB).

## Środowisko uruchomieniowe

### Informacje o deploymencie na Railway

```
Framework: Node.js (Express)
Environment: Production
Node version: v18.17.0
Memory limit: 1024 MB
CPU limit: 1 vCPU
Timeout: 30s
Health check path: /api/diagnostic/health
```

### Zależności

Najważniejsze zależności z package.json:

```json
{
  "dependencies": {
    "aws-sdk": "^2.1048.0",
    "bcryptjs": "^2.4.3",
    "cloudinary": "^1.33.0",
    "compression": "^1.7.4",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "docx": "^8.0.0",
    "dotenv": "^16.0.3",
    "express": "^4.18.2",
    "express-mongo-sanitize": "^2.2.0",
    "express-rate-limit": "^6.7.0",
    "fs-extra": "^11.1.1",
    "helmet": "^6.1.5",
    "jsonwebtoken": "^9.0.0",
    "mongoose": "^7.0.3",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "pdf-lib": "^1.17.1",
    "pdf-parse": "^1.1.1",
    "pdfjs-dist": "^3.8.162",
    "sharp": "^0.32.1",
    "stripe": "^12.2.0",
    "uuid": "^9.0.0",
    "winston": "^3.8.2",
    "xss-clean": "^0.1.1"
  }
}
```

## Najważniejsze pliki diagnostyczne

### Memory Diagnostics

Niedawno wdrożyliśmy rozszerzone narzędzia diagnostyczne dla monitorowania pamięci. Pełny opis znajdziesz w pliku [MEMORY_DIAGNOSTICS.md](./MEMORY_DIAGNOSTICS.md).

```markdown
# PDFSpark Memory Diagnostics

Ten dokument opisuje rozszerzone endpointy diagnostyczne pamięci dostępne w PDFSpark do rozwiązywania problemów z pamięcią, szczególnie w środowiskach z ograniczonymi zasobami jak Railway.

## Dostęp do endpointów diagnostycznych

Wszystkie zaawansowane endpointy diagnostyczne są zabezpieczone kluczem administratora API. Aby uzyskać dostęp, należy dołączyć klucz administratora API na jeden z dwóch sposobów:

1. Używając nagłówka: `X-API-Key: your_admin_api_key`
2. Używając parametru zapytania: `?key=your_admin_api_key`

Klucz administratora API powinien być ustawiony w zmiennych środowiskowych jako `ADMIN_API_KEY`.

## Dostępne endpointy

### 1. Podstawowy sprawdzian pamięci

**Endpoint**: `GET /api/diagnostic/memory`

Ten endpoint dostarcza podstawowych informacji o użyciu pamięci. Nie jest chroniony i dostarcza informacji, które nie są wrażliwe.

### 2. Zaawansowana diagnostyka pamięci

**Endpoint**: `GET /api/diagnostic/memory/advanced`  
**Chroniony**: Tak (wymagany klucz administratora API)

Ten endpoint dostarcza kompleksowych metryk pamięci, analizy trendów, wykrywania wycieków pamięci i opcjonalnego testowania odzyskiwania pamięci.

### 3. Śledzenie historii pamięci

**Endpoint**: `GET /api/diagnostic/memory/history`  
**Chroniony**: Tak (wymagany klucz administratora API)

Ten endpoint zapewnia dostęp do historycznych danych użycia pamięci, pomagając identyfikować wzorce i wykrywać anomalie w czasie.
```

## Kluczowe fragmenty kodu

### Menedżer pamięci

`/backend/utils/processingQueue.js` zawiera klasę MemoryManager, która jest odpowiedzialna za monitorowanie i zarządzanie pamięcią:

```javascript
class MemoryManager {
  constructor(options = {}) {
    this.thresholds = {
      warning: options.warningThreshold || 65,    // 65% użycia pamięci
      critical: options.criticalThreshold || 80,  // 80% użycia pamięci
      emergency: options.emergencyThreshold || 90 // 90% użycia pamięci
    };
    
    this.memoryUsageHistory = [];
    this.historyMaxLength = options.historyMaxLength || 20;
    this.lastClearTime = Date.now();
    this.gcMode = 'auto'; // 'auto', 'forced', 'disabled'
    
    // Interwały dla sprawdzenia pamięci (w ms)
    this.checkInterval = options.checkInterval || 30000; // 30 sekund
    this.criticalCheckInterval = options.criticalCheckInterval || 5000; // 5 sekund
    
    // Opcje odzyskiwania pamięci
    this.recoveryOptions = {
      clearCaches: options.clearCaches !== false,
      clearTimers: options.clearTimers !== false,
      forceGc: options.forceGc !== false
    };
    
    // Status i diagnostyka
    this.status = 'ok'; // 'ok', 'warning', 'critical', 'emergency'
    this.startTime = Date.now();
    this.totalOperations = 0;
    this.failedOperations = 0;
    this.lastMemoryPressure = null;
    
    // Uruchom planowane sprawdzanie, jeśli włączone
    if (options.autoCheck !== false) {
      this.startPeriodicChecks();
    }
    
    // Metryki
    this.metrics = {
      gcCount: 0,
      memoryRecovered: 0,
      peakUsage: 0,
      largestRecovery: 0,
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
    
    console.log('MemoryManager initialized with thresholds:', this.thresholds);
  }
  
  // Pobierz aktualny status pamięci
  getMemoryStatus() {
    const memUsage = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      usedPercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)
    };
    
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const systemUsedPercent = parseFloat(systemMemory.usedPercent);
    
    // Określ status na podstawie progów
    let newStatus = 'ok';
    if (systemUsedPercent >= this.thresholds.emergency || heapUsedPercent >= this.thresholds.emergency) {
      newStatus = 'emergency';
    } else if (systemUsedPercent >= this.thresholds.critical || heapUsedPercent >= this.thresholds.critical) {
      newStatus = 'critical';
    } else if (systemUsedPercent >= this.thresholds.warning || heapUsedPercent >= this.thresholds.warning) {
      newStatus = 'warning';
    }
    
    // Aktualizuj historię użycia
    this.memoryUsageHistory.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      systemTotal: systemMemory.total,
      systemFree: systemMemory.free,
      status: newStatus
    });
    
    // Ogranicz długość historii
    if (this.memoryUsageHistory.length > this.historyMaxLength) {
      this.memoryUsageHistory.shift();
    }
    
    // Aktualizuj metryki
    if (systemUsedPercent > this.metrics.peakUsage) {
      this.metrics.peakUsage = systemUsedPercent;
    }
    
    // Aktualizuj status
    const prevStatus = this.status;
    this.status = newStatus;
    
    // Zanotuj czas nacisku na pamięć
    if (newStatus !== 'ok' && prevStatus === 'ok') {
      this.lastMemoryPressure = Date.now();
    }
    
    return {
      heap: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        usedPercent: heapUsedPercent.toFixed(2)
      },
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      system: systemMemory,
      status: newStatus,
      threshold: {
        warning: this.thresholds.warning,
        critical: this.thresholds.critical,
        emergency: this.thresholds.emergency
      }
    };
  }
  
  // Wykryj potencjalny wyciek pamięci na podstawie historii użycia
  detectMemoryLeak() {
    if (this.memoryUsageHistory.length < 5) {
      return { detected: false, reason: 'Niewystarczająca historia' };
    }
    
    // Sprawdź, czy pamięć stale rośnie
    let increasingCount = 0;
    for (let i = 1; i < this.memoryUsageHistory.length; i++) {
      if (this.memoryUsageHistory[i].heapUsed > this.memoryUsageHistory[i-1].heapUsed) {
        increasingCount++;
      }
    }
    
    const percentIncreasing = (increasingCount / (this.memoryUsageHistory.length - 1)) * 100;
    
    if (percentIncreasing > 80) {
      return {
        detected: true,
        reason: 'Stały wzrost zużycia pamięci',
        percentIncreasing: percentIncreasing.toFixed(2),
        samples: this.memoryUsageHistory.length
      };
    }
    
    return { detected: false, percentIncreasing: percentIncreasing.toFixed(2) };
  }
  
  // Próbuj zwolnić pamięć
  async tryFreeMemory() {
    console.log('Próba odzyskania pamięci...');
    const beforeStatus = this.getMemoryStatus();
    let recoveryActions = [];
    let recoverySuccess = false;
    
    try {
      this.metrics.recoveryAttempts++;
      
      // Zbierz śmieci jeśli włączone
      if (this.recoveryOptions.forceGc && global.gc) {
        console.log('Wywołuję ręcznie garbage collection');
        this.metrics.gcCount++;
        recoveryActions.push('forced-gc');
        try {
          global.gc();
        } catch (gcError) {
          console.error('Błąd podczas ręcznego GC:', gcError);
        }
      }
      
      // Wyczyść cache gdy włączone
      if (this.recoveryOptions.clearCaches) {
        if (global.memoryStorage && typeof global.memoryStorage === 'object') {
          console.log('Czyszczę pamięć podręczną aplikacji');
          recoveryActions.push('clear-app-cache');
          
          // Spróbuj wyczyścić różne kolekcje w pamięci
          try {
            const cacheCollections = ['fileCache', 'operationCache', 'resultCache', 'tempFiles'];
            
            for (const cache of cacheCollections) {
              if (global.memoryStorage[cache]) {
                if (global.memoryStorage[cache] instanceof Map) {
                  const sizeBefore = global.memoryStorage[cache].size;
                  // Usuń stare elementy
                  const now = Date.now();
                  const expiryTime = 30 * 60 * 1000; // 30 minut
                  
                  for (const [key, item] of global.memoryStorage[cache].entries()) {
                    if (item.timestamp && (now - item.timestamp > expiryTime)) {
                      global.memoryStorage[cache].delete(key);
                    }
                  }
                  
                  console.log(`Wyczyszczono ${sizeBefore - global.memoryStorage[cache].size} elementów z ${cache}`);
                } else if (Array.isArray(global.memoryStorage[cache])) {
                  const sizeBefore = global.memoryStorage[cache].length;
                  // Usuń stare elementy starsze niż 30 minut
                  const now = Date.now();
                  const expiryTime = 30 * 60 * 1000; // 30 minut
                  
                  global.memoryStorage[cache] = global.memoryStorage[cache].filter(item => {
                    return !item.timestamp || (now - item.timestamp <= expiryTime);
                  });
                  
                  console.log(`Wyczyszczono ${sizeBefore - global.memoryStorage[cache].length} elementów z ${cache}`);
                } else {
                  // Ostateczność - zresetuj obiekt
                  global.memoryStorage[cache] = (global.memoryStorage[cache] instanceof Map) ? new Map() : [];
                  console.log(`Zresetowano ${cache}`);
                }
              }
            }
          } catch (cacheError) {
            console.error('Błąd podczas czyszczenia cache:', cacheError);
          }
        }
      }
      
      // Wyczyść zmienne tymczasowe
      try {
        // Sugestia GC dla globalnych buforów
        if (global.Buffer) {
          recoveryActions.push('buffer-gc');
          Buffer.from(''); // Pomocnicze dla GC
        }
        
        // Sprawdź użycie procesów potomnych i wymuś GC jeśli to możliwe
        if (global.workerPool && Array.isArray(global.workerPool)) {
          recoveryActions.push('worker-cleanup');
          // Tutaj można dodać wyczyszczenie nieaktywnych workerów
        }
      } catch (gcError) {
        console.error('Błąd podczas czyszczenia zmiennych:', gcError);
      }
      
      // Odczekaj chwilę, aby GC miało czas zadziałać
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Sprawdź efekt działań naprawczych
      const afterStatus = this.getMemoryStatus();
      
      const heapBefore = beforeStatus.heap.used;
      const heapAfter = afterStatus.heap.used;
      const memoryRecovered = heapBefore - heapAfter;
      
      if (memoryRecovered > 0) {
        this.metrics.memoryRecovered += memoryRecovered;
        if (memoryRecovered > this.metrics.largestRecovery) {
          this.metrics.largestRecovery = memoryRecovered;
        }
        
        const recoveredMB = (memoryRecovered / (1024 * 1024)).toFixed(2);
        console.log(`Odzyskano ${recoveredMB} MB pamięci`);
        recoverySuccess = true;
        this.metrics.successfulRecoveries++;
      } else {
        console.log('Nie udało się odzyskać pamięci');
      }
      
      return {
        success: recoverySuccess,
        before: {
          heap: beforeStatus.heap.used,
          rss: beforeStatus.rss,
          status: beforeStatus.status
        },
        after: {
          heap: afterStatus.heap.used,
          rss: afterStatus.rss,
          status: afterStatus.status
        },
        recovered: memoryRecovered,
        recoveredMB: (memoryRecovered / (1024 * 1024)).toFixed(2),
        actions: recoveryActions
      };
    } catch (error) {
      console.error('Błąd podczas próby odzyskania pamięci:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

### ChunkedPdfProcessor

`/backend/utils/chunkedPdfProcessor.js` zawiera implementację podzielonego przetwarzania dużych plików PDF:

```javascript
class ChunkedPdfProcessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 5; // Liczba stron w jednym chunk'u
    this.maxConcurrent = options.maxConcurrent || 2; // Maksymalna liczba równoległych operacji
    this.memoryManager = options.memoryManager || null;
    this.queue = options.queue || null;
    
    // Metryki
    this.metrics = {
      totalProcessed: 0,
      successfulProcessed: 0,
      failedProcessed: 0,
      processingTime: 0,
      largestFileMB: 0,
      averageChunkTime: 0,
      totalChunks: 0
    };
    
    console.log(`ChunkedPdfProcessor initialized with chunkSize=${this.chunkSize}, maxConcurrent=${this.maxConcurrent}`);
  }
  
  async processPdfInChunks(pdfBuffer, targetFormat, options = {}) {
    console.log(`Rozpoczynam przetwarzanie PDF w chunkach (${pdfBuffer.length / (1024 * 1024)).toFixed(2)}MB, format=${targetFormat})`);
    const startTime = Date.now();
    
    try {
      // Aktualizuj metryki
      this.metrics.totalProcessed++;
      if (pdfBuffer.length > this.metrics.largestFileMB * 1024 * 1024) {
        this.metrics.largestFileMB = (pdfBuffer.length / (1024 * 1024)).toFixed(2);
      }
      
      // Wczytaj dokument PDF
      console.log('Wczytuję dokument PDF...');
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer, {
        updateMetadata: false, // Zmniejsza zużycie pamięci
        ignoreEncryption: false
      });
      
      const totalPages = pdfDoc.getPageCount();
      console.log(`Wczytano dokument PDF, stron: ${totalPages}`);
      
      // Podziel na chunki
      const chunkSize = Math.min(this.chunkSize, totalPages);
      const chunks = [];
      
      for (let i = 0; i < totalPages; i += chunkSize) {
        const endPage = Math.min(i + chunkSize, totalPages);
        chunks.push({
          startPage: i,
          endPage: endPage,
          pages: endPage - i
        });
      }
      
      console.log(`Podzielono dokument na ${chunks.length} chunków`);
      this.metrics.totalChunks += chunks.length;
      
      // Przetwarzaj chunki (maksymalnie maxConcurrent na raz)
      let results = [];
      for (let i = 0; i < chunks.length; i += this.maxConcurrent) {
        const currentChunks = chunks.slice(i, i + this.maxConcurrent);
        
        // Sprawdź pamięć przed przetwarzaniem chunka
        if (this.memoryManager) {
          const memStatus = this.memoryManager.getMemoryStatus();
          if (memStatus.status === 'critical' || memStatus.status === 'emergency') {
            console.log(`Krytyczny poziom pamięci (${memStatus.status}), próbuję zwolnić pamięć...`);
            await this.memoryManager.tryFreeMemory();
            
            // Zmniejsz liczbę równoległych operacji jeśli wciąż mamy problemy z pamięcią
            const newStatus = this.memoryManager.getMemoryStatus();
            if (newStatus.status === 'critical' || newStatus.status === 'emergency') {
              this.maxConcurrent = 1;
              console.log('Zmniejszono maxConcurrent do 1 z powodu ograniczonej pamięci');
            }
          }
        }
        
        // Przetwarzaj aktualny zestaw chunków równolegle
        const chunkPromises = currentChunks.map(async (chunk) => {
          const chunkStartTime = Date.now();
          console.log(`Przetwarzam chunk ${chunks.indexOf(chunk) + 1}/${chunks.length} (strony ${chunk.startPage+1}-${chunk.endPage})`);
          
          try {
            // Stwórz nowy dokument tylko z tym fragmentem stron
            const chunkDoc = await PDFLib.PDFDocument.create();
            
            // Indeksy stron do skopiowania
            const pagesToCopy = Array.from(
              { length: chunk.pages }, 
              (_, index) => chunk.startPage + index
            );
            
            // Kopiuj strony
            const copiedPages = await chunkDoc.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach(page => chunkDoc.addPage(page));
            
            // Przetwórz ten mały dokument
            let chunkResult;
            
            if (targetFormat === 'txt') {
              // Implementacja konwersji do tekstu
            } else if (targetFormat === 'docx') {
              // Implementacja konwersji do docx
            } else {
              // Inne formaty
            }
            
            const chunkEndTime = Date.now();
            const chunkProcessingTime = chunkEndTime - chunkStartTime;
            
            console.log(`Chunk ${chunks.indexOf(chunk) + 1}/${chunks.length} przetworzony w ${chunkProcessingTime}ms`);
            
            // Explicite wywołaj garbage collector, jeśli dostępny
            if (global.gc) {
              global.gc();
            }
            
            return {
              ...chunkResult,
              chunkIndex: chunks.indexOf(chunk),
              processingTime: chunkProcessingTime
            };
          } catch (chunkError) {
            console.error(`Błąd przetwarzania chunka ${chunks.indexOf(chunk) + 1}:`, chunkError);
            throw chunkError;
          }
        });
        
        // Czekaj na zakończenie obecnego zestawu chunków
        const chunkResults = await Promise.all(chunkPromises);
        results = results.concat(chunkResults);
        
        // Explicite wywołaj garbage collector po każdym zestawie chunków
        if (global.gc) {
          global.gc();
        }
      }
      
      // Połącz wyniki
      const combinedResult = await this.combineResults(results, targetFormat);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      this.metrics.processingTime += processingTime;
      this.metrics.successfulProcessed++;
      this.metrics.averageChunkTime = this.metrics.processingTime / this.metrics.totalChunks;
      
      console.log(`Przetwarzanie PDF zakończone w ${processingTime}ms`);
      
      return combinedResult;
    } catch (error) {
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      this.metrics.processingTime += processingTime;
      this.metrics.failedProcessed++;
      
      console.error('Błąd podczas przetwarzania PDF w chunkach:', error);
      throw error;
    }
  }
}
```

### Diagnostyka pamięci

`/backend/controllers/diagnosticController.js` zawiera nowe endpointy do szczegółowej diagnostyki pamięci:

```javascript
exports.advancedMemoryDiagnostics = async (req, res) => {
  try {
    // Parametry z zapytania
    const testRecovery = req.query.testRecovery === 'true';
    const details = req.query.details === 'true';
    const estimateSize = req.query.estimateSize === 'true';
    
    // Przygotuj wynik
    const result = {
      status: 'ok',
      timestamp: new Date(),
      memory: {}
    };
    
    // 1. Zbierz podstawowe informacje o pamięci systemu
    const memUsage = process.memoryUsage();
    result.memory.system = {
      free: os.freemem(),
      total: os.totalmem(),
      usedPercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)
    };
    
    // 2. Informacje o pamięci procesu
    result.memory.process = {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0
    };
    
    // 3. Szczegółowe statystyki sterty V8 (jeśli żądano szczegółów)
    if (details && typeof v8 !== 'undefined') {
      try {
        const v8HeapStats = v8.getHeapStatistics();
        result.memory.v8Heap = {
          totalHeapSize: v8HeapStats.total_heap_size,
          totalHeapSizeExecutable: v8HeapStats.total_heap_size_executable,
          totalPhysicalSize: v8HeapStats.total_physical_size,
          totalAvailableSize: v8HeapStats.total_available_size,
          usedHeapSize: v8HeapStats.used_heap_size,
          heapSizeLimit: v8HeapStats.heap_size_limit,
          mallocedMemory: v8HeapStats.malloced_memory,
          peakMallocedMemory: v8HeapStats.peak_malloced_memory,
          numberOfNativeContexts: v8HeapStats.number_of_native_contexts,
          numberOfDetachedContexts: v8HeapStats.number_of_detached_contexts
        };
      } catch (v8Error) {
        console.error('Error getting V8 heap statistics:', v8Error);
      }
    }
    
    // 4. Dane z MemoryManager jeśli istnieje
    let memoryManager = null;
    
    // Sprawdź czy mamy dostęp do ProcessingQueue i MemoryManager
    if (global.processingQueue && global.processingQueue.memoryManager) {
      memoryManager = global.processingQueue.memoryManager;
    } else if (global.memoryManager) {
      memoryManager = global.memoryManager;
    } else if (global.app && global.app.memoryManager) {
      memoryManager = global.app.memoryManager;
    }
    
    if (memoryManager) {
      try {
        // Pobierz status pamięci
        const memStatus = memoryManager.getMemoryStatus();
        
        // Sprawdź wykrywanie wycieków pamięci
        const leakInfo = memoryManager.detectMemoryLeak();
        
        result.memory.memoryManager = {
          status: memStatus.status,
          currentUsagePercent: parseFloat(memStatus.heap.usedPercent),
          thresholds: memoryManager.thresholds,
          trend: leakInfo.detected ? 'increasing' : (
            memoryManager.memoryUsageHistory.length > 1 
              ? (memoryManager.memoryUsageHistory[memoryManager.memoryUsageHistory.length - 1].heapUsed > 
                 memoryManager.memoryUsageHistory[0].heapUsed ? 'upward' : 'stable')
              : 'unknown'
          ),
          memoryLeakDetected: leakInfo.detected,
          historyPoints: memoryManager.memoryUsageHistory.length,
          metrics: memoryManager.metrics
        };
        
        // Dodaj ostatni skuteczny GC, jeśli jest dostępny
        if (memoryManager.lastGcEffectiveness) {
          result.memory.memoryManager.lastGcEffectiveness = memoryManager.lastGcEffectiveness;
        }
      } catch (mmError) {
        console.error('Error getting MemoryManager info:', mmError);
        result.memory.memoryManager = { error: mmError.message };
      }
    }
    
    // 5. Szacowanie rozmiaru komponentów, jeśli żądane
    if (estimateSize) {
      result.memory.componentSizes = {};
      
      // Szacuj rozmiar zmiennych globalnych (bezpiecznie)
      try {
        if (global) {
          result.memory.componentSizes.global = await estimateMemoryStorageSize(global);
        }
        
        // Szacuj rozmiar pamięci podręcznej aplikacji
        if (global.memoryStorage) {
          result.memory.componentSizes.memoryStorage = await estimateMemoryStorageSize(global.memoryStorage);
        }
        
        // Szacuj rozmiar cache aplikacji
        if (global.appCache) {
          result.memory.componentSizes.applicationCache = await estimateMemoryStorageSize(global.appCache);
        }
        
        // Szacuj rozmiar sesji
        if (global.sessions) {
          result.memory.componentSizes.sessions = await estimateMemoryStorageSize(global.sessions);
        }
      } catch (sizeError) {
        console.error('Error estimating component sizes:', sizeError);
        result.memory.componentSizes.error = sizeError.message;
      }
    }
    
    // 6. Test odzyskiwania pamięci, jeśli żądany
    if (testRecovery) {
      result.memory.recoveryTest = {};
      
      // Zapisz stan pamięci przed testem
      const beforeMemory = {
        heapUsed: memUsage.heapUsed,
        rss: memUsage.rss
      };
      
      result.memory.recoveryTest.beforeGc = beforeMemory;
      
      // Najpierw spróbuj normalne GC
      let gcSuccess = false;
      
      try {
        if (global.gc) {
          global.gc();
          gcSuccess = true;
        }
      } catch (gcError) {
        result.memory.recoveryTest.gcError = gcError.message;
      }
      
      // Dodatkowe działania odzyskiwania pamięci
      if (memoryManager && typeof memoryManager.tryFreeMemory === 'function') {
        try {
          const recoveryResult = await memoryManager.tryFreeMemory();
          result.memory.recoveryTest.managerRecovery = recoveryResult;
        } catch (mrError) {
          result.memory.recoveryTest.managerRecoveryError = mrError.message;
        }
      }
      
      // Sprawdź stan pamięci po teście
      const afterMemUsage = process.memoryUsage();
      const afterMemory = {
        heapUsed: afterMemUsage.heapUsed,
        rss: afterMemUsage.rss
      };
      
      result.memory.recoveryTest.afterGc = afterMemory;
      
      // Oblicz skuteczność odzyskiwania
      const heapReclaimedBytes = beforeMemory.heapUsed - afterMemory.heapUsed;
      const heapReclaimedPercent = (heapReclaimedBytes / beforeMemory.heapUsed) * 100;
      
      result.memory.recoveryTest.reclaimedBytes = heapReclaimedBytes;
      result.memory.recoveryTest.reclaimedPercent = heapReclaimedPercent.toFixed(2);
      
      // Oceń skuteczność
      let effectiveness = 'none';
      if (heapReclaimedPercent > 20) {
        effectiveness = 'high';
      } else if (heapReclaimedPercent > 10) {
        effectiveness = 'moderate';
      } else if (heapReclaimedPercent > 1) {
        effectiveness = 'low';
      }
      
      result.memory.recoveryTest.effectiveness = effectiveness;
      result.memory.recoveryTest.gcAvailable = gcSuccess;
    }
    
    // 7. Rekomendacje
    result.recommendations = [];
    
    // Sugestie dotyczące pamięci
    if (parseFloat(result.memory.system.usedPercent) > 85) {
      result.recommendations.push('Rozważ zwiększenie dostępnej pamięci do co najmniej 2GB');
    }
    
    if (memoryManager && result.memory.memoryManager.trend === 'increasing') {
      result.recommendations.push('Wykryto trend wzrostowy zużycia pamięci, możliwy wyciek pamięci');
    }
    
    if (memoryManager && result.memory.memoryManager.memoryLeakDetected) {
      result.recommendations.push('Wykryto potencjalny wyciek pamięci, sprawdź zasoby, które nie są zwalniane');
    }
    
    if (testRecovery && result.memory.recoveryTest.effectiveness === 'low') {
      result.recommendations.push('Niska skuteczność odzyskiwania pamięci, sprawdź zasoby, które nie są zwalniane');
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Advanced memory diagnostics error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Historia zużycia pamięci
let memoryHistory = {
  active: false,
  startedAt: null,
  interval: 60000, // 1 minuta domyślnie
  dataPoints: [],
  maxDataPoints: 100,
  timerId: null
};

// Memory history tracking endpoint
exports.memoryHistory = (req, res) => {
  try {
    // Obsługa komend
    const command = req.query.command;
    
    if (command === 'start') {
      // Rozpocznij śledzenie, jeśli jeszcze nie uruchomione
      if (!memoryHistory.active) {
        // Opcjonalny interwał
        if (req.query.interval) {
          const interval = parseInt(req.query.interval);
          if (!isNaN(interval) && interval >= 5000) { // Minimum 5 sekund
            memoryHistory.interval = interval;
          }
        }
        
        startMemoryHistoryTracking();
        
        return res.json({
          status: 'ok',
          message: 'Memory history tracking started',
          interval: memoryHistory.interval,
          startedAt: memoryHistory.startedAt
        });
      } else {
        return res.json({
          status: 'ok',
          message: 'Memory history tracking already active',
          interval: memoryHistory.interval,
          startedAt: memoryHistory.startedAt
        });
      }
    } else if (command === 'stop') {
      // Zatrzymaj śledzenie
      if (memoryHistory.active) {
        if (memoryHistory.timerId) {
          clearTimeout(memoryHistory.timerId);
          memoryHistory.timerId = null;
        }
        
        memoryHistory.active = false;
        
        return res.json({
          status: 'ok',
          message: 'Memory history tracking stopped',
          dataPoints: memoryHistory.dataPoints.length
        });
      } else {
        return res.json({
          status: 'ok',
          message: 'Memory history tracking not active'
        });
      }
    } else if (command === 'clear') {
      // Wyczyść dane historii
      memoryHistory.dataPoints = [];
      
      return res.json({
        status: 'ok',
        message: 'Memory history data cleared'
      });
    }
    
    // Pobierz limit danych zwracanych
    let limit = 0;
    if (req.query.limit) {
      limit = parseInt(req.query.limit);
      if (isNaN(limit) || limit <= 0) {
        limit = 0;
      }
    }
    
    // Wybierz dane do zwrócenia, respektując limit
    let dataToReturn = memoryHistory.dataPoints;
    if (limit > 0 && limit < dataToReturn.length) {
      dataToReturn = dataToReturn.slice(-limit);
    }
    
    // Wykryj anomalie jeśli zażądano
    const detectAnomalies = req.query.detectAnomalies === 'true';
    const anomalies = detectAnomalies ? detectMemoryAnomalies(memoryHistory.dataPoints) : [];
    
    // Przygotuj odpowiedź
    const response = {
      status: 'ok',
      tracking: {
        active: memoryHistory.active,
        startedAt: memoryHistory.startedAt,
        dataPoints: memoryHistory.dataPoints.length,
        sampleInterval: memoryHistory.interval
      },
      memoryHistory: dataToReturn
    };
    
    // Dodaj analizę jeśli mamy wystarczającą ilość danych
    if (memoryHistory.dataPoints.length >= 3) {
      const firstPoint = memoryHistory.dataPoints[0];
      const lastPoint = memoryHistory.dataPoints[memoryHistory.dataPoints.length - 1];
      const elapsedHours = (lastPoint.timestamp - firstPoint.timestamp) / (1000 * 60 * 60);
      
      let trend = 'stable';
      if (lastPoint.heapUsed > firstPoint.heapUsed * 1.2) {
        trend = 'increasing';
      } else if (lastPoint.heapUsed < firstPoint.heapUsed * 0.8) {
        trend = 'decreasing';
      }
      
      response.analysis = {
        trend,
        avgIncreasePerHour: elapsedHours > 0 
          ? ((lastPoint.heapUsed - firstPoint.heapUsed) / elapsedHours).toFixed(0)
          : 0
      };
      
      // Znajdź najwyższe zużycie
      let peakUsage = memoryHistory.dataPoints[0];
      for (const point of memoryHistory.dataPoints) {
        if (point.heapUsed > peakUsage.heapUsed) {
          peakUsage = point;
        }
      }
      
      response.analysis.peakUsage = {
        timestamp: peakUsage.timestamp,
        heapUsed: peakUsage.heapUsed,
        usedPercent: peakUsage.usedPercent
      };
      
      // Dodaj anomalie jeśli wykryto
      if (detectAnomalies && anomalies.length > 0) {
        response.analysis.anomalies = anomalies;
      }
    }
    
    return res.json(response);
  } catch (error) {
    console.error('Memory history error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
```

## Logi i błędy

Poniżej znajdują się najważniejsze logi i błędy obserwowane podczas awarii:

### Logi z chwili awarii

```
2023-09-15T08:32:12.543Z [ERROR] Memory usage critical: 84.2% (heap: 89.5%)
2023-09-15T08:32:12.673Z [WARN] Attempting memory recovery...
2023-09-15T08:32:13.102Z [INFO] Memory recovery succeeded, freed 42.8MB
2023-09-15T08:32:15.384Z [ERROR] Error processing PDF: RangeError: Maximum call stack size exceeded
    at PDFPageLeaf._parseContents (/app/node_modules/pdf-lib/lib/core/pdf-objects/PDFPageLeaf.js:195:34)
    at processChunk (/app/node_modules/pdf-lib/lib/core/pdf-structures/PDFContentStream.js:87:29)
    at recursivelyProcess (/app/node_modules/pdf-lib/lib/core/pdf-structures/PDFContentStream.js:118:14)
    at processOperator (/app/node_modules/pdf-lib/lib/core/pdf-operators/PDFOperator.js:243:12)
2023-09-15T08:32:15.731Z [ERROR] Conversion operation failed: 6e9a12bc-8d7e-4f91-b8fd-0ae4c21a3f8c
2023-09-15T08:32:18.129Z [ERROR] Memory usage emergency: 91.7% (heap: 94.3%)
2023-09-15T08:32:18.873Z [WARN] Attempting emergency memory recovery...
2023-09-15T08:32:19.342Z [INFO] Emergency memory recovery succeeded, freed 103.5MB
2023-09-15T08:32:25.731Z [ERROR] Health check failed: memory usage too high
2023-09-15T08:32:30.452Z [ERROR] MongoDB connection lost
2023-09-15T08:32:35.109Z [ERROR] Falling back to memory storage mode
```

### Health Check

```
GET /api/diagnostic/health
Status: 500 Internal Server Error
Response:
{
  "status": "error",
  "error": "Memory usage too high",
  "memory": {
    "usedPercent": 89.7,
    "free": 106168320,
    "total": 1073741824
  },
  "timestamp": "2023-09-15T08:32:25.731Z"
}
```

## Wdrożone rozwiązania

### Ostatnio wprowadzone poprawki

1. **Implementacja ChunkedPdfProcessor** - Dodaliśmy system przetwarzania dużych plików PDF w mniejszych fragmentach, aby zmniejszyć zużycie pamięci.

2. **Klasa MemoryManager** - Wdrożyliśmy system zarządzania pamięcią z progami (warning, critical, emergency) i mechanizmami odzyskiwania pamięci.

3. **Mechanizm fallbacku do pamięci** - Dodaliśmy system, który w przypadku problemów z MongoDB przełącza się na przechowywanie danych w pamięci.

4. **Rozszerzone narzędzia diagnostyczne** - Wdrożyliśmy zaawansowane endpointy do monitorowania pamięci, wykrywania wycieków i anomalii.

### Plany dalszego rozwoju

1. Zaimplementowanie mechanizmu kolejkowania konwersji, aby ograniczyć liczbę jednoczesnych operacji.
2. Przejście na pełne przechowywanie plików w Cloudinary zamiast lokalnie.
3. Optymalizacja bibliotek PDF i procesu konwersji.

## Pytania do konsultanta

1. Jak zoptymalizować zarządzanie pamięcią w środowisku Node.js w kontenerze Railway z limitowaną pamięcią?

2. Jak skutecznie debugować i rozwiązywać problemy "Maximum call stack size exceeded" w bibliotece pdf-lib?

3. Jakie są najlepsze praktyki dla przetwarzania dużych plików PDF w Node.js?

4. Jak zaimplementować bardziej niezawodny system kolejkowania zadań konwersji?

5. Czy są lepsze alternatywy dla naszego obecnego stosu technologicznego do przetwarzania PDF?

## Dane techniczne

- **Nazwa aplikacji**: PDFSpark
- **Backend**: Node.js (Express.js)
- **Hosting**: Railway
- **Przechowywanie plików**: Lokalne + Cloudinary
- **Baza danych**: MongoDB
- **Główne biblioteki**: pdf-lib, docx, sharp, pdfjs-dist
- **Zarządzanie pamięcią**: Własna implementacja (MemoryManager)
- **Zarządzanie plikami PDF**: ChunkedPdfProcessor (własna implementacja)

## Dane kontaktowe

- **Konsultacja dla**: PDFSpark Backend
- **Zespół**: PDFSpark Engineering Team
- **Kontakt**: engineering@pdfspark.example.com
- **Priorytet**: Wysoki (aplikacja produkcyjna)
- **Deadline**: ASAP