const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Store room states in memory
// Map of roomCode → { seeder: socketId, leechers: [] }
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // client joins Socket.io room
    socket.on('join-room', (roomCode) => {
        let room = rooms.get(roomCode);
        
        if (!room) {
            // First person is seeder
            room = { seeder: socket.id, leechers: [] };
            rooms.set(roomCode, room);
            socket.join(roomCode);
            socket.emit('room-created', roomCode);
            console.log(`Seeder ${socket.id} created room ${roomCode}`);
        } else {
            // Join as leecher
            room.leechers.push(socket.id);
            socket.join(roomCode);
            
            // Notify seeder that a leecher joined
            io.to(room.seeder).emit('leecher-joined', socket.id);
            socket.emit('room-joined', roomCode);
            console.log(`Leecher ${socket.id} joined room ${roomCode}`);
        }
    });

    // seeder sends WebRTC offer
    socket.on('offer', (roomCode, sdp, targetId) => {
        if (targetId) {
            io.to(targetId).emit('offer', sdp, socket.id);
        } else {
            socket.to(roomCode).emit('offer', sdp, socket.id);
        }
    });

    // leecher sends WebRTC answer
    socket.on('answer', (roomCode, sdp, targetId) => {
        if (targetId) {
            io.to(targetId).emit('answer', sdp, socket.id);
        } else {
            socket.to(roomCode).emit('answer', sdp, socket.id);
        }
    });

    // both sides exchange ICE candidates
    socket.on('ice-candidate', (roomCode, candidate, targetId) => {
        if (targetId) {
            io.to(targetId).emit('ice-candidate', candidate, socket.id);
        } else {
            socket.to(roomCode).emit('ice-candidate', candidate, socket.id);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Clean up empty rooms
        for (const [roomCode, room] of rooms.entries()) {
            if (room.seeder === socket.id) {
                // Seeder disconnected, alert all in room
                socket.to(roomCode).emit('seeder-disconnected');
                rooms.delete(roomCode);
            } else {
                // Leecher disconnected
                const index = room.leechers.indexOf(socket.id);
                if (index !== -1) {
                    room.leechers.splice(index, 1);
                    if (room.seeder) {
                        io.to(room.seeder).emit('leecher-disconnected', socket.id);
                    }
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
