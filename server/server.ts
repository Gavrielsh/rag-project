import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ragRoutes from './routes/ragRoutes';
import { initializeDB } from './models/index';
import { loadAllData } from './services/ragService';
import KnowledgeBase from './models/KnowledgeBase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', ragRoutes);

app.use(express.static(path.join(__dirname, '../public/dist')));

app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, '../public/dist/index.html'));
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    await initializeDB();
    
    // Check if database is empty and optionally load data
    const totalChunks = await KnowledgeBase.count();
    console.log(`Current chunks in database: ${totalChunks}`);
    
    if (totalChunks === 0) {
      const autoLoad = process.env.AUTO_LOAD_DATA === 'true';
      if (autoLoad) {
        console.log('Database is empty. Auto-loading data (this may take several minutes)...');
        try {
          await loadAllData();
          console.log('Data loaded successfully!');
        } catch (error) {
          console.error('Failed to auto-load data:', error);
          console.log('You can manually load data by calling POST /api/load_data');
        }
      } else {
        console.log('Database is empty. To load data, call: POST /api/load_data');
        console.log('Or set AUTO_LOAD_DATA=true in your .env file to auto-load on startup');
      }
    }
  } catch (error) {
    console.error(
      'Failed to connect to database. Server will continue but database operations may fail.'
    );
  }
});
