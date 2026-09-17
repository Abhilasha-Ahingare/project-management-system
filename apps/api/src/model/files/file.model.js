import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    storageName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["Task", "Project", "Comment"],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

fileSchema.index({ targetType: 1, targetId: 1, isActive: 1 });

const File = mongoose.model("File", fileSchema);
export default File;
