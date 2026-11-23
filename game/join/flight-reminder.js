(() => {
  const returnUrl = 'https://playaerie.com/join/?return=1';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  let dialog;
  let opener;

  function calendarText(value) {
    return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');
  }

  function foldLine(line) {
    const encoder = new TextEncoder();
    let length = 0;
    let folded = '';
    for (const character of line) {
      const bytes = encoder.encode(character).length;
      if (length + bytes > 75) {
        folded += '\r\n ';
        length = 1;
      }
      folded += character;
      length += bytes;
    }
    return folded;
  }

  function calendarFile(day, time) {
    const now = new Date();
    const [hour, minute] = time.split(':').map(Number);
    let offset = (day - now.getDay() + 7) % 7;
    const localStart = () => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
    let start = localStart();
    // A skipped spring-forward hour must not move every later flight to a different hour.
    if (start <= now || start.getDay() !== day || start.getHours() !== hour || start.getMinutes() !== minute) {
      offset += 7;
      start = localStart();
    }
    const pad = value => String(value).padStart(2, '0');
    const date = String(start.getFullYear()) + pad(start.getMonth() + 1) + pad(start.getDate());
    const clock = pad(hour) + pad(minute);
    const weekday = weekdayCodes[day];
    const title = calendarText('A quiet flight in Aerie');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aerie//Weekly flight//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', `UID:weekly-flight-${weekday}-${clock}@playaerie.com`,
      'DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      // Floating time keeps the weekly appointment at the player's local wall-clock time.
      `DTSTART:${date}T${clock}00`, 'DURATION:PT15M', 'RRULE:FREQ=WEEKLY;BYDAY=' + weekday,
      'TRANSP:TRANSPARENT', 'SUMMARY:' + title,
      'DESCRIPTION:' + calendarText('Take fifteen minutes to fly.\n' + returnUrl), 'URL:' + returnUrl,
      'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:' + title,
      'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'
    ];
    return new Blob([lines.map(foldLine).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  }

  function createDialog() {
    const element = document.createElement('dialog');
    element.className = 'dialog aerie-flight-reminder';
    element.setAttribute('aria-labelledby', 'flight-reminder-title');
    element.setAttribute('aria-describedby', 'flight-reminder-description');
    element.innerHTML = `
      <style>
        .aerie-flight-reminder { box-sizing:border-box; width:min(26rem,calc(100% - 1.5rem)); max-height:90dvh; margin:auto; padding:1.6rem; overflow:auto; border:1px solid #80755b; border-radius:8px; background:#142622; color:#f7f0dd; text-align:left; font:1rem/1.45 "Avenir Next",system-ui,sans-serif; }
        .aerie-flight-reminder::backdrop { background:rgba(5,13,12,.8); }
        .aerie-flight-reminder h2 { margin:0 2.6rem .4rem 0; padding:0; font:normal 2rem/1.1 Georgia,serif; letter-spacing:-.03em; color:inherit; }
        .aerie-flight-reminder p { margin:.6rem 0 1rem; color:#cad2c7; font-size:.95rem; }
        .aerie-flight-reminder .reminder-close { position:absolute; inset:.5rem .5rem auto auto; width:44px; height:44px; margin:0; padding:0; border:0; border-radius:50%; background:transparent; color:inherit; font:1.6rem/1 system-ui; cursor:pointer; }
        .aerie-flight-reminder .reminder-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr)); gap:.75rem; }
        .aerie-flight-reminder label { display:grid; align-content:start; gap:.3rem; margin:0; color:inherit; font:600 .9rem/1.4 system-ui; }
        .aerie-flight-reminder :is(select,input) { box-sizing:border-box; width:100%; min-width:0; min-height:44px; margin:0; padding:.45rem .5rem; border:1px solid #788578; border-radius:4px; background:#0f1d1b; color:#f7f0dd; font:1rem/1.3 system-ui; color-scheme:dark; }
        .aerie-flight-reminder .reminder-submit { display:inline-flex; align-items:center; min-height:44px; margin:1rem 0 0; padding:.55rem 1rem; border:1px solid #eac47e; border-radius:4px; background:#efcd8e; color:#17251e; font:600 1rem/1.35 system-ui; cursor:pointer; }
        .aerie-flight-reminder :focus-visible { outline:2px solid #ffdb91; outline-offset:2px; }
        .aerie-flight-reminder [role="status"] { margin:.8rem 0 0; }
        .aerie-flight-reminder [role="status"]:empty { display:none; }
      </style>
      <button type="button" class="reminder-close" aria-label="Close flight reminder">×</button>
      <h2 id="flight-reminder-title" tabindex="-1">A weekly flight</h2>
      <p id="flight-reminder-description">Choose a time for 15 minutes in the air. Your calendar will ask you to add the event, with an alert 10 minutes before.</p>
      <form>
        <div class="reminder-fields">
          <label>Every<select name="day" required></select></label>
          <label>Local time<input type="time" name="time" value="09:00" required></label>
        </div>
        <button class="button button-gold reminder-submit" type="submit">Review in calendar</button>
        <p role="status"></p>
      </form>`;
    const form = element.querySelector('form');
    const dayField = form.elements.namedItem('day');
    const status = form.querySelector('[role="status"]');
    days.forEach((name, index) => dayField.add(new Option(name, String(index))));
    dayField.value = '6';
    element.querySelector('.reminder-close').addEventListener('click', () => element.close());
    element.addEventListener('click', event => {
      if (event.target !== element) return;
      const box = element.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) element.close();
    });
    element.addEventListener('keydown', event => event.stopPropagation());
    element.addEventListener('keyup', event => event.stopPropagation());
    element.addEventListener('close', () => {
      status.textContent = '';
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    form.addEventListener('input', () => { status.textContent = ''; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const time = form.elements.namedItem('time').value;
      const day = Number(dayField.value);
      if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
      const url = URL.createObjectURL(calendarFile(day, time));
      const link = document.createElement('a');
      link.href = url;
      // iOS opens its native Calendar preview when it navigates to the calendar blob.
      if (!/iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        link.download = 'aerie-weekly-flight.ics';
      }
      element.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Confirm in your calendar. If a file downloaded, open aerie-weekly-flight.ics.';
    });
    document.body.append(element);
    return element;
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-flight-reminder]');
    if (!trigger) return;
    event.preventDefault();
    opener = trigger;
    if (!dialog) dialog = createDialog();
    if (!dialog.open) {
      dialog.showModal();
      dialog.querySelector('h2').focus();
    }
  });
})();
