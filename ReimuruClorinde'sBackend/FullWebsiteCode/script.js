const themeButtons = document.querySelectorAll('#theme-toggle, #theme-toggle-settings');
const themeToggle = document.getElementById('theme-toggle');
const themeToggleSettings = document.getElementById('theme-toggle-settings');
const fileInput = document.getElementById('fileInput');
const uploadAreaBtn = document.getElementById('uploadAreaBtn');
const uploadList = document.getElementById('uploadList');
const analysisStatus = document.getElementById('analysisStatus');
const subjectNav = document.getElementById('subjectNav');
const subjectNavEmpty = document.getElementById('subjectNavEmpty');
const subjectsContainer = document.getElementById('subjectsContainer');

const subjects = new Map();
const STORAGE_KEY = 'studysnap_subjects_v1';
const THEMES = ['light', 'dark', 'proactive'];
const THEME_LABELS = {
  light: 'Light mode',
  dark: 'Dark mode',
  proactive: 'Proactive mode',
};
const THEME_BUTTON_LABELS = {
  light: 'Theme: Light',
  dark: 'Theme: Dark',
  proactive: 'Theme: Proactive',
};

const applyTheme = (theme) => {
  const safeTheme = THEMES.includes(theme) ? theme : 'light';
  document.body.dataset.theme = safeTheme;

  const currentIndex = THEMES.indexOf(safeTheme);
  const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
  const nextLabel = THEME_LABELS[nextTheme];
  const currentLabel = THEME_BUTTON_LABELS[safeTheme];

  if (themeToggle) {
    themeToggle.textContent = currentLabel;
    themeToggle.title = `Next: ${nextLabel}`;
    themeToggle.setAttribute('aria-label', `Current theme ${THEME_LABELS[safeTheme]}. Next: ${nextLabel}`);
  }

  if (themeToggleSettings) {
    themeToggleSettings.textContent = currentLabel;
    themeToggleSettings.title = `Next: ${nextLabel}`;
    themeToggleSettings.setAttribute('aria-label', `Current theme ${THEME_LABELS[safeTheme]}. Next: ${nextLabel}`);
  }
};

themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const currentTheme = THEMES.includes(document.body.dataset.theme)
      ? document.body.dataset.theme
      : 'light';
    const nextTheme = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length];
    applyTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  hydrateSubjectsFromStorage();
});

const renderUploads = (files) => {
  if (!uploadList) return;
  uploadList.innerHTML = '';
  if (!files.length) {
    uploadList.innerHTML = '<li>No files selected yet.</li>';
    return;
  }

  Array.from(files).forEach((file) => {
    const item = document.createElement('li');
    item.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    uploadList.appendChild(item);
  });
};

const setAnalysisStatus = (message = '', tone = 'info') => {
  if (!analysisStatus) return;
  analysisStatus.className = `analysis-status visible ${tone}`;
  analysisStatus.innerHTML = message;
};

const clearAnalysisStatus = () => {
  if (!analysisStatus) return;
  analysisStatus.className = 'analysis-status';
  analysisStatus.innerHTML = '';
};

const createRecordId = () =>
  `record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const slugify = (value) =>
  (value || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const setSubjectNavState = () => {
  if (!subjectNavEmpty) return;
  subjectNavEmpty.style.display = subjects.size ? 'none' : 'block';
};

const serializeSubjects = () =>
  Array.from(subjects.values()).map(({ name, slug, documents, flashcards, quizzes }) => ({
    name,
    slug,
    documents,
    flashcards,
    quizzes,
  }));

const saveSubjectsToStorage = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeSubjects()));
  } catch (error) {
    console.warn('Unable to save subjects.', error);
  }
};

const loadSubjectsFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to load subjects.', error);
    return [];
  }
};

const createSubjectNav = (subject, slug) => {
  if (!subjectNav) return;
  const details = document.createElement('details');
  details.className = 'subject-nav-item';
  details.open = subjects.size === 0;

  const summary = document.createElement('summary');
  summary.textContent = subject;
  details.appendChild(summary);

  const list = document.createElement('ul');
  list.innerHTML = `
    <li><a href="subjects.html#subject-${slug}-documents">Documents</a></li>
    <li><a href="subjects.html#subject-${slug}-flashcards">Flashcards</a></li>
    <li><a href="subjects.html#subject-${slug}-quiz">Quiz</a></li>
  `;
  details.appendChild(list);
  subjectNav.appendChild(details);
  return details;
};

const createSubjectSection = (subject, slug) => {
  if (!subjectsContainer) return null;

  const section = document.createElement('section');
  section.className = 'section-block subject-section';
  section.id = `subject-${slug}`;
  section.innerHTML = `
    <div class="subject-header">
      <h2>${subject}</h2>
      <p class="subject-meta">Auto-generated from your uploads.</p>
    </div>
    <div id="subject-${slug}-documents" class="subject-subsection">
      <h3>Documents</h3>
      <div class="document-list" data-subject-documents="${slug}"></div>
    </div>
    <div id="subject-${slug}-flashcards" class="subject-subsection">
      <h3>Flashcards</h3>
      <div class="flashcard-container" data-subject-flashcards="${slug}"></div>
    </div>
    <div id="subject-${slug}-quiz" class="subject-subsection">
      <h3>Quiz</h3>
      <div class="quiz-list" data-subject-quiz="${slug}"></div>
    </div>
  `;

  subjectsContainer.appendChild(section);
  return section;
};

const ensureSubject = (subjectName, seed = {}) => {
  const safeName = subjectName || seed.name || 'General';
  const slug = slugify(seed.slug || safeName);
  if (subjects.has(slug)) return subjects.get(slug);

  const navEl = createSubjectNav(safeName, slug);
  const section = createSubjectSection(safeName, slug);

  const subjectData = {
    name: safeName,
    slug,
    documents: Array.isArray(seed.documents)
      ? seed.documents.map((doc) => ({ ...doc, id: doc.id || createRecordId() }))
      : [],
    flashcards: Array.isArray(seed.flashcards) ? seed.flashcards : [],
    quizzes: Array.isArray(seed.quizzes) ? seed.quizzes : [],
    navEl: navEl || null,
    section,
    documentsEl: section?.querySelector(`[data-subject-documents="${slug}"]`),
    flashcardsEl: section?.querySelector(`[data-subject-flashcards="${slug}"]`),
    quizzesEl: section?.querySelector(`[data-subject-quiz="${slug}"]`),
  };

  subjects.set(slug, subjectData);
  setSubjectNavState();

  if (seed.documents || seed.flashcards || seed.quizzes) {
    renderSubjectContent(subjectData);
  }

  return subjectData;
};

const removeSubjectIfEmpty = (subjectData) => {
  const hasDocuments = subjectData.documents.length > 0;
  const hasFlashcards = subjectData.flashcards.length > 0;
  const hasQuizzes = subjectData.quizzes.length > 0;
  if (hasDocuments || hasFlashcards || hasQuizzes) return;

  subjectData.section?.remove();
  subjectData.navEl?.remove();
  subjects.delete(subjectData.slug);
  setSubjectNavState();
};

const deleteDocumentRecord = (subjectSlug, documentId) => {
  const subjectData = subjects.get(subjectSlug);
  if (!subjectData) return;

  subjectData.documents = subjectData.documents.filter((doc) => doc.id !== documentId);
  subjectData.flashcards = subjectData.flashcards.filter((card) => card.sourceDocId !== documentId);
  subjectData.quizzes = subjectData.quizzes.filter((quiz) => quiz.sourceDocId !== documentId);

  renderSubjectContent(subjectData);
  removeSubjectIfEmpty(subjectData);
  saveSubjectsToStorage();
  setAnalysisStatus('The uploaded file record has been deleted.', 'success');
};

const createDocumentCard = ({ id, title, topic, uploadedAt }, subjectSlug) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="document-card-header">
      <h3>${title || 'Untitled document'}</h3>
      <button class="delete-btn" type="button">Delete</button>
    </div>
    <p>Topic: ${topic || 'Unsorted'}</p>
    <p>Uploaded: ${uploadedAt || 'Just now'}</p>
  `;

  const deleteBtn = card.querySelector('.delete-btn');
  deleteBtn?.addEventListener('click', () => deleteDocumentRecord(subjectSlug, id));
  return card;
};

const createFlashcard = ({ question, answer }) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'flashcard';
  wrapper.innerHTML = `
    <div class="flashcard-inner">
      <div class="front">${question}</div>
      <div class="back">${answer}</div>
    </div>
  `;
  wrapper.addEventListener('click', () => wrapper.classList.toggle('flipped'));
  return wrapper;
};

const createQuizCard = ({ question, options }) => {
  const card = document.createElement('div');
  card.className = 'card';
  const safeOptions = Array.isArray(options) ? options : [];
  const optionsMarkup = safeOptions
    .map(
      (option, index) =>
        `<button class="quiz-option" type="button">${String.fromCharCode(65 + index)}) ${option}</button>`
    )
    .join('');

  card.innerHTML = `
    <p>${question}</p>
    ${optionsMarkup}
  `;

  card.querySelectorAll('.quiz-option').forEach((option) => {
    option.addEventListener('click', () => {
      const siblings = card.querySelectorAll('.quiz-option');
      siblings.forEach((btn) => btn.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  return card;
};

const renderSubjectContent = (subjectData) => {
  if (subjectData.documentsEl) subjectData.documentsEl.innerHTML = '';
  if (subjectData.flashcardsEl) subjectData.flashcardsEl.innerHTML = '';
  if (subjectData.quizzesEl) subjectData.quizzesEl.innerHTML = '';

  subjectData.documents.forEach((doc) => {
    if (subjectData.documentsEl) {
      subjectData.documentsEl.appendChild(createDocumentCard(doc, subjectData.slug));
    }
  });

  subjectData.flashcards.forEach((card) => {
    if (subjectData.flashcardsEl) {
      subjectData.flashcardsEl.appendChild(createFlashcard(card));
    }
  });

  subjectData.quizzes.forEach((quiz) => {
    if (subjectData.quizzesEl) {
      subjectData.quizzesEl.appendChild(createQuizCard(quiz));
    }
  });
};

const hydrateSubjectsFromStorage = () => {
  const stored = loadSubjectsFromStorage();
  stored.forEach((subject) => ensureSubject(subject.name, subject));
  setSubjectNavState();
};

const analyzeFileWithApi = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Analysis failed (${response.status})`);
  }

  return response.json();
};

const analyzeAndSortFiles = async (files) => {
  const fileArray = Array.from(files);
  if (!fileArray.length) {
    clearAnalysisStatus();
    return;
  }

  setAnalysisStatus(`Analyzing ${fileArray.length} file${fileArray.length === 1 ? '' : 's'}...`, 'info');
  const detectedSubjects = [];

  for (const file of fileArray) {
    try {
      const result = await analyzeFileWithApi(file);
      const subjectData = ensureSubject(result.subject);
      const uploadedAt = new Date().toLocaleDateString();
      detectedSubjects.push(subjectData.name);

      const docData = {
        id: createRecordId(),
        title: result.title,
        topic: result.topic,
        uploadedAt,
      };

      subjectData.documents.push(docData);

      const flashcards = Array.isArray(result.flashcards) ? result.flashcards : [];
      const quizzes = Array.isArray(result.quizzes) ? result.quizzes : [];

      if (flashcards.length) {
        subjectData.flashcards.push(...flashcards.map((card) => ({ ...card, sourceDocId: docData.id })));
      }

      if (quizzes.length) {
        subjectData.quizzes.push(...quizzes.map((quiz) => ({ ...quiz, sourceDocId: docData.id })));
      }

      renderSubjectContent(subjectData);
      saveSubjectsToStorage();
    } catch (error) {
      const subjectData = ensureSubject('General');
      const uploadedAt = new Date().toLocaleDateString();
      detectedSubjects.push(subjectData.name);
      const docData = {
        id: createRecordId(),
        title: file.name,
        topic: 'Unsorted',
        uploadedAt,
      };

      subjectData.documents.push(docData);
      renderSubjectContent(subjectData);
      saveSubjectsToStorage();
    }
  }

  const uniqueSubjects = [...new Set(detectedSubjects)];
  const summary =
    uniqueSubjects.length === 1
      ? `Analysis complete. Added this file to <strong>${uniqueSubjects[0]}</strong> under <a href="subjects.html">Subjects</a>.`
      : `Analysis complete. Added files to <strong>${uniqueSubjects.join(', ')}</strong> under <a href="subjects.html">Subjects</a>.`;

  setAnalysisStatus(summary, 'success');
};

const openFileDialog = () => {
  if (fileInput) fileInput.click();
};

if (uploadAreaBtn) uploadAreaBtn.addEventListener('click', openFileDialog);

if (fileInput) {
  fileInput.addEventListener('change', (event) => {
    renderUploads(event.target.files);
    analyzeAndSortFiles(event.target.files);
  });
}

renderUploads(fileInput ? fileInput.files : []);
setSubjectNavState();
