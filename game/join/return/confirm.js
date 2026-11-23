(() => {
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  const fragment = location.hash ? new URLSearchParams(location.hash.slice(1)) : null;
  const order = fragment ? fragment.get('order') : history.state?.order;
  const sessionId = fragment ? fragment.get('session') : history.state?.sessionId;
  let ticket;
  if (typeof order === 'string' && /^[0-9a-f]{64}$/.test(order) && !sessionId) ticket = {order};
  if (typeof sessionId === 'string' && /^cs_(?:test|live)_[A-Za-z0-9]{1,200}$/.test(sessionId) && !order) ticket = {sessionId};
  if (fragment) {
    // Keep the reference for reloads while removing it from the address bar.
    try { history.replaceState(ticket || null, '', location.pathname); } catch {}
  }
  if (!ticket) {
    status.textContent = 'Use your checkout email to restore your ticket on this device.';
    return;
  }

  const delays = sessionId ? [0, 1500, 3500, 7000, 12000, 20000] : [0, 1500, 3500, 7000];
  let checking = false;
  async function confirm() {
    if (checking) return;
    checking = true;
    retry.hidden = true;
    let message = 'Ticket confirmation is unavailable. Check again or restore your ticket with your checkout email. You don’t need to pay again.';
    let waitingForPayment = false;
    for (const delay of delays) {
      status.textContent = waitingForPayment ? 'Waiting for Stripe to confirm your ticket. This page will update automatically.' :
        delay ? 'Aerie is reconnecting. We’ll check your ticket again automatically.' : 'Checking your ticket with Aerie…';
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/aerie/checkout/confirm', {
          method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
          // WebKit needs an origin referrer policy to send Origin on this same-origin POST.
          cache: 'no-store', referrerPolicy: 'origin', signal: controller.signal,
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(ticket)
        });
        if (response.ok) {
          const {state} = await response.json();
          if (state === 'success' || state === 'preview-ended') {
            location.replace('../?checkout=' + state);
            return;
          }
          if (state === 'return-to-www' && sessionId && location.origin === 'https://playaerie.com') {
            // The checkout cookie belongs to the host on which this buyer started.
            location.replace('https://www.playaerie.com/join/return/#session=' + sessionId);
            return;
          }
          if (state === 'restore') {
            location.replace('../#restore-ticket');
            return;
          }
          if (state === 'pending') {
            message = 'Your ticket is still pending. Check again or restore it with your checkout email. You don’t need to pay again.';
            if (!sessionId) break;
            waitingForPayment = true;
          }
        } else if (response.status < 500 && ![408, 425, 429].includes(response.status)) {
          message = 'Aerie couldn’t confirm this ticket. Restore it with your checkout email or contact purchase help.';
          break;
        }
      } catch {
        // A dropped connection and an expired request both retry this same order.
      } finally {
        clearTimeout(timeout);
      }
    }
    status.textContent = message;
    checking = false;
    retry.hidden = false;
  }
  retry.addEventListener('click', confirm);
  confirm();
})();
