# Tetris Online - Multiplayer

A real-time multiplayer Tetris game built with Node.js, Express, and Socket.IO.

## Features

- Real-time multiplayer gameplay
- Room system (create/join rooms)
- Live opponent board preview
- Garbage lines system (clear 2+ lines to send garbage)
- Level progression with increasing speed
- Modern responsive UI

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5 Canvas, CSS3, JavaScript

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Or run production server
npm start
```

The game will be available at `http://localhost:3000`

## Controls

- **Arrow Left/Right**: Move piece
- **Arrow Up**: Rotate piece
- **Arrow Down**: Soft drop
- **Space**: Hard drop

## Deployment on Render.com

1. Push this repository to GitHub
2. Go to [Render.com](https://render.com) and sign in
3. Click "New" → "Web Service"
4. Connect your GitHub repository
5. Render will auto-detect settings from `render.yaml`
6. Click "Create Web Service"

The app will be deployed automatically on every push to the main branch.

## Environment Variables

- `PORT`: Server port (default: 3000, auto-set by Render)
- `NODE_ENV`: Environment (production/development)

## License

MIT
