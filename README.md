# Team Collaboration Workspace

A full-stack collaboration platform for teams to manage rooms, meetings, invitations, activity, chat, and users in one place.

## Features

- User authentication with JWT
- Team rooms with room details and member access
- Real-time chat and updates using Socket.IO
- Meeting details and video-call support
- Invitations, activity timeline, and unread counts
- Admin dashboard for user management

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Zustand, Axios, Socket.IO Client
- Backend: Node.js, Express, MongoDB, Mongoose, Socket.IO
- Auth/Security: JWT, bcryptjs, Helmet, rate limiting

## Project Structure

```text
team-collaboration-workspace/
  frontend/   React client
  backend/    Express API and Socket.IO server
```

## Getting Started

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure environment variables

Create `backend/.env`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:5173
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

### 3. Run the app

Start the backend:

```bash
cd backend
npm run dev
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Open the frontend URL shown by Vite, usually:

```text
http://localhost:5173
```

## Build

```bash
cd frontend
npm run build
```

