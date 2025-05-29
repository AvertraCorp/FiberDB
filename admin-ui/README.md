# FiberDB Admin UI

A modern Next.js 15 admin interface for FiberDB with query capabilities and performance monitoring.

## Features

- **Query Explorer**: Interactive query builder with JSON editor and example queries
- **Data Visualization**: Table, JSON, and metrics views for query results
- **Performance Dashboard**: Real-time cache metrics and system status monitoring
- **Modern UI**: Built with Tailwind CSS and Lucide icons
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Configuration

The admin UI connects to FiberDB on `http://localhost:4001` by default. You can modify the API endpoint in `src/lib/api.ts`.

## Usage

### Query Explorer
- Write JSON queries in the query builder
- Use example queries to get started
- Configure query options (performance metrics, cache settings, etc.)
- View results in table, JSON, or metrics format

### Performance Dashboard
- Monitor FiberDB system status
- View cache performance metrics
- Clear cache when needed
- Real-time status updates every 30 seconds

## Tech Stack

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## API Integration

The admin UI integrates with FiberDB's REST API:

- `POST /query` - Execute queries
- `GET /cache` - Get cache information
- `DELETE /cache` - Clear cache

All API interactions support FiberDB's headers for performance metrics, cache control, and TTL settings.
