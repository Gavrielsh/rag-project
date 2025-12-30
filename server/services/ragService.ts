// Make sure you've reviewed the README.md file to understand the task and the RAG flow

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import KnowledgeBase from '../models/KnowledgeBase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Choose embedding dimension (768 or 1536)
const EMBEDDING_DIMENSION = 768; // Using 768 for faster processing

// Helper function to chunk text into ~400 word pieces
const chunkText = (text: string, wordsPerChunk: number = 400): string[] => {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
};

// Helper function to get embeddings from Gemini
const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    
    // According to Gemini API docs, embedContent returns:
    // { embedding: { values: number[] } }
    let embedding: number[];
    
    // Try the standard format first
    if (result.embedding && typeof result.embedding === 'object' && 'values' in result.embedding) {
      embedding = Array.from(result.embedding.values);
    } else if (Array.isArray(result.embedding)) {
      embedding = result.embedding;
    } else if (result.embedding && typeof result.embedding === 'object') {
      // Try to find values array in the object
      const embeddingObj = result.embedding as any;
      embedding = embeddingObj.values || embeddingObj.embedding || [];
    } else {
      // Last resort: try direct access
      embedding = (result as any).embedding?.values || (result as any).embedding || [];
    }
    
    // Validate the embedding
    if (!Array.isArray(embedding) || embedding.length === 0) {
      console.error('Invalid embedding format. Result structure:', JSON.stringify(result, null, 2));
      throw new Error(`Failed to extract embedding from API response. Got: ${typeof embedding}`);
    }
    
    // Validate dimension
    if (embedding.length !== EMBEDDING_DIMENSION && embedding.length !== 768 && embedding.length !== 1536) {
      console.warn(`Unexpected embedding dimension: ${embedding.length}, expected: ${EMBEDDING_DIMENSION}`);
    }
    
    // text-embedding-004 returns 768 dimensions by default
    if (EMBEDDING_DIMENSION === 768) {
      // Take first 768 if longer, or pad if shorter
      if (embedding.length >= 768) {
        return embedding.slice(0, 768);
      } else {
        console.warn(`Embedding is shorter than expected (${embedding.length} < 768), padding with zeros`);
        return [...embedding, ...new Array(768 - embedding.length).fill(0)];
      }
    } else {
      // For 1536, take first 1536 or pad
      if (embedding.length >= 1536) {
        return embedding.slice(0, 1536);
      } else {
        console.warn(`Embedding is shorter than expected (${embedding.length} < 1536), padding with zeros`);
        return [...embedding, ...new Array(1536 - embedding.length).fill(0)];
      }
    }
  } catch (error) {
    console.error('Error getting embedding:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
};

// Helper function to load and parse PDF
const loadPDF = async (filePath: string): Promise<string> => {
  try {
    // pdf-parse v2.4.5 exports PDFParse class, not a direct function
    const pdfParseModule = require('pdf-parse');
    const PDFParse = pdfParseModule.PDFParse;
    
    if (!PDFParse || typeof PDFParse !== 'function') {
      throw new Error('PDFParse class not found in pdf-parse module');
    }
    
    const dataBuffer = fs.readFileSync(filePath);
    
    // PDFParse requires Uint8Array, not Buffer
    const uint8Array = new Uint8Array(dataBuffer);
    
    // Create instance of PDFParse with the Uint8Array
    const pdfParser = new PDFParse(uint8Array);
    
    // Load and get text
    await pdfParser.load();
    const textResult = pdfParser.getText();
    
    // getText() might return an object or array, not a string
    // Convert to string if needed
    let text: string;
    if (typeof textResult === 'string') {
      text = textResult;
    } else if (Array.isArray(textResult)) {
      // If it's an array, join it
      text = textResult.join(' ');
    } else if (textResult && typeof textResult === 'object' && 'text' in textResult) {
      // If it's an object with a text property
      text = textResult.text;
    } else if (textResult && typeof textResult === 'object' && 'content' in textResult) {
      // If it's an object with a content property
      text = textResult.content;
    } else {
      // Convert to string as last resort
      text = String(textResult || '');
    }
    
    return text;
  } catch (error) {
    console.error(`Error loading PDF ${filePath}:`, error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
};

// Helper function to load article from gist
const loadArticle = async (articleId: string): Promise<string> => {
  try {
    const articleNumbers = [1, 2, 3, 4, 5];
    const articleIds = [
      'military-deployment-report',
      'urban-commuting',
      'hover-polo',
      'warehousing',
      'consumer-safety'
    ];
    
    const index = articleIds.indexOf(articleId);
    if (index === -1) {
      throw new Error(`Unknown article ID: ${articleId}`);
    }
    
    const articleNumber = articleNumbers[index];
    const url = `https://gist.githubusercontent.com/JonaCodes/394d01021d1be03c9fe98cd9696f5cf3/raw/article-${articleNumber}_${articleId}.md`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch article ${articleId}: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error(`Error loading article ${articleId}:`, error);
    throw error;
  }
};

// Helper function to load Slack messages with pagination
const loadSlackChannel = async (channel: string): Promise<string[]> => {
  const messages: string[] = [];
  let page = 1;
  let hasMore = true;
  
  try {
    while (hasMore) {
      const url = `https://lev-boots-slack-api.jona-581.workers.dev/?channel=${channel}&page=${page}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`Failed to fetch page ${page} for channel ${channel}`);
        break;
      }
      
      const data = await response.json();
      
      if (data.messages && Array.isArray(data.messages)) {
        const pageMessages = data.messages
          .map((msg: any) => {
            // Format: "User: message text"
            if (msg.user && msg.text) {
              return `${msg.user}: ${msg.text}`;
            }
            return msg.text || '';
          })
          .filter((text: string) => text.trim().length > 0);
        
        messages.push(...pageMessages);
      }
      
      // Check if there are more pages
      hasMore = data.hasMore !== false && data.messages && data.messages.length > 0;
      page++;
      
      // Add a small delay to avoid rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error(`Error loading Slack channel ${channel}:`, error);
  }
  
  return messages;
};

// Check if source already exists in database
const sourceExists = async (source: string, sourceId: string): Promise<boolean> => {
  try {
    const count = await KnowledgeBase.count({
      where: {
        source,
        source_id: sourceId,
      },
    });
    return count > 0;
  } catch (error) {
    console.error(`Error checking if source exists:`, error);
    return false;
  }
};

// Store chunks in database
const storeChunks = async (
  source: string,
  sourceId: string,
  chunks: string[],
  embeddings: number[][]
): Promise<void> => {
  try {
    // Delete existing chunks for this source first (in case of re-loading)
    await KnowledgeBase.destroy({
      where: {
        source,
        source_id: sourceId,
      },
    });
    
    const embeddingField = EMBEDDING_DIMENSION === 768 ? 'embeddings_768' : 'embeddings_1536';
    const dimension = EMBEDDING_DIMENSION;
    
    // Use raw SQL query to properly store vector embeddings
    // Sequelize's ARRAY type doesn't automatically convert to pgvector's vector type
    for (let i = 0; i < chunks.length; i++) {
      const vectorString = `[${embeddings[i].join(',')}]`;
      // Escape single quotes in chunk_content for SQL
      const escapedContent = chunks[i].replace(/'/g, "''");
      
      const insertQuery = `
        INSERT INTO knowledge_base (source, source_id, chunk_index, chunk_content, ${embeddingField}, created_at, updated_at)
        VALUES ('${source.replace(/'/g, "''")}', '${sourceId.replace(/'/g, "''")}', ${i}, '${escapedContent}', '${vectorString}'::vector(${dimension}), NOW(), NOW())
      `;
      
      await KnowledgeBase.sequelize?.query(insertQuery);
    }
    console.log(`Stored ${chunks.length} chunks for ${source}:${sourceId}`);
  } catch (error) {
    console.error(`Error storing chunks for ${source}:${sourceId}:`, error);
    throw error;
  }
};

// Main function to load all data
export const loadAllData = async () => {
  console.log('Starting to load all data...');
  
  try {
    // 1. Load PDFs
    console.log('Loading PDFs...');
    const pdfFiles = [
      'OpEd - A Revolution at Our Feet.pdf',
      'Research Paper - Gravitational Reversal Physics.pdf',
      'White Paper - The Development of Localized Gravity Reversal Technology.pdf'
    ];
    
    for (const pdfFile of pdfFiles) {
      // Check if already loaded
      if (await sourceExists('pdf', pdfFile)) {
        console.log(`PDF ${pdfFile} already loaded, skipping...`);
        continue;
      }
      
      const pdfPath = path.join(__dirname, '../knowledge_pdfs', pdfFile);
      console.log(`Processing PDF: ${pdfFile}`);
      
      const text = await loadPDF(pdfPath);
      const chunks = chunkText(text);
      
      // Get embeddings for all chunks
      console.log(`Getting embeddings for ${chunks.length} chunks from ${pdfFile}...`);
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        embeddings.push(embedding);
        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      await storeChunks('pdf', pdfFile, chunks, embeddings);
    }
    
    // 2. Load Articles
    console.log('Loading articles...');
    const articleIds = [
      'military-deployment-report',
      'urban-commuting',
      'hover-polo',
      'warehousing',
      'consumer-safety'
    ];
    
    for (const articleId of articleIds) {
      // Check if already loaded
      if (await sourceExists('article', articleId)) {
        console.log(`Article ${articleId} already loaded, skipping...`);
        continue;
      }
      
      console.log(`Processing article: ${articleId}`);
      const text = await loadArticle(articleId);
      const chunks = chunkText(text);
      
      // Get embeddings for all chunks
      console.log(`Getting embeddings for ${chunks.length} chunks from ${articleId}...`);
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        embeddings.push(embedding);
        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      await storeChunks('article', articleId, chunks, embeddings);
    }
    
    // 3. Load Slack messages
    console.log('Loading Slack messages...');
    const channels = ['lab-notes', 'engineering', 'offtopic'];
    
    for (const channel of channels) {
      // Check if already loaded
      if (await sourceExists('slack', channel)) {
        console.log(`Slack channel ${channel} already loaded, skipping...`);
        continue;
      }
      
      console.log(`Processing Slack channel: ${channel}`);
      const messages = await loadSlackChannel(channel);
      
      if (messages.length === 0) {
        console.log(`No messages found for channel ${channel}`);
        continue;
      }
      
      // Combine all messages into one text, then chunk
      const combinedText = messages.join('\n');
      const chunks = chunkText(combinedText);
      
      // Get embeddings for all chunks
      console.log(`Getting embeddings for ${chunks.length} chunks from ${channel}...`);
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        embeddings.push(embedding);
        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      await storeChunks('slack', channel, chunks, embeddings);
    }
    
    console.log('All data loaded successfully!');
  } catch (error) {
    console.error('Error loading data:', error);
    throw error;
  }
};

// Function to find similar chunks using vector similarity
const findSimilarChunks = async (
  questionEmbedding: number[],
  limit: number = 5
): Promise<KnowledgeBase[]> => {
  try {
    const embeddingField = EMBEDDING_DIMENSION === 768 ? 'embeddings_768' : 'embeddings_1536';
    const dimension = EMBEDDING_DIMENSION;
    
    // Validate embedding
    if (!Array.isArray(questionEmbedding) || questionEmbedding.length !== dimension) {
      console.error(`Invalid embedding: expected array of length ${dimension}, got:`, questionEmbedding?.length);
      return [];
    }
    
    // Use pgvector's cosine similarity search
    // Convert array to PostgreSQL vector format: [1,2,3]::vector
    // Note: We embed the vector string directly in the query instead of using bind parameters
    // because Sequelize doesn't handle vector type casting with bind parameters correctly.
    // This is safe because questionEmbedding is a number array from the embedding API (not user input),
    // and we're only joining numbers with commas, so there's no SQL injection risk.
    const vectorString = `[${questionEmbedding.join(',')}]`;
    
    console.log(`Searching for similar chunks with embedding dimension: ${dimension}, field: ${embeddingField}`);
    
    // Use raw query with embedded vector string (pgvector requires the vector to be in the query string)
    // Return raw results and map them manually to avoid issues with computed columns
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
    
    console.log(`Found ${(results as any[]).length} similar chunks`);
    
    // Map raw results to KnowledgeBase instances
    const chunks = (results as any[]).map((row: any) => {
      const chunk = KnowledgeBase.build({
        id: row.id,
        source: row.source,
        source_id: row.source_id,
        chunk_index: row.chunk_index,
        chunk_content: row.chunk_content,
        embeddings_768: row.embeddings_768,
        embeddings_1536: row.embeddings_1536,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      return chunk;
    });
    
    return chunks;
  } catch (error) {
    console.error('Error finding similar chunks:', error);
    // Log the full error for debugging
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    throw error;
  }
};

// Main function to answer user questions
export const ask = async (userQuestion: string): Promise<string> => {
  try {
    console.log(`Processing question: ${userQuestion}`);
    
    // First, check if database has any data
    const totalChunks = await KnowledgeBase.count();
    console.log(`Total chunks in database: ${totalChunks}`);
    
    if (totalChunks === 0) {
      return "The knowledge base is empty. Please load data first by calling the /api/load_data endpoint.";
    }
    
    // 1. Embed the question
    console.log('Getting embedding for question...');
    const questionEmbedding = await getEmbedding(userQuestion);
    console.log(`Question embedding dimension: ${questionEmbedding.length}`);
    
    // 2. Find similar chunks
    console.log('Searching for similar chunks...');
    const similarChunks = await findSimilarChunks(questionEmbedding, 5);
    console.log(`Found ${similarChunks.length} similar chunks`);
    
    if (similarChunks.length === 0) {
      console.log('No similar chunks found. This might indicate:');
      console.log('1. The database has data but embeddings are not stored correctly');
      console.log('2. The similarity search query is not working');
      console.log('3. The question embedding format is incorrect');
      return "I couldn't find any relevant information in the knowledge base to answer your question.";
    }
    
    // 3. Construct prompt with retrieved chunks
    const contextText = similarChunks
      .map((chunk, index) => `[Source ${index + 1}: ${chunk.source} - ${chunk.source_id}]\n${chunk.chunk_content}`)
      .join('\n\n---\n\n');
    
    console.log(`Context length: ${contextText.length} characters`);
    
    const prompt = `You are a helpful assistant answering questions about Lev-Boots technology based on the provided knowledge base.

Context from knowledge base:
${contextText}

User question: ${userQuestion}

Instructions:
- Answer the question based ONLY on the information provided in the context above
- If the context doesn't contain enough information to answer the question, say so clearly
- Do not make up information or use knowledge outside of the provided context
- Be concise and accurate
- Cite the source when relevant (e.g., "According to [source name]...")

Answer:`;
    
    // 4. Ask the LLM
    console.log('Sending prompt to LLM...');
    
    // Use gemini-pro as the default model (most widely supported)
    // If you need a different model, you can change this
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
    });
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const answer = response.text();
    
    console.log('Received answer from LLM');
    return answer;
  } catch (error) {
    console.error('Error answering question:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    throw error;
  }
};
