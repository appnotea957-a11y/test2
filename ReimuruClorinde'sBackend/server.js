require('dotenv').config();
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const PORT = process.env.PORT || 3000;
const SITE_DIR = path.resolve(__dirname, 'FullWebsiteCode');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SUBJECT_KEYWORDS = {
  biology: ['cell', 'mitochondria', 'photosynthesis', 'dna', 'enzyme'],
  calculus: ['derivative', 'integral', 'limit', 'calculus', 'function'],
  physics: ['force', 'energy', 'velocity', 'motion', 'quantum'],
  chemistry: ['molecule', 'reaction', 'atom', 'bond', 'acid'],
  history: ['war', 'revolution', 'empire', 'treaty', 'ancient'],
  literature: ['novel', 'poem', 'metaphor', 'author', 'literature'],
  'computer science': ['algorithm', 'data', 'network', 'code', 'program'],
  engineering: ['system', 'design', 'circuit', 'thermodynamics', 'mechanics'],
};

const TOPIC_KEYWORDS = [
  { topic: 'Theory 1', keywords: ['intro', 'basics', 'foundation', 'chapter 1', 'theory 1'] },
  { topic: 'Theory 2', keywords: ['intermediate', 'chapter 2', 'theory 2', 'practice'] },
  { topic: 'Theory 3', keywords: ['advanced', 'chapter 3', 'theory 3', 'exam'] },
];

const scoreMatch = (text, keywords) =>
  keywords.reduce((score, word) => (text.includes(word) ? score + 1 : score), 0);

const inferSubject = (text) => {
  let best = { subject: 'General', score: 0 };
  Object.entries(SUBJECT_KEYWORDS).forEach(([subject, words]) => {
    const score = scoreMatch(text, words);
    if (score > best.score) best = { subject, score };
  });
  return best.subject;
};

const inferTopic = (text) => {
  let best = { topic: 'Unsorted', score: 0 };
  TOPIC_KEYWORDS.forEach(({ topic, keywords }) => {
    const score = scoreMatch(text, keywords);
    if (score > best.score) best = { topic, score };
  });
  return best.topic;
};

const generateFlashcards = (subject, topic) => [
  {
    question: `Key concept in ${subject}?`,
    answer: `This flashcard was generated from your ${topic} material.`,
  },
  {
    question: `Define a core term from ${subject}.`,
    answer: `The API can replace this with real definitions.`,
  },
];

const generateQuizzes = (subject, topic) => [
  {
    question: `Which option best fits ${subject} fundamentals?`,
    options: [
      `Intro to ${subject}`,
      `Advanced ${subject}`,
      `${topic} review`,
      'None of the above',
    ],
  },
  {
    question: `Which topic relates to ${topic}?`,
    options: ['Basics', topic, 'Unrelated', 'Mixed'],
  },
];

const extractTextHint = (file) => {
  const name = file.originalname.toLowerCase();
  let content = '';
  if (file.mimetype.startsWith('text/')) {
    content = file.buffer.toString('utf8').slice(0, 10000);
  }
  return `${name} ${content}`.toLowerCase();
};

const createFallbackAnalysis = (file) => {
  const textHint = extractTextHint(file);
  const subject = inferSubject(textHint);
  const topic = inferTopic(textHint);

  return {
    title: file.originalname,
    subject: subject.charAt(0).toUpperCase() + subject.slice(1),
    topic,
    flashcards: generateFlashcards(subject, topic),
    quizzes: generateQuizzes(subject, topic),
    source: 'fallback',
  };
};

const stripCodeFences = (value) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const normalizeAnalysis = (payload, file) => {
  const fallback = createFallbackAnalysis(file);
  const subject = typeof payload?.subject === 'string' && payload.subject.trim()
    ? payload.subject.trim()
    : fallback.subject;
  const topic = typeof payload?.topic === 'string' && payload.topic.trim()
    ? payload.topic.trim()
    : fallback.topic;
  const title = typeof payload?.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : file.originalname;
  const flashcards = Array.isArray(payload?.flashcards)
    ? payload.flashcards
        .filter((card) => card && typeof card.question === 'string' && typeof card.answer === 'string')
        .slice(0, 4)
    : fallback.flashcards;
  const quizzes = Array.isArray(payload?.quizzes)
    ? payload.quizzes
        .filter(
          (quiz) =>
            quiz &&
            typeof quiz.question === 'string' &&
            Array.isArray(quiz.options) &&
            quiz.options.length >= 2
        )
        .map((quiz) => ({
          question: quiz.question,
          options: quiz.options.slice(0, 4).map((option) => String(option)),
        }))
        .slice(0, 3)
    : fallback.quizzes;

  return {
    title,
    subject,
    topic,
    flashcards: flashcards.length ? flashcards : fallback.flashcards,
    quizzes: quizzes.length ? quizzes : fallback.quizzes,
    source: 'openai',
  };
};

const analyzeWithOpenAI = async (file) => {
  if (!openai) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const mimeType = file.mimetype || 'application/octet-stream';
  const fileData = `data:${mimeType};base64,${file.buffer.toString('base64')}`;
  const textHint = extractTextHint(file).slice(0, 4000);
  const prompt = [
    'You are organizing uploaded study materials for a revision website.',
    'Analyze the attached file and return only valid JSON.',
    'Use this exact shape:',
    '{"title":"string","subject":"string","topic":"string","flashcards":[{"question":"string","answer":"string"}],"quizzes":[{"question":"string","options":["string","string","string","string"]}]}',
    'Rules:',
    '- Pick a clear school/university subject name.',
    '- Pick a concise topic name.',
    '- Write 2 to 4 useful flashcards.',
    '- Write 2 to 3 multiple-choice quiz questions.',
    '- Each quiz should have exactly 4 options.',
    '- Do not include markdown fences or any commentary.',
    textHint ? `Helpful filename/text hint: ${textHint}` : `Filename: ${file.originalname}`,
  ].join('\n');

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          {
            type: 'input_file',
            filename: file.originalname,
            file_data: fileData,
          },
        ],
      },
    ],
    max_output_tokens: 900,
  });

  const raw = stripCodeFences((response.output_text || '').trim());
  if (!raw) {
    throw new Error('OpenAI returned an empty response.');
  }

  return normalizeAnalysis(JSON.parse(raw), file);
};

app.use(express.static(SITE_DIR));

app.get('/', (_req, res) => {
  res.sendFile(path.resolve(SITE_DIR, 'index.html'));
});

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    const result = await analyzeWithOpenAI(req.file);
    res.json(result);
  } catch (error) {
    console.warn('OpenAI analysis unavailable, using fallback:', error.message);
    res.json({
      ...createFallbackAnalysis(req.file),
      warning: openai
        ? 'OpenAI analysis failed, so fallback content was used.'
        : 'Set OPENAI_API_KEY to enable real OpenAI analysis.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`StudySnap API running on http://localhost:${PORT}`);
});
