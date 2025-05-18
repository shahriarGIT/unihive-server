import mongoose from "mongoose";

// const QuizRoomSchema = new mongoose.Schema({
//   quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
//   roomName: { type: String, required: true },
//   roomPassword: { type: String, required: true },
//   hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
//   timerEnabled: { type: Boolean, default: false },
//   timerDuration: { type: Number }, // in seconds
//   isStarted: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now },
// });

const QuizRoomSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
  roomName: { type: String, required: true },
  roomPassword: { type: String, required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  participants: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      username: { type: String, required: true }, // Store the username here
      completed: { type: Boolean, default: false }, // Track if the user has completed the quiz
    },
  ],
  timerEnabled: { type: Boolean, default: false },
  timerDuration: { type: Number }, // in seconds
  isStarted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const QuizRoom = mongoose.model("QuizRoom", QuizRoomSchema);

export default QuizRoom;
