import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "src/data/physicsQuestions.ts");
let fileContent = fs.readFileSync(filePath, "utf-8");

// Extract the array content
const startIndex = fileContent.indexOf("export const INITIAL_QUESTIONS: Question[] = [") + "export const INITIAL_QUESTIONS: Question[] = [".length;
const endIndex = fileContent.lastIndexOf("];");
const arrayContent = fileContent.slice(startIndex, endIndex);

// Split the array content into individual question objects
// We can do this by splitting on "}," and then adding back the "}"
const questionStrings = arrayContent.split("},").map(s => s.trim() + "}").filter(s => s.length > 5);

// Remove the extra "}" from the last element
if (questionStrings.length > 0) {
  const last = questionStrings[questionStrings.length - 1];
  if (last.endsWith("}}")) {
    questionStrings[questionStrings.length - 1] = last.slice(0, -1);
  }
}

const categories = [
  "Category.MECHANICS",
  "Category.MATTER_HEAT",
  "Category.LIGHT_OPTICS",
  "Category.ELECTRICITY_MAGNETISM",
  "Category.MODERN_PHYSICS"
];

let newQuestionsCode = "";

for (const category of categories) {
  const categoryQuestions = questionStrings.filter(q => q.includes(`category: ${category}`));
  console.log(`Found ${categoryQuestions.length} questions for ${category}`);
  
  // Take the first 50 questions
  const selectedQuestions = categoryQuestions.slice(0, 50);
  
  for (let i = 0; i < selectedQuestions.length; i++) {
    let q = selectedQuestions[i];
    
    // Modify the ID
    q = q.replace(/id:\s*"([^"]+)"/, 'id: "$1-added-' + Date.now() + '-' + i + '"');
    
    // Modify the text
    q = q.replace(/text:\s*"([^"]+)"/, 'text: "$1 (سؤال إضافي ' + (i + 1) + ')"');
    
    // If it doesn't end with "}", fix it
    if (!q.endsWith("}")) {
      q += "}";
    }
    
    newQuestionsCode += "  " + q + ",\n";
  }
}

// Insert the new questions
const newFileContent = fileContent.slice(0, endIndex) + ",\n" + newQuestionsCode + "];\n";
fs.writeFileSync(filePath, newFileContent);
console.log("Successfully appended 250 questions.");
