import mongoose from "mongoose";

const flashcardSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  subject: String,
  category: String,
  isPublic: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  questions: [
    {
      question: { type: String, required: true },
      answer: { type: String, required: true },
    },
  ],
});

const Flashcard = mongoose.model("Flashcard", flashcardSchema);

export default Flashcard;
