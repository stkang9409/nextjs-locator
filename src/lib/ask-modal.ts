export interface AskModalElements {
  overlay: HTMLDivElement;
}

/** Create the Ask Claude modal overlay, appended to document.body */
export function createAskModal(): AskModalElements {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 200000;
    background: rgba(0,0,0,0.6); display: none;
    align-items: center; justify-content: center;
  `;
  document.body.appendChild(overlay);
  return { overlay };
}

/** Show the modal with a textarea for user instructions */
export function showAskModal(
  elements: AskModalElements,
  componentName: string,
  onSubmit: (instruction: string) => void,
): void {
  const { overlay } = elements;
  overlay.innerHTML = '';

  const card = document.createElement('div');
  card.style.cssText = `
    background: #1e293b; color: #f8fafc;
    border-radius: 10px; padding: 20px 24px;
    width: 560px; max-width: calc(100vw - 32px);
    font-family: ui-monospace, monospace; font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.12);
    display: flex; flex-direction: column; gap: 12px;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'font-size: 14px; font-weight: 600; color: #a78bfa;';
  header.textContent = `Claude에게 묻기 — <${componentName}>`;
  card.appendChild(header);

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.placeholder = '이 컴포넌트를 어떻게 수정할까요?';
  textarea.rows = 4;
  textarea.style.cssText = `
    width: 100%; box-sizing: border-box;
    background: #0f172a; color: #f8fafc;
    border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
    padding: 10px 12px; font-family: inherit; font-size: 13px;
    resize: vertical; outline: none;
    transition: border-color 0.15s;
  `;
  textarea.addEventListener('focus', () => {
    textarea.style.borderColor = 'rgba(139,92,246,0.6)';
  });
  textarea.addEventListener('blur', () => {
    textarea.style.borderColor = 'rgba(255,255,255,0.15)';
  });
  card.appendChild(textarea);

  // Hint
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size: 11px; color: #64748b;';
  hint.textContent = 'Ctrl+Enter로 전송 · Escape로 닫기';
  card.appendChild(hint);

  // Loading message (hidden initially)
  const loadingMsg = document.createElement('div');
  loadingMsg.style.cssText = 'font-size: 12px; color: #a78bfa; display: none;';
  loadingMsg.textContent = '컨텍스트 수집 중...';
  card.appendChild(loadingMsg);

  // Buttons row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '취소';
  cancelBtn.style.cssText = `
    padding: 6px 16px; border-radius: 6px; font-size: 13px;
    cursor: pointer; border: 1px solid rgba(255,255,255,0.2);
    background: transparent; color: #94a3b8; font-family: inherit;
  `;
  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.background = 'rgba(255,255,255,0.05)';
  });
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.background = 'transparent';
  });

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Claude에게 보내기';
  submitBtn.style.cssText = `
    padding: 6px 16px; border-radius: 6px; font-size: 13px;
    cursor: pointer; border: 1px solid rgba(139,92,246,0.6);
    background: rgba(139,92,246,0.2); color: #a78bfa; font-family: inherit;
    font-weight: 600;
  `;
  submitBtn.addEventListener('mouseenter', () => {
    if (!submitBtn.disabled) submitBtn.style.background = 'rgba(139,92,246,0.35)';
  });
  submitBtn.addEventListener('mouseleave', () => {
    if (!submitBtn.disabled) submitBtn.style.background = 'rgba(139,92,246,0.2)';
  });

  const handleSubmit = () => {
    const instruction = textarea.value.trim();
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    cancelBtn.style.opacity = '0.5';
    loadingMsg.style.display = 'block';
    onSubmit(instruction);
  };

  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideAskModal(elements);
  });

  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleSubmit();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideAskModal(elements);
    }
    // Prevent locator's capture-phase listeners from seeing these keystrokes
    e.stopPropagation();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(submitBtn);
  card.appendChild(btnRow);

  overlay.appendChild(card);
  overlay.style.display = 'flex';

  // Backdrop click dismisses modal
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideAskModal(elements);
  });

  // Store handler reference for cleanup
  (overlay as any)._escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      hideAskModal(elements);
    }
  };
  document.addEventListener('keydown', (overlay as any)._escHandler, true);

  // Focus textarea
  requestAnimationFrame(() => textarea.focus());
}

/** Hide the modal */
export function hideAskModal(elements: AskModalElements): void {
  elements.overlay.style.display = 'none';
  elements.overlay.innerHTML = '';
  const handler = (elements.overlay as any)._escHandler;
  if (handler) {
    document.removeEventListener('keydown', handler, true);
    delete (elements.overlay as any)._escHandler;
  }
}

/** Remove modal from DOM */
export function removeAskModal(elements: AskModalElements): void {
  hideAskModal(elements);
  elements.overlay.remove();
}

/** Check if modal is currently visible */
export function isAskModalVisible(elements: AskModalElements): boolean {
  return elements.overlay.style.display !== 'none';
}
