// The thin layer of paper over the scene: navigation tabs, pencil notes, tooltips.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.hud = $('hud');
    this.nav = $('nav');
    this.back = $('btn-back');
    this.hintBtn = $('btn-hint');
    this.hintLabel = $('hint-label');
    this.cardbar = $('cardbar');
    this.tip = $('tooltip');
    this.noteEl = $('note');
    this.fadeEl = $('fade');
    this.final = $('final');
    this.heldEl = $('held');
    this.finalTextEl = $('final-text');
    this.soundBtn = $('btn-sound');
    this.taskEl = $('task');
    this.noteTimer = null;
  }

  showHud(on) { this.hud.hidden = !on; }

  setStation(name, canGoBack) {
    for (const b of this.nav.querySelectorAll('button')) {
      const go = b.dataset.go;
      const here = go === name || (go === 'cabinets' && (/^(cab|dial)\d$/.test(name) || name === 'lock'));
      b.classList.toggle('here', here);
    }
    this.back.hidden = !canGoBack;
  }

  tooltip(text, x, y) {
    if (!text) {
      this.tip.hidden = true;
      return;
    }
    this.tip.hidden = false;
    this.tip.textContent = text;
    const w = this.tip.offsetWidth;
    const left = Math.min(x, window.innerWidth - w - 30);
    this.tip.style.left = left + 'px';
    this.tip.style.top = y + 'px';
  }

  note(text, { small = '', ms = 6500 } = {}) {
    clearTimeout(this.noteTimer);
    this.noteEl.hidden = false;
    this.noteEl.classList.add('hide');
    this.noteEl.innerHTML = '';
    const p = document.createElement('div');
    p.textContent = text;
    this.noteEl.appendChild(p);
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      this.noteEl.appendChild(s);
    }
    requestAnimationFrame(() => this.noteEl.classList.remove('hide'));
    this.noteTimer = setTimeout(() => {
      this.noteEl.classList.add('hide');
      setTimeout(() => (this.noteEl.hidden = true), 700);
    }, ms);
  }

  setHint(text, spent) {
    this.hintLabel.textContent = text;
    this.hintBtn.classList.toggle('spent', !!spent);
  }


  // Buttons under a lifted card. Each option is null (hidden) or its state.
  showCardbar(on, { flip = null, compare = null, nav = null, take = null, lay = null, stand = null, down = 'Terugleggen' } = {}) {
    this.cardbar.hidden = !on;
    if (!on) return;
    const b = (act) => this.cardbar.querySelector(`[data-act="${act}"]`);
    b('take').hidden = !take;
    b('lay').hidden = !lay;
    b('stand').hidden = !stand;
    b('down').querySelector('.lbl').textContent = down;
    b('flip').hidden = !flip;
    if (flip) b('flip').querySelector('.lbl').textContent = flip.flipped ? 'Voorkant' : 'Achterkant';
    b('compare').hidden = !compare;
    if (compare) {
      b('compare').querySelector('.ico').textContent = compare.compare ? '▭' : '⊞';
      b('compare').querySelector('.lbl').textContent = compare.compare ? 'Eén kaart' : 'Naast elkaar';
    }
    b('prev').hidden = b('next').hidden = !nav;
  }

  // The strip at the top: where you are in the night, the clock, what is done.
  task({ head, ticks, digits, clock }) {
    const el = this.taskEl;
    el.hidden = false;
    el.querySelector('.t-head').textContent = head;
    if (clock) this.setClock(clock);
    el.querySelector('.t-ticks').innerHTML = ticks
      .map((c) => `<span class="t-cab">${c.map((d) => `<i class="${d === true ? 'on' : d || ''}"></i>`).join('')}</span>`)
      .join('');
    el.querySelector('.t-letters').textContent = digits.length ? `cijfers: ${digits.join(' ')}` : '';
  }

  setClock(text) {
    this.taskEl.querySelector('.t-clock').textContent = text;
  }



  fadeColor(color) { this.fadeEl.style.background = color; }

  // a card carried in the hand, shown at the bottom left; clicking it puts it back
  held(text) {
    this.heldEl.hidden = !text;
    if (text) this.heldEl.querySelector('em').textContent = text;
  }

  onHeld(fn) { this.heldEl.addEventListener('click', fn); }

  // the last screen: the card, or only a line of text (the other ending)
  finalText(text) {
    this.final.hidden = false;
    this.finalTextEl.hidden = !text;
    if (text) this.finalTextEl.textContent = text;
    document.getElementById('final-card').hidden = !!text;
    document.getElementById('btn-save-card').hidden = !!text;
    document.getElementById('btn-copy').hidden = !!text;
    document.getElementById('btn-turn').hidden = !!text;
  }

  fade(opacity, ms = 1400) {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.opacity = String(opacity);
    return new Promise((r) => setTimeout(r, ms));
  }
}
