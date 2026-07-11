export function toast(message, duration = 2200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

export function openModal(overlayEl) {
  overlayEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

export function closeModal(overlayEl) {
  overlayEl.classList.remove('active');
  document.body.style.overflow = '';
}

export function confirmAction(message) {
  return window.confirm(message);
}

/**
 * A simple chip-based multi-value text input (for 동반자 목록 입력).
 * container: element that will hold the chip UI
 * initial: string[]
 * returns { getValues, el }
 */
export function createChipInput(container, initial = [], placeholder = '이름 입력 후 Enter') {
  const values = [...initial];
  const wrap = document.createElement('div');
  wrap.className = 'chip-input-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;

  function render() {
    wrap.querySelectorAll('.chip').forEach((c) => c.remove());
    values.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const label = document.createElement('span');
      label.textContent = v;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.onclick = () => {
        values.splice(i, 1);
        render();
      };
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      wrap.insertBefore(chip, input);
    });
  }

  function tryAdd() {
    const v = input.value.trim();
    if (v && !values.includes(v)) {
      values.push(v);
      input.value = '';
      render();
    } else {
      input.value = '';
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      tryAdd();
    } else if (e.key === 'Backspace' && input.value === '' && values.length) {
      values.pop();
      render();
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) tryAdd();
  });

  wrap.appendChild(input);
  container.innerHTML = '';
  container.appendChild(wrap);
  render();

  return {
    getValues: () => [...values],
    focus: () => input.focus(),
  };
}
