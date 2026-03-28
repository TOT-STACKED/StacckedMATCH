// js/swipe.js
// Touch/mouse drag engine for swipeable cards

export class SwipeEngine {
  constructor({ arena, onSwipe, onEmpty }) {
    this.arena    = arena;
    this.onSwipe  = onSwipe;
    this.onEmpty  = onEmpty;
    this.cards    = [];
    this.isDragging = false;
    this.startX   = 0;
    this.startY   = 0;
    this.currentX = 0;
    this.currentCard = null;
    this.isAnimating = false;
    this.SWIPE_THRESHOLD = 90;
    this.ROTATION_FACTOR = 0.12;

    this._bindDoc();
  }

  // ─────────────────────────────────────────
  // CARD STACK RENDERING
  // ─────────────────────────────────────────

  render(vendors) {
    this.cards = [...vendors];
    this.arena.innerHTML = '';

    // Render bottom two cards as visual stack (top two visible)
    const visible = this.cards.slice(0, 2);
    visible.reverse().forEach((vendor, i) => {
      const isTop = i === visible.length - 1;
      const el = this._buildCard(vendor, isTop);
      this.arena.appendChild(el);
      if (isTop) this._attachDrag(el);
    });
  }

  _buildCard(vendor, isTop) {
    const el = document.createElement('div');
    el.className = 'tech-card ' + (isTop ? 'is-top' : 'is-back');
    el.dataset.vendorId = vendor.id;

    const fitsHTML = (vendor.venue_types || [])
      .map(f => `<span class="fit-tag">${f.replace('-', ' ')}</span>`).join('');

    const statsHTML = [
      vendor.stat_1_val ? `<div class="stat"><div class="stat-val">${vendor.stat_1_val}</div><div class="stat-lbl">${vendor.stat_1_lbl}</div></div>` : '',
      vendor.stat_2_val ? `<div class="stat"><div class="stat-val">${vendor.stat_2_val}</div><div class="stat-lbl">${vendor.stat_2_lbl}</div></div>` : '',
      vendor.stat_3_val ? `<div class="stat"><div class="stat-val">${vendor.stat_3_val}</div><div class="stat-lbl">${vendor.stat_3_lbl}</div></div>` : '',
    ].join('');

    el.innerHTML = `
      <div class="card-color-bar" style="background:${vendor.color || '#E64E1A'}"></div>
      <span class="swipe-label nope">NOPE</span>
      <span class="swipe-label yep">YEP</span>
      <div class="card-inner">
        <div class="card-cat">${vendor.category}</div>
        <div class="card-name">${vendor.name}</div>
        <div class="card-tagline">${vendor.tagline}</div>
        <div class="card-fits">
          <div class="fits-label">Best fit for</div>
          <div class="fits-tags">${fitsHTML}</div>
        </div>
        <div class="card-stats">${statsHTML}</div>
        ${vendor.hook ? `<div class="card-hook"><span>💬</span><span>${vendor.hook}</span></div>` : ''}
      </div>
    `;

    return el;
  }

  _promoteBackCard() {
    const back = this.arena.querySelector('.is-back');
    if (!back) return;
    back.classList.remove('is-back');
    back.classList.add('is-top');
    back.style.transform = '';
    this._attachDrag(back);
  }

  _appendNextCard(vendor) {
    if (!vendor) return;
    const el = this._buildCard(vendor, false);
    this.arena.insertBefore(el, this.arena.firstChild);
  }

  // ─────────────────────────────────────────
  // DRAG HANDLING
  // ─────────────────────────────────────────

  _attachDrag(el) {
    el.addEventListener('mousedown',  e => this._start(e, el), { passive: false });
    el.addEventListener('touchstart', e => this._start(e, el), { passive: true  });
  }

  _start(e, el) {
    if (this.isAnimating) return;
    this.isDragging  = true;
    this.currentCard = el;
    this.startX = e.touches ? e.touches[0].clientX : e.clientX;
    this.startY = e.touches ? e.touches[0].clientY : e.clientY;
    this.currentX = 0;
    el.style.transition = 'none';
  }

  _move(e) {
    if (!this.isDragging || !this.currentCard) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - this.startX;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - this.startY;

    // Prevent vertical scroll hijack unless clearly horizontal
    if (Math.abs(x) < Math.abs(y) * 0.8 && Math.abs(x) < 10) return;

    this.currentX = x;
    const rot = x * this.ROTATION_FACTOR;
    this.currentCard.style.transform = `translateX(${x}px) rotate(${rot}deg)`;

    // Overlay opacity
    const nope = this.currentCard.querySelector('.swipe-label.nope');
    const yep  = this.currentCard.querySelector('.swipe-label.yep');
    const prog = Math.min(Math.abs(x) / this.SWIPE_THRESHOLD, 1);
    if (x < 0) { nope.style.opacity = prog; yep.style.opacity = 0; }
    else        { yep.style.opacity  = prog; nope.style.opacity = 0; }

    // Back card scale hint
    const back = this.arena.querySelector('.is-back');
    if (back) {
      const scale = 0.93 + (prog * 0.07);
      const ty    = 14 - (prog * 14);
      back.style.transform = `scale(${scale}) translateY(${ty}px)`;
    }
  }

  _end() {
    if (!this.isDragging || !this.currentCard) return;
    this.isDragging = false;

    if (Math.abs(this.currentX) > this.SWIPE_THRESHOLD) {
      const dir = this.currentX > 0 ? 'right' : 'left';
      this._flyOut(dir);
    } else {
      this._snapBack();
    }
  }

  _bindDoc() {
    document.addEventListener('mousemove',  e => this._move(e));
    document.addEventListener('mouseup',    e => this._end(e));
    document.addEventListener('touchmove',  e => this._move(e), { passive: true });
    document.addEventListener('touchend',   e => this._end(e));
  }

  // ─────────────────────────────────────────
  // PROGRAMMATIC SWIPE (button click)
  // ─────────────────────────────────────────

  swipe(direction) {
    if (this.isAnimating) return;
    const top = this.arena.querySelector('.is-top');
    if (!top) return;
    this.currentCard = top;
    this._flyOut(direction);
  }

  // ─────────────────────────────────────────
  // ANIMATIONS
  // ─────────────────────────────────────────

  _flyOut(direction) {
    if (!this.currentCard || this.isAnimating) return;
    this.isAnimating = true;

    const el = this.currentCard;
    const vendorId = el.dataset.vendorId;
    const vendor = this.cards.find(v => v.id === vendorId);

    const xTarget = direction === 'right'
      ? window.innerWidth + 300
      : -(window.innerWidth + 300);
    const rot = direction === 'right' ? 28 : -28;

    // Show final overlay
    const label = el.querySelector('.swipe-label.' + (direction === 'right' ? 'yep' : 'nope'));
    if (label) label.style.opacity = '1';

    el.style.transition = 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    el.style.transform  = `translateX(${xTarget}px) rotate(${rot}deg)`;

    // Promote back card
    const back = this.arena.querySelector('.is-back');
    if (back) {
      back.style.transition = 'transform 0.3s ease';
      back.style.transform  = 'scale(1) translateY(0)';
    }

    el.addEventListener('transitionend', () => {
      el.remove();
      this.isAnimating = false;
      this.currentCard = null;

      // Remove this card from local list
      const idx = this.cards.findIndex(v => v.id === vendorId);
      if (idx > -1) this.cards.splice(idx, 0);

      this._promoteBackCard();

      // Callback
      if (vendor) this.onSwipe(vendor, direction);

      // Check empty
      if (this.arena.querySelectorAll('.tech-card').length === 0) {
        this.onEmpty();
      }
    }, { once: true });
  }

  _snapBack() {
    if (!this.currentCard) return;
    this.currentCard.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    this.currentCard.style.transform  = 'translateX(0) rotate(0deg)';

    const nope = this.currentCard.querySelector('.swipe-label.nope');
    const yep  = this.currentCard.querySelector('.swipe-label.yep');
    if (nope) nope.style.opacity = '0';
    if (yep)  yep.style.opacity  = '0';

    const back = this.arena.querySelector('.is-back');
    if (back) {
      back.style.transition = 'transform 0.3s ease';
      back.style.transform  = 'scale(0.93) translateY(14px)';
    }

    this.currentCard = null;
    this.currentX = 0;
  }

  // ─────────────────────────────────────────
  // UNDO
  // ─────────────────────────────────────────

  undoLast(vendor) {
    if (this.isAnimating) return;
    // Demote current top to back
    const top = this.arena.querySelector('.is-top');
    if (top) {
      top.classList.remove('is-top');
      top.classList.add('is-back');
      top.style.transition = 'transform 0.3s ease';
      top.style.transform = 'scale(0.93) translateY(14px)';
      top.style.pointerEvents = 'none';
    }
    // Insert undo card as new top
    this.cards.unshift(vendor);
    const el = this._buildCard(vendor, true);
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8)';
    this.arena.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s';
      el.style.transform = 'scale(1) translateX(0)';
      el.style.opacity = '1';
    });
    this._attachDrag(el);
  }
}
