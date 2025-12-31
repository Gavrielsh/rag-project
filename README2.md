# Lev-Boots RAG System

A high-performance **Retrieval-Augmented Generation (RAG)** system designed to provide intelligent answers regarding Lev-Boots technology. This system ingests data from multiple sources, processes it into vector embeddings, and uses Large Language Models (LLM) to generate context-aware responses.

## 🚀 Overview

The Lev-Boots RAG system solves the challenge of querying unstructured data (PDFs, Articles, and Slack messages) by implementing a semantic search pipeline. It leverages **Google Gemini** for both embeddings and text generation, using **PostgreSQL with pgvector** for efficient similarity retrieval.

## 🛠️ Tech Stack

- **Backend:** Node.js, TypeScript, Express
- **Database:** PostgreSQL + `pgvector` (Vector similarity search)
- **AI Models:** - `text-embedding-004` (Embeddings)
  - `gemini-pro` (Generative LLM)
- **ORM:** Sequelize (with Raw SQL for vector optimization)
- **Frontend:** React, Vite, Tailwind CSS

## 🏗️ RAG Architecture

The implementation follows a standard two-phase RAG pipeline:

### 1. Data Ingestion & Indexing
- **Sources:** Extracts content from local PDFs, GitHub Gist articles, and Slack API channels.
- **Chunking:** Documents are split into ~400-word segments to preserve semantic context while fitting model token limits.
- **Embedding:** Generates 768-dimensional vectors using the Gemini Embedding API.
- **Storage:** Persists chunks and vectors in PostgreSQL using the `pgvector` extension.

### 2. Retrieval & Generation
- **Similarity Search:** Converts user queries into vectors and performs a **Cosine Similarity** search using raw SQL to find the top-K most relevant chunks.
- **Contextual Prompting:** Augments the user's question with the retrieved chunks.
- **Synthesis:** The LLM generates a grounded response based strictly on the provided context.

## 🔧 Key Engineering Improvements

I addressed several critical bottlenecks found in the initial boilerplate:

* **Optimized Vector Search:** Replaced standard Sequelize queries with **Raw SQL** to handle `pgvector` operators (`<=>`) and computed similarity columns accurately.
* **Robust PDF Processing:** Fixed `pdf-parse` integration issues by implementing proper class-based instantiation and Buffer-to-Uint8Array conversion.
* **Gemini API Resilience:** Standardized model usage to `gemini-pro` and implemented flexible response parsing to handle various embedding output formats.
* **Automated Ingestion:** Added an `AUTO_LOAD_DATA` trigger on startup to ensure the knowledge base is populated without manual intervention.

## 🚦 Getting Started

### Prerequisites
- PostgreSQL with `pgvector` installed.
- Google Gemini API Key.

### Environment Setup
Create a `.env` file in the server directory:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/lev_boots
GEMINI_API_KEY=your_api_key_here
AUTO_LOAD_DATA=true
```

### Installation
```
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start the development server
npm run dev
```

### 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/load_data` | Manually triggers ingestion from all sources. |
| **POST** | `/api/ask` | Accepts `userQuestion` and returns a RAG-generated answer. |


**Author** : Gavriel Shalem
**Project**: Lev-Boots Technical Challenge