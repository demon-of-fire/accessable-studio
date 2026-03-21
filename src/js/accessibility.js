/**
 * Accessibility Module - NVDA Screen Reader Support
 * Handles announcements, keyboard navigation, focus management
 */

const Accessibility = (() => {
  const announcer = document.getElementById('sr-announcer');
  const status = document.getElementById('sr-status');

  /** Announce a message to screen readers immediately (assertive) */
  function announce(message) {
    if (!announcer) return;
    announcer.textContent = '';
    // Force re-announcement by toggling content
    requestAnimationFrame(() => {
      announcer.textContent = message;
    });
  }

  /** Announce a polite status update */
  function announceStatus(message) {
    if (!status) return;
    status.textContent = '';
    requestAnimationFrame(() => {
      status.textContent = message;
    });
  }

  /** Set status bar text */
  function setStatus(message) {
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = message;
    announceStatus(message);
  }

  /** Format seconds to MM:SS */
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0 seconds';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs} second${secs !== 1 ? 's' : ''}`;
    return `${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
  }

  /** Format seconds to MM:SS display */
  function formatTimeDisplay(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /** Trap focus within a modal dialog */
  function trapFocus(element) {
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = element.querySelectorAll(focusableSelectors);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleTab(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    element.addEventListener('keydown', handleTab);
    if (firstFocusable) firstFocusable.focus();

    return () => element.removeEventListener('keydown', handleTab);
  }

  /** Show a modal dialog accessibly */
  function showModal(modalEl) {
    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
    const cleanup = trapFocus(modalEl);
    modalEl._focusCleanup = cleanup;
    modalEl._previousFocus = document.activeElement;
    announce('Dialog opened: ' + (modalEl.querySelector('h2')?.textContent || 'Dialog'));
  }

  /** Hide a modal dialog accessibly */
  function hideModal(modalEl) {
    modalEl.classList.add('hidden');
    modalEl.setAttribute('aria-hidden', 'true');
    if (modalEl._focusCleanup) modalEl._focusCleanup();
    if (modalEl._previousFocus) modalEl._previousFocus.focus();
    announce('Dialog closed');
  }

  /** Setup toolbar arrow key navigation (WAI-ARIA toolbar pattern) */
  function setupToolbarNavigation(toolbar) {
    const buttons = toolbar.querySelectorAll('button');
    let currentIndex = 0;

    toolbar.addEventListener('keydown', (e) => {
      let newIndex = currentIndex;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = (currentIndex + 1) % buttons.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = (currentIndex - 1 + buttons.length) % buttons.length;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = buttons.length - 1;
          break;
        default:
          return;
      }
      buttons[currentIndex].setAttribute('tabindex', '-1');
      buttons[newIndex].setAttribute('tabindex', '0');
      buttons[newIndex].focus();
      currentIndex = newIndex;
    });
  }

  /** Setup listbox arrow key navigation */
  function setupListboxNavigation(listbox, onSelect) {
    listbox.addEventListener('keydown', (e) => {
      const items = listbox.querySelectorAll('[role="option"]');
      if (items.length === 0) return;

      const currentItem = listbox.querySelector('[aria-selected="true"]') || items[0];
      let currentIdx = Array.from(items).indexOf(currentItem);
      let newIdx = currentIdx;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          newIdx = Math.min(currentIdx + 1, items.length - 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          newIdx = Math.max(currentIdx - 1, 0);
          break;
        case 'Home':
          e.preventDefault();
          newIdx = 0;
          break;
        case 'End':
          e.preventDefault();
          newIdx = items.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (onSelect) onSelect(items[currentIdx]);
          return;
        default:
          return;
      }

      items.forEach(item => {
        item.setAttribute('aria-selected', 'false');
        item.setAttribute('tabindex', '-1');
      });
      items[newIdx].setAttribute('aria-selected', 'true');
      items[newIdx].setAttribute('tabindex', '0');
      items[newIdx].focus();
      announce(items[newIdx].textContent);
    });
  }

  /** Initialize escape key handler for modals */
  function initModalEscapeHandler() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal:not(.hidden)');
        openModals.forEach(modal => hideModal(modal));
      }
    });
  }

  // Initialize
  initModalEscapeHandler();

  return {
    announce,
    announceStatus,
    setStatus,
    formatTime,
    formatTimeDisplay,
    trapFocus,
    showModal,
    hideModal,
    setupToolbarNavigation,
    setupListboxNavigation,
  };
})();
