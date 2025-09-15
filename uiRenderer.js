// uiRenderer.js
export function updateScoreDisplay(score) {
  const el = document.getElementById('score-display');
  if (el) el.textContent = `SCORE: ${Number(score) || 0}`;
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

