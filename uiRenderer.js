// uiRenderer.js
export function updateScoreDisplay(score) {
  const el = document.getElementById('score-display');
  if (!el) return;
  const n = Number(score) || 0;
  el.innerHTML = `<span class="score-num">${n}</span><span class="score-pts"> pts</span>`;
}

export function showWordScorePreview(score) {
  const el = document.getElementById('word-score-preview');
  if (el) {
    el.textContent = `+${score}`;
    el.classList.add('visible');
  }
}

export function hideWordScorePreview() {
  const el = document.getElementById('word-score-preview');
  if (el) {
    el.textContent = '';
    el.classList.remove('visible');
  }
}

export function addWordToList(word, score) {
  const list = document.getElementById('word-list');
  if (!list) {
    console.error('❌ addWordToList: #word-list not found in DOM');
    return null; // explicit null so callers can check `if (!result) ...`
  }

  // Create the list item
  const li = document.createElement('li');
  li.textContent = `${word.toUpperCase()} (+${score})`;

  // Create the remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '✖';
  removeBtn.classList.add('remove-word');
  removeBtn.setAttribute('aria-label', `Remove ${word.toUpperCase()}`);
  removeBtn.style.marginLeft = '10px';
  removeBtn.style.cursor = 'pointer';

  // Append and return
  li.appendChild(removeBtn);
  list.appendChild(li);
  return { li, removeBtn };
}

