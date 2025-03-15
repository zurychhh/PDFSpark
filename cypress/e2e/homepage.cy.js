describe('Homepage', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('displays the header with correct navigation links', () => {
    cy.get('header').should('exist')
    cy.contains('PDFSpark').should('be.visible')
    cy.contains('Tools').should('be.visible')
    cy.contains('Pricing').should('be.visible')
    cy.contains('Blog').should('be.visible')
  })

  it('displays the hero section with main heading', () => {
    cy.get('h1').should('contain.text', 'PDF')
    cy.get('h1').should('be.visible')
  })

  it('displays call-to-action buttons', () => {
    cy.contains('button', 'Convert PDF').should('be.visible')
    cy.contains('a', 'Explore').should('be.visible')
  })

  it('displays the tools section', () => {
    cy.contains('h2', 'Tools').should('be.visible')
    cy.get('[data-testid="tool-grid"]').should('exist')
    cy.get('[data-testid="tool-card"]').should('have.length.at.least', 3)
  })

  it('displays the features section', () => {
    cy.contains('h2', 'Why Choose PDFSpark').should('be.visible')
    cy.get('[data-testid="feature-grid"]').should('exist')
    cy.get('[data-testid="feature-card"]').should('have.length.at.least', 3)
  })

  it('displays the footer with correct links', () => {
    cy.get('footer').should('exist')
    cy.get('footer').contains('Convert').should('be.visible')
    cy.get('footer').contains('Tools').should('be.visible')
    cy.get('footer').contains('Company').should('be.visible')
    cy.get('footer').contains('Legal').should('be.visible')
  })

  it('navigates to the tools page when clicking tools link', () => {
    cy.contains('Tools').click()
    cy.url().should('include', '/tools')
    cy.contains('h1', 'PDF Tools').should('be.visible')
  })
})