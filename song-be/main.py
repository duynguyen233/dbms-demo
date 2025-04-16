from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="PostgreSQL Full Text Search Demo")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for demo purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection parameters - update these with your actual values
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "music")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "thangcho")
DB_PORT = os.getenv("DB_PORT", "5432")

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT,
            cursor_factory=RealDictCursor
        )
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

class Song(BaseModel):
    id: int
    artist: str
    name: str
    album: Optional[str] = None
    lyrics: str
    year: str
    rank: Optional[float] = None

@app.get("/")
async def root():
    return {"message": "PostgreSQL Full-Text Search Demo API"}

@app.get("/songs", response_model=List[Song])
async def get_songs(limit: int = 10, offset: int = 0):
    """Get a list of songs with pagination"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            "SELECT id, artist, name, album, lyrics, year FROM songs LIMIT %s OFFSET %s",
            (limit, offset)
        )
        results = cursor.fetchall()
        return results
    finally:
        cursor.close()
        conn.close()

@app.get("/search/ilike", response_model=List[Song])
async def search_ilike(query: str = Query(..., description="Search query"), limit: int = 20):
    """Search using ILIKE (case-insensitive pattern matching)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        search_pattern = f"%{query}%"
        cursor.execute(
            """
            SELECT id, artist, name, album, lyrics, year
            FROM songs 
            WHERE lyrics ILIKE %s OR name ILIKE %s OR artist ILIKE %s OR album ILIKE %s
            ORDER BY year DESC
            LIMIT %s
            """,
            (search_pattern, search_pattern, search_pattern, search_pattern, limit)
        )
        results = cursor.fetchall()
        return results
    finally:
        cursor.close()
        conn.close()

@app.get("/search/fts", response_model=List[Song])
async def search_full_text(query: str = Query(..., description="Search query"), limit: int = 20):
    """Search using PostgreSQL Full Text Search with ranking"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            """
            SELECT 
                id,
                artist, 
                name,
                album, 
                lyrics, 
                year,
                ts_rank(to_tsvector('english', name || ' ' || lyrics || ' ' || artist), 
                        plainto_tsquery('english', %s)) AS rank
            FROM songs 
            WHERE to_tsvector('english', name || ' ' || lyrics || ' ' || artist) @@ plainto_tsquery('english', %s)
            ORDER BY rank DESC
            LIMIT %s
            """,
            (query, query, limit)
        )
        results = cursor.fetchall()

        return results
    finally:
        cursor.close()
        conn.close()

@app.get("/search/fuzzy", response_model=List[Song])
async def search_fuzzy(query: str = Query(..., description="Search query"), limit: int = 20):
    """Search using pg_trgm for fuzzy matching"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # First check if pg_trgm extension is installed
        cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
        if not cursor.fetchone():
            return {"error": "pg_trgm extension is not installed in the database"}
            
        cursor.execute(
            """
            SELECT 
                id, artist, name, album, lyrics, year, 
                similarity(name, %s) + similarity(lyrics, %s) + similarity(artist, %s) AS rank
            FROM songs 
            WHERE name %% %s OR lyrics %% %s OR artist %% %s
            ORDER BY rank DESC
            LIMIT %s
            """,
            (query, query, query, query, query, query, limit)
        )
        results = cursor.fetchall()
        return results
    finally:
        cursor.close()
        conn.close()

@app.post("/index/create")
async def create_index(index_type: str = Query(..., description="Type of index to create: fts or trgm")):
    """Create a database index for improved search performance"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if index_type == "fts":
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_songs_fts ON songs 
                USING GIN(to_tsvector('english', name || ' ' || lyrics || ' ' || artist))
                """
            )
            message = "Full-text search GIN index created successfully"
        elif index_type == "trgm":
            # First ensure pg_trgm extension is installed
            cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            
            # Create trigram indexes for fuzzy matching
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_songs_name_trgm ON songs 
                USING GIN(name gin_trgm_ops)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_songs_lyrics_trgm ON songs 
                USING GIN(lyrics gin_trgm_ops)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_songs_artist_trgm ON songs 
                USING GIN(artist gin_trgm_ops)
                """
            )
            message = "Trigram GIN indexes created successfully"
        else:
            return {"error": "Invalid index type. Use 'fts' or 'trgm'"}
        
        conn.commit()
        return {"message": message}
    except Exception as e:
        conn.rollback()
        return {"error": f"Failed to create index: {str(e)}"}
    finally:
        cursor.close()
        conn.close()

@app.post("/index/drop")
async def drop_index(index_type: str = Query(..., description="Type of index to drop: fts or trgm")):
    """Drop a database index"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if index_type == "fts":
            cursor.execute("DROP INDEX IF EXISTS idx_songs_fts")
            message = "Full-text search index dropped successfully"
        elif index_type == "trgm":
            cursor.execute("DROP INDEX IF EXISTS idx_songs_name_trgm")
            cursor.execute("DROP INDEX IF EXISTS idx_songs_lyrics_trgm")
            cursor.execute("DROP INDEX IF EXISTS idx_songs_artist_trgm")
            message = "Trigram indexes dropped successfully"
        else:
            return {"error": "Invalid index type. Use 'fts' or 'trgm'"}
        
        conn.commit()
        return {"message": message}
    except Exception as e:
        conn.rollback()
        return {"error": f"Failed to drop index: {str(e)}"}
    finally:
        cursor.close()
        conn.close()

@app.get("/search/debug")
async def debug_search(query: str = Query(..., description="Search query")):
    """Debug PostgreSQL text search processing"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get token information with ts_debug
        cursor.execute("SELECT * FROM ts_debug('english', %s)", (query,))
        token_info = cursor.fetchall()
        
        # Get lexeme statistics for the query
        cursor.execute(
            """
            SELECT lexeme, count FROM ts_stat('
                SELECT to_tsvector(''english'', name || '' '' || lyrics) 
                FROM songs 
                LIMIT 1000
            ') 
            WHERE lexeme IN (
                SELECT lexeme FROM ts_debug('english', %s) WHERE lexeme IS NOT NULL
            )
            ORDER BY count DESC
            """,
            (query,)
        )
        lexeme_stats = cursor.fetchall()
        
        return {
            "query": query,
            "token_info": token_info,
            "lexeme_stats": lexeme_stats
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/db/stats")
async def db_stats():
    """Get some basic database statistics"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get row count
        cursor.execute("SELECT COUNT(*) as song_count FROM songs")
        song_count = cursor.fetchone().get("song_count", 0)
        
        # Check existing indexes
        cursor.execute(
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'songs'
            """
        )
        indexes = cursor.fetchall()
        
        # Check if extensions are installed
        cursor.execute("SELECT extname FROM pg_extension")
        extensions = [ext["extname"] for ext in cursor.fetchall()]
        
        return {
            "song_count": song_count,
            "indexes": indexes,
            "extensions": extensions
        }
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)