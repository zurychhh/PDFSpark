# Vercel TypeScript Deployment Guide

## Overview

This guide addresses common TypeScript errors encountered during Vercel deployments and provides best practices for ensuring smooth deployments in the future.

## Common Issues

### 1. TypeScript Errors with Browser APIs

The most frequent issues occur when using browser APIs that aren't fully recognized by TypeScript's type definitions. In our case, we encountered:

```
Error: Property 'featurePolicy' does not exist on type 'Document'.
```

This happened because the Feature Policy API is a relatively new browser feature and isn't included in the standard TypeScript DOM definitions.

## Solutions

### 1. Type-Safe Browser API Detection

When using browser APIs that may not be fully supported or defined in TypeScript:

```typescript
// ❌ Problematic approach
const policies = document.featurePolicy.allowedFeatures();

// ✅ Type-safe approach
function checkFeaturePolicy(): string {
  try {
    // Use type assertion for APIs not in TypeScript definitions
    const featPolicy = (document as any).featurePolicy;
    
    if (featPolicy && typeof featPolicy.allowedFeatures === 'function') {
      return `Supported: ${featPolicy.allowedFeatures().join(', ')}`;
    } else {
      return 'Not supported in this browser';
    }
  } catch (e) {
    return 'Error checking feature policy';
  }
}
```

### 2. Progressive Enhancement Pattern

Always use the progressive enhancement pattern for browser APIs that might not be available in all environments:

```typescript
// Check for API availability before using it
if (typeof window !== 'undefined' && 'featurePolicy' in document) {
  // Use the API
} else {
  // Provide fallback behavior
}
```

### 3. Environment-Aware Type Definitions

Create environment-aware type definitions for browser APIs:

```typescript
// Add to a types.d.ts file
interface Document {
  // Add missing browser APIs with optional chaining
  featurePolicy?: {
    allowedFeatures(): string[];
    allowsFeature(feature: string, origin?: string): boolean;
  };
}
```

## Best Practices for Vercel Deployments

### 1. Run TypeScript Checks Locally

Always run the following checks locally before pushing to Vercel:

```bash
npm run typecheck  # or tsc --noEmit
npm run build
```

### 2. Stricter TypeScript Configuration

Consider using a stricter TypeScript configuration to catch potential issues earlier:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": false
  }
}
```

### 3. Browser Compatibility Checks

Implement browser compatibility checks for critical features:

```typescript
function checkBrowserCompatibility() {
  const compatibility = {
    formData: typeof FormData !== 'undefined',
    fileReader: typeof FileReader !== 'undefined',
    fetch: typeof fetch !== 'undefined',
    serviceWorker: 'serviceWorker' in navigator,
    webGL: (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && 
          (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
      } catch (e) {
        return false;
      }
    })()
  };
  
  return compatibility;
}
```

### 4. Handle Experimental or Vendor-Prefixed APIs

For experimental or vendor-prefixed APIs:

```typescript
// Check for all vendor prefixes
const getIndexedDB = () => {
  return window.indexedDB || 
         (window as any).mozIndexedDB || 
         (window as any).webkitIndexedDB || 
         (window as any).msIndexedDB;
};

const indexedDB = getIndexedDB();
if (indexedDB) {
  // Use IndexedDB
}
```

### 5. Create Deployment Verification Script

Create a deployment verification script to test critical features post-deployment:

```typescript
// deploymentVerify.js
async function verifyDeployment() {
  const results = {
    environment: process.env.NODE_ENV,
    buildTime: new Date().toISOString(),
    features: {}
  };
  
  // Test API endpoints
  try {
    const response = await fetch('/api/health');
    results.api = {
      status: response.status,
      healthy: response.status === 200
    };
  } catch (e) {
    results.api = { error: e.message };
  }
  
  // Log results
  console.log('Deployment verification:', results);
  
  // Could also send to a monitoring service
}

// Run verification on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', verifyDeployment);
}
```

## Troubleshooting Vercel Builds

If you encounter TypeScript errors in Vercel builds:

1. **Check Build Logs**: Examine the full build logs in the Vercel dashboard
2. **Local Reproduction**: Try to reproduce the error locally using the same Node.js version
3. **Incremental Fixes**: Fix one error at a time and verify each fix
4. **Environment Variables**: Ensure all required environment variables are correctly set in Vercel
5. **Dependencies**: Verify that all dependencies are correctly installed and compatible
6. **Check TypeScript Version**: Ensure the TypeScript version in Vercel matches your local version

## Preventing Future Issues

1. **Pre-commit Hooks**: Set up pre-commit hooks to run type checking before allowing commits
2. **CI Pipelines**: Configure CI pipelines to run type checking and builds before merging PRs
3. **Browser Testing**: Implement automated browser testing to catch compatibility issues
4. **Feature Flags**: Use feature flags for experimental browser features
5. **Polyfills**: Consider using polyfills for critical features in older browsers

## Additional Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vercel TypeScript Documentation](https://vercel.com/docs/concepts/functions/serverless-functions/runtimes/node-js#typescript)
- [Feature Policy API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Feature_Policy_API)
- [Browser Compatibility Data](https://developer.mozilla.org/en-US/docs/Web/API)