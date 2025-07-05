import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DBUSER,
  host: process.env.DBHOST,
  database: process.env.DBNAME,
  password: process.env.DBPW,
  port: process.env.DBPORT,
});

const connect = () => {
  console.log('Database connection established.');
  return pool;
};

const close = async (pool) => {
  try {
    await pool.end();
    console.log('Database connection closed.');
  } catch (e) {
    throw new Error(`Failed to close the database connection: ${e.message}`);
  }
};

const createTableIfNotExists = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS organisation_data (
      organisation_id SERIAL PRIMARY KEY,
      organisation_data TEXT NOT NULL,
      ai_embeddings_status TEXT NOT NULL,
      ai_embeddings_reason TEXT,
      created_at TIMESTAMP NOT NULL,
      modified_at TIMESTAMP NOT NULL
    )
  `;
  const client = await pool.connect();
  try {
    await client.query(query);
    await pool.query('COMMIT');
    console.log('Table created or already exists.');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw new Error(`Failed to create table: ${e.message}`);
  } finally {
    client.release();
  }
};

const createCollectionTableIfNotExists = async (pool) => {
  const query = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS langchain_collections (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(query);
    await client.query('COMMIT');
    console.log('✅ langchain_collections table created or already exists.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create langchain_collections table:', e.message);
    throw e;
  } finally {
    client.release();
  }
};


const createEmbeddingTableIfNotExists = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // First, create the pgvector extension if it doesn't exist
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Then create the embedding table
    const query = `
      CREATE TABLE IF NOT EXISTS langchain_pg_embedding (
        id SERIAL PRIMARY KEY,
        embedding VECTOR(1536), -- Adjust dimension based on your embedding model
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        content TEXT,
        collection_id UUID REFERENCES langchain_collections(uuid)
      )
    `;
    
    await client.query(query);
    await client.query('COMMIT');
    console.log('✅ Embedding table created or already exists.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create embedding table:', e.message);
    throw new Error(`Failed to create embedding table: ${e.message}`);
  } finally {
    client.release();
  }
};

const insertOrUpdateData = async (pool, data) => {
  const now = new Date();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (data.organisation_id) {
      // 🟠 Check if org exists
      const checkQuery = 'SELECT organisation_id FROM organisation_data WHERE organisation_id = $1';
      const checkResult = await client.query(checkQuery, [data.organisation_id]);

      if (checkResult.rows.length > 0) {
        // 🔁 Update existing org
        const updateQuery = `
          UPDATE organisation_data
          SET 
            organisation_data = $1,
            ai_embeddings_status = $2,
            ai_embeddings_reason = $3,
            modified_at = $4
          WHERE organisation_id = $5
        `;
        await client.query(updateQuery, [
          data.organisation_data,
          data.ai_embeddings_status,
          data.ai_embeddings_reason,
          now,
          data.organisation_id
        ]);
        await client.query('COMMIT');
        console.log('Record updated.');
        return data.organisation_id;
      } else {
        throw new Error(`No organisation found with ID: ${data.organisation_id}`);
      }
    } else {
 const insertQuery = `
  INSERT INTO organisation_data (
    organisation_data, ai_embeddings_status, ai_embeddings_reason, created_at, modified_at
  ) VALUES ($1, $2, $3, $4, $5)
  RETURNING organisation_id
`;
const insertResult = await client.query(insertQuery, [
  data.organisation_data,
  data.ai_embeddings_status,
  data.ai_embeddings_reason,
  now,
  now
]);
const newId = insertResult.rows[0].organisation_id;
await client.query('COMMIT');
console.log('Record inserted.');
return newId;
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw new Error(`Failed to insert or update data: ${e.message}`);
  } finally {
    client.release();
  }
};


export { connect, close, createTableIfNotExists,createCollectionTableIfNotExists, createEmbeddingTableIfNotExists, insertOrUpdateData };