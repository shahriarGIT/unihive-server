import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import bodyParser from "body-parser";
// import fileupload from "express-fileupload";

import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// Models
import Quiz from "./models/Quiz.js";
import QuizRoom from "./models/QuizRoom.js";

export const server = http.createServer(app);
app.use(cors());
app.use(express.json());
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

// ---------------------- Quiz -------------------------

// GET /api/quizzes - fetch all quizzes
app.get("/api/quizzes", async (req, res) => {
  try {
    const quizzes = await Quiz.find().sort({ createdAt: -1 }); // latest first
    res.json(quizzes);
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    res.status(500).json({ message: "Failed to fetch quizzes" });
  }
});

app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  } catch (error) {
    console.error("Error fetching quiz:", error);
    res.status(500).json({ message: "Failed to fetch quiz" });
  }
});

app.post("/api/create-quiz", async (req, res) => {
  try {
    const { title, description, questions, isPublic } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res
        .status(400)
        .json({ message: "Title and questions are required" });
    }

    const newQuiz = new Quiz({
      title,
      description,
      questions,
      isPublic: isPublic || false,
    });

    await newQuiz.save();

    return res
      .status(201)
      .json({ message: "Quiz created successfully!", quiz: newQuiz });
  } catch (error) {
    console.error("Error creating quiz:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// POST /api/create-quiz-room
app.post("/api/create-quiz-room", async (req, res) => {
  try {
    const {
      quizId,
      roomName,
      roomPassword,
      hostId,
      timerEnabled,
      timerDuration,
    } = req.body;

    if (!quizId || !roomName || !roomPassword || !hostId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Optional: Check if quizId is valid
    const quizExists = await Quiz.findById(quizId);
    if (!quizExists) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const newRoom = new QuizRoom({
      quizId,
      roomName,
      roomPassword,
      hostId,
      timerEnabled: timerEnabled || false,
      timerDuration: timerEnabled ? timerDuration : undefined,
    });

    await newRoom.save();

    res
      .status(201)
      .json({ message: "Quiz room created successfully", room: newRoom });
  } catch (error) {
    console.error("Error creating quiz room:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/join-quiz-room", async (req, res) => {
  try {
    const { roomName, roomPassword, userId } = req.body;

    if (!roomName || !roomPassword || !userId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const room = await QuizRoom.findOne({ roomName });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.roomPassword !== roomPassword) {
      return res.status(403).json({ message: "Incorrect room password" });
    }

    // Add user to participants if not already in the room
    const userIdStr = userId.toString();
    const alreadyJoined = room.participants.some(
      (id) => id.toString() === userIdStr
    );

    if (!alreadyJoined) {
      room.participants.push(userId);
      await room.save();
    }

    res
      .status(200)
      .json({ message: "Joined room successfully", roomId: room._id });
  } catch (error) {
    console.error("Error joining quiz room:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/submit-quiz", async (req, res) => {
  const { quizId, roomName, userId, answers } = req.body;

  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    let score = 0;

    // Evaluate each answer
    quiz.questions.forEach((question, index) => {
      const userAnswer = answers[index];

      if (question.type === "multiple_choice") {
        const correct = Array.isArray(question.correctAnswer)
          ? question.correctAnswer.sort().toString()
          : [];
        const submitted = Array.isArray(userAnswer)
          ? userAnswer.sort().toString()
          : [];
        if (correct === submitted) score++;
      } else {
        if (question.correctAnswer === userAnswer) score++;
      }
    });

    // (Optional) Save submission
    // await Submission.create({ userId, quizId, roomName, answers, score });

    // (Optional) Update finished count or user status in room if needed

    return res.json({ score });
  } catch (err) {
    console.error("Error submitting quiz:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// io.on("connection", (socket) => {
//   console.log("User connected:", socket.id);

//   socket.on("start_quiz", async ({ roomId, hostId }) => {
//     try {
//       const room = await QuizRoom.findById(roomId).populate("quizId");

//       if (!room) return socket.emit("error_message", "Room not found");
//       if (room.hostId.toString() !== hostId) {
//         return socket.emit("error_message", "Only host can start the quiz");
//       }

//       room.isStarted = true;
//       await room.save();

//       const payload = {
//         quiz: room.quizId,
//         timerEnabled: room.timerEnabled,
//         timerDuration: room.timerDuration,
//       };

//       io.to(roomId).emit("quiz_started", payload);

//       // Optional: start countdown logic here (if you want server control)
//     } catch (err) {
//       console.error("Error starting quiz:", err);
//       socket.emit("error_message", "Failed to start quiz");
//     }
//   });

//   socket.on("join_room", ({ roomId }) => {
//     socket.join(roomId);
//   });
// });
const userProgress = {}; // temp in-memory store: { roomName: { userId: score } }
const finishedParticipants = new Map(); // roomName -> Set of userIds

io.on("connection", (socket) => {
  console.log("New client connected for quiz lobby:", socket.id);

  // Handle room joining
  socket.on("joinRoom", async ({ roomName, roomPassword, user }) => {
    console.log("User trying to join room:", roomName, user);

    try {
      // Find the room by roomName
      const room = await QuizRoom.findOne({ roomName });

      if (!room) {
        // Room doesn't exist
        socket.emit("joinError", { message: "Room not found" });
        return;
      }

      // Check if the password matches
      if (room.roomPassword !== roomPassword) {
        // Incorrect password
        socket.emit("joinError", { message: "Incorrect password" });
        return;
      }

      // Join the room

      socket.join(room._id.toString());
      console.log(`${user.name} joined room ${room._id}`);

      // Add user to DB if not already a participant
      // if (!room.participants.includes(user._id)) {
      //   room.participants.push(user._id);
      //   await room.save();
      // }

      // Add user to DB if not already a participant
      if (
        !room.participants.includes(
          (user) => user.userId.toString() === user._id.toString()
        )
      ) {
        room.participants.push({ userId: user._id, username: user.name });
        await room.save();
      }

      // Broadcast updated participant list to everyone in the room
      // const updatedRoom = await QuizRoom.findOne({ roomName }).populate(
      //   "participants",
      //   "roomName"
      // );

      const updatedRoom = await QuizRoom.findOne({ roomName });

      // console.log("Updated participants:", updatedRoom);

      io.to(room._id.toString()).emit(
        "participantsUpdate",
        updatedRoom.participants
      );
    } catch (err) {
      console.error("Error while joining room:", err);
      socket.emit("joinError", { message: "Server error, please try again" });
    }
  });

  // Handle starting the quiz
  socket.on("startQuiz", async ({ roomName }) => {
    console.log(`Starting quiz in room: ${roomName}`);

    const room = await QuizRoom.findOne({ roomName: roomName });
    if (!room) return;

    room.isStarted = true;
    await room.save();

    let quizId = room.quizId;
    io.to(room._id.toString()).emit("quizStarted", { quizId });
    // io.to(roomName).emit("quizStarted");
  });

  socket.on("quizFinished", async ({ roomName, quizId, userId, answers }) => {
    try {
      const quiz = await Quiz.findById(quizId);
      if (!quiz) return;

      let score = 0;

      quiz.questions.forEach((q, index) => {
        const userAnswer = answers[index];

        switch (q.type) {
          case "true_false":
          case "single_choice":
          case "short_answer":
            if (
              typeof q.correctAnswer === "string" &&
              userAnswer?.toString().trim().toLowerCase() ===
                q.correctAnswer.toString().trim().toLowerCase()
            ) {
              score++;
            }
            break;

          case "multiple_choice":
            const correctSet = new Set(q.correctAnswer || []);
            const userSet = new Set(userAnswer || []);
            const isEqual =
              correctSet.size === userSet.size &&
              [...correctSet].every((opt) => userSet.has(opt));
            if (isEqual) score++;
            break;
        }
      });

      // Store progress
      if (!userProgress[roomName]) userProgress[roomName] = {};
      userProgress[roomName][userId] = score;

      // Emit real-time stats to all in the room
      const participants = Object.keys(userProgress[roomName] || {});
      io.to(roomName).emit("quizStatsUpdate", {
        completedCount: participants.length,
        totalParticipants: await QuizRoom.findOne({ roomName }).then(
          (r) => r?.participants.length || 0
        ),
        scores: userProgress[roomName],
      });
    } catch (error) {
      console.error("Error in quizFinished:", error);
    }
  });

  socket.on("quizFinished", ({ roomName, userId }) => {
    if (!roomName || !userId) return;

    if (!finishedParticipants.has(roomName)) {
      finishedParticipants.set(roomName, new Set());
    }

    const finishedSet = finishedParticipants.get(roomName);
    finishedSet.add(userId);

    // Broadcast updated count to everyone in the stats room
    io.to(`stats-${roomName}`).emit("quizStatsUpdate", {
      finishedCount: finishedSet.size,
    });

    console.log(
      `[${roomName}] User ${userId} finished. Total finished: ${finishedSet.size}`
    );
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // Optionally: Handle user leaving room and update DB if necessary
  });
});

const port = process.env.PORT;
server.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

export default app;
