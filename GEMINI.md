# Gemini Context: n8n-nodes-mediawiki-tmagnussen

This project is a fork of `n8n-nodes-mediawiki`, customized to fix authentication issues with private MediaWiki instances.

## 🚀 Project Overview

- **Purpose**: Seamless MediaWiki integration for n8n workflows, supporting both public (Wikipedia) and private wikis.
- **Main Technologies**: TypeScript, n8n-workflow, MediaWiki API, Jest, Gulp.
- **Fork Details**: Published to npm as `n8n-nodes-mediawiki-tmagnussen`.

## 🔧 Fixes & Improvements

### Private Wiki Authentication & Session Persistence (Issue #1)
- **Problem**: Private MediaWiki instances often require a stateful session (cookies) and a formal login flow even when using credentials. Previous attempts using only Basic Auth or stateless token requests were blocked.
- **Solution**: 
  - **Explicit Login Flow**: Implemented a two-step `action=login` process at the start of node execution.
  - **Session Persistence**: Added an internal cookie jar to capture and re-send `set-cookie` headers across all API calls.
  - **Robust Request Handling**: Switched to n8n's native `httpRequest` helper for better connection management and explicitly handled URL-encoding for POST bodies.
- **Implementation**: Managed within the `MediaWikiClient.ts` class, which handles the orchestration of login, token retrieval, and authenticated operations.

## 🛠 Building and Running

### Key Commands
- **Install Dependencies**: `npm install`
- **Build**: `npm run build` (Compiles TS and builds icons)
- **Test**: `npm test` (Includes regression tests for Issue #1 in `tests/MediaWikiClient.test.ts`)
- **Lint**: `npm run lint`

### Publishing to npm
To update the custom package on the npm registry:
1. `npm run build`
2. `npm publish --access public`

## 📁 Key Files
- `src/MediaWikiClient.ts`: Core API client with authenticated request logic.
- `nodes/MediaWikiPage/MediaWikiPage.node.ts`: Main implementation for page operations.
- `tests/MediaWikiClient.test.ts`: Authenticated request verification tests.
- `package.json`: Contains package name `n8n-nodes-mediawiki-tmagnussen` and version `0.2.1`.
