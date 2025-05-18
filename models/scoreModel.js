import mongoose from "mongoose";

const UserPointsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "QuizRoom" },
    firstName: { type: String, required: true },

    lastScore: { type: Number, default: 0 }, // score from their most-recent quiz
    totalScore: { type: Number, default: 0 }, // running total across all quizzes
  },
  { timestamps: true } // keeps createdAt / updatedAt
);

const UserPoints = mongoose.model("UserPoints", UserPointsSchema);

export default UserPoints;
