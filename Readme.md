# Search Song by Name, lyrics or artist
## Description
We are building a music database for a streaming platform. It stores metadata about songs including artist, title, album, lyrics, and year. Users frequently search for songs using lyrics snippets, artist names, or song titles.
The main challenge is to ensure fast and relevant search across large text fields (especially the lyrics). This calls for text search optimizations.
# Run this project
To run this project, first must have a PostgreSQL
1. SQL Script:
- Create schema
```
CREATE SCHEMA music
```
- Create Table
```
CREATE TABLE public.songs (
	id SERIAL PRIMARY KEY,
	artist TEXT,
	name TEXT,
	album TEXT,
	lyrics text,
	year text,
);
```
- Seed data into the database by using psql command
```
psql -U {username} -d {database_name} -p {port} -h {hostname}

\copy songs(artist,name,album,lyrics,year) FROM '{your_path_to_csv}' DELIMITER ',' CSV HEADER;
```
2. Start the application
**Frontend**
- Go to FE directory
```
cd song-fe
```
- Instal dependencies
```
npm install
```
- Run the app
```
npm start
```
**Backend**
- Go to BE directory
```
cd song-be
```
- Create virtual environment
```
python -m venv venv
```
- Activate a virtual environment 
```
source .venv/bin/activate
```
- Install dependency
```
pip install -r requirements.txt
```
- Run the app
```
python main.py
```
**Notice:** Please modify the db_host, db_password,... in main.py to your appropriate database server
