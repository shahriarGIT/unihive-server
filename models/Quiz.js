import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["true_false", "single_choice", "multiple_choice", "short_answer"],
    required: true,
  },
  questionText: { type: String, required: true },
  options: {
    type: [String],
    default: [], // Ensures it's always an array
  },
  correctAnswer: mongoose.Schema.Types.Mixed, // String for short/true-false/single-choice, Array for multiple-choice
});

const QuizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String }, // Optional description
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    // required: true,
  },
  questions: [QuestionSchema],
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  timerEnabled: { type: Boolean, default: false },
  timerDuration: { type: Number }, // in seconds (optional)
});
const Quiz = mongoose.model("Quiz", QuizSchema);

export default Quiz;
