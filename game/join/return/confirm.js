(() => {
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  const order = location.hash
    ? new URLSearchParams(location.hash.slice(1)).get('order')
    : history.state?.order;
  const validOrder = typeof order === 'string' && /^[0-9a-f]{64}$/.test(order);
  if (location.hash) {
    // Keeping this reference in the current history entry lets a reload resume the same ticket.
    try { history.replaceState(validOrder ? {order} : null, '', location.pathname); } catch {}
  }
  if (!validOrder) {
    status.textContent = 'Use your checkout email to restore your ticket on this device.';
    return;
  }

  const delays = [0, 1500, 3500, 7000];
  let checking = false;
  async function confirm() {
    if (checking) return;
    checking = true;
    retry.hidden = true;
    let message = 'Ticket confirmation is unavailable. Check again or restore your ticket with your checkout email. You don’t need to pay again.';
    for (const delay of delays) {
      status.textContent = delay ? 'Aerie is reconnecting. We’ll check your ticket again automatically.' : 'Checking your ticket with Aerie…';
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/aerie/checkout/confirm', {
          method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
          // WebKit needs an origin referrer policy to send Origin on this same-origin POST.
          cache: 'no-store', referrerPolicy: 'origin', signal: controller.signal,
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify({order})
        });
        if (response.ok) {
          const {state} = await response.json();
          if (state === 'success' || state === 'preview-ended') {
            location.replace('../?checkout=' + state);
            return;
          }
          if (state === 'pending') {
            message = 'Your ticket is pending. Check again in a moment or restore it with your checkout email.';
            break;
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
