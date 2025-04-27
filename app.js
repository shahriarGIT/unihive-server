import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import bodyParser from "body-parser";
// import fileupload from "express-fileupload";

import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

export const server = http.createServer(app);
app.use(cors());

// Allow CORS from your frontend

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // your frontend URL
    methods: ["GET", "POST"],
  },
});

import dotenv from "dotenv";
dotenv.config();

const rooms = {}; // Save room data temporarily
const roomUsers = {}; // { roomName: [ { id, name }, ... ] }
const activePolls = {}; // { roomName: pollData }

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("create_room", ({ roomName, passcode, username }) => {
    // rooms[roomName] = { passcode, users: [], polls: [], livePoll: null };
    rooms[roomName] = {
      passcode,
      users: [],
      polls: [],
      livePoll: null,
      hostId: socket.id, // 👈 new line
    };
    rooms[roomName].users.push({ id: socket.id, name: username });
    socket.join(roomName);
    socket.emit("room_created", roomName);
    io.to(roomName).emit("users_in_room", rooms[roomName].users);
  });

  socket.on("join_room", ({ roomName, passcode, username }) => {
    if (rooms[roomName] && rooms[roomName].passcode === passcode) {
      rooms[roomName].users.push({ id: socket.id, name: username });
      socket.join(roomName);
      socket.emit("room_joined", roomName);
      io.to(roomName).emit("users_in_room", rooms[roomName].users);

      // If a live poll is running, send it immediately
      if (rooms[roomName].livePoll) {
        socket.emit("poll_started", rooms[roomName].livePoll);
      }
    } else {
      socket.emit("error_message", "Invalid room name or passcode.");
    }
  });

  socket.on("save_poll", ({ roomName, poll }) => {
    if (!rooms[roomName]) return;

    // push it into the room’s polls array
    rooms[roomName].polls.push(poll);

    // broadcast the updated list back to everyone in that room
    io.to(roomName).emit("polls_updated", rooms[roomName].polls);
  });

  socket.on("go_live_poll", ({ roomName, pollIndex }) => {
    if (rooms[roomName]) {
      const poll = rooms[roomName].polls[pollIndex];
      rooms[roomName].livePoll = {
        ...poll,
        voteCounts: {},
        totalVotes: 0,
      };
      poll.options.forEach((option) => {
        rooms[roomName].livePoll.voteCounts[option] = 0;
      });

      io.to(roomName).emit("poll_started", rooms[roomName].livePoll);
    }
  });

  // socket.on("submit_vote", ({ roomName, selectedOptions }) => {
  //   const room = rooms[roomName];
  //   if (!room || !room.livePoll) return;

  //   // Don't allow host to vote
  //   if (socket.id === room.hostId) {
  //     socket.emit("error_message", "Host is not allowed to vote!");
  //     return;
  //   }

  //   selectedOptions.forEach(option => {
  //     if (room.livePoll.voteCounts[option] !== undefined) {
  //       room.livePoll.voteCounts[option] += 1;
  //     }
  //   });

  //   room.livePoll.totalVotes++;

  //   io.to(roomName).emit("vote_count_updated", room.livePoll.totalVotes);
  // });

  socket.on("submit_vote", ({ roomName, selectedOptions }) => {
    if (rooms[roomName] && rooms[roomName].livePoll) {
      selectedOptions.forEach((option) => {
        if (rooms[roomName].livePoll.voteCounts[option] !== undefined) {
          rooms[roomName].livePoll.voteCounts[option]++;
        }
      });

      rooms[roomName].livePoll.totalVotes++;

      io.to(roomName).emit(
        "vote_count_updated",
        rooms[roomName].livePoll.totalVotes
      );
    }
  });

  socket.on("end_poll", ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || !room.livePoll) return;

    const results = room.livePoll.voteCounts;
    const correctAnswers = room.livePoll.correctAnswers || []; // Just in case

    io.to(roomName).emit("poll_ended", { results, correctAnswers });

    room.livePoll = null; // Reset the live poll
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (const roomName in rooms) {
      rooms[roomName].users = rooms[roomName].users.filter(
        (u) => u.id !== socket.id
      );
      io.to(roomName).emit("users_in_room", rooms[roomName].users);
    }
  });
});

const port = process.env.PORT;
server.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

export default app;
