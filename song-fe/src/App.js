import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [query, setQuery] = useState('');
  const [searchMethod, setSearchMethod] = useState('ilike');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbStats, setDbStats] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedSong, setSelectedSong] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [executedQuery, setExecutedQuery] = useState('');
  const [executionTime, setExecutionTime] = useState(0);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    // Fetch DB stats on component mount
    fetchDbStats();
  }, []);

  const fetchDbStats = async () => {
    try {
      const response = await fetch(`${API_URL}/db/stats`);
      const data = await response.json();
      setDbStats(data);
    } catch (error) {
      console.error('Error fetching DB stats:', error);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setExecutionTime(null)
    setLoading(true);
    setMessage('');

    try {
      let endpoint;
      let queryText = '';
      
      switch (searchMethod) {
        case 'ilike':
          endpoint = `${API_URL}/search/ilike?query=${encodeURIComponent(query)}`;
          queryText = `SELECT * FROM songs WHERE lyrics ILIKE '%${query}%' OR name ILIKE '%${query}%' OR artist ILIKE '%${query}%' OR album ILIKE '%${query}%' ORDER BY year DESC LIMIT 20;`;
          break;
        case 'fts':
          endpoint = `${API_URL}/search/fts?query=${encodeURIComponent(query)}`;
          queryText = `SELECT id, artist, name, album, lyrics, year, ts_rank(to_tsvector('english', name || ' ' || lyrics || ' ' || artist), plainto_tsquery('english', '${query}')) AS rank FROM songs WHERE to_tsvector('english', name || ' ' || lyrics || ' ' || artist) @@ plainto_tsquery('english', '${query}') ORDER BY rank DESC LIMIT 20;`;
          break;
        case 'fuzzy':
          endpoint = `${API_URL}/search/fuzzy?query=${encodeURIComponent(query)}`;
          queryText = `SELECT id, artist, name, album, lyrics, year, similarity(name, '${query}') + similarity(lyrics, '${query}') + similarity(artist, '${query}') AS rank FROM songs WHERE name % '${query}' OR lyrics % '${query}' OR artist % '${query}' ORDER BY rank DESC LIMIT 20;`;
          break;
        default:
          endpoint = `${API_URL}/search/ilike?query=${encodeURIComponent(query)}`;
          queryText = `SELECT * FROM songs WHERE lyrics ILIKE '%${query}%' OR name ILIKE '%${query}%' OR artist ILIKE '%${query}%' OR album ILIKE '%${query}%' ORDER BY year DESC LIMIT 20;`;
      }

      // Log query to console
      console.log("Executing query:", queryText);
      setExecutedQuery(queryText);

      const startTime = performance.now();
      const response = await fetch(endpoint);
      const data = await response.json();
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      setExecutionTime(executionTime);
      
      if (response.ok) {
        setResults(data);
        setMessage(`Found ${data.length} results using ${getSearchMethodName(searchMethod)}`);
      } else {
        setMessage(`Error: ${data.detail || 'Failed to fetch results'}`);
      }
    } catch (error) {
      console.error('Search error:', error);
      setMessage('Error: Failed to perform search. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIndex = async (indexType) => {
    setLoading(true);
    setMessage('');

    try {
      let queryText = '';
      if (indexType === 'fts') {
        queryText = "CREATE INDEX IF NOT EXISTS idx_songs_fts ON songs USING GIN(to_tsvector('english', name || ' ' || lyrics || ' ' || artist));";
      } else if (indexType === 'trgm') {
        queryText = `CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_songs_name_trgm ON songs USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_songs_lyrics_trgm ON songs USING GIN(lyrics gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_songs_artist_trgm ON songs USING GIN(artist gin_trgm_ops);`;
      }

      // Log query to console
      console.log("Executing index creation:", queryText);

      const response = await fetch(`${API_URL}/index/create?index_type=${indexType}`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        setMessage(data.message);
        fetchDbStats(); // Refresh DB stats
      } else {
        setMessage(`Error: ${data.error || 'Failed to create index'}`);
      }
    } catch (error) {
      console.error('Error creating index:', error);
      setMessage('Error: Failed to create index. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleDropIndex = async (indexType) => {
    setLoading(true);
    setMessage('');

    try {
      let queryText = '';
      if (indexType === 'fts') {
        queryText = "DROP INDEX IF EXISTS idx_songs_fts;";
      } else if (indexType === 'trgm') {
        queryText = `DROP INDEX IF EXISTS idx_songs_name_trgm;
DROP INDEX IF EXISTS idx_songs_lyrics_trgm;
DROP INDEX IF EXISTS idx_songs_artist_trgm;`;
      }

      // Log query to console
      console.log("Executing index drop:", queryText);

      const response = await fetch(`${API_URL}/index/drop?index_type=${indexType}`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        setMessage(data.message);
        fetchDbStats(); // Refresh DB stats
      } else {
        setMessage(`Error: ${data.error || 'Failed to drop index'}`);
      }
    } catch (error) {
      console.error('Error dropping index:', error);
      setMessage('Error: Failed to drop index. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const openLyricsModal = (song) => {
    setSelectedSong(song);
    setShowModal(true);
  };

  const closeLyricsModal = () => {
    setShowModal(false);
    setSelectedSong(null);
  };

  const getSearchMethodName = (method) => {
    switch (method) {
      case 'ilike': return 'ILIKE (basic text matching)';
      case 'fts': return 'Full Text Search';
      case 'fuzzy': return 'Fuzzy Search (pg_trgm)';
      default: return method;
    }
  };

  const truncateText = (text, maxLength = 150) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const formatExecutionTime = (time) => {
    if (time < 1000) {
      return `${time.toFixed(2)} ms`;
    } else {
      return `${(time / 1000).toFixed(2)} s`;
    }
  };

  console.log(results)
  return (
    <div className="App">
      <header className="App-header">
        <h1>PostgreSQL Full Text Search Demo</h1>
      </header>

      <main>
        <section className="search-section">
          <form onSubmit={handleSearch}>
            <div className="search-container">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for songs, lyrics, or artists..."
                className="search-input"
              />
              <button type="submit" className="search-button" disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            <div className="search-options">
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    value="ilike"
                    checked={searchMethod === 'ilike'}
                    onChange={() => setSearchMethod('ilike')}
                  />
                  ILIKE (Basic)
                </label>
                <label>
                  <input
                    type="radio"
                    value="fts"
                    checked={searchMethod === 'fts'}
                    onChange={() => setSearchMethod('fts')}
                  />
                  Full Text Search
                </label>
                <label>
                  <input
                    type="radio"
                    value="fuzzy"
                    checked={searchMethod === 'fuzzy'}
                    onChange={() => setSearchMethod('fuzzy')}
                  />
                  Fuzzy Search
                </label>
              </div>
            </div>
          </form>
        </section>

        <section className="database-tools">
          <div className="index-management">
            <h3>Index Management</h3>
            <div className="button-row">
              <button onClick={() => handleCreateIndex('fts')} disabled={loading}>
                Create FTS Index
              </button>
              <button onClick={() => handleDropIndex('fts')} disabled={loading}>
                Drop FTS Index
              </button>
              <button onClick={() => handleCreateIndex('trgm')} disabled={loading}>
                Create Trigram Index
              </button>
              <button onClick={() => handleDropIndex('trgm')} disabled={loading}>
                Drop Trigram Index
              </button>
            </div>
          </div>

          {dbStats && (
            <div className="db-stats">
              <h3>Database Statistics</h3>
              <p>Total songs: {dbStats.song_count}</p>
              <div className="indexes">
                <h4>Current Indexes:</h4>
                {dbStats.indexes.length > 0 ? (
                  <ul>
                    {dbStats.indexes.map((index, i) => (
                      <li key={i}>{index.indexname}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No indexes found on songs table.</p>
                )}
              </div>
              <div className="extensions">
                <h4>PostgreSQL Extensions:</h4>
                <ul>
                  {dbStats.extensions.map((ext, i) => (
                    <li key={i}>{ext}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {message && <div className="message">{message}</div>}

        {executedQuery && (
          <div className="executed-query">
            <h3>SQL Query</h3>
            <pre>{executedQuery}</pre>
            <div className="execution-time">
              {executionTime !== null && (
                <pre>Execution Time: {formatExecutionTime(executionTime)}</pre>
              )}
            </div>
          </div>
        )}

        <section className="results-section">
          {results.length > 0 ? (
            <>
              <h2>Search Results</h2>
              <div className="results-list">
                {results.map((song) => (
                  <div key={song.id} className="song-card">
                    <h3>{song.name}</h3>
                    <p className="artist">
                      <strong>Artist:</strong> {song.artist}
                    </p>
                    <p>
                      <strong>Album:</strong> {song.album} ({song.year})
                    </p>
                    {song.rank !== null && (
                      <p className="rank">
                        <strong>Relevance Score:</strong> {song.rank.toFixed(4)}
                      </p>
                    )}
                    <p className="lyrics">
                      <strong>Lyrics:</strong> {truncateText(song.lyrics)}
                    </p>
                    <button 
                      className="view-lyrics-btn" 
                      onClick={() => openLyricsModal(song)}
                    >
                      View Full Lyrics
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            query && !loading && <p className="no-results">No songs found matching your query.</p>
          )}
        </section>
      </main>

      {/* Lyrics Modal */}
      {showModal && selectedSong && (
        <div className="modal-overlay" onClick={closeLyricsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedSong.name}</h2>
              <button className="close-modal" onClick={closeLyricsModal}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="song-info">
                <strong>Artist:</strong> {selectedSong.artist}<br />
                <strong>Album:</strong> {selectedSong.album} ({selectedSong.year})
              </p>
              <div className="lyrics-container">
                <h3>Lyrics:</h3>
                <pre className="full-lyrics">{selectedSong.lyrics || "No lyrics available"}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;