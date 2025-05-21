import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import bodyParser from "body-parser";
// import fileupload from "express-fileupload";

import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";

import userRouter from "./routes/userRouter.js";

const app = express();

// Models
import Quiz from "./models/Quiz.js";
import QuizRoom from "./models/QuizRoom.js";

export const server = http.createServer(app);
// app.use(cors());
app.use(express.json());
// Allow CORS from your frontend

const corsOptions = {
  origin: ["http://localhost:3000"], // Specific frontend origin
  credentials: true, // Allow cookies
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // your frontend URL
    methods: ["GET", "POST"],
  },
});

import dotenv from "dotenv";
import Flashcard from "./models/flashcardModel.js";
import { log } from "console";
import UserPoints from "./models/scoreModel.js";
dotenv.config();

app.use("/api/users", userRouter);

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
    const { title, description, subject, category, questions, isPublic } =
      req.body;

    if (!title || !questions || questions.length === 0) {
      return res
        .status(400)
        .json({ message: "Title and questions are required" });
    }

    const newQuiz = new Quiz({
      title,
      subject,
      category,
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
  const { quizId, roomName, userId, firstname, answers } = req.body;

  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const room = await QuizRoom.findOne({ roomName });

    // console.log("from submit quiz", roomName, room);

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

    await UserPoints.findOneAndUpdate(
      { userId }, // match user
      {
        roomId: room._id,
        firstname, // send from client
        lastScore: score, // this quiz
        $inc: { totalScore: score }, // add to running total
      },
      { upsert: true, new: true } // create if not exists
    );

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
const socketUserMap = new Map();
const userSocketMap = new Map();

function findSocketIdByUser(userId) {
  return userSocketMap.get(userId);
}

const roomTimers = new Map();

io.on("connection", (socket) => {
  console.log("New client connected for quiz lobby:", socket.id);

  function armRoomTimer(room, io) {
    // clear any existing timer first (handles restarts / host restart)
    if (roomTimers.has(room._id)) {
      clearTimeout(roomTimers.get(room._id));
    }

    // if timer not enabled just return
    if (!room.timerEnabled || !room.timerDuration) return;

    const ms = room.timerDuration * 1000;

    const tId = setTimeout(async () => {
      try {
        // mark room as finished
        await QuizRoom.updateOne({ _id: room._id }, { isStarted: false });

        io.to(room._id.toString()).emit("quizForceEnded");
        console.log(`[room ${room.roomName}] timer expired – quiz ended`);
      } catch (e) {
        console.error("auto-end error:", e);
      } finally {
        roomTimers.delete(room._id);
      }
    }, ms);

    roomTimers.set(room._id, tId);
  }

  socket.on("joinRoom", async ({ roomName, user }) => {
    console.log("User trying to join room: quiz", roomName, user);
    userSocketMap.set(user.id, socket.id);

    socket.on("disconnect", () => {
      userSocketMap.delete(user.id);
    });
    try {
      const room = await QuizRoom.findOne({ roomName });

      if (!room) {
        socket.emit("joinError", { message: "Room not found" });
        return;
      }

      socket.join(room._id.toString());

      socketUserMap.set(socket.id, {
        roomId: room._id.toString(),
        userId: user.id,
      });

      let alreadyExists = [];

      if (user) {
        alreadyExists = room.participants.some(
          (p) => p.userId.toString() === user.id.toString()
        );
      }

      if (!alreadyExists) {
        // room.participants.push({ userId: user.id, username: user.name });
        // await room.save();
        await QuizRoom.updateOne(
          { roomName },
          {
            $addToSet: {
              participants: { userId: user.id, username: user.name },
            },
          }
        );
      }

      const updatedRoom = await QuizRoom.findOne({ roomName })
        .populate("participants", "username userId completed")
        .populate("hostId", "firstname _id");

      io.to(room._id.toString()).emit("participantsUpdate", {
        participants: updatedRoom.participants.map((p) => ({
          _id: p.userId,
          name: p.username || p.username, // fallback if no firstname
          completed: p.completed,
        })),
        host: {
          _id: updatedRoom.hostId?._id,
          name: updatedRoom.hostId?.firstname || "Host",
        },
      });
    } catch (err) {
      console.error("joinRoom error:", err);
      socket.emit("joinError", { message: "Server error" });
    }
  });

  // Handle starting the quiz
  socket.on("startQuiz", async ({ roomName }) => {
    // console.log(`Starting quiz in room: ${roomName}`);

    // const room = await QuizRoom.findOne({ roomName: roomName });
    // if (!room) return;

    // room.isStarted = true;
    // await room.save();

    // let quizId = room.quizId;
    // io.to(room._id.toString()).emit("quizStarted", { quizId });
    // io.to(roomName).emit("quizStarted");
    const updatedRoom = await QuizRoom.findOne({ roomName })
      .populate("participants", "username userId")
      .populate("hostId", "firstname _id");

    const room = await QuizRoom.findOne({ roomName });
    if (!room) return;

    room.isStarted = true;
    await room.save();

    const quizId = room.quizId;
    const participants = room.participants;

    // ------------------------ timer

    // mark started + save timestamp
    room.isStarted = true;
    room.startedAt = new Date();
    await room.save();

    // emit start as before …
    // io.to(room._id.toString()).emit("quizStarted", { quizId: room.quizId });

    // arm the timer
    armRoomTimer(room, io);

    // Notify all non-host users to start quiz
    participants.forEach((p) => {
      if (p.userId.toString() !== updatedRoom.hostId?._id) {
        const targetSocketId = findSocketIdByUser(p.userId.toString()); // implement this
        if (targetSocketId) {
          io.to(targetSocketId).emit("quizStarted", {
            quizId,
            startedAt: room.startedAt,
            duration: room.timerDuration || 0,
          });
        }
      }
    });

    // Notify host with initial stats
    const hostSocketId = findSocketIdByUser(updatedRoom.hostId?._id); // implement this too
    if (hostSocketId) {
      io.to(hostSocketId).emit("quizStatsUpdate", {
        completedCount: 0,
        totalParticipants: participants.length - 1,
        scores: {},
      });
    }
  });

  // Host triggers this to force-finish the quiz for everyone
  socket.on("endQuiz", async ({ roomName }) => {
    if (!roomName) return;
    const room = await QuizRoom.findOne({ roomName });

    try {
      // mark the room as ended (optional, but handy)
      await QuizRoom.updateOne({ roomName }, { isStarted: false });

      // ----------- timer cleanup
      if (roomTimers.has(room._id)) {
        clearTimeout(roomTimers.get(room._id));
        roomTimers.delete(room._id);
      }

      // Tell every client in the room to jump to stats page
      io.to(room._id.toString()).emit("quizForceEnded");
      console.log(`[room ${roomName}] Quiz forcibly ended by host`);
    } catch (err) {
      console.error("Error in endQuiz:", err);
    }
  });

  // const quiz = await Quiz.findById(quizId);
  // if (!quiz) return;

  // 1️⃣ calculate score
  // let score = 0;
  // quiz.questions.forEach((q, idx) => {
  //   const ans = answers[idx];
  //   if (!ans) return;

  //   if (["true_false", "single_choice", "short_answer"].includes(q.type)) {
  //     if (
  //       ans.toString().trim().toLowerCase() ===
  //       q.correctAnswer.toString().trim().toLowerCase()
  //     )
  //       score++;
  //   } else if (q.type === "multiple_choice") {
  //     const ok =
  //       q.correctAnswer?.length === ans?.length &&
  //       q.correctAnswer.every((opt) => ans.includes(opt));
  //     if (ok) score++;
  //   }
  // });

  socket.on("quizFinished", async ({ roomName, quizId, userId, answers }) => {
    try {
      console.log(roomName, quizId, userId, answers, "from quiz finished 1");

      // 2️⃣ update DB → set completed + score
      const room = await QuizRoom.findOneAndUpdate(
        { roomName, "participants.userId": userId.toString() },
        {
          $set: {
            "participants.$.completed": true,
          },
        },
        { new: true }
      ).populate("hostId", "firstname");

      console.log(room, "from quiz finished after");

      // 1️⃣  gather active userIds in the room
      const participantIds = room.participants.map((p) => p.userId.toString());

      // 2️⃣  fetch their points docs only
      const topThree = await UserPoints.find({
        roomId: room._id,
        userId: { $in: participantIds },
      })
        .sort({ lastScore: -1, updatedAt: 1 }) // highest lastScore, earlier submit wins tie
        .limit(3)
        .select("userId firstName lastScore"); // just the fields we need

      console.log("Top three participants:", topThree);

      // // 4️⃣ stats for host
      // const completedCount = room.participants.filter(
      //   (p) => p.completed
      // ).length;
      // const totalParticipants = room.participants.length - 1; // excluding host
      const hostSocketId = findSocketIdByUser(room.hostId._id.toString());

      io.to(room._id.toString()).emit("quizStatsUpdate", {
        updatedParticipants: room.participants,
        topThree,
      });
      if (hostSocketId) {
      }

      // 5️⃣ notify this participant of their own score
      // socket.emit("yourScore", { score });
    } catch (err) {
      console.error("quizFinished error:", err);
    }
  });

  /*
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
*/

  // Handle disconnection
  // Handle disconnection
  socket.on("disconnect", async () => {
    console.log(roomUsers, "from disconnect quiz");

    const userData = socketUserMap.get(socket.id);

    if (!userData) return;

    const { roomId, userId } = userData;

    try {
      const room = await QuizRoom.findById(roomId);
      if (!room) return;

      // Remove user from participants list
      room.participants = room.participants.filter(
        (p) => p.userId.toString() !== userId.toString()
      );

      await room.save();

      // Fetch updated room
      const updatedRoom = await QuizRoom.findById(roomId)
        .populate("participants", "username userId")
        .populate("hostId", "firstname _id");

      io.to(roomId).emit("participantsUpdate", {
        participants: updatedRoom.participants.map((p) => ({
          _id: p.userId,
          name: p.username || p.username, // fallback if no firstname
        })),
        host: {
          _id: updatedRoom.hostId?._id,
          name: updatedRoom.hostId?.firstname || "Host",
        },
      });
    } catch (error) {
      console.error("Error handling disconnect:", error);
    } finally {
      socketUserMap.delete(socket.id); // Clean up
    }
  });
});

// ---------------------- Flashcards -------------------------
// Create flashcard
app.post("/api/create-flashcard", async (req, res) => {
  console.log("from flashcard", req.body);

  try {
    const flashcard = new Flashcard({
      ...req.body,
    });
    await flashcard.save();
    res.status(201).send(flashcard);
  } catch (error) {
    res.status(400).send(error);
  }
});

// Get user's flashcards
app.get("/api/flashcards", async (req, res) => {
  console.log("from flashcard", req.body, req.query.userId);

  try {
    const flashcards = await Flashcard.find({ userId: req.query.userId });
    res.send(flashcards);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get("/api/flashcards/public", async (req, res) => {
  try {
    const publicFlashcards = await Flashcard.find({ isPublic: true });
    console.log("from public flashcard", publicFlashcards);

    res.json(publicFlashcards);
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// Add to your flashcards routes
app.get("/api/flashcard/:id", async (req, res) => {
  try {
    const flashcard = await Flashcard.findOne({
      _id: req.params.id,
    });

    if (!flashcard) return res.status(404).send();
    res.send(flashcard);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.patch("/api/flashcard/:flashcardId", async (req, res) => {
  console.log("from flashcard patch", req.body, req.params.flashcardId);

  try {
    const flashcard = await Flashcard.findOneAndUpdate(
      {
        _id: req.params.flashcardId,
        // userId: req.user.id, // Only owner can update
      },
      { isPublic: req.body.isPublic },
      { new: true }
    );

    if (!flashcard) return res.status(404).send();
    res.send(flashcard);
  } catch (error) {
    res.status(400).send(error);
  }
});

// ------------------------- new polling -----------------------------

const voteSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["text", "chart", "opinion"],
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  options: [
    {
      type: String,
      required: true,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    userId: String,
    userName: String,
  },
  responses: [
    {
      userId: String,
      selectedOption: String, // or index, depending on your structure
      votedAt: Date,
    },
  ],
});

const Vote = mongoose.model("Vote", voteSchema);

const roomSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: true,
  },
  passcode: {
    type: String,
    required: true,
  },
  host: {
    userId: String,
    userName: String,
  },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vote" }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

let Room = mongoose.model("Room", roomSchema);

app.post("/api/vote/create", async (req, res) => {
  try {
    const { type, question, options, userId, userName } = req.body;

    if (!type || !question || !options || options.length < 2) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const newVote = new Vote({
      type,
      question,
      options,
      createdBy: {
        userId,
        userName,
      },
    });

    const savedVote = await newVote.save();

    res.status(200).json({ success: true, voteId: savedVote._id });
  } catch (err) {
    console.error("Vote creation failed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/vote/user/:userId
app.get("/api/vote/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const votes = await Vote.find({ "createdBy.userId": userId }).sort({
      createdAt: -1,
    });

    res.status(200).json(votes);
  } catch (err) {
    console.error("Failed to get votes:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/vote/delete/:voteId", async (req, res) => {
  try {
    const { voteId } = req.params;
    await Vote.findByIdAndDelete(voteId);
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Failed to delete vote" });
  }
});

app.post("/api/vote/room/create", async (req, res) => {
  try {
    const { roomName, passcode, userId, userName } = req.body;

    if (!roomName || !passcode) {
      return res
        .status(400)
        .json({ message: "Room name and passcode required" });
    }

    const newRoom = new Room({
      roomName,
      passcode,
      host: { userId, userName },
    });

    const savedRoom = await newRoom.save();

    res.status(200).json({ roomId: savedRoom._id });
  } catch (err) {
    console.error("Room creation error:", err);
    res.status(500).json({ message: "Failed to create room" });
  }
});

app.delete("/api/vote/room/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Vote.deleteOne({ _id: id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete vote" });
  }
});

app.get("/api/vote/room/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

app.post("/api/vote/room/verify", async (req, res) => {
  const { roomId, passcode } = req.body;
  console.log("from verify", roomId, passcode);

  try {
    const room = await Room.findOne({ roomName: roomId, passcode });
    if (!room) return res.status(404).json({ error: "Invalid room" });
    console.log("from verify room", room);

    res.json({ hostId: room?.host.userId });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

let roomVotes = {}; // { roomId: { questionId: { option: count } } }
// let roomUsers = {}; // { roomId: [{ socketId, name, userId }, ...] }

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", ({ roomId, userInfo }) => {
    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    console.log("Joining room:", roomId, userInfo);

    // Prevent duplicate joins from same socket
    const alreadyInRoom = roomUsers[roomId].some(
      (u) => u.socketId === socket.id
    );
    if (!alreadyInRoom) {
      roomUsers[roomId].push({
        socketId: socket.id,
        firstname: userInfo.firstname,
        userId: userInfo.id,
      });
    }

    socket.join(roomId);
    console.log("Users in room:", roomUsers[roomId]);

    // Emit updated user list to all in room
    io.to(roomId).emit("update-user-list", roomUsers[roomId]);
  });

  socket.on("go-live", ({ roomId, question }) => {
    if (!roomVotes[roomId]) roomVotes[roomId] = {};
    roomVotes[roomId][question._id] = {};

    // Initialize vote count for each option
    question.options.forEach((opt) => {
      roomVotes[roomId][question._id][opt] = 0;
    });

    io.to(roomId).emit("question-live", question);
  });

  socket.on("vote", ({ roomId, questionId, selectedOption }) => {
    if (
      roomVotes[roomId] &&
      roomVotes[roomId][questionId] &&
      roomVotes[roomId][questionId][selectedOption] !== undefined
    ) {
      roomVotes[roomId][questionId][selectedOption] += 1;

      io.to(roomId).emit("update-votes", roomVotes[roomId][questionId]);
    }
  });

  socket.on("end-room", ({ roomId }) => {
    io.to(roomId).emit("room-ended");
    delete roomVotes[roomId]; // cleanup
    socket.leave(roomId);
  });

  socket.on("leave-room", ({ roomId, userId }) => {
    if (!roomUsers[roomId]) return;

    const prevLength = roomUsers[roomId].length;
    roomUsers[roomId] = roomUsers[roomId].filter((u) => u.userId !== userId);

    if (roomUsers[roomId].length !== prevLength) {
      io.to(roomId).emit("update-user-list", roomUsers[roomId]);
    }

    if (roomUsers[roomId].length === 0) {
      delete roomUsers[roomId];
    }

    console.log(`User ${userId} left room ${roomId}`);
  });

  socket.on("disconnect", () => {
    console.log(roomUsers, "from disconnect polling");

    for (const roomId in roomUsers) {
      const prevLength = roomUsers[roomId].length;
      roomUsers[roomId] = roomUsers[roomId].filter(
        (u) => u.socketId !== socket.id
      );

      // If someone was removed, update the room
      if (roomUsers[roomId].length !== prevLength) {
        io.to(roomId).emit("update-user-list", roomUsers[roomId]);
      }

      // Clean up empty room
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
      }

      console.log(`User with socket ${socket.id} left room ${roomId}`);
    }
  });
});

const port = process.env.PORT;
server.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

export default app;
