function normalize(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Round 1 — AI/ML MCQ quiz. answers: { [questionId]: "A"|"B"|"C"|"D" } */
function scoreRound1(challenge, answers) {
  let score = 0;
  let correctCount = 0;
  const breakdown = challenge.round1.map(q => {
    const given = answers?.[q.id];
    const isCorrect = given && given.toUpperCase() === q.correct.toUpperCase();
    if (isCorrect) {
      score += q.points || 10;
      correctCount++;
    }
    return { id: q.id, given: given || null, correct: q.correct, isCorrect };
  });
  return { score, maxScore: challenge.round1.reduce((s, q) => s + (q.points || 10), 0), correctCount, breakdown };
}

function scoreRound2(challenge, answers) {
  let score = 0;
  const breakdown = challenge.round2.map(q => {
    const rawGiven = answers?.[q.id];
    const given = normalize(rawGiven);
    const accepted = (q.acceptedAnswers || []).map(normalize);
    // If no answer given, answer is incorrect. Otherwise accept exact match or full-code containing answer.
    const isCorrect = !!given && accepted.some(a => a.length > 0 && (given === a || (given.length >= a.length && given.includes(a))));
    if (isCorrect) score += q.points || 20;
    return { id: q.id, given: rawGiven || null, isCorrect };
  });
  return { score, maxScore: challenge.round2.reduce((s, q) => s + (q.points || 20), 0), breakdown };
}

/** Round 4 — Final Vault. answers: { finalCode: "1234" } (stage answers optional/for partial credit) */
function scoreRound4(challenge, answers) {
  const r4 = challenge.round4;
  let score = 0;
  const stage1Correct = normalize(answers?.stage1) === normalize(r4.stage1.answer);
  const stage2Correct = normalize(answers?.stage2) === normalize(r4.stage2.answer);
  const finalCorrect = normalize(answers?.finalCode) === normalize(r4.finalCode);

  if (stage1Correct) score += 20;
  if (stage2Correct) score += 20;
  if (finalCorrect) score += 60; // majority of points for cracking the vault

  return {
    score,
    maxScore: 100,
    breakdown: { stage1Correct, stage2Correct, finalCorrect }
  };
}

/** Generic entry point used by the submit route. */
function scoreSubmission(round, challengeSet, answers) {
  if (round === 1) return scoreRound1(challengeSet, answers);
  if (round === 2) return scoreRound2(challengeSet, answers);
  if (round === 4) return scoreRound4(challengeSet, answers);
  throw new Error(`Round ${round} is not auto-scored (Round 3 is manually scored by admin).`);
}

module.exports = { scoreSubmission, normalize };
