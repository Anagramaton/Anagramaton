// uiRenderer.js
export function updateScoreDisplay(score) {
  const display = document.getElementById('score-display');
  if (display) {
    display.textContent = `Score: ${score}`;
  }
}

export function addWordToList(word, score) {
  const list = document.getElementById('word-list');
  if (!list) return;

  const li = document.createElement('li');
  li.textContent = `${word.toUpperCase()} (+${score})`;

  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✖';
  removeBtn.classList.add('remove-word');
  removeBtn.style.marginLeft = '10px';
  removeBtn.style.cursor = 'pointer';

  li.appendChild(removeBtn);
  list.appendChild(li);

  return { li, removeBtn };
}
