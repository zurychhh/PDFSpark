describe('PDF Conversion Flow', () => {
  beforeEach(() => {
    cy.visit('/convert/pdf-to-word')
    
    // Intercept API calls
    cy.intercept('POST', '/api/files/upload', {
      statusCode: 200,
      body: {
        success: true,
        fileId: 'test-file-id',
        fileName: 'test.pdf',
        fileSize: 1024 * 10,
        previewUrl: '/test-preview.png',
        uploadDate: new Date().toISOString()
      },
    }).as('fileUpload')
    
    cy.intercept('POST', '/api/convert', {
      statusCode: 200,
      body: {
        success: true,
        operationId: 'test-operation-id',
        estimatedTime: 5,
        isPremium: false
      },
    }).as('startConversion')
    
    cy.intercept('GET', '/api/operations/*/status', {
      statusCode: 200,
      body: {
        operationId: 'test-operation-id',
        status: 'completed',
        progress: 100,
        estimatedTimeRemaining: 0,
        resultFileId: 'result-file-id',
        downloadUrl: '/test-download.docx'
      },
    }).as('operationStatus')
  })

  it('displays the file upload area', () => {
    cy.get('[data-testid="file-upload"]').should('be.visible')
    cy.contains('Drag and drop').should('be.visible')
    cy.contains('Maximum file size').should('be.visible')
  })

  it('completes a full conversion flow', () => {
    // Upload file
    cy.get('[data-testid="file-upload"]').selectFile('cypress/fixtures/test.pdf', { action: 'drag-drop' })
    
    // Wait for upload to complete
    cy.wait('@fileUpload')
    
    // Check file preview is shown
    cy.get('[data-testid="file-preview"]').should('be.visible')
    
    // Select conversion options
    cy.get('[data-testid="preserve-formatting"]').check()
    cy.get('[data-testid="extract-images"]').check()
    
    // Start conversion
    cy.contains('button', 'Start Conversion').click()
    
    // Wait for conversion to start
    cy.wait('@startConversion')
    
    // Check progress is shown
    cy.get('[data-testid="conversion-progress"]').should('be.visible')
    
    // Wait for operation status check
    cy.wait('@operationStatus')
    
    // Check result is shown
    cy.get('[data-testid="conversion-result"]').should('be.visible')
    cy.contains('Conversion completed').should('be.visible')
    cy.contains('button', 'Download').should('be.visible')
  })

  it('displays error message when upload fails', () => {
    // Override the intercept with an error response
    cy.intercept('POST', '/api/files/upload', {
      statusCode: 400,
      body: {
        success: false,
        error: 'Invalid file format',
      },
    }).as('fileUploadError')
    
    // Upload file
    cy.get('[data-testid="file-upload"]').selectFile('cypress/fixtures/test.pdf', { action: 'drag-drop' })
    
    // Wait for upload to complete
    cy.wait('@fileUploadError')
    
    // Check error message is shown
    cy.contains('Invalid file format').should('be.visible')
  })

  it('displays premium feature message for large files', () => {
    // Override the intercept to simulate a large file
    cy.intercept('POST', '/api/files/upload', {
      statusCode: 200,
      body: {
        success: true,
        fileId: 'test-file-id',
        fileName: 'large.pdf',
        fileSize: 1024 * 1024 * 20, // 20MB
        previewUrl: '/test-preview.png',
        uploadDate: new Date().toISOString(),
        isPremium: true
      },
    }).as('largeFileUpload')
    
    // Upload file
    cy.get('[data-testid="file-upload"]').selectFile('cypress/fixtures/test.pdf', { action: 'drag-drop' })
    
    // Wait for upload to complete
    cy.wait('@largeFileUpload')
    
    // Check premium message is shown
    cy.contains('Premium Feature').should('be.visible')
    cy.contains('Subscribe').should('be.visible')
  })
})