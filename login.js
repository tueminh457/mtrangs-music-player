// ---------- log in page ----------
// "hint: enter anything" -> any password (even empty) works.
const enterBtn = document.getElementById('enter-btn');
const passwordInput = document.getElementById('password-input');

function enter() {
  window.location.href = 'music-player.html';
}

enterBtn.addEventListener('click', enter);
enterBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
});
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enter();
});