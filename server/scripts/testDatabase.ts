// Script to test and debug the knowledge base
import sequelize from '../config/database';
import KnowledgeBase from '../models/KnowledgeBase';

const EMBEDDING_DIMENSION = 768;

async function testDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Count total records
    const totalCount = await KnowledgeBase.count();
    console.log(`\n📊 Total records in knowledge_base: ${totalCount}`);
    
    // Count by source
    const bySource = await KnowledgeBase.findAll({
      attributes: [
        'source',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['source'],
      raw: true,
    });
    console.log('\n📁 Records by source:');
    bySource.forEach((item: any) => {
      console.log(`  - ${item.source}: ${item.count}`);
    });
    
    // Count records with embeddings using raw query
    const embeddingField = EMBEDDING_DIMENSION === 768 ? 'embeddings_768' : 'embeddings_1536';
    const withEmbeddingsResult = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM knowledge_base
      WHERE ${embeddingField} IS NOT NULL
    `, {
      type: 'SELECT' as any,
    });
    const withEmbeddings = (withEmbeddingsResult[0] as any)?.count || 0;
    console.log(`\n🔢 Records with ${embeddingField}: ${withEmbeddings}`);
    
    // Show sample records
    const samples = await KnowledgeBase.findAll({
      limit: 5,
      attributes: ['id', 'source', 'source_id', 'chunk_index', 'chunk_content'],
    });
    
    console.log('\n📝 Sample records:');
    samples.forEach((record) => {
      const contentPreview = record.chunk_content.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  ID ${record.id}: [${record.source}] ${record.source_id} - Chunk ${record.chunk_index}`);
      console.log(`    Preview: ${contentPreview}...`);
    });
    
    // Check if embeddings are stored as vectors (raw query)
    const vectorCheck = await sequelize.query(`
      SELECT 
        id, 
        source,
        source_id,
        chunk_index,
        pg_typeof(${embeddingField}) as embedding_type,
        array_length(${embeddingField}::real[], 1) as embedding_length
      FROM knowledge_base 
      WHERE ${embeddingField} IS NOT NULL
      LIMIT 3
    `, {
      type: 'SELECT' as any,
    });
    
    console.log('\n🔍 Embedding type check:');
    if (Array.isArray(vectorCheck) && vectorCheck.length > 0) {
      vectorCheck.forEach((item: any) => {
        console.log(`  ID ${item.id}: type=${item.embedding_type}, length=${item.embedding_length || 'N/A'}`);
      });
    } else {
      console.log('  ⚠️  No records with embeddings found');
    }
    
  } catch (error) {
    console.error('❌ Error testing database:', error);
  } finally {
    await sequelize.close();
  }
}

testDatabase();

