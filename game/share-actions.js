(() => {
  'use strict';

  const gameUrl = 'https://playaerie.com';
  const message = 'Hey, I really like this game. I hope you do too.';
  const invitation = message + '\n' + gameUrl;
  const icons = new URL('social-icons.svg', document.currentScript.src).href;
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function compose(base, params) {
    return base + '?' + new URLSearchParams(params);
  }

  // Messages uses a different body separator on Apple devices, including iPadOS in desktop mode.
  const apple = /iPhone|iPad|iPod|Mac/i.test(navigator.platform + ' ' + navigator.userAgent);
  const channels = {
    messages: { label: 'Messages', href: 'sms:' + (apple ? '&' : '?') + 'body=' + encodeURIComponent(invitation) },
    whatsapp: { label: 'WhatsApp', href: compose('https://wa.me/', { text: invitation }) },
    x: { label: 'X', href: compose('https://twitter.com/intent/tweet', { text: message, url: gameUrl }) },
    instagram: {
      label: 'Instagram', title: 'Share in Instagram messages', href: 'https://www.instagram.com/direct/inbox/',
      copyText: invitation, hint: 'Invitation copied. Paste it into an Instagram message.'
    },
    facebook: {
      label: 'Facebook', href: compose('https://www.facebook.com/sharer/sharer.php', { u: gameUrl }),
      copyText: message, hint: 'Facebook adds the link. Paste the copied message if you like.'
    },
    linkedin: {
      label: 'LinkedIn', href: compose('https://www.linkedin.com/sharing/share-offsite/', { url: gameUrl }),
      copyText: message, hint: 'LinkedIn adds the link. Paste the copied message if you like.'
    },
    bluesky: { label: 'Bluesky', href: compose('https://bsky.app/intent/compose', { text: invitation }) },
    telegram: { label: 'Telegram', href: compose('https://t.me/share/url', { url: gameUrl, text: message }) },
    copy: { label: 'Copy invite', title: 'Copy the invitation and game link', copyText: invitation, hint: 'Invitation copied.' },
    more: { label: 'More', title: 'Share using another app' }
  };

  // A handoff only reveals the confirmation button. The server grants worlds after the player confirms.
  const choiceKey = 'aerie.shareChosen';
  let choseThisPage = false;

  function hasChosen() {
    try { return choseThisPage || sessionStorage.getItem(choiceKey) === '1'; }
    catch { return choseThisPage; }
  }

  function clearChoice() {
    choseThisPage = false;
    try { sessionStorage.removeItem(choiceKey); } catch {}
  }

  function mount(container, { channels: names = Object.keys(channels), status, onChoose, compact = false }) {
    const actions = document.createDocumentFragment();
    let lastAction = 0;

    async function copy(text, hint, action) {
      try {
        await navigator.clipboard.writeText(text);
        if (action === lastAction) status.textContent = hint;
      } catch {
        if (action !== lastAction) return;
        const field = document.createElement('textarea');
        field.readOnly = true;
        field.value = text;
        field.rows = 2;
        field.setAttribute('aria-label', 'Invitation to copy');
        field.addEventListener('click', () => field.select());
        status.replaceChildren('Select and copy the invitation.', field);
      }
    }

    for (const key of names) {
      const channel = channels[key];
      if (!channel || (key === 'more' && typeof navigator.share !== 'function')) continue;
      const control = document.createElement(channel.href ? 'a' : 'button');
      control.className = compact ? 'ticket-icon' : 'aerie-share-action';
      control.dataset.shareChannel = key;
      control.title = channel.title || 'Share on ' + channel.label;
      control.setAttribute('aria-label', control.title);
      if (channel.href) {
        control.href = channel.href;
        if (key !== 'messages') {
          control.target = '_blank';
          control.rel = 'noopener noreferrer';
        }
      } else {
        control.type = 'button';
      }
      const icon = document.createElementNS(svgNamespace, 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('focusable', 'false');
      const use = document.createElementNS(svgNamespace, 'use');
      use.setAttribute('href', icons + '#' + key);
      icon.append(use);
      control.append(icon);
      if (!compact) {
        const label = document.createElement('span');
        label.textContent = channel.label;
        control.append(label);
      }
      control.addEventListener('click', async () => {
        const action = ++lastAction;
        status.replaceChildren();
        if (key === 'more') {
          try {
            await navigator.share({ text: message, url: gameUrl });
          } catch (error) {
            if (error.name !== 'AbortError') status.textContent = 'Choose another app or copy the invitation.';
            return;
          }
        }
        choseThisPage = true;
        try { sessionStorage.setItem(choiceKey, '1'); } catch {}
        onChoose?.(key);
        if (channel.copyText) await copy(channel.copyText, channel.hint, action);
      });
      actions.append(control);
    }
    container.replaceChildren(actions);
  }

  window.AerieShare = { mount, invitation, hasChosen, clearChoice };
})();
