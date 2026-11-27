// Prints the 20 basic company-information answers (deterministic) from the web app's own question definitions, for scripts/local-e2e/stage-demo.py.
import { basicInfoQuestions, basicToLegacy } from "../../../frontend/src/data/basicInfoQuestions.ts";
const answers: Record<string, number[]> = {};
for (const q of basicInfoQuestions) answers[q.id] = [q.options[Math.min(2, q.options.length - 1)].optionIndex];
console.log(JSON.stringify({ profileAnswers: basicToLegacy(answers), basicInfoAnswers: basicInfoQuestions.map(q => ({ questionId: q.id, optionIndexes: answers[q.id] })) }));
