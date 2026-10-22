// Subtitles: the few lines the night says out loud, one at a time.
// (They used to be read aloud by the system voice; that sounded too mechanical.)
export class Voice {
  constructor(sound, el) {
    this.sound = sound;
    this.el = el;
    this.queue = [];
    this.busy = false;
  }

  say(text, { mark = '', hold = 2.2 } = {}) {
    this.queue.push({ text, mark, hold });
    if (!this.busy) this.next();
  }

  next() {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.el.classList.remove('fade');
    this.el.innerHTML = (item.mark ? `<span class="frag-mark">${item.mark}</span>` : '') + escapeHtml(item.text);
    // long enough to read at an unhurried pace
    setTimeout(() => {
      this.el.classList.add('fade');
      setTimeout(() => this.next(), 1300);
    }, 1200 + item.text.length * 60 + item.hold * 1000);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
