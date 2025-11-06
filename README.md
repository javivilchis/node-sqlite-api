# node-sqlite-api

Small Node.js API using SQLite for local development and quick prototypes.

## Features

- Simple REST endpoints (CRUD) backed by a local SQLite database
- Minimal dependencies
- Ready for local development and Docker

## Prerequisites

- Node.js 16+ (or compatible)
- npm or yarn
- SQLite3 (CLI optional for inspecting the DB)
- Docker (optional)

## Installation

1. Clone the repo (or work in this directory).
2. Install dependencies:

```bash
npm install
# or
yarn
```

## Configuration

- By default the project uses a local SQLite file (e.g. `./data/database.sqlite`).
- Optional environment variables:
  - PORT (default: 3000)
  - DATABASE_FILE (default: ./data/database.sqlite)

Create a `.env` file (if using dotenv):

```
PORT=3000
DATABASE_FILE=./data/database.sqlite
```

Troubleshoot `.env` : after you create the file, include something like the following content.

```
PORT=4000
JWT_SECRET=qiewffehohqwef
```

## Initialize / Migration

If the project includes an initialization script (e.g. `scripts/init-db.js`), run:

```bash
node scripts/init-db.js
```

Or let the server create/init the DB on first start (check project implementation).

## Run the server locally

- Start (production):

```bash
npm start
# or
node ./src/index.js
```

- Start in development (auto-reload with nodemon):

```bash
npm run dev
# or
npx nodemon ./src/index.js
```

- Custom port:

```bash
PORT=4000 npm start
```

## Run with Docker

1. Build:

```bash
docker build -t node-sqlite-api .
```

2. Run:

```bash
docker run --rm -p 3000:3000 -v "$(pwd)/data:/app/data" node-sqlite-api
```

(Expose the `data` directory so the SQLite file persists.)

Or use a simple docker-compose.yml mapping the port and volume.

## Example requests

Assuming server on http://localhost:3000

- GET all items

```bash
curl http://localhost:3000/items
```

- POST create

```bash
curl -X POST -H "Content-Type: application/json" -d '{"name":"example"}' http://localhost:3000/items
```

## Notes

- Inspect the SQLite DB with `sqlite3 ./data/database.sqlite`.
- Add tests and migrations as needed for production readiness.

## License

Specify a license in LICENSE file (e.g. MIT).

```
 __      ___ _             _____    _   _____       _
 \ \    / (_) |           / ____|  | | |  __ \     | |
  \ \  / / _| |__   ___  | |     __| | | |__) |   _| | ___  ___
   \ \/ / | | '_ \ / _ \ | |    / _` | |  _  / | | | |/ _ \/ __|
    \  /  | | |_) |  __/ | |___| (_| | | | \ \ |_| | |  __/\__ \
     \/   |_|_.__/ \___|  \_____\__,_| |_|  \_\__,_|_|\___||___/

    Javi Nov. 2025
```
# node-sqlite-api
