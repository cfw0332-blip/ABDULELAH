import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "src/data/physicsQuestions.ts");
let fileContent = fs.readFileSync(filePath, "utf-8");

// Split by lines
const lines = fileContent.split("\n");
// Keep only the first 9633 lines
const originalLines = lines.slice(0, 9633);
// Add the closing bracket
originalLines.push("];");

fs.writeFileSync(filePath, originalLines.join("\n"));
console.log("Restored original file");
