const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3001;
app.use(express.static(path.join(__dirname, 'public')));

// Store room states: Map of roomCode → { host, guests[], mode }
const rooms = new Map();

io.on('connection', (socket) => {
    socket.on('join-room', (roomCode, mode) => {
        let room = rooms.get(roomCode);
        
        if (!room) {
            // First person is host
            room = { host: socket.id, guests: [], mode: mode || 'files' };
            rooms.set(roomCode, room);
            socket.join(roomCode);
            socket.emit('room-created', roomCode, room.mode);
            console.log(`Host ${socket.id} created ${room.mode} room ${roomCode}`);
        } else {
            // Join as guest
            room.guests.push(socket.id);
            socket.join(roomCode);
            
            // Notify host
            io.to(room.host).emit('guest-joined', socket.id);
            // Notify guest of the room's mode
            socket.emit('room-joined', roomCode, room.mode);
            console.log(`Guest ${socket.id} joined ${room.mode} room ${roomCode}`);
        }
    });

    socket.on('offer', (roomCode, sdp, targetId) => {
        io.to(targetId).emit('offer', sdp, socket.id);
    });

    socket.on('answer', (roomCode, sdp, targetId) => {
        io.to(targetId).emit('answer', sdp, socket.id);
    });

    socket.on('ice-candidate', (roomCode, candidate, targetId) => {
        io.to(targetId).emit('ice-candidate', candidate, socket.id);
    });

    socket.on('disconnect', () => {
        for (const [roomCode, room] of rooms.entries()) {
            if (room.host === socket.id) {
                socket.to(roomCode).emit('peer-disconnected');
                rooms.delete(roomCode);
            } else {
                const index = room.guests.indexOf(socket.id);
                if (index !== -1) {
                    room.guests.splice(index, 1);
                    if (room.host) io.to(room.host).emit('peer-disconnected', socket.id);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
