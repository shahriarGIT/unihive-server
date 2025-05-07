const mongoose = require("mongoose");

const flashcardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  subject: String,
  topic: String,
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
