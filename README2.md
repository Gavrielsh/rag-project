# RAG System Implementation - Solution Documentation

**Author:** Gavriel Shalem

## Overview

This document describes the implementation and fixes applied to the Lev-Boots RAG (Retrieval-Augmented Generation) system. The system allows users to ask questions about Lev-Boots technology and receive answers based on a knowledge base containing PDFs, articles, and Slack messages.

## Problem Statement

The initial implementation had several critical issues that prevented the system from working:

1. **Empty Database**: The system always returned "I couldn't find any relevant information" because the database was empty
2. **PDF Parsing Error**: The `pdf-parse` library integration was incorrect, causing "pdfParse is not a function" errors
3. **Similarity Search Failure**: The vector similarity search query wasn't returning results due to Sequelize model mapping issues
4. **LLM Model Error**: The Gemini API model name was incorrect, causing 404 errors
5. **Embedding API Issues**: The embedding response format wasn't being handled correctly

## Solution Implementation

### 1. PDF Parsing Fix

**Problem**: The `pdf-parse` library (v2.4.5) exports a `PDFParse` class, not a direct function. The initial code tried to call it as a function, which failed.

**Solution**: 
- Changed from function call to class instantiation
- Used `PDFParse` class with proper initialization
- Converted Buffer to Uint8Array as required by the library
- Implemented proper text extraction using `load()` and `getText()` methods

**Implementation**:
```typescript
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse;
const uint8Array = new Uint8Array(dataBuffer);
const pdfParser = new PDFParse(uint8Array);
await pdfParser.load();
const text = pdfParser.getText();
```

**Why**: The library's API changed in v2.x, requiring class-based usage instead of function calls.

### 2. Vector Similarity Search Fix

**Problem**: The similarity search query using Sequelize's model mapping wasn't returning results because:
- Sequelize couldn't properly map computed columns (like `similarity`)
- The vector type casting wasn't working correctly with bind parameters

**Solution**:
- Switched from Sequelize model mapping to raw SQL queries
- Manually mapped raw results to KnowledgeBase instances
- Embedded vector strings directly in the query (safe because embeddings come from the API, not user input)

**Implementation**:
```typescript
const query = `
  SELECT id, source, source_id, chunk_index, chunk_content, 
    ${embeddingField}, created_at, updated_at,
    (1 - (${embeddingField} <=> '${vectorString}'::vector(${dimension}))) as similarity
  FROM knowledge_base
  WHERE ${embeddingField} IS NOT NULL
  ORDER BY ${embeddingField} <=> '${vectorString}'::vector(${dimension})
  LIMIT ${limit}
`;

const [results] = await KnowledgeBase.sequelize?.query(query) || [[]];
// Manually map results to KnowledgeBase instances
```

**Why**: Raw queries give us full control over the SQL and allow computed columns to work correctly with pgvector.

### 3. Gemini Embedding API Fix

**Problem**: The embedding API response format wasn't being handled correctly, causing errors when extracting embeddings.

**Solution**:
- Added comprehensive format detection and fallback logic
- Validated embedding dimensions
- Added proper error handling with detailed logging

**Implementation**:
```typescript
// Try different response formats
if (result.embedding && typeof result.embedding === 'object' && 'values' in result.embedding) {
  embedding = Array.from(result.embedding.values);
} else if (Array.isArray(result.embedding)) {
  embedding = result.embedding;
} else {
  // Fallback logic...
}
```

**Why**: Different API versions or configurations might return embeddings in different formats, so we need robust handling.

### 4. LLM Model Name Fix

**Problem**: The model name `gemini-1.5-flash` wasn't available in the API version being used, causing 404 errors.

**Solution**: Changed to `gemini-pro`, which is the standard supported model.

**Implementation**:
```typescript
const model = genAI.getGenerativeModel({ 
  model: 'gemini-pro',
});
```

**Why**: `gemini-pro` is the most widely supported model across all API versions and regions.

### 5. Automatic Data Loading

**Problem**: Users had to manually call the `/api/load_data` endpoint, and the database was often empty.

**Solution**:
- Added automatic check on server startup
- Optionally auto-load data if `AUTO_LOAD_DATA=true` in `.env`
- Provide helpful messages if database is empty

**Implementation**:
```typescript
const totalChunks = await KnowledgeBase.count();
if (totalChunks === 0) {
  const autoLoad = process.env.AUTO_LOAD_DATA === 'true';
  if (autoLoad) {
    await loadAllData();
  } else {
    console.log('Database is empty. To load data, call: POST /api/load_data');
  }
}
```

**Why**: Improves user experience by automatically handling data loading when needed.

### 6. Enhanced Error Handling and Logging

**Problem**: When errors occurred, it was difficult to debug because of insufficient logging.

**Solution**:
- Added comprehensive logging throughout the service
- Improved error messages with actual error details
- Added validation checks at each step

**Implementation**:
- Log database chunk count
- Log embedding dimensions
- Log similarity search results
- Log context length sent to LLM
- Detailed error messages with stack traces

**Why**: Better logging makes debugging much easier and helps identify issues quickly.

## Architecture Overview

### Data Flow

1. **Data Loading** (`loadAllData`):
   - Loads PDFs from `/knowledge_pdfs` directory
   - Fetches articles from GitHub Gist URLs
   - Retrieves Slack messages from API with pagination
   - Chunks all content into ~400 word pieces
   - Generates embeddings using Gemini API
   - Stores chunks and embeddings in PostgreSQL with pgvector

2. **Question Answering** (`ask`):
   - Embeds the user question using the same embedding model
   - Performs vector similarity search to find relevant chunks
   - Constructs a prompt with retrieved context
   - Sends prompt to Gemini LLM
   - Returns the generated answer

### Key Components

- **ragService.ts**: Core RAG logic (data loading, embeddings, similarity search, LLM interaction)
- **ragController.ts**: Express route handlers
- **KnowledgeBase.ts**: Sequelize model for knowledge_base table
- **testDatabase.ts**: Utility script for testing database state

### Database Schema

The `knowledge_base` table stores:
- `source`: Type of source (pdf, article, slack)
- `source_id`: Identifier for the specific source
- `chunk_index`: Index of the chunk within the source
- `chunk_content`: The actual text content
- `embeddings_768`: Vector embeddings (768 dimensions)
- `embeddings_1536`: Vector embeddings (1536 dimensions) - not used in this implementation

## Technical Decisions

### Why 768 Dimensions?

- `text-embedding-004` returns 768 dimensions by default
- 768 dimensions provide good balance between accuracy and performance
- Smaller than 1536, so faster queries and lower storage costs
- Sufficient for this use case

### Why pgvector?

- Native PostgreSQL extension for vector operations
- Efficient cosine similarity search with IVFFlat indexes
- No need for external vector databases
- Integrated with existing PostgreSQL setup

### Why Chunk Size of 400 Words?

- Balances context preservation with embedding quality
- Large enough to maintain semantic meaning
- Small enough to fit within token limits
- Standard practice in RAG systems

### Why Manual Result Mapping?

- Sequelize doesn't handle computed columns well
- Raw queries give full control over SQL
- Better performance for complex queries
- Easier to debug and maintain

## Testing

The system includes a test script (`testDatabase.ts`) that can be run with:
```bash
npm run test:db
```

This script checks:
- Database connection
- Total record count
- Records by source type
- Embedding presence and types
- Sample records

## Usage

### Initial Setup

1. Set up PostgreSQL database with pgvector extension
2. Configure `.env` file:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   GEMINI_API_KEY=your_api_key_here
   AUTO_LOAD_DATA=true  # Optional: auto-load on startup
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

### Loading Data

If `AUTO_LOAD_DATA` is not set, manually load data:
```bash
curl -X POST http://localhost:3000/api/load_data
```

### Asking Questions

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"userQuestion": "What are Lev-Boots?"}'
```

## Performance Considerations

- **Embedding Generation**: Takes time due to API rate limits (100ms delay between requests)
- **Similarity Search**: Fast with IVFFlat indexes on vector columns
- **LLM Response**: Depends on context length and API response time

## Future Improvements

1. **Caching**: Cache embeddings to avoid re-generating for same content
2. **Batch Processing**: Process multiple chunks in parallel (with rate limiting)
3. **Incremental Updates**: Only load new/changed sources
4. **Better Chunking**: Use semantic chunking instead of fixed word count
5. **Hybrid Search**: Combine vector search with keyword search
6. **Response Streaming**: Stream LLM responses for better UX

## Conclusion

The RAG system is now fully functional, with all critical issues resolved. The implementation follows best practices for RAG systems, with proper error handling, logging, and performance optimizations. The system successfully retrieves relevant information from the knowledge base and generates accurate answers using the Gemini LLM.

---

**Author:** Gavriel Shalem  
**Date:** 2024  
**Project:** Lev-Boots RAG System

