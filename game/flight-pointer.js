// Feed normalized demands to the same aerodynamic controls as the keyboard.
window.makeFlightPointer = function ({surface, cue, currentStage, pick, pan}) {
  const input = {x:0, y:0};
  let contact = null;
  let awaitingMouseMotion = true;
  let firstMouseX, firstMouseY;
  function neutral() {
    input.x = input.y = 0;
    cue.hidden = true;
  }
  function clear() {
    const id = contact?.id;
    contact = null;
    awaitingMouseMotion = true;
    firstMouseX = firstMouseY = undefined;
    if (id != null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    neutral();
  }
  function axis(value, dead) {
    const amount = Math.min(1, Math.max(0, (Math.abs(value)-dead)/(1-dead)));
    return Math.sign(value)*amount**1.22;
  }
  function steer(dx, dy, rx, ry, dead) {
    input.x = axis(dx/rx,dead);
    input.y = axis(-dy/ry,dead);
  }
  function showCue(x,y,kind) {
    cue.dataset.kind = kind;
    cue.style.left = x+'px';
    cue.style.top = y+'px';
    cue.hidden = false;
  }
  surface.addEventListener('pointerdown', e => {
    const stage=currentStage();
    if (!stage || e.button!==0 || !e.isPrimary || contact) return;
    contact={id:e.pointerId, x:e.clientX, y:e.clientY, lastX:e.clientX, lastY:e.clientY, moved:false};
    surface.setPointerCapture(e.pointerId);
    if (e.pointerType!=='mouse' && stage==='free') {
      neutral();
      showCue(e.clientX,e.clientY,'touch');
    }
  });
  surface.addEventListener('pointermove', e => {
    const stage=currentStage();
    if (!stage || !e.isPrimary || (contact && contact.id!==e.pointerId)) return;
    if (contact) {
      const dx=e.clientX-contact.x, dy=e.clientY-contact.y;
      if (Math.hypot(dx,dy)>7) contact.moved=true;
      if (stage==='perched') pan((contact.lastX-e.clientX)*.006,(e.clientY-contact.lastY)*.006);
      contact.lastX=e.clientX; contact.lastY=e.clientY;
      if (stage==='free' && e.pointerType!=='mouse') {
        const travel=Math.max(42,Math.min(86,Math.min(surface.clientWidth,surface.clientHeight)*.16));
        steer(dx,dy,travel,travel,.08);
      }
    }
    if (stage==='free' && e.pointerType==='mouse') {
      // WebKit can retarget the stationary launch-button pointer to the canvas
      // as the menu disappears. Wait for movement before applying a flight input.
      if (awaitingMouseMotion) {
        const changedPosition = firstMouseX !== undefined &&
          (e.clientX !== firstMouseX || e.clientY !== firstMouseY);
        firstMouseX = e.clientX;
        firstMouseY = e.clientY;
        if (!e.movementX && !e.movementY && !changedPosition) return;
        awaitingMouseMotion = false;
      }
      const rect=surface.getBoundingClientRect(), cx=rect.width/2, cy=rect.height/2;
      steer(e.clientX-rect.left-cx,e.clientY-rect.top-cy,cx*.85,cy*.82,.065);
      showCue(rect.left+cx,rect.top+cy,'mouse');
    } else if (stage!=='free') neutral();
  });
  surface.addEventListener('pointerup', e => {
    if (!contact || contact.id!==e.pointerId) return;
    const tapped=!contact.moved && Math.hypot(e.clientX-contact.x,e.clientY-contact.y)<=7;
    contact=null;
    if (e.pointerType!=='mouse') neutral();
    if (tapped && currentStage()==='free') pick(e.clientX,e.clientY);
  });
  surface.addEventListener('pointercancel', e => {if (contact?.id===e.pointerId) clear();});
  surface.addEventListener('lostpointercapture', e => {if (contact?.id===e.pointerId) clear();});
  surface.addEventListener('pointerleave', e => {if (!contact && e.pointerType==='mouse') neutral();});
  window.addEventListener('resize', clear);
  return {input,clear};
};
