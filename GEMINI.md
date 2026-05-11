# Gemini Context: n8n-nodes-mediawiki-tmagnussen

This project is a fork of `n8n-nodes-mediawiki`, customized to fix authentication issues with private MediaWiki instances.

## 🚀 Project Overview

- **Purpose**: Seamless MediaWiki integration for n8n workflows, supporting both public (Wikipedia) and private wikis.
- **Main Technologies**: TypeScript, n8n-workflow, MediaWiki API, Jest, Gulp.
- **Fork Details**: Published to npm as `n8n-nodes-mediawiki-tmagnussen`.

## 🔧 Fixes & Improvements

### Private Wiki Authentication (Issue #1)
- **Problem**: The original node attempted to fetch CSRF tokens anonymously before authenticating, leading to `readapidenied` errors on private wikis.
- **Solution**: Refactored `MediaWikiClient.ts` to store credentials and use them for **all** requests, including the initial token-fetching calls.
- **Implementation**: Consolidated request logic into a private `request()` helper that injects Basic Auth headers automatically.

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
