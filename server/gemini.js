/**
 * Uses Google's Gemini API to generate a full "Crack the Code" challenge set:
 *  - Round 1: 10 AI/ML MCQ questions
 *  - Round 2: 5 Python code-completion / debugging challenges
 *  - Round 4: A 2-stage encoding/decoding "Final Vault" puzzle
 *
 * Round 3 (Rival Zone) is intentionally NOT auto-generated — it's a live,
 * facilitator-run interaction round (Shield/Scanner/Boost/Trap), scored
 * manually by the admin in real time. We do generate a small bank of
 * optional "power challenge" prompts admins can use to award power-ups.
 */

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are generating content for a live, offline high-school tech-fest event called
"Crack the Code". Output STRICT JSON ONLY — no markdown fences, no commentary, no leading/trailing text.

Generate ONE complete challenge set matching exactly this JSON shape:

{
  "round1": [
    {
      "id": "r1q1",
      "question": "string - scenario based AIML question, medium difficulty for high schoolers",
      "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
      "correct": "A" | "B" | "C" | "D",
      "points": 10
    }
    // exactly 10 items total, topics spread across: AI vs ML, supervised vs unsupervised learning,
    // classification, regression, training/testing data, overfitting, computer vision, NLP,
    // generative AI, basic neural network concepts. No advanced math.
  ],
  "round2": [
    {
      "id": "r2q1",
      "title": "short title",
      "prompt": "string instructions for the challenge",
      "codeTemplate": "python code as a single string with literal blanks written as ____",
      "acceptedAnswers": ["array of acceptable exact-fill or full-code strings, normalized lowercase, no extra spaces required by checker"],
      "expectedOutput": "string - what correct code should print (or null)",
      "points": 20
    }
    // exactly 5 items: (1) fill-in-the-blank simple condition, (2) fill-in-the-blank comparison,
    // (3) fill-in-the-blank loop range, (4) debug-the-code (give buggy code in codeTemplate,
    // acceptedAnswers should contain the corrected single line), (5) medium write-a-solution challenge
    // (acceptedAnswers should contain a couple of valid full solutions as strings).
  ],
  "round4": {
    "stage1": {
      "instructions": "string explaining A1Z26 (A=1..Z=26) decoding",
      "cipherText": "string of dash separated numbers, e.g. 8-5-12-16",
      "answer": "string - the decoded word, uppercase"
    },
    "stage2": {
      "instructions": "string explaining Caesar cipher shifted forward by 3, decode by shifting back 3",
      "cipherText": "string of shifted uppercase letters and one number at the end, e.g. WKH GRRU LV 3",
      "answer": "string - decoded phrase, uppercase, e.g. THE DOOR IS 3"
    },
    "finalCode": "string - a 4 digit numeric code teams must ultimately submit, e.g. 7314",
    "finalInstructions": "string - short flavour text tying stage1 word + stage2 phrase to the final code"
  },
  "round3PowerChallenges": [
    { "id": "p1", "prompt": "short 30-second trivia/skill micro-challenge a facilitator can pose to award a power-up card", "answer": "string" }
    // exactly 6 short items, mixed AI/coding/general logic trivia, usable as quick tie-breakers or bonus tasks
  ]
}

Make each of the 5 sets you are asked for DISTINCT (different questions, different cipher words/numbers,
different code challenges) so teams competing in different runs never see repeats. Keep difficulty medium
and appropriate for high-school students. Respond with JSON only.`;

async function callGemini(apiKey, userPrompt) {
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Generates `count` distinct challenge sets by calling Gemini once per set
 * (keeps prompts simple & reduces truncation risk vs. asking for all 5 at once).
 */
async function generateChallengeSets(apiKey, count = 5) {
  const sets = [];
  for (let i = 0; i < count; i++) {
    const variantPrompt = `Generate challenge SET #${i + 1} of ${count} for the Crack the Code event. ` +
      `Make sure it is meaningfully different from any other set (different scenarios, numbers, words, code). ` +
      `Respond with the JSON object only.`;
    const parsed = await callGemini(apiKey, variantPrompt);
    sets.push({
      id: `set-${i + 1}`,
      label: `Set ${i + 1}`,
      source: 'gemini',
      ...parsed
    });
  }
  return sets;
}

/**
 * Local fallback generator — used if no Gemini API key is configured, or if
 * the API call fails. Lets the whole platform be demoed / tested offline.
 * Produces static but fully valid, distinct-enough sets based on the
 * example content from the event design doc.
 */
function fallbackSets(count = 5) {
  const words = ['HELP', 'CODE', 'GAME', 'PLAY', 'WINS'];
  const finalCodes = ['7314', '4827', '9051', '3396', '6182'];
  const sets = [];
  for (let i = 0; i < count; i++) {
    const w = words[i % words.length];
    const fc = finalCodes[i % finalCodes.length];
    sets.push({
      id: `set-${i + 1}`,
      label: `Set ${i + 1} (offline fallback)`,
      source: 'fallback',
      round1: [
        { id: 'r1q1', question: 'A model learns from pictures labeled Cat/Dog and later predicts new images. What type of learning is this?', options: { A: 'Unsupervised learning', B: 'Supervised learning', C: 'Reinforcement learning', D: 'Random learning' }, correct: 'B', points: 10 },
        { id: 'r1q2', question: 'A fruit-recognition model trained only on apples & oranges is given a banana. What is the biggest problem?', options: { A: 'The model has never seen a banana during training', B: 'The model has too much data', C: 'The model is automatically correct', D: 'The model cannot use images' }, correct: 'A', points: 10 },
        { id: 'r1q3', question: 'Which of these is an example of computer vision?', options: { A: 'Predicting tomorrow\'s temperature', B: 'Recognizing a face in a photograph', C: 'Translating English to Tamil', D: 'Predicting house prices' }, correct: 'B', points: 10 },
        { id: 'r1q4', question: 'A model performs extremely well on training data but poorly on new data. What is this called?', options: { A: 'Underfitting', B: 'Overfitting', C: 'Classification', D: 'Clustering' }, correct: 'B', points: 10 },
        { id: 'r1q5', question: 'Which of these is most likely a classification problem?', options: { A: 'Predicting someone\'s salary', B: 'Predicting tomorrow\'s temperature', C: 'Predicting whether an email is spam or not', D: 'Predicting the price of a house' }, correct: 'C', points: 10 },
        { id: 'r1q6', question: 'A dataset is split 80% training / 20% testing. Why is testing data used?', options: { A: 'To train the model faster', B: 'To check performance on unseen data', C: 'To delete incorrect data', D: 'To increase dataset size' }, correct: 'B', points: 10 },
        { id: 'r1q7', question: 'Which technology is primarily associated with understanding human language?', options: { A: 'NLP', B: 'GPS', C: 'HTML', D: 'CPU' }, correct: 'A', points: 10 },
        { id: 'r1q8', question: 'A real spam email is predicted as "not spam". What is this called?', options: { A: 'False Positive', B: 'False Negative', C: 'True Positive', D: 'True Negative' }, correct: 'B', points: 10 },
        { id: 'r1q9', question: 'Which of these is an example of unsupervised learning?', options: { A: 'Predicting whether an image contains a cat', B: 'Predicting exam marks', C: 'Grouping customers by similar behavior with no predefined labels', D: 'Detecting whether an email is spam' }, correct: 'C', points: 10 },
        { id: 'r1q10', question: 'A model follows Input -> Prediction -> Error -> Adjustment. What is the basic idea?', options: { A: 'The model learns from its mistakes', B: 'The model deletes its training data', C: 'The model stops learning after one prediction', D: 'The model randomly changes the answer' }, correct: 'A', points: 10 }
      ],
      round2: [
        { id: 'r2q1', title: 'Even or Odd', prompt: 'Complete the code to check if a number is even or odd.', codeTemplate: 'n = int(input())\n\nif ____:\n    print("Even")\nelse:\n    print("Odd")', acceptedAnswers: ['n % 2 == 0', 'n%2==0'], expectedOutput: null, points: 20 },
        { id: 'r2q2', title: 'Find the Largest', prompt: 'Complete the code to print the larger of two numbers.', codeTemplate: 'a = int(input())\nb = int(input())\n\nif a > b:\n    print(____)\nelse:\n    print(____)', acceptedAnswers: ['a,b', 'a, b'], expectedOutput: null, points: 20 },
        { id: 'r2q3', title: 'Loop It', prompt: 'Complete the code to print numbers from 1 to 5.', codeTemplate: 'for i in range(____):\n    print(i)', acceptedAnswers: ['1, 6', '1,6'], expectedOutput: '1 2 3 4 5', points: 20 },
        { id: 'r2q4', title: 'Debug the Sum', prompt: 'This should print the sum of the list but doesn\'t. Give the corrected line.', codeTemplate: 'numbers = [10, 20, 30, 40]\ntotal = 0\nfor i in numbers:\n    total = total + 1\nprint(total)', acceptedAnswers: ['total = total + i', 'total=total+i', 'total += i'], expectedOutput: '100', points: 20 },
        { id: 'r2q5', title: 'Count Greater Than 10', prompt: 'Write code that counts how many numbers in [5,12,8,20,15,3] are greater than 10. Expected output: 3', codeTemplate: 'numbers = [5, 12, 8, 20, 15, 3]\n\n# your code here', acceptedAnswers: ['count = 0\nfor n in numbers:\n    if n > 10:\n        count += 1\nprint(count)', '3'], expectedOutput: '3', points: 20 }
      ],
      round4: {
        stage1: { instructions: 'Decode using A=1, B=2, C=3 ... Z=26', cipherText: w.split('').map(c => c.charCodeAt(0) - 64).join('-'), answer: w },
        stage2: { instructions: 'Each letter has been shifted 3 places forward. Shift every letter back by 3 to decode.', cipherText: `WKH ILQDO FRGH LV ${fc[0]}`, answer: `THE FINAL CODE IS ${fc[0]}` },
        finalCode: fc,
        finalInstructions: `Combine the decoded word "${w}" with the revealed digit sequence to unlock the vault code.`
      },
      round3PowerChallenges: [
        { id: 'p1', prompt: 'Name the AI that famously beat a world Go champion.', answer: 'alphago' },
        { id: 'p2', prompt: 'What does "GPU" stand for?', answer: 'graphics processing unit' },
        { id: 'p3', prompt: 'In Python, what symbol starts a comment?', answer: '#' },
        { id: 'p4', prompt: 'What does NLP stand for?', answer: 'natural language processing' },
        { id: 'p5', prompt: 'True or False: overfitting means a model performs poorly on training data.', answer: 'false' },
        { id: 'p6', prompt: 'What is the output of print(2**3) in Python?', answer: '8' }
      ]
    });
  }
  return sets;
}

module.exports = { generateChallengeSets, fallbackSets };
